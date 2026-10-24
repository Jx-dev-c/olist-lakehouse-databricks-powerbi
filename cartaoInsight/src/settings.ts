"use strict";

import { formattingSettings } from "powerbi-visuals-utils-formattingmodel";

import FormattingSettingsCard = formattingSettings.SimpleCard;
import FormattingSettingsSlice = formattingSettings.Slice;
import FormattingSettingsModel = formattingSettings.Model;

class InsightCardSettings extends FormattingSettingsCard {
    rotulo = new formattingSettings.TextInput({ name: "rotulo", displayName: "Rótulo", value: "INSIGHT", placeholder: "INSIGHT" });
    corRotulo = new formattingSettings.ColorPicker({ name: "corRotulo", displayName: "Cor do rótulo", value: { value: "#22D3EE" } });

    name: string = "insight";
    displayName: string = "Cartão Insight";
    slices: Array<FormattingSettingsSlice> = [this.rotulo, this.corRotulo];
}

export class VisualFormattingSettingsModel extends FormattingSettingsModel {
    insightCard = new InsightCardSettings();

    cards = [this.insightCard];
}
