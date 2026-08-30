/**
 * compendium-import.mjs
 * Reads JSON source files and populates system compendium packs.
 * Called once on `ready` by a GM.  Skips entries that already exist (by name).
 *
 * Source format (flat array):
 *   [{ id, name, description?, borrowRacialsFrom?, ...extraFields }]
 *
 * Each source file lives alongside the LevelDB pack directory:
 *   packs/races/races.json
 *   packs/racials/racials.json   (when added)
 *   etc.
 */

import { AOE_PATTERN_LEGEND } from "../config.mjs";

const SYSTEM_ID = "aurore";

/** char → stored integer index, derived from AOE_PATTERN_LEGEND. */
const AOE_CHAR = Object.fromEntries(
  Object.entries(AOE_PATTERN_LEGEND).map(([char, def]) => [char, def.index])
);

/**
 * Convert char-notation aoePattern ("..e.eeee") to stored integer JSON ("[0,0,1,0,1,1,1,1]").
 * @param {string} pattern
 * @param {string} [context]  Record name, for warning messages on unknown characters.
 */
function parseAoePattern(pattern, context = "") {
  if (!pattern) return "";
  if (pattern.startsWith("[")) return pattern; // already numeric JSON
  return JSON.stringify(pattern.split("").map(c => {
    if (!(c in AOE_CHAR)) {
      console.warn(`Aurore | Unknown aoePattern character "${c}"${context ? ` in "${context}"` : ""} — treating as off.`);
      return 0;
    }
    return AOE_CHAR[c];
  }));
}

/**
 * Map of pack name → { sourceFile, itemType, mapFn }
 * mapFn converts a source record to a Foundry Item creation object.
 */
const PACK_SOURCES = {
  weapons: {
    sourceFile:   `systems/${SYSTEM_ID}/packs/weapons/weapons.json`,
    itemType:     "weapon",
    alwaysUpdate: true,
    mapFn(record) {
      return {
        name:   record.name,
        type:   "weapon",
        img:    record.img ?? "icons/svg/sword.svg",
        system: {
          description: record.description ?? "",
          trinity:     record.trinity     ?? "red",
          heavy:       record.heavy       ?? false,
          damage:      record.damage      ?? 0,
          range:       record.range       ?? 1,
          aoeSize:     record.aoeSize     ?? 0,
          aoePattern:  parseAoePattern(record.aoePattern ?? "", record.name)
        }
      };
    }
  },
  armors: {
    sourceFile:   `systems/${SYSTEM_ID}/packs/armors/armors.json`,
    itemType:     "armor",
    alwaysUpdate: true,
    mapFn(record) {
      return {
        name:   record.name,
        type:   "armor",
        img:    record.img ?? "icons/svg/shield.svg",
        system: {
          description:    record.description    ?? "",
          trinity:        record.trinity        ?? "red",
          ppBonus:        record.ppBonus        ?? 20,
          cmModifier:     record.cmModifier     ?? -1,
          aoeSize:        record.aoeSize        ?? 2,
          highlightColor: record.highlightColor || "#ff000044",
          aoePattern:     parseAoePattern(record.aoePattern ?? "", record.name)
        }
      };
    }
  },
  gadgets: {
    sourceFile:   `systems/${SYSTEM_ID}/packs/gadgets/gadgets.json`,
    itemType:     "gadget",
    alwaysUpdate: true,
    mapFn(record) {
      const maxUses = record.maxUses ?? 3;
      return {
        name:   record.name,
        type:   "gadget",
        img:    record.img ?? "icons/svg/item-bag.svg",
        system: {
          description:    record.description    ?? "",
          trinity:        record.trinity        ?? "red",
          maxUses,
          usesLeft:       record.usesLeft       ?? maxUses,
          range:          record.range          ?? 1,
          aoeSize:        record.aoeSize        ?? 2,
          highlightColor: record.highlightColor || "#ff000044",
          aoePattern:     parseAoePattern(record.aoePattern ?? "", record.name)
        }
      };
    }
  },
  races: {
    sourceFile: `systems/${SYSTEM_ID}/packs/races/races.json`,
    itemType:   "race",
    mapFn(record) {
      return {
        name:   record.name,
        type:   "race",
        img:    record.img ?? "icons/svg/item-bag.svg",
        system: {
          description:       record.description       ?? "",
          borrowRacialsFrom: record.borrowRacialsFrom ?? []
        }
      };
    }
  },
  racials: {
    sourceFile: `systems/${SYSTEM_ID}/packs/racials/racials.json`,
    itemType:   "racial",
    mapFn(record) {
      return {
        name:   record.name,
        type:   "racial",
        img:    record.img ?? "icons/svg/item-bag.svg",
        system: {
          description: record.description ?? "",
          raceId:      record.raceId      ?? "",
          display:     record.display     ?? ""
        }
      };
    }
  }
};

