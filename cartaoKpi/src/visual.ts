"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import { valueFormatter } from "powerbi-visuals-utils-formattingutils";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;
import DataViewValueColumn = powerbi.DataViewValueColumn;

import { VisualFormattingSettingsModel } from "./settings";

const SVG = "http://www.w3.org/2000/svg";
const CONTAGEM_MS = 900;

/** Cartão de KPI em HTML/CSS: rótulo, valor com contagem animada, pílula ▲▼ e minigráfico que se desenha. */
export class Visual implements IVisual {
    private events: IVisualEventService;
    private locale: string;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService = new FormattingSettingsService();

    private cartao: HTMLElement;
    private rotulo: HTMLElement;
    private valor: HTMLElement;
    private pilulas: HTMLElement[];
    private comparacao: HTMLElement;
    private aviso: HTMLElement;
    private serie: HTMLElement;
    private svg: SVGSVGElement;
    private gradiente: SVGStopElement[];
    private area: SVGPathElement;
    private linha: SVGPathElement;
    private ponto: HTMLElement;

    private valorExibido = 0;
    private quadro = 0;
    private assinaturaSerie = "";

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.locale = options.host.locale;

        this.cartao = this.el("div", "kpi", options.element);
        // título à esquerda e o período de referência à direita (ex.: "ago/18")
        const cabecalho = this.el("div", "kpi-cabecalho", this.cartao);
        this.rotulo = this.el("div", "kpi-rotulo", cabecalho);
        this.comparacao = this.el("span", "kpi-comparacao", cabecalho);
        this.valor = this.el("div", "kpi-valor", this.cartao);
        // até duas pílulas: variação contra o mês anterior (m/m) e contra o mesmo mês do ano anterior (a/a)
        const rodape = this.el("div", "kpi-rodape", this.cartao);
        this.pilulas = [this.el("span", "kpi-pilula", rodape), this.el("span", "kpi-pilula", rodape)];
        this.aviso = this.el("div", "kpi-aviso", this.cartao);
        this.aviso.textContent = "Arraste uma medida para \"Valor\".";

