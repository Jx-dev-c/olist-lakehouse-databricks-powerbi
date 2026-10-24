"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;

import { construirCidade, noturnos } from "./cena";
import { VisualFormattingSettingsModel } from "./settings";

interface Item { ordem: number; nome: string; valor: string; detalhe: string; serie: number[]; tom: number; }
interface Predio {
    id: string; nome: string; curto: string; area: string; icone: string; cor: string; cor2: string; pergunta: string;
    pos: [number, number]; zoom: number;
    topo?: number; grupo?: THREE.Group; anel?: THREE.Mesh; ancora?: THREE.Vector3;
    etiqueta?: HTMLElement; etiquetaValor?: HTMLElement;
    itens: Item[];
}

// Cada prédio é uma área do negócio. pos = centro da quadra (x, z). Ids iguais aos da tabela 'Cidade Itens'.
const PREDIOS: Predio[] = [
    { id: "torre", nome: "Torre Olist", curto: "Visão geral", area: "Visão geral", icone: "🏢", cor: "#6366F1", cor2: "#8B5CF6", pergunta: "O negócio está crescendo?", pos: [0, 0], zoom: 1.7, itens: [] },
    { id: "shopping", nome: "Shopping Olist", curto: "Vendas", area: "Vendas e produtos", icone: "🛍️", cor: "#F97316", cor2: "#EC4899", pergunta: "O que vende e quanto cada pedido rende?", pos: [0, -20], zoom: 2.1, itens: [] },
    { id: "galpao", nome: "Galpão Olist Log", curto: "Logística", area: "Logística", icone: "🚚", cor: "#2563EB", cor2: "#06B6D4", pergunta: "Onde e quando atrasamos?", pos: [20, 0], zoom: 2.1, itens: [] },
    { id: "bairro", nome: "Vila dos Clientes", curto: "Clientes", area: "Clientes", icone: "🏘️", cor: "#EC4899", cor2: "#A855F7", pergunta: "Quem compra e quem volta?", pos: [-20, 0], zoom: 2.2, itens: [] },
    { id: "feira", nome: "Feira dos Vendedores", curto: "Vendedores", area: "Vendedores", icone: "🧺", cor: "#F59E0B", cor2: "#EF4444", pergunta: "Quem concentra a receita?", pos: [-20, -20], zoom: 2.2, itens: [] },
    { id: "banco", nome: "Banco Olist", curto: "Pagamentos", area: "Pagamentos", icone: "🏦", cor: "#059669", cor2: "#14B8A6", pergunta: "Como o cliente paga?", pos: [20, -20], zoom: 2.1, itens: [] },
    { id: "praca", nome: "Praça das Avaliações", curto: "Avaliações", area: "Satisfação do cliente", icone: "⭐", cor: "#EAB308", cor2: "#F97316", pergunta: "O que derruba a satisfação?", pos: [0, 20], zoom: 2.2, itens: [] },
];
const SVG = "http://www.w3.org/2000/svg";
const LARG_PAINEL = 330;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, classe: string, pai?: HTMLElement, texto?: string): HTMLElementTagNameMap[K] {
    const e = document.createElement(tag);
    if (classe) e.className = classe;
    if (texto != null) e.textContent = texto;
    if (pai) pai.appendChild(e);
    return e;
}
const suave = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const voltaSuave = (t: number) => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; };

/**
 * Olist City 3D: cidade isométrica em three.js. Cada prédio é uma área do negócio.
 * Etiquetas, painel (KPIs + minigráficos + insight) e letreiro vêm de medidas de texto do modelo,
 * então tudo acompanha os filtros da página.
 */