/**
 * Fetch JSON source data for a pack.
 * @param {string} path  URL path (relative to Foundry root)
 * @returns {Promise<Array|null>}
 */
async function fetchSource(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const data = await res.json();
    // Support envelope format { items: [...] } as well as plain arrays.
    // aoePattern char legend ("." "e" "a" "n" "s") is defined once in AOE_PATTERN_LEGEND (config.mjs).
    return Array.isArray(data) ? data : (data.items ?? null);
  } catch {
    return null;
  }
}

/**
 * Import one source file into its compendium pack.
 * @param {string} packName  e.g. "races"
 */
async function importPack(packName) {
  const config = PACK_SOURCES[packName];
  if (!config) return;

  const pack = game.packs.get(`${SYSTEM_ID}.${packName}`);
  if (!pack) {
    console.warn(`Aurore | Compendium pack "${SYSTEM_ID}.${packName}" not found.`);
    return;
  }

  const records = await fetchSource(config.sourceFile);
  if (!records?.length) {
    console.log(`Aurore | No source data found at ${config.sourceFile} — skipping.`);
    return;
  }

  // Build a name → existing entry map for upsert (create new, update changed)
  const index       = await pack.getIndex({ fields: ["img"] });
  const existingMap = new Map(index.map(e => [e.name, e]));

  const toCreate = [];
  const toUpdate = [];

  for (const record of records) {
    if (!record.name) continue;
    const mapped   = config.mapFn(record);
    const existing = existingMap.get(record.name);
    if (!existing) {
      toCreate.push(mapped);
    } else if (config.alwaysUpdate) {
      // Full upsert — keep all system fields in sync with source
      toUpdate.push({ _id: existing._id, ...mapped });
    } else if (existing.img !== mapped.img) {
      // img changed in source — update the existing entry
      toUpdate.push({ _id: existing._id, img: mapped.img });
    }
  }

  if (!toCreate.length && !toUpdate.length) {
    console.log(`Aurore | Pack "${packName}" is already up to date.`);
    return;
  }

  await pack.configure({ locked: false });
  if (toCreate.length) {
    await pack.documentClass.createDocuments(toCreate, { pack: pack.collection });
  }
  if (toUpdate.length) {
    await pack.documentClass.updateDocuments(toUpdate, { pack: pack.collection });
  }
  await pack.configure({ locked: true });

  const total = toCreate.length + toUpdate.length;
  console.log(`Aurore | Synced ${total} entries in "${packName}" (${toCreate.length} created, ${toUpdate.length} updated).`);
  ui.notifications.info(
    `Aurore : ${total} entrée(s) synchronisée(s) dans le compendium « ${pack.metadata.label} ».`
  );
}

/**
 * Import all configured source packs.
 * Only runs for the GM and only if source files are present.
 */
export async function importAllPacks() {
  if (!game.user.isGM) return;
  for (const packName of Object.keys(PACK_SOURCES)) {
    await importPack(packName);
  }
}
