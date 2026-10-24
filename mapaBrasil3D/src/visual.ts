"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import ISelectionId = powerbi.visuals.ISelectionId;
import VisualTooltipDataItem = powerbi.extensibility.VisualTooltipDataItem;
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { UFS, UfGeo } from "./geo";
import { VisualFormattingSettingsModel } from "./settings";

const DURACAO_MS = 900;       // crescimento dos estados
const ONDA_MS = 450;          // atraso máximo entre o oeste e o leste (efeito de onda)
const ALTURA_BASE = 0.25;     // estados com valor 0 continuam visíveis
const ALTURA_SEM_DADOS = 0.12;
const CINZA_APAGADO = new THREE.Color(0xe2e8f0);

interface DadoUf {
    altura: number | null;
    cor: number | null;
    tooltips: VisualTooltipDataItem[];
    selectionId: ISelectionId;
}

interface Estado {
    geo: UfGeo;
    mesh: THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial>;
    rotulo: THREE.Sprite;
    dado?: DadoUf;
    alturaDe: number;
    alturaPara: number;
    corDe: THREE.Color;
    corPara: THREE.Color;
    apagadoPara: number;   // 0 = cor normal, 1 = esmaecido (fora da seleção)
    apagado: number;
    atrasoMs: number;
}

export class Visual implements IVisual {
    private host: IVisualHost;
    private events: IVisualEventService;
    private selectionManager: ISelectionManager;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService = new FormattingSettingsService();

