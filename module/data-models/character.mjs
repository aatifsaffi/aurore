import { RESOURCES, MENTAL_STATS, TALENTS } from "../config.mjs";
import { resourceField, mentalStatField } from "./_common.mjs";

const fields = foundry.data.fields;

export class CharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    const resourceFields = {};
    for (const [key, cfg] of Object.entries(RESOURCES)) {
      resourceFields[key] = resourceField(cfg.default, cfg.default);
    }

    const mentalFields = {};
    for (const [key, cfg] of Object.entries(MENTAL_STATS)) {
      mentalFields[key] = mentalStatField(cfg.default, cfg.max);
    }

    const talentBonusFields = {};
    for (const key of Object.keys(TALENTS)) {
      talentBonusFields[key] = new fields.NumberField({ integer: true, initial: 0 });
    }

    return {
      resources: new fields.SchemaField(resourceFields),
      mental:    new fields.SchemaField(mentalFields),

      niveau:       new fields.NumberField({ required: true, integer: true, min: 1, initial: 1 }),
      raceId:       new fields.StringField({ initial: "" }),
      racialId:     new fields.StringField({ initial: "" }),
      talentFavori: new fields.StringField({ initial: "" }),

      talentBonuses: new fields.SchemaField(talentBonusFields),

      experiencePoints: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      // Currency — displayed on the sheet as "Dômes"
      gold: new fields.NumberField({ required: true, integer: true, min: 0, initial: 0 }),

      equippedWeapon1: new fields.StringField({ initial: "" }),
      equippedWeapon2: new fields.StringField({ initial: "" }),
      equippedArmor:   new fields.StringField({ initial: "" }),
      equippedGadget:  new fields.StringField({ initial: "" }),

      portraitImage: new fields.StringField({ required: false, blank: true }),
      biography:     new fields.HTMLField({ required: false, blank: true })
    };
  }

  prepareDerivedData() {
    const actor = this.parent;
    if (!actor) return;
    this.trinityDominant = this._computeDominantTrinity(actor);
  }

  /**
   * Compute dominant Trinity color from equipped items.
   * @param {AuroreActor} actor
   * @returns {"red"|"green"|"blue"|"balanced"}
   */
  _computeDominantTrinity(actor) {
    const counts = { red: 0, green: 0, blue: 0 };
    const slotIds = [
      this.equippedWeapon1,
      this.equippedWeapon2,
      this.equippedArmor,
      this.equippedGadget
    ];
    for (const id of slotIds) {
      if (!id) continue;
      const item = actor.items.get(id);
      if (item?.system.trinity) counts[item.system.trinity]++;
    }
    const max = Math.max(counts.red, counts.green, counts.blue);
    if (max === 0) return "balanced";
    const dominants = Object.entries(counts).filter(([, v]) => v === max);
    return dominants.length === 1 ? dominants[0][0] : "balanced";
  }
}
