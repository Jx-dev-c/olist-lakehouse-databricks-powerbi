"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class CartaoCardSettings extends FormattingSettingsCard {
    titulo = new formattingSettings.TextInput({ name: "titulo", displayName: "Título (vazio = nome da medida)", value: "", placeholder: "Receita" });
    destaque = new formattingSettings.ToggleSwitch({ name: "destaque", displayName: "Cartão em destaque (fundo escuro)", value: false });
    subirEhBom = new formattingSettings.ToggleSwitch({ name: "subirEhBom", displayName: "Subir é bom", value: true });
    rotuloVar1 = new formattingSettings.TextInput({ name: "rotuloVar1", displayName: "Rótulo da variação 1", value: "m/m", placeholder: "m/m" });
    rotuloVar2 = new formattingSettings.TextInput({ name: "rotuloVar2", displayName: "Rótulo da variação 2", value: "a/a", placeholder: "a/a" });
    corDestaque = new formattingSettings.ColorPicker({ name: "corDestaque", displayName: "Cor de destaque", value: { value: "#2563EB" } });
    corBom = new formattingSettings.ColorPicker({ name: "corBom", displayName: "Cor de variação boa", value: { value: "#10B981" } });
    corRuim = new formattingSettings.ColorPicker({ name: "corRuim", displayName: "Cor de variação ruim", value: { value: "#EF4444" } });
    mostrarSerie = new formattingSettings.ToggleSwitch({ name: "mostrarSerie", displayName: "Minigráfico", value: true });
    animar = new formattingSettings.ToggleSwitch({ name: "animar", displayName: "Animações", value: true });

    name: string = "cartao";
    displayName: string = "Cartão KPI";
    slices: Array<FormattingSettingsSlice> = [this.titulo, this.destaque, this.subirEhBom, this.rotuloVar1, this.rotuloVar2, this.corDestaque, this.corBom, this.corRuim, this.mostrarSerie, this.animar];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    cartaoCard = new CartaoCardSettings();

    cards = [this.cartaoCard];
}