export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService = new FormattingSettingsService();

    private raiz: HTMLElement;
    private palco: HTMLElement;
    private camadaEtiquetas: HTMLElement;
    private painel: HTMLElement;
    private doca: HTMLElement;
    private selos: HTMLElement;
    private contaPassaporte: HTMLElement;
    private letreiro: HTMLElement;
    private trilho: HTMLElement;
    private vazio: HTMLElement;
    private botaoNoite: HTMLButtonElement;

    private renderer: THREE.WebGLRenderer;
    private cena = new THREE.Scene();
    private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 500);
    private controles: OrbitControls;
    private hemi: THREE.HemisphereLight;
    private sol: THREE.DirectionalLight;
    private cidade: { atualizar: (dt: number, t: number) => void };
    private alvos: THREE.Object3D[];

    private largura = 0;
    private altura = 0;
    private selecionado: string | null = null;
    private sobre: string | null = null;
    private visitados = new Set<string>();
    private noite = false;
    private mistura = 0;
    private noiteDoFormato: boolean | null = null;
    private animarCena = true;
    private voo: { de: THREE.Vector3; para: THREE.Vector3; zde: number; zpara: number; t0: number; ms: number } | null = null;
    private t0 = performance.now();
    private relogio = new THREE.Clock();
    private raio = new THREE.Raycaster();
    private mouse = new THREE.Vector2();
    private mouseMudou = false;
    private inicio: { x: number; y: number; t: number } | null = null;
    private v = new THREE.Vector3();
    private corDia = new THREE.Color("#EEF2FF");
    private corNoite = new THREE.Color("#6366F1");

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;

        this.raiz = el("div", "cidade", options.element);
        this.palco = el("div", "cidade-palco", this.raiz);
        this.camadaEtiquetas = el("div", "cidade-etiquetas", this.raiz);

        const chip = el("div", "cidade-chip", this.raiz);
        el("span", "cidade-chip-logo", chip, "🏙️");
        const txt = el("div", "", chip);
        el("strong", "", txt, "Olist City");
        el("span", "", txt, "clique num prédio para ver a área");
        this.botaoNoite = el("button", "cidade-botao", chip, "🌙");
        this.botaoNoite.title = "Modo noite";
        this.botaoNoite.onclick = () => this.definirNoite(!this.noite);

        this.montarPassaporte();
        this.montarDoca();
        this.montarZoom();
        this.painel = el("div", "cidade-painel", this.raiz);
        this.letreiro = el("div", "cidade-letreiro", this.raiz);
        el("span", "ao-vivo", this.letreiro, "● AO VIVO");
        const trilhoFora = el("div", "letreiro-trilho", this.letreiro);
        this.trilho = el("div", "letreiro-texto", trilhoFora);
        this.vazio = el("div", "cidade-vazio", this.raiz,
            "Arraste 'Cidade Itens'[predio], [ordem] e [item] e as medidas 'Cidade Valor', 'Cidade Detalhe', 'Cidade Série' e 'Cidade Tom'.");

        this.montarCena();
        this.eventosPonteiro();
        this.renderer.setAnimationLoop(() => this.quadro());
    }

    // ---------------- cena ----------------
    private montarCena() {
        const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        r.shadowMap.enabled = true;
        r.shadowMap.type = THREE.PCFSoftShadowMap;
        r.toneMapping = THREE.ACESFilmicToneMapping;
        r.toneMappingExposure = 1.05;
        this.palco.appendChild(r.domElement);

        this.camera.position.copy(new THREE.Vector3(1, 0.86, 1).normalize()).multiplyScalar(120);
        this.hemi = new THREE.HemisphereLight("#EEF2FF", "#A8A29E", 1.25);
        this.sol = new THREE.DirectionalLight("#FFF7ED", 2.3);
        this.sol.position.set(35, 60, 18);
        this.sol.castShadow = true;
        this.sol.shadow.mapSize.set(2048, 2048);
        Object.assign(this.sol.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 200 });
        this.sol.shadow.bias = -0.0005;
        this.sol.shadow.normalBias = 0.03;
        this.cena.add(this.hemi, this.sol);

        const c = this.controles = new OrbitControls(this.camera, r.domElement);
        Object.assign(c, {
            enableDamping: true, dampingFactor: 0.08, screenSpacePanning: false,
            minZoom: 0.7, maxZoom: 4.5, minPolarAngle: 0.55, maxPolarAngle: 1.12,
            minAzimuthAngle: Math.PI / 4 - 0.9, maxAzimuthAngle: Math.PI / 4 + 0.9, zoomToCursor: true,
        });
        c.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
        c.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
        c.addEventListener("change", () => {
            c.target.x = THREE.MathUtils.clamp(c.target.x, -30, 30);
            c.target.z = THREE.MathUtils.clamp(c.target.z, -30, 30);
        });

        this.cidade = construirCidade(this.cena, PREDIOS, { textoOutdoor: "Olist City · dados ao vivo" });
        this.alvos = PREDIOS.map(p => p.grupo);
        for (const p of PREDIOS) {
            p.ancora = new THREE.Vector3(p.pos[0], p.topo, p.pos[1]);
            p.grupo.scale.y = 0.001;
            const e = el("button", "etiqueta oculta", this.camadaEtiquetas);
            e.style.setProperty("--cor", p.cor);
            el("i", "", e, p.icone);
            el("span", "etiqueta-nome", e, p.curto);
            p.etiquetaValor = el("b", "etiqueta-valor", e);
            el("span", "ok", e, "✓");
            e.onclick = () => this.abrir(p.id);
            p.etiqueta = e;
        }
        this.camera.zoom = 0.62;
        this.camera.updateProjectionMatrix();
        this.voar(new THREE.Vector3(0, 0, 0), 1, 1800);
    }

    private eventosPonteiro() {
        const tela = this.renderer.domElement;
        const pos = (e: PointerEvent) => {
            const r = tela.getBoundingClientRect();
            this.mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        };
        tela.addEventListener("pointermove", e => {
            pos(e);
            this.mouseMudou = true;
            if (this.sobre) this.mostrarDica(this.sobre, e);
        });
        tela.addEventListener("pointerleave", () => this.esconderDica());
        tela.addEventListener("pointerdown", e => { this.inicio = { x: e.clientX, y: e.clientY, t: performance.now() }; this.voo = null; });
        tela.addEventListener("pointerup", e => {
            const i = this.inicio;
            if (!i || Math.hypot(e.clientX - i.x, e.clientY - i.y) > 6 || performance.now() - i.t > 500) return;
            pos(e);
            const id = this.predioSobMouse();
            if (id) this.abrir(id);
        });
        // menu de contexto do Power BI no botão direito fica para a rotação da câmera
        tela.addEventListener("contextmenu", e => e.preventDefault());
    }

    private predioSobMouse(): string | null {
        this.raio.setFromCamera(this.mouse, this.camera);
        const acerto = this.raio.intersectObjects(this.alvos, true).find(h => h.object.userData.predio && h.object.visible);
        return acerto ? acerto.object.userData.predio : null;
    }

    private mostrarDica(id: string, e: PointerEvent) {
        const p = PREDIOS.find(q => q.id === id);
        const itens: VisualTooltipDataItem[] = [{ displayName: p.area, value: p.nome, color: p.cor }];
        for (const it of p.itens.filter(x => x.ordem >= 1 && x.ordem <= 4)) itens.push({ displayName: it.nome, value: it.valor });
        itens.push({ displayName: "", value: "Clique para abrir o painel" });
        this.host.tooltipService.show({ coordinates: [e.clientX, e.clientY], isTouchEvent: e.pointerType === "touch", dataItems: itens, identities: [] });
    }
    private esconderDica() {
        this.sobre = null;
        this.raiz.classList.remove("sobre-predio");
        this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    // ---------------- interface fixa ----------------
    private montarPassaporte() {
        const p = el("div", "cidade-passaporte", this.raiz);
        const topo = el("div", "passaporte-topo", p);
        el("span", "", topo, "🎫 Passaporte do tour");
        this.contaPassaporte = el("b", "", topo, `0/${PREDIOS.length}`);
        this.selos = el("div", "passaporte-selos", p);
        for (const q of PREDIOS) {
            const s = el("button", "selo", this.selos, q.icone);
            s.title = q.nome;
            s.style.setProperty("--cor", q.cor);
            s.dataset.id = q.id;
            s.onclick = () => this.abrir(q.id);
        }
    }
    private atualizarPassaporte() {
        this.contaPassaporte.textContent = `${this.visitados.size}/${PREDIOS.length}`;
        for (const s of Array.from(this.selos.children) as HTMLElement[]) s.classList.toggle("visitado", this.visitados.has(s.dataset.id));
        for (const p of PREDIOS) p.etiqueta.classList.toggle("visitado", this.visitados.has(p.id));
    }
    private montarDoca() {
        this.doca = el("div", "cidade-doca", this.raiz);
        for (const p of PREDIOS) {
            const b = el("button", "", this.doca);
            b.style.setProperty("--cor", p.cor);
            b.dataset.id = p.id;
            b.title = `${p.nome}: ${p.area}`;
            el("span", "", b, p.icone);
            b.appendChild(document.createTextNode(p.curto));
            b.onclick = () => this.abrir(p.id);
        }
    }
    private montarZoom() {
        const z = el("div", "cidade-zoom", this.raiz);
        const botao = (texto: string, titulo: string, acao: () => void) => { const b = el("button", "cidade-botao", z, texto); b.title = titulo; b.onclick = acao; };
        botao("+", "Aproximar", () => this.voar(this.controles.target.clone(), Math.min(this.camera.zoom * 1.35, this.controles.maxZoom), 400));
        botao("−", "Afastar", () => this.voar(this.controles.target.clone(), Math.max(this.camera.zoom / 1.35, this.controles.minZoom), 400));
        botao("⌂", "Ver a cidade inteira", () => (this.selecionado ? this.fechar() : this.voar(new THREE.Vector3(0, 0, 0), 1)));
    }

    private definirNoite(v: boolean) {
        this.noite = v;
        this.raiz.classList.toggle("noite", v);
        this.botaoNoite.textContent = v ? "☀️" : "🌙";
    }

    // ---------------- câmera ----------------
    private voar(alvo: THREE.Vector3, zoom: number, ms = 1100) {
        this.voo = { de: this.controles.target.clone(), para: alvo, zde: this.camera.zoom, zpara: zoom, t0: performance.now(), ms: this.animarCena ? ms : 1 };
    }
    private enquadrar(p: Predio) {
        // desloca o alvo para o prédio aparecer na área livre (fora do painel)
        const alvo = new THREE.Vector3(p.pos[0], p.topo * 0.35, p.pos[1]);
        const upp = (this.camera.right - this.camera.left) / p.zoom / Math.max(1, this.largura);
        this.camera.updateMatrixWorld();
        if (this.largura > 640) {
            const direita = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
            alvo.addScaledVector(direita, ((LARG_PAINEL + 20) / 2) * upp);
        } else {
            const cima = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
            alvo.addScaledVector(cima, -(this.altura * 0.6 / 2) * upp * 0.85);
        }
        this.voar(alvo, p.zoom);
    }

    // ---------------- painel ----------------
    private abrir(id: string) {
        const i = PREDIOS.findIndex(p => p.id === id);
        if (i < 0) return;
        const p = PREDIOS[i];
        this.selecionado = id;
        this.desenharPainel(p, i);
        this.raiz.classList.add("painel-aberto");
        for (const b of Array.from(this.doca.children) as HTMLElement[]) b.classList.toggle("ativa", b.dataset.id === id);
        for (const q of PREDIOS) q.etiqueta.classList.toggle("ativa", q.id === id);
        this.enquadrar(p);
        this.visitados.add(id);
        this.atualizarPassaporte();
    }
    private fechar() {
        this.selecionado = null;
        this.raiz.classList.remove("painel-aberto");
        for (const b of Array.from(this.doca.children) as HTMLElement[]) b.classList.remove("ativa");
        for (const q of PREDIOS) q.etiqueta.classList.remove("ativa");
        this.voar(new THREE.Vector3(0, 0, 0), 1);
    }
    private navegar(passo: number) {
        const i = PREDIOS.findIndex(p => p.id === this.selecionado);
        this.abrir(PREDIOS[(i + passo + PREDIOS.length) % PREDIOS.length].id);
    }

    private desenharPainel(p: Predio, i: number) {
        const pn = this.painel;
        pn.replaceChildren();
        pn.style.setProperty("--cor", p.cor);
        pn.style.setProperty("--cor-2", p.cor2);

        const cabeca = el("div", "painel-cabeca", pn);
        const fechar = el("button", "painel-fechar", cabeca, "✕");
        fechar.title = "Fechar";
        fechar.onclick = () => this.fechar();
        const l1 = el("div", "linha1", cabeca);
        el("div", "painel-icone", l1, p.icone);
        const nomes = el("div", "", l1);
        el("div", "painel-area", nomes, p.area);
        el("div", "painel-nome", nomes, p.nome);
        const nav = el("div", "painel-nav", cabeca);
        el("button", "", nav, "‹ Anterior").onclick = () => this.navegar(-1);
        el("span", "", nav, `Prédio ${i + 1} de ${PREDIOS.length}`);
        el("button", "", nav, "Próximo ›").onclick = () => this.navegar(1);

        const corpo = el("div", "painel-corpo", pn);
        const perg = el("p", "pergunta", corpo, "Pergunta de negócio: ");
        el("b", "", perg, p.pergunta);

        const kpis = el("div", "kpis", corpo);
        const lista = p.itens.filter(x => x.ordem >= 1 && x.ordem <= 4);
        if (!lista.length) el("p", "pergunta", corpo, "Sem dados para esta área no filtro atual.");
        lista.forEach((it, k) => {
            const c = el("div", "kpi", kpis);
            c.style.animationDelay = `${k * 60}ms`;
            if (it.serie.length > 1) c.appendChild(this.minigrafico(it.serie));
            el("small", "", c, it.nome);
            el("b", "", c, it.valor || "–");
            el("span", it.tom > 0 ? "sobe" : it.tom < 0 ? "desce" : "", c, it.detalhe);
        });

        const titulo = p.itens.find(x => x.ordem === 8), texto = p.itens.find(x => x.ordem === 9);
        if (titulo?.valor) {
            const ins = el("div", "insight", corpo);
            el("small", "", ins, "INSIGHT");
            el("strong", "", ins, titulo.valor);
            if (texto?.valor) el("span", "", ins, texto.valor);
        }
        requestAnimationFrame(() => requestAnimationFrame(() => pn.classList.add("visivel")));
    }

    private minigrafico(valores: number[]): SVGSVGElement {
        const w = 54, h = 22, min = Math.min(...valores), max = Math.max(...valores);
        const pts = valores.map((y, i) => [(i / (valores.length - 1)) * w, h - ((y - min) / (max - min || 1)) * h]);
        const svg = document.createElementNS(SVG, "svg");
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        const linha = document.createElementNS(SVG, "polyline");
        linha.setAttribute("points", pts.map(q => q.join(",")).join(" "));
        linha.setAttribute("fill", "none");
        linha.setAttribute("stroke", "var(--cor)");
        linha.setAttribute("stroke-width", "1.8");
        linha.setAttribute("stroke-linejoin", "round");
        linha.setAttribute("stroke-linecap", "round");
        const ponto = document.createElementNS(SVG, "circle");
        const u = pts[pts.length - 1];
        ponto.setAttribute("cx", String(u[0]));
        ponto.setAttribute("cy", String(u[1]));
        ponto.setAttribute("r", "2.6");
        ponto.setAttribute("fill", "var(--cor)");
        svg.append(linha, ponto);
        return svg;
    }

    // ---------------- dados ----------------
    private lerDados(options: VisualUpdateOptions): boolean {
        for (const p of PREDIOS) p.itens = [];
        const tabela = options.dataViews?.[0]?.table;
        if (!tabela?.rows?.length) return false;
        const idx = (papel: string) => tabela.columns.findIndex(c => c.roles?.[papel]);
        const [iP, iO, iI, iV, iD, iS, iT] = ["predio", "ordem", "item", "valor", "detalhe", "serie", "tom"].map(idx);
        if (iP < 0 || iV < 0) return false;
        const texto = (r: powerbi.DataViewTableRow, i: number) => (i >= 0 && r[i] != null ? String(r[i]) : "");
        for (const r of tabela.rows) {
            const p = PREDIOS.find(q => q.id === texto(r, iP).trim().toLowerCase());
            if (!p) continue;
            p.itens.push({
                ordem: iO >= 0 ? Number(r[iO]) : 0,
                nome: texto(r, iI),
                valor: texto(r, iV),
                detalhe: texto(r, iD),
                serie: texto(r, iS).split(";").map(Number).filter(n => Number.isFinite(n)),
                tom: iT >= 0 ? Number(r[iT]) || 0 : 0,
            });
        }
        for (const p of PREDIOS) p.itens.sort((a, b) => a.ordem - b.ordem);
        return PREDIOS.some(p => p.itens.length);
    }

    private atualizarLetreiro(mostrar: boolean) {
        const frases = PREDIOS.map(p => ({ p, t: p.itens.find(x => x.ordem === 8)?.valor })).filter(x => x.t);
        this.letreiro.style.display = mostrar && frases.length ? "" : "none";
        this.raiz.classList.toggle("com-letreiro", mostrar && frases.length > 0);
        this.trilho.replaceChildren();
        for (let volta = 0; volta < 2; volta++) for (const f of frases) {
            const s = el("span", "", this.trilho);
            el("b", "", s, `${f.p.icone} ${f.p.curto}: `);
            s.appendChild(document.createTextNode(f.t));
        }
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const cfg = this.formattingSettings.cidadeCard;

            this.largura = options.viewport.width;
            this.altura = options.viewport.height;
            this.redimensionar();

            this.animarCena = cfg.animar.value;
            this.controles.enableZoom = cfg.permitirZoom.value;
            if (this.noiteDoFormato !== cfg.noite.value) { this.noiteDoFormato = cfg.noite.value; this.definirNoite(cfg.noite.value); }

            const temDados = this.lerDados(options);
            this.vazio.style.display = temDados ? "none" : "";
            for (const p of PREDIOS) {
                const cabeca = p.itens.find(x => x.ordem === 0);
                p.etiquetaValor.textContent = cabeca?.valor ?? "";
                p.etiqueta.classList.toggle("ruim", (cabeca?.tom ?? 0) < 0);
                p.etiqueta.classList.toggle("bom", (cabeca?.tom ?? 0) > 0);
            }
            this.atualizarLetreiro(cfg.letreiro.value);
            if (this.selecionado) {
                const i = PREDIOS.findIndex(p => p.id === this.selecionado);
                this.desenharPainel(PREDIOS[i], i);
            }
            this.events.renderingFinished(options);
        } catch (erro) {
            this.events.renderingFailed(options, String(erro));
        }
    }

    private redimensionar() {
        const w = Math.max(1, this.largura), h = Math.max(1, this.altura), asp = w / h;
        // a ilha inteira cabe no zoom 1 em qualquer proporção
        let meiaAlt = 36, meiaLarg = meiaAlt * asp;
        if (meiaLarg < 52) { meiaLarg = 52; meiaAlt = meiaLarg / asp; }
        Object.assign(this.camera, { left: -meiaLarg, right: meiaLarg, top: meiaAlt, bottom: -meiaAlt });
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.raiz.classList.toggle("estreito", w <= 640);
    }

    // ---------------- laço ----------------
    private quadro() {
        if (!this.largura) return;
        const dt = Math.min(this.relogio.getDelta(), 0.05), t = this.relogio.elapsedTime, agora = performance.now();
        const cam = this.camera, ctl = this.controles;

        if (this.voo) {
            const k = Math.min(1, (agora - this.voo.t0) / this.voo.ms), e = suave(k);
            const desloc = cam.position.clone().sub(ctl.target);
            ctl.target.lerpVectors(this.voo.de, this.voo.para, e);
            cam.position.copy(ctl.target).add(desloc);
            cam.zoom = this.voo.zde + (this.voo.zpara - this.voo.zde) * e;
            cam.updateProjectionMatrix();
            if (k >= 1) this.voo = null;
        }
        ctl.update();

        PREDIOS.forEach((p, i) => {
            const k = this.animarCena ? THREE.MathUtils.clamp((agora - this.t0 - 250 - i * 140) / 900, 0, 1) : 1;
            p.grupo.scale.y = Math.max(0.001, voltaSuave(k));
            const alvoY = p.id === this.sobre && p.id !== this.selecionado ? 0.45 : 0.2;
            p.grupo.position.y += (alvoY - p.grupo.position.y) * 0.18;
            const mat = p.anel.material as THREE.MeshBasicMaterial;
            const op = p.id === this.selecionado ? 0.65 + Math.sin(t * 4) * 0.3 : p.id === this.sobre ? 0.5 : 0;
            mat.opacity += (op - mat.opacity) * 0.15;
        });

        if (this.mouseMudou && !this.voo) {
            this.mouseMudou = false;
            const id = this.predioSobMouse();
            if (id !== this.sobre) {
                if (!id) this.esconderDica();
                this.sobre = id;
                this.raiz.classList.toggle("sobre-predio", !!id);
            }
        }

        this.cidade.atualizar(this.animarCena ? dt : 0, this.animarCena ? t : 0);

        this.mistura += ((this.noite ? 1 : 0) - this.mistura) * 0.06;
        const m = this.mistura;
        this.hemi.intensity = 1.25 - m * 0.85;
        this.hemi.color.lerpColors(this.corDia, this.corNoite, m);
        this.sol.intensity = 2.3 - m * 2.0;
        this.sol.color.set(m > 0.5 ? "#A5B4FC" : "#FFF7ED");
        for (const x of noturnos.janelas) x.emissiveIntensity = m * 1.1;
        for (const x of noturnos.placas) x.emissiveIntensity = 0.08 + m * 0.75;
        for (const x of noturnos.lampadas) x.emissiveIntensity = 0.1 + m * 2.4;

        this.renderer.render(this.cena, cam);

        // etiquetas acompanham os prédios; as que se sobrepõem empilham (a do prédio mais distante sobe)
        const pronta = agora - this.t0 > 1400 || !this.animarCena;
        const pos = PREDIOS.map(p => {
            this.v.copy(p.ancora).project(cam);
            return { p, x: ((this.v.x + 1) / 2) * this.largura, y: ((1 - this.v.y) / 2) * this.altura, prof: this.v.z, larg: p.etiqueta.offsetWidth };
        });
        for (let volta = 0; volta < 3; volta++) for (const a of pos) for (const b of pos) {
            if (a === b || a.prof <= b.prof) continue;
            const dy = b.y - a.y;
            if (Math.abs(a.x - b.x) < (a.larg + b.larg) / 2 + 4 && dy > -30 && dy < 30) a.y = b.y - 30;
        }
        for (const q of pos) {
            q.p.etiqueta.style.transform = `translate(${q.x}px, ${q.y}px) translate(-50%, -100%)`;
            q.p.etiqueta.classList.toggle("oculta", !pronta);
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }

    public destroy() {
        this.renderer.setAnimationLoop(null);
        this.renderer.dispose();
    }
}
