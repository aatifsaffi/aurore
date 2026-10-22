const fields = foundry.data.fields;

/** Free-form inventory item: the document name is its title. */
export class ExtraData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ required: false, blank: true })
    };
  }
}