    private renderer: THREE.WebGLRenderer;
    private scene = new THREE.Scene();
    private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 600);
    private controls: OrbitControls;
    private raycaster = new THREE.Raycaster();
    private mapa = new THREE.Group();
    private estados: Estado[] = [];
    private centro = new THREE.Vector3();
    private raio = 1;

    private inicioAnimacao = 0;
    private quadro = 0;
    private hover: Estado | null = null;
    private ponteiroInicio: { x: number; y: number } | null = null;
    private cliquePendente = 0;

    private legenda: HTMLElement;
    private aviso: HTMLElement;

    constructor(options: VisualConstructorOptions) {
        this.host = options.host;
        this.events = options.host.eventService;
        this.selectionManager = options.host.createSelectionManager();
        this.selectionManager.registerOnSelectCallback(() => this.aplicarSelecao());

        const raiz = options.element;
        raiz.classList.add("mapa3d");

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        raiz.appendChild(this.renderer.domElement);

        this.legenda = this.criarDiv(raiz, "legenda");
        this.aviso = this.criarDiv(raiz, "aviso");
        this.aviso.textContent = "Arraste a UF para \"Estado\" e uma medida para \"Altura\".";

        this.montarCena();
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.maxPolarAngle = Math.PI * 0.46;   // não deixa a câmera passar para baixo do "chão"
        this.controls.minDistance = 12;
        this.controls.maxDistance = 160;
        this.controls.autoRotateSpeed = 0.6;
        this.controls.enablePan = false;
        // a roda do mouse rola a página do relatório; zoom só quando o autor do relatório liga a opção
        this.controls.enableZoom = false;

        this.ligarEventos();
        this.animar();
    }

    // ---------------------------------------------------------------- cena

    private montarCena() {
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x94a3b8, 1.1));
        const sol = new THREE.DirectionalLight(0xffffff, 1.9);
        sol.position.set(-18, 40, 22);
        sol.castShadow = true;
        sol.shadow.mapSize.set(2048, 2048);
        Object.assign(sol.shadow.camera, { left: -32, right: 32, top: 32, bottom: -32, near: 1, far: 120 });
        sol.shadow.radius = 4;
        this.scene.add(sol);

        // chão invisível que só recebe a sombra dos estados
        const chao = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.ShadowMaterial({ opacity: 0.12 }));
        chao.rotation.x = -Math.PI / 2;
        chao.position.y = -0.01;
        chao.receiveShadow = true;
        this.scene.add(chao);

        // geometria em XY com extrusão em Z; girando o grupo, Z vira "para cima" e o norte fica ao fundo
        this.mapa.rotation.x = -Math.PI / 2;
        this.scene.add(this.mapa);

        const bordaMaterial = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
        for (const geo of UFS) {
            const formas = geo.poligonos.map(aneis => {
                const forma = new THREE.Shape(this.pontos(aneis[0]));
                for (const buraco of aneis.slice(1)) forma.holes.push(new THREE.Path(this.pontos(buraco)));
                return forma;
            });
            const geometria = new THREE.ExtrudeGeometry(formas, { depth: 1, bevelEnabled: false, curveSegments: 1 });
            const material = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.05 });
            const mesh = new THREE.Mesh(geometria, material);
            mesh.scale.z = 0.01;
            mesh.castShadow = true;
            mesh.receiveShadow = true;

            // contorno só na face de cima (z = 1), escala junto com a altura do estado
            const segmentos: number[] = [];
            for (const aneis of geo.poligonos) for (const anel of aneis) {
                for (let i = 0; i < anel.length; i += 2) {
                    const j = (i + 2) % anel.length;
                    segmentos.push(anel[i], anel[i + 1], 1.001, anel[j], anel[j + 1], 1.001);
                }
            }
            const bordaGeo = new THREE.BufferGeometry();
            bordaGeo.setAttribute("position", new THREE.Float32BufferAttribute(segmentos, 3));
            mesh.add(new THREE.LineSegments(bordaGeo, bordaMaterial));

            const rotulo = this.criarRotulo(geo.uf);
            rotulo.position.set(geo.centro[0], geo.centro[1], 1);
            this.mapa.add(mesh, rotulo);

            this.estados.push({
                geo, mesh, rotulo,
                alturaDe: 0.01, alturaPara: ALTURA_SEM_DADOS,
                corDe: new THREE.Color(0xe2e8f0), corPara: new THREE.Color(0xe2e8f0),
                apagadoPara: 0, apagado: 0,
                atrasoMs: ((geo.centro[0] + 20) / 40) * ONDA_MS
            });
            material.color.set(0xe2e8f0);
        }

        // centro e raio do mapa, para enquadrar a câmera
        const caixa = new THREE.Box3().setFromObject(this.mapa);
        const esfera = caixa.getBoundingSphere(new THREE.Sphere());
        this.centro.copy(esfera.center).setY(0);
        this.raio = esfera.radius;
    }

    private pontos(anel: number[]): THREE.Vector2[] {
        const pts: THREE.Vector2[] = [];
        for (let i = 0; i < anel.length; i += 2) pts.push(new THREE.Vector2(anel[i], anel[i + 1]));
        return pts;
    }

    private criarRotulo(texto: string): THREE.Sprite {
        const canvas = document.createElement("canvas");
        canvas.width = 128; canvas.height = 64;
        const ctx = canvas.getContext("2d");
        ctx.font = "600 38px 'Segoe UI', sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 8;
        ctx.strokeStyle = "rgba(255,255,255,0.95)";
        ctx.strokeText(texto, 64, 34);
        ctx.fillStyle = "#1B2A4A";
        ctx.fillText(texto, 64, 34);
        const textura = new THREE.CanvasTexture(canvas);
        textura.colorSpace = THREE.SRGBColorSpace;
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textura, depthTest: false, transparent: true }));
        sprite.scale.set(2.6, 1.3, 1);
        sprite.renderOrder = 10;
        return sprite;
    }

    private criarDiv(pai: HTMLElement, classe: string): HTMLElement {
        const div = document.createElement("div");
        div.className = classe;
        pai.appendChild(div);
        return div;
    }

    // ---------------------------------------------------------------- dados

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const cfg = this.formattingSettings.mapaCard;

            const { width, height } = options.viewport;
            this.renderer.setSize(width, height);
            this.camera.aspect = width / Math.max(height, 1);
            this.camera.updateProjectionMatrix();
            if (options.type & powerbi.VisualUpdateType.Resize || !this.inicioAnimacao) this.enquadrar();

            this.controls.autoRotate = cfg.autoRotacao.value;
            this.controls.enableZoom = cfg.permitirZoom.value;
            // giro limitado a ±70° para o mapa nunca ficar "de cabeça para baixo" (sem limite na rotação automática)
            const giro = cfg.autoRotacao.value ? Infinity : THREE.MathUtils.degToRad(70);
            this.controls.minAzimuthAngle = -giro;
            this.controls.maxAzimuthAngle = giro;

            const dados = this.lerDados(dataView);
            this.aviso.style.display = dados.size ? "none" : "block";

            const alturas = [...dados.values()].map(d => d.altura).filter(v => v != null && isFinite(v));
            // um estado dominante (SP) achata o resto; a raiz quadrada mantém a ordem e dá leitura aos menores
            const escala = (v: number) => cfg.escalaRaiz.value ? Math.sqrt(Math.max(0, v)) : Math.max(0, v);
            const maxAltura = Math.max(...alturas.map(escala), 0) || 1;
            const cores = [...dados.values()].map(d => d.cor ?? d.altura).filter(v => v != null && isFinite(v));
            const minCor = Math.min(...cores), maxCor = Math.max(...cores);

            // escala divergente de 3 cores: o meio da faixa fica neutro e os extremos se destacam
            const corMin = new THREE.Color(cfg.corMin.value.value);
            const corMeio = new THREE.Color(cfg.corMeio.value.value);
            const corMax = new THREE.Color(cfg.corMax.value.value);
            const corDe = (t: number) => t < 0.5 ? corMin.clone().lerp(corMeio, t * 2) : corMeio.clone().lerp(corMax, (t - 0.5) * 2);
            const corSemDados = new THREE.Color(cfg.corSemDados.value.value);
            const alturaMax = Math.max(0.5, cfg.alturaMax.value);

            for (const e of this.estados) {
                const d = dados.get(e.geo.uf);
                e.dado = d;
                e.alturaDe = e.mesh.scale.z;
                e.corDe = e.mesh.material.color.clone();
                if (d && d.altura != null) {
                    e.alturaPara = ALTURA_BASE + escala(d.altura) / maxAltura * alturaMax;
                    const v = d.cor ?? d.altura;
                    const t = maxCor > minCor ? (v - minCor) / (maxCor - minCor) : 1;
                    e.corPara = corDe(Math.min(1, Math.max(0, t)));
                } else {
                    e.alturaPara = ALTURA_SEM_DADOS;
                    e.corPara = corSemDados.clone();
                }
                e.rotulo.visible = cfg.rotulos.value;
            }
            this.inicioAnimacao = performance.now();

            this.desenharLegenda(dataView, cfg.legenda.value && cores.length > 0, minCor, maxCor, [corMin, corMeio, corMax]);
            this.aplicarSelecao();
            this.events.renderingFinished(options);
        } catch (erro) {
            this.events.renderingFailed(options, String(erro));
        }
    }

    private lerDados(dataView: powerbi.DataView): Map<string, DadoUf> {
        const mapa = new Map<string, DadoUf>();
        const categoria = dataView?.categorical?.categories?.[0];
        if (!categoria) return mapa;
        const valores: DataViewValueColumn[] = dataView.categorical.values ? [...dataView.categorical.values] : [];
        const colAltura = valores.find(v => v.source.roles?.altura);
        const colCor = valores.find(v => v.source.roles?.cor);
        const formatar = (col: DataViewValueColumn) => valueFormatter.create({ format: col.source.format });
        const colunasDica = valores.map(col => ({ col, fmt: formatar(col) }));

        categoria.values.forEach((valor, i) => {
            const uf = String(valor ?? "").trim().toUpperCase();
            if (!uf) return;
            const num = (col?: DataViewValueColumn) => col && col.values[i] != null ? Number(col.values[i]) : null;
            mapa.set(uf, {
                altura: num(colAltura),
                cor: num(colCor),
                tooltips: colunasDica
                    .filter(({ col }) => col.values[i] != null)
                    .map(({ col, fmt }) => ({ displayName: col.source.displayName, value: fmt.format(col.values[i]) })),
                selectionId: this.host.createSelectionIdBuilder().withCategory(categoria, i).createSelectionId()
            });
        });
        return mapa;
    }

    private desenharLegenda(dataView: powerbi.DataView, mostrar: boolean, min: number, max: number, paleta: THREE.Color[]) {
        this.legenda.style.display = mostrar ? "block" : "none";
        if (!mostrar) return;
        const valores = dataView.categorical.values;
        const col = valores.find(v => v.source.roles?.cor) ?? valores.find(v => v.source.roles?.altura);
        const fmt = valueFormatter.create({ format: col.source.format });
        while (this.legenda.firstChild) this.legenda.removeChild(this.legenda.firstChild);
        this.criarDiv(this.legenda, "titulo").textContent = col.source.displayName;
        const barra = this.criarDiv(this.legenda, "barra");
        barra.style.background = `linear-gradient(90deg, ${paleta.map(c => "#" + c.getHexString()).join(", ")})`;
        const escala = this.criarDiv(this.legenda, "escala");
        this.criarDiv(escala, "min").textContent = fmt.format(min);
        this.criarDiv(escala, "max").textContent = fmt.format(max);
    }

    // ---------------------------------------------------------------- interação

    private ligarEventos() {
        const canvas = this.renderer.domElement;
        canvas.addEventListener("pointerdown", e => { this.ponteiroInicio = { x: e.clientX, y: e.clientY }; });
        canvas.addEventListener("pointermove", e => this.aoMover(e));
        canvas.addEventListener("dblclick", () => {   // recentraliza a câmera (e cancela o clique simples pendente)
            clearTimeout(this.cliquePendente);
            this.enquadrar();
        });
        canvas.addEventListener("pointerleave", () => this.esconderDica());
        canvas.addEventListener("pointerup", e => {
            const ini = this.ponteiroInicio;
            this.ponteiroInicio = null;
            if (!ini || Math.hypot(e.clientX - ini.x, e.clientY - ini.y) > 5) return;   // foi arraste, não clique
            const alvo = this.estadoEm(e);
            const multi = e.ctrlKey || e.metaKey;
            clearTimeout(this.cliquePendente);
            this.cliquePendente = window.setTimeout(() => {
                if (alvo?.dado) {
                    this.selectionManager.select(alvo.dado.selectionId, multi).then(() => this.aplicarSelecao());
                } else {
                    this.selectionManager.clear().then(() => this.aplicarSelecao());
                }
            }, 250);
        });
        canvas.addEventListener("contextmenu", e => {
            e.preventDefault();
            const alvo = this.estadoEm(e);
            this.selectionManager.showContextMenu(alvo?.dado?.selectionId ?? {}, { x: e.clientX, y: e.clientY });
        });
    }

    private estadoEm(e: MouseEvent): Estado | null {
        const r = this.renderer.domElement.getBoundingClientRect();
        const ponto = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        this.raycaster.setFromCamera(ponto, this.camera);
        const hit = this.raycaster.intersectObjects(this.estados.map(s => s.mesh), false)[0];
        return hit ? this.estados.find(s => s.mesh === hit.object) ?? null : null;
    }

    private aoMover(e: PointerEvent) {
        if (this.ponteiroInicio) return;   // arrastando a câmera
        const alvo = this.estadoEm(e);
        if (this.hover && this.hover !== alvo) this.hover.mesh.material.emissive.set(0x000000);
        this.hover = alvo;
        if (!alvo) { this.esconderDica(); return; }
        alvo.mesh.material.emissive.set(0x1e293b);

        const itens: VisualTooltipDataItem[] = [{ displayName: "Estado", value: `${alvo.geo.nome} (${alvo.geo.uf})` }, ...(alvo.dado?.tooltips ?? [])];
        if (!alvo.dado) itens.push({ displayName: "", value: "Sem dados no filtro atual" });
        this.host.tooltipService.show({
            coordinates: [e.clientX, e.clientY],
            isTouchEvent: e.pointerType === "touch",
            dataItems: itens,
            identities: alvo.dado ? [alvo.dado.selectionId] : []
        });
    }

    private esconderDica() {
        if (this.hover) this.hover.mesh.material.emissive.set(0x000000);
        this.hover = null;
        this.host.tooltipService.hide({ immediately: true, isTouchEvent: false });
    }

    private aplicarSelecao() {
        const selecionados = this.selectionManager.getSelectionIds() as ISelectionId[];
        for (const e of this.estados) {
            const marcado = !selecionados.length || (e.dado && selecionados.some(id => id.equals(e.dado.selectionId)));
            e.apagadoPara = marcado ? 0 : 1;
        }
    }

    // ---------------------------------------------------------------- câmera e animação

    private enquadrar() {
        // câmera ao sul, olhando para o mapa a ~50°; distância calculada para o mapa caber na menor dimensão
        const fovV = THREE.MathUtils.degToRad(this.camera.fov);
        const fovH = 2 * Math.atan(Math.tan(fovV / 2) * this.camera.aspect);
        const distancia = this.raio * 0.72 / Math.sin(Math.min(fovV, fovH) / 2);
        const direcao = new THREE.Vector3(0, 0.78, 0.63).normalize();
        // sem amortecimento, update() consome a inércia restante de um arraste; senão o mapa continuaria girando após o reset
        if (this.controls) { this.controls.enableDamping = false; this.controls.update(); }
        this.camera.position.copy(this.centro).addScaledVector(direcao, distancia);
        this.controls?.target.copy(this.centro);
        this.camera.lookAt(this.centro);
        if (this.controls) { this.controls.update(); this.controls.enableDamping = true; }
    }

    private animar = () => {
        this.quadro = requestAnimationFrame(this.animar);
        const agora = performance.now();
        for (const e of this.estados) {
            const p = Math.min(1, Math.max(0, (agora - this.inicioAnimacao - e.atrasoMs) / DURACAO_MS));
            const k = 1 - Math.pow(1 - p, 3);   // easeOutCubic
            const altura = e.alturaDe + (e.alturaPara - e.alturaDe) * k;
            e.mesh.scale.z = altura;
            // fora da seleção o estado vai para o cinza em vez de ficar transparente (transparência expõe faces internas)
            e.apagado += (e.apagadoPara - e.apagado) * 0.15;
            e.mesh.material.color.copy(e.corDe).lerp(e.corPara, k).lerp(CINZA_APAGADO, e.apagado * 0.85);
            e.rotulo.position.z = altura + 0.7;
            e.rotulo.material.opacity = 1 - e.apagado * 0.6;
        }
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    };

    public destroy() {
        cancelAnimationFrame(this.quadro);
        this.controls.dispose();
        this.renderer.dispose();
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
