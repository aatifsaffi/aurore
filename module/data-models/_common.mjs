const fields = foundry.data.fields;

/**
 * Returns a SchemaField with value/max NumberFields for resource pools (PV, PA, PP).
 * @param {number} initialValue
 * @param {number} initialMax
 * @returns {foundry.data.fields.SchemaField}
 */
export function resourceField(initialValue, initialMax) {
  return new fields.SchemaField({
    value: new fields.NumberField({ required: true, integer: true, min: 0, initial: initialValue }),
    max:   new fields.NumberField({ required: true, integer: true, min: 0, initial: initialMax })
  });
}

/**
 * Returns a NumberField for a mental stat (rage/surprise/peur have a max, mental/cm do not).
 * @param {number} [initialValue=0]
 * @param {number} [max]
 * @returns {foundry.data.fields.NumberField}
 */
export function mentalStatField(initialValue = 0, max) {
  const opts = { required: true, integer: true, min: 0, initial: initialValue };
  if (max !== undefined) opts.max = max;
  return new fields.NumberField(opts);
}

/**
 * Returns the four equipment-slot StringFields shared by every actor type
 * (weapon1, weapon2, armor, gadget). Each holds an embedded item id.
 * @returns {Record<string, foundry.data.fields.StringField>}
 */
export function equipmentSlotFields() {
  return {
    equippedWeapon1: new fields.StringField({ initial: "" }),
    equippedWeapon2: new fields.StringField({ initial: "" }),
    equippedArmor:   new fields.StringField({ initial: "" }),
    equippedGadget:  new fields.StringField({ initial: "" })
  };
}

/**
 * Compute the dominant Trinity color from a list of equipped item ids.
 * @param {Actor}    actor    The actor owning the items.
 * @param {string[]} slotIds  Embedded item ids for each equipment slot.
 * @returns {"red"|"green"|"blue"|"balanced"}
 */
export function computeDominantTrinity(actor, slotIds) {
  const counts = { red: 0, green: 0, blue: 0 };
  for (const id of slotIds) {
    if (!id) continue;
    const item = actor.items.get(id);
    if (item?.system?.trinity) counts[item.system.trinity]++;
  }
  const max = Math.max(counts.red, counts.green, counts.blue);
  if (max === 0) return "balanced";
  const dominants = Object.entries(counts).filter(([, v]) => v === max);
  return dominants.length === 1 ? dominants[0][0] : "balanced";
}
