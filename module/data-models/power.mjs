const fields = foundry.data.fields;

export class PowerData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, blank: true }),
      powerType:   new fields.StringField({ required: true, initial: "active", choices: ["active", "passive"] }),
      cost:        new fields.NumberField({ integer: true, min: 0, initial: 0 }),
      category:    new fields.StringField({ initial: "" }),
      requirements: new fields.SchemaField({
        minLevel: new fields.NumberField({ integer: true, min: 0, initial: 0 }),
        raceIds:  new fields.ArrayField(new fields.StringField())
      })
    };
  }
}
