const fields = foundry.data.fields;

export class RacialData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, blank: true }),
      display:     new fields.StringField({ initial: "" }),
      raceId:      new fields.StringField({ required: true, initial: "" })
    };
  }
}
