const fields = foundry.data.fields;

export class ArmorData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:    new fields.HTMLField({ required: false, blank: true }),
      trinity:        new fields.StringField({ required: true, initial: "red", choices: ["red", "green", "blue"] }),
      ppBonus:        new fields.NumberField({ integer: true, initial: 20 }),
      cmModifier:     new fields.NumberField({ integer: true, initial: -1 }),
      aoeSize:        new fields.NumberField({ integer: true, min: 0, initial: 2 }),
      highlightColor: new fields.StringField({ initial: "#ff000044" }),
      aoePattern:     new fields.StringField({ required: false, blank: true, initial: "" })
    };
  }
}
