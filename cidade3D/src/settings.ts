"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class CidadeCardSettings extends FormattingSettingsCard {
    noite = new formattingSettings.ToggleSwitch({ name: "noite", displayName: "Começar no modo noite", value: false });
    permitirZoom = new formattingSettings.ToggleSwitch({ name: "permitirZoom", displayName: "Permitir zoom (roda do mouse)", value: true });
    animar = new formattingSettings.ToggleSwitch({ name: "animar", displayName: "Animações (trânsito, pessoas, entrada)", value: true });
    letreiro = new formattingSettings.ToggleSwitch({ name: "letreiro", displayName: "Letreiro de insights", value: true });

    name: string = "cidade";
    displayName: string = "Cidade";
    slices: Array<FormattingSettingsSlice> = [this.noite, this.permitirZoom, this.animar, this.letreiro];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    cidadeCard = new CidadeCardSettings();

    cards = [this.cidadeCard];
}