        // minigráfico: área com gradiente + linha + ponto final; viewBox 100x30 esticado no espaço disponível
        this.serie = this.el("div", "kpi-serie", this.cartao);
        this.svg = document.createElementNS(SVG, "svg");
        this.svg.setAttribute("viewBox", "0 0 100 30");
        this.svg.setAttribute("preserveAspectRatio", "none");
        const id = "g" + window.crypto.getRandomValues(new Uint32Array(1))[0].toString(36);
        const defs = document.createElementNS(SVG, "defs");
        const grad = document.createElementNS(SVG, "linearGradient");
        grad.setAttribute("id", id);
        Object.entries({ x1: "0", y1: "0", x2: "0", y2: "1" }).forEach(([k, v]) => grad.setAttribute(k, v));
        this.gradiente = [0, 1].map(o => {
            const stop = document.createElementNS(SVG, "stop");
            stop.setAttribute("offset", String(o));
            grad.appendChild(stop);
            return stop;
        });
        defs.appendChild(grad);
        this.area = document.createElementNS(SVG, "path");
        this.area.setAttribute("class", "area");
        this.area.setAttribute("fill", `url(#${id})`);
        this.linha = document.createElementNS(SVG, "path");
        this.linha.setAttribute("class", "linha");
        this.linha.setAttribute("pathLength", "1");
        this.svg.append(defs, this.area, this.linha);
        this.serie.appendChild(this.svg);
        // ponto final em HTML: dentro do SVG esticado (preserveAspectRatio=none) o círculo viraria elipse
        this.ponto = this.el("span", "ponto", this.serie);
    }

    private el(tag: string, classe: string, pai: HTMLElement): HTMLElement {
        const e = document.createElement(tag);
        e.className = classe;
        pai.appendChild(e);
        return e;
    }

    public update(options: VisualUpdateOptions) {
        this.events.renderingStarted(options);
        try {
            const dataView = options.dataViews?.[0];
            this.formattingSettings = this.formattingSettingsService.populateFormattingSettingsModel(VisualFormattingSettingsModel, dataView);
            const cfg = this.formattingSettings.cartaoCard;
            const animar = cfg.animar.value;
            this.cartao.classList.toggle("animado", animar);
            const escuro = cfg.destaque.value;
            this.cartao.classList.toggle("escuro", escuro);
            // no cartão em destaque (degradê azul → ciano) o minigráfico fica branco
            const corSerie = escuro ? "#FFFFFF" : cfg.corDestaque.value.value;

            const colunas: DataViewValueColumn[] = dataView?.categorical?.values ? [...dataView.categorical.values] : [];
            const col = (papel: string) => colunas.find(c => c.source.roles?.[papel]);
            const colValor = col("valor"), colVar = col("variacao"), colComp = col("comparacao"), colSerie = col("serie");

            this.aviso.style.display = colValor ? "none" : "block";
            this.cartao.style.setProperty("--destaque", cfg.corDestaque.value.value);
            this.dimensionar(options.viewport.width, options.viewport.height);

            // rótulo
            this.rotulo.textContent = cfg.titulo.value || colValor?.source.displayName || "";

            // valor com contagem do valor anterior até o novo (formatado com o formato e o idioma do relatório)
            const valor = colValor ? Number(colValor.values[0]) : NaN;
            // a partir de 1 milhão, unidade automática (R$ 15,8 mi); abaixo disso, o formato da medida como está
            const fmtValor = colValor ? valueFormatter.create({
                format: colValor.source.format,
                cultureSelector: this.locale,
                ...(Math.abs(valor) >= 1e6 ? { value: Math.abs(valor), precision: 1 } : {})
            }) : null;
            this.contar(isFinite(valor) ? valor : null, fmtValor, animar);

            // pílulas de variação: seta + valor sem sinal + rótulo do comparativo; cor pelo sentido bom/ruim
            const colVar2 = col("variacao2");
            this.preencherPilula(this.pilulas[0], colVar, cfg.rotuloVar1.value, cfg, escuro, animar);
            this.preencherPilula(this.pilulas[1], colVar2, cfg.rotuloVar2.value, cfg, escuro, animar);
            const comp = colComp?.values[0];
            this.comparacao.textContent = comp != null ? String(comp) : "";

            // minigráfico
            const pontos = String(colSerie?.values[0] ?? "").split(";").map(s => parseFloat(s.replace(",", "."))).filter(v => isFinite(v));
            this.desenharSerie(cfg.mostrarSerie.value ? pontos : [], corSerie, animar);

            this.events.renderingFinished(options);
        } catch (erro) {
            this.events.renderingFailed(options, String(erro));
        }
    }

    /**
     * Uma pílula de variação. Regra de neutralidade: se o valor formatado na precisão exibida é zero
     * (ex.: -0,007 com formato 0,00 → "0,00"), mostra ■ em cinza, nunca ▲ verde ou ▼ vermelho.
     */
    private preencherPilula(el: HTMLElement, col: DataViewValueColumn, rotulo: string, cfg: VisualFormattingSettingsModel["cartaoCard"], escuro: boolean, animar: boolean) {
        const v = col && col.values[0] != null ? Number(col.values[0]) : NaN;
        el.classList.remove("alerta");
        if (!isFinite(v)) { el.style.display = "none"; return; }
        const fmt = valueFormatter.create({ format: col.source.format, cultureSelector: this.locale });
        const texto = fmt.format(Math.abs(v)).replace(/^[+\-−]\s*/, "");
        const sentido = /[1-9]/.test(texto) ? Math.sign(v) : 0;
        const bom = sentido === 0 ? null : (sentido > 0) === cfg.subirEhBom.value;
        const seta = sentido > 0 ? "▲" : sentido < 0 ? "▼" : "■";
        el.textContent = `${seta} ${texto}${rotulo ? " " + rotulo : ""}`;
        el.style.display = "";
        const cor = bom === null ? "#64748B" : bom ? cfg.corBom.value.value : cfg.corRuim.value.value;
        // no cartão em destaque, pílula branca sólida com texto na cor (verde/vermelho sobre azul some)
        el.style.color = cor;
        el.style.background = escuro ? "#FFFFFF" : bom === null ? "#F1F5F9" : this.transparente(cor, 0.12);
        el.style.setProperty("--cor-pilula", cor);
        // variação ruim: a pílula pulsa duas vezes para puxar o olho, depois fica parada
        if (bom === false && animar) {
            void el.offsetWidth;
            el.classList.add("alerta");
        }
    }

    /** Tamanho da fonte acompanha o card: o número ocupa ~38% da altura, limitado pela largura. */
    private dimensionar(w: number, h: number) {
        const fonte = Math.max(14, Math.min(h * 0.34, w * 0.15, 40));
        this.cartao.style.setProperty("--fonte-valor", `${fonte}px`);
        this.cartao.classList.toggle("compacto", h < 80);
    }

    /** Se o número final não cabe na largura do cartão, reduz a fonte na proporção exata. */
    private caberNaLargura() {
        this.valor.style.fontSize = "";
        const sobra = this.valor.clientWidth / Math.max(1, this.valor.scrollWidth);
        if (sobra < 1) this.valor.style.fontSize = `calc(var(--fonte-valor) * ${(sobra * 0.97).toFixed(3)})`;
    }

    private contar(alvo: number | null, fmt: valueFormatter.IValueFormatter, animar: boolean) {
        cancelAnimationFrame(this.quadro);
        if (alvo === null || !fmt) { this.valor.textContent = alvo === null ? "—" : String(alvo); return; }
        const inicio = performance.now();
        const de = animar ? this.valorExibido : alvo;
        // inteiros grandes contam em inteiros; valores pequenos (nota, %) contam com casas decimais pelo formato
        const passo = (agora: number) => {
            const p = Math.min(1, (agora - inicio) / CONTAGEM_MS);
            const k = 1 - Math.pow(1 - p, 3);
            this.valorExibido = de + (alvo - de) * k;
            this.valor.textContent = fmt.format(p < 1 ? this.valorExibido : alvo);
            if (p === 1) this.caberNaLargura();
            if (p < 1) this.quadro = requestAnimationFrame(passo);
        };
        this.quadro = requestAnimationFrame(passo);
    }

    private desenharSerie(pontos: number[], cor: string, animar: boolean) {
        this.serie.style.display = pontos.length >= 2 ? "" : "none";
        this.cartao.classList.toggle("com-serie", pontos.length >= 2);
        if (pontos.length < 2) return;
        const min = Math.min(...pontos), max = Math.max(...pontos);
        const xy = pontos.map((v, i) => [i / (pontos.length - 1) * 100, 27 - (max > min ? (v - min) / (max - min) : 0.5) * 24]);
        const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
        this.linha.setAttribute("d", d);
        this.area.setAttribute("d", `${d} L100,30 L0,30 Z`);
        const [ux, uy] = xy[xy.length - 1];
        this.ponto.style.left = `${ux}%`;
        this.ponto.style.top = `${uy / 30 * 100}%`;
        this.linha.style.stroke = cor;
        this.ponto.style.background = cor;
        this.gradiente[0].setAttribute("stop-color", cor);
        this.gradiente[0].setAttribute("stop-opacity", "0.28");
        this.gradiente[1].setAttribute("stop-color", cor);
        this.gradiente[1].setAttribute("stop-opacity", "0");

        // redesenha (reinicia a animação CSS) só quando a série muda, não a cada redimensionamento
        const assinatura = d + cor;
        if (animar && assinatura !== this.assinaturaSerie) {
            this.serie.classList.remove("desenhar");
            void this.serie.getBoundingClientRect();   // força reflow para a animação recomeçar
            this.serie.classList.add("desenhar");
        }
        this.assinaturaSerie = assinatura;
    }

    private transparente(hex: string, alfa: number): string {
        const n = parseInt(hex.replace("#", ""), 16);
        return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
    }

    public destroy() {
        cancelAnimationFrame(this.quadro);
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
