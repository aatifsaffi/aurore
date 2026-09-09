import { RESOURCES, MENTAL_STATS, NPC_KINDS, NPC_MAX_EQUIPMENT, NPC_EQUIPMENT_CATEGORIES } from "../config.mjs";
import { resourceField, mentalStatField, equipmentSlotFields, computeDominantTrinity } from "./_common.mjs";

const fields = foundry.data.fields;

/**
 * One inline piece of monster equipment. Shaped like a lightweight weapon so the
 * grid-highlight engine can consume it the same way it consumes equipped weapon
 * items. Only used when `kind === "monster"`.
 *
 * `category` tags what the entry is: "attack" gear carries a Trinity color;
 * "boreale" gear is an aurora power outside the Trinity, so `trinity` is blank.
 * @returns {foundry.data.fields.SchemaField}
 */
function npcEquipmentField() {
  return new fields.SchemaField({
    name:        new fields.StringField({ required: true, blank: false }),
    description: new fields.HTMLField({ required: false, blank: true }),
    img:         new fields.StringField({ required: false, blank: true }),
    category:    new fields.StringField({ required: true, initial: "attack", choices: Object.keys(NPC_EQUIPMENT_CATEGORIES) }),
    // Blank for "boreale" entries; a real color for "attack" entries.
    trinity:     new fields.StringField({ required: false, blank: true, initial: "", choices: ["red", "green", "blue"] }),
    damage:      new fields.NumberField({ integer: true, min: 0, initial: 0 }),
    range:       new fields.NumberField({ integer: true, min: 0, initial: 1 }),
    aoeSize:     new fields.NumberField({ integer: true, min: 0, initial: 0 }),
    aoePattern:  new fields.StringField({ required: false, blank: true, initial: "" })
  });
}

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

      // "human"  → equips compendium items via the equipment slots below.
      // "monster" → uses the inline `equipment` array instead.
      kind:      new fields.StringField({ required: true, initial: "human", choices: Object.keys(NPC_KINDS) }),

      // Token footprint on the grid. size = N makes the token occupy an N×N
      // block of cells (size 1 → 1 cell, size 2 → 4 cells, size 3 → 9 cells…).
      size:      new fields.NumberField({ required: true, integer: true, min: 1, initial: 1 }),

      ...equipmentSlotFields(),

      // Monster-specific gear. Capped at NPC_MAX_EQUIPMENT in prepareDerivedData.
      equipment: new fields.ArrayField(npcEquipmentField()),

      // Free-form passive trait / always-on effect for this NPC.
      passif:    new fields.HTMLField({ required: false, blank: true }),

      portraitImage: new fields.StringField({ required: false, blank: true }),
      biography:     new fields.HTMLField({ required: false, blank: true })
    };
  }

  /** @override */
  prepareDerivedData() {
    const actor = this.parent;
    if (!actor) return;

    // Humans equip from the compendiums; monsters never do.
    this.isMonster = this.kind === "monster";

    // Hard cap on inline monster equipment.
    if (this.equipment.length > NPC_MAX_EQUIPMENT) {
      this.equipment = this.equipment.slice(0, NPC_MAX_EQUIPMENT);
    }

    this.trinityDominant = this.isMonster
      ? computeDominantTrinityFromList(this.equipment)
      : computeDominantTrinity(actor, [
          this.equippedWeapon1,
          this.equippedWeapon2,
          this.equippedArmor,
          this.equippedGadget
        ]);
  }
}

/**
 * Dominant Trinity color from a list of objects that each carry a `trinity` key
 * (used for monster inline equipment, which has no backing items).
 * @param {Array<{trinity?: string}>} list
 * @returns {"red"|"green"|"blue"|"balanced"}
 */
function computeDominantTrinityFromList(list) {
  const counts = { red: 0, green: 0, blue: 0 };
  for (const entry of list) {
    if (entry?.trinity && entry.trinity in counts) counts[entry.trinity]++;
  }
  const max = Math.max(counts.red, counts.green, counts.blue);
  if (max === 0) return "balanced";
  const dominants = Object.entries(counts).filter(([, v]) => v === max);
  return dominants.length === 1 ? dominants[0][0] : "balanced";
}
