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
