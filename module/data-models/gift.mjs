const fields = foundry.data.fields;

export class GiftData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description:  new fields.HTMLField({ required: false, blank: true }),
      talentBonus:  new fields.StringField({ required: false, blank: true }),
      talentAmount: new fields.NumberField({ integer: true, initial: 5 })
    };
  }
}
