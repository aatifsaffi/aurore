const fields = foundry.data.fields;

export class RaceData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:       new fields.HTMLField({ required: false, blank: true }),
      borrowRacialsFrom: new fields.ArrayField(new fields.StringField())
    };
  }
}
