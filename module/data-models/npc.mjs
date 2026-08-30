import { RESOURCES, MENTAL_STATS } from "../config.mjs";
import { resourceField, mentalStatField } from "./_common.mjs";

const fields = foundry.data.fields;

export class NpcData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const resourceFields = {};
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      resourceFields[key] = resourceField(cfg.default, cfg.default);
    }

    const mentalFields = {};
    for (const [key, cfg] of Object.entries(MENTAL_STATS)) {
      mentalFields[key] = mentalStatField(cfg.default, cfg.max);
    }

    return {
      resources: new fields.SchemaField(resourceFields),
      mental:    new fields.SchemaField(mentalFields),
      niveau:    new fields.NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      biography: new fields.HTMLField({ required: false, blank: true })
    };
  }
}
