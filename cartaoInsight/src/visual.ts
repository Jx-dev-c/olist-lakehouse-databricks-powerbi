"use strict";

import powerbi from "powerbi-visuals-api";
import { FormattingSettingsService } from "powerbi-visuals-utils-formattingmodel";
import "./../style/visual.less";

import VisualConstructorOptions = powerbi.extensibility.visual.VisualConstructorOptions;
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisual = powerbi.extensibility.visual.IVisual;
import IVisualEventService = powerbi.extensibility.IVisualEventService;

import { VisualFormattingSettingsModel } from "./settings";

/**
 * Cartão de insight escuro: rótulo, manchete e texto vindos de medidas DAX.
 * O texto é calculado no contexto de filtro, então o insight acompanha os filtros
 * (uma caixa de texto estática ficaria errada ao filtrar).
 */
export class Visual implements IVisual {
    private events: IVisualEventService;
    private formattingSettings: VisualFormattingSettingsModel;
    private formattingSettingsService = new FormattingSettingsService();

    private cartao: HTMLElement;
    private rotulo: HTMLElement;
    private titulo: HTMLElement;
    private texto: HTMLElement;
    private ultimo = "";

    constructor(options: VisualConstructorOptions) {
        this.events = options.host.eventService;
        this.cartao = this.el("div", "insight", options.element);
        this.rotulo = this.el("div", "insight-rotulo", this.cartao);
        this.titulo = this.el("div", "insight-titulo", this.cartao);
        this.texto = this.el("div", "insight-texto", this.cartao);
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
            const cfg = this.formattingSettings.insightCard;
            const colunas = dataView?.categorical?.values ? [...dataView.categorical.values] : [];
            const valor = (papel: string) => {
                const c = colunas.find(x => x.source.roles?.[papel]);
                return c && c.values[0] != null ? String(c.values[0]) : "";
            };

            this.rotulo.textContent = cfg.rotulo.value;
            this.rotulo.style.color = cfg.corRotulo.value.value;
            const titulo = valor("titulo"), texto = valor("texto");
            this.titulo.textContent = titulo || "Arraste uma medida de texto para \"Manchete\".";
            this.texto.textContent = texto;

            // quando o texto muda (filtro), a manchete entra de novo: sinaliza que o insight foi recalculado
            const assinatura = titulo + "|" + texto;
            if (assinatura !== this.ultimo) {
                this.cartao.classList.remove("novo");
                void this.cartao.offsetWidth;
                this.cartao.classList.add("novo");
                this.ultimo = assinatura;
            }
            this.events.renderingFinished(options);
        } catch (erro) {
            this.events.renderingFailed(options, String(erro));
        }
    }

    public getFormattingModel(): powerbi.visuals.FormattingModel {
        return this.formattingSettingsService.buildFormattingModel(this.formattingSettings);
    }
}
