"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class MapaCardSettings extends FormattingSettingsCard {
    corMin = new formattingSettings.ColorPicker({ name: "corMin", displayName: "Cor do menor valor", value: { value: "#2563EB" } });
    corMeio = new formattingSettings.ColorPicker({ name: "corMeio", displayName: "Cor do meio", value: { value: "#E2E8F0" } });
    corMax = new formattingSettings.ColorPicker({ name: "corMax", displayName: "Cor do maior valor", value: { value: "#EF4444" } });
    corSemDados = new formattingSettings.ColorPicker({ name: "corSemDados", displayName: "Cor sem dados", value: { value: "#CBD5E1" } });
    alturaMax = new formattingSettings.NumUpDown({ name: "alturaMax", displayName: "Altura máxima", value: 8 });
    escalaRaiz = new formattingSettings.ToggleSwitch({ name: "escalaRaiz", displayName: "Suavizar alturas (raiz quadrada)", value: true });
    rotulos = new formattingSettings.ToggleSwitch({ name: "rotulos", displayName: "Rótulos das UFs", value: true });
    legenda = new formattingSettings.ToggleSwitch({ name: "legenda", displayName: "Legenda de cores", value: true });
    autoRotacao = new formattingSettings.ToggleSwitch({ name: "autoRotacao", displayName: "Girar automaticamente", value: false });

    name: string = "mapa";
    displayName: string = "Mapa 3D";
    slices: Array<FormattingSettingsSlice> = [this.corMin, this.corMeio, this.corMax, this.corSemDados, this.alturaMax, this.escalaRaiz, this.rotulos, this.legenda, this.autoRotacao];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    mapaCard = new MapaCardSettings();

    cards = [this.mapaCard];
}
