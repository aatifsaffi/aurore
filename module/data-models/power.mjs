import { POWER_DISCIPLINES } from "../config.mjs";

const fields = foundry.data.fields;

export class PowerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, blank: true }),
      discipline:  new fields.StringField({ required: true, initial: "passif", choices: Object.keys(POWER_DISCIPLINES) }),
      // Blank = outside the Trinity (auromancie powers).
      trinity:     new fields.StringField({ required: true, blank: true, initial: "", choices: ["", "red", "green", "blue"] })
    };
  }
}
