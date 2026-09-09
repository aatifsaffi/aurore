/**
 * compendium-import.mjs
 * Reads JSON source files and populates system compendium packs.
 * Called once on `ready` by a GM.  Skips entries that already exist (by name).
 *
 * Source format (flat array):
 *   [{ id, name, description?, borrowRacialsFrom?, folder?, ...extraFields }]
 *
 * `folder` is an optional "/"-separated path ("Monstres/Boréliens"). Missing
 * segments are created in the pack on import (Foundry caps the depth at 3).
 *
 * Each source file lives alongside the LevelDB pack directory:
 *   packs/races/races.json
 *   packs/racials/racials.json   (when added)
 *   etc.
 */

import { AOE_PATTERN_LEGEND, NPC_MAX_EQUIPMENT } from "../config.mjs";

const SYSTEM_ID = "aurore";

/** Trinity color key → compendium folder name (matches lang/fr.json AURORE.Trinity.*). */
const TRINITY_FOLDER = { red: "Rouge", green: "Vert", blue: "Bleu" };

/** Sort a Trinity-bearing record into its color folder. */
const trinityFolder = (record) => TRINITY_FOLDER[record.trinity] ?? TRINITY_FOLDER.red;

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
 * mapFn converts a source record to a Foundry document creation object.
 * Item packs return { type: <itemType>, ... }; Actor packs (e.g. npcs) return
 * { type: <actorType>, ... } — importPack resolves the document class from the
 * pack itself, so the same upsert loop handles both.
 */
const PACK_SOURCES = {
  weapons: {
    sourceFile:   `systems/${SYSTEM_ID}/packs/weapons/weapons.json`,
    itemType:     "weapon",
    alwaysUpdate: true,
    folderFn:     trinityFolder,
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
    folderFn:     trinityFolder,
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
    folderFn:     trinityFolder,
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
  },
  npcs: {
    sourceFile:   `systems/${SYSTEM_ID}/packs/npcs/npcs.json`,
    itemType:     "npc", // Actor sub-type; document class comes from the pack
    alwaysUpdate: true,
    // Folder hierarchy inside the pack. An explicit `folder` path on the record
    // wins; otherwise split humans vs monsters. Depth is capped at 3.
    folderFn(record) {
      return record.folder ?? (record.kind === "monster" ? "Monstres" : "Humanoïdes");
    },
    // kind === "human"  → weapon1 / weapon2 / armor / gadget names are resolved
    //   to embedded items in a second pass (importNpcEquipment), once the item
    //   packs are populated — mapFn only has names here, not compendium ids.
    // kind === "monster" → `equipment` is an inline array (max NPC_MAX_EQUIPMENT)
    //   written straight through; nothing is looked up in the packs.
    mapFn(record) {
      const r = record.resources ?? {};
      const m = record.mental    ?? {};
      // Source gives a single number per resource; expand to { value, max }.
      const pool = (val, fallback) => {
        const n = val ?? fallback;
        return { value: n, max: n };
      };
      const size = record.size ?? 1;
      const img  = record.img ?? "icons/svg/mystery-man.svg";
      const kind = record.kind === "monster" ? "monster" : "human";

      const equipment = kind === "monster"
        ? (record.equipment ?? []).slice(0, NPC_MAX_EQUIPMENT).map(e => {
            // Legacy source data used `trinity: "purple"` to mark an aurora
            // power. That's now `category: "boreale"` with a blank trinity.
            const boreale  = e.category === "boreale" || e.trinity === "purple";
            const category = boreale ? "boreale" : (e.category ?? "attack");
            const trinity  = boreale ? "" : (["red", "green", "blue"].includes(e.trinity) ? e.trinity : "red");
            return {
              name:        e.name ?? "",
              description: e.description ?? "",
              img:         e.img ?? "",
              category,
              trinity,
              damage:      e.damage ?? 0,
              range:       e.range ?? 1,
              aoeSize:     e.aoeSize ?? 0,
              aoePattern:  parseAoePattern(e.aoePattern ?? "", `${record.name} / ${e.name ?? "?"}`)
            };
          })
        : [];

      return {
        name:   record.name,
        type:   "npc",
        img,
        system: {
          kind,
          niveau:    record.niveau ?? 1,
          size,
          equipment,
          passif:    record.passif ?? "",
          resources: {
            pv: pool(r.pv, 20),
            pa: pool(r.pa, 3),
            pp: pool(r.pp, 0)
          },
          mental: {
            rage:     m.rage     ?? 0,
            surprise: m.surprise ?? 0,
            peur:     m.peur     ?? 0,
            mental:   m.mental   ?? 0,
            cm:       m.cm       ?? 5
          },
          portraitImage: record.portraitImage ?? img,
          biography:     record.biography     ?? ""
        },
        prototypeToken: {
          width:   size,
          height:  size,
          texture: { src: img }
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
    // aoePattern char legend ("." "e" "a" "n" "s" "m") is defined once in AOE_PATTERN_LEGEND (config.mjs).
    return Array.isArray(data) ? data : (data.items ?? null);
  } catch {
    return null;
  }
}

/**
 * Ensure a "/"-separated folder path exists inside a compendium pack, creating
 * any missing segments. Foundry caps compendium folder nesting at depth 3, so
 * extra segments are dropped.
 * @param {CompendiumCollection} pack
 * @param {string}               path   e.g. "Monstres/Boréliens"
 * @param {Map<string,string>}   cache  fullPath → folderId, reused across records
 * @returns {Promise<string|undefined>}  id of the deepest folder in the path
 */
async function ensureFolderPath(pack, path, cache) {
  const segments = String(path ?? "").split("/").map(s => s.trim()).filter(Boolean).slice(0, 3);
  if (!segments.length) return undefined;

  const folderType = pack.documentName; // "Actor" | "Item"
  let parentId;
  let running = "";

  for (const name of segments) {
    running = running ? `${running}/${name}` : name;
    let id = cache.get(running);
    if (!id) {
      const existing = pack.folders.find(
        f => f.name === name && (f.folder?.id ?? null) === (parentId ?? null)
      );
      id = existing?.id ?? (await Folder.createDocuments(
        [{ name, type: folderType, folder: parentId ?? null }],
        { pack: pack.collection }
      ))[0].id;
      cache.set(running, id);
    }
    parentId = id;
  }
  return parentId;
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
  const index       = await pack.getIndex({ fields: ["img", "folder"] });
  const existingMap = new Map(index.map(e => [e.name, e]));

  // Folders must be created before the documents that reference them, so the
  // pack is unlocked up front and re-locked once everything is written.
  await pack.configure({ locked: false });

  const folderCache = new Map();
  const toCreate    = [];
  const toUpdate    = [];

  for (const record of records) {
    if (!record.name) continue;
    const mapped   = config.mapFn(record);

    if (config.folderFn) {
      const folderId = await ensureFolderPath(pack, config.folderFn(record), folderCache);
      if (folderId) mapped.folder = folderId;
    }

    const existing = existingMap.get(record.name);
    if (!existing) {
      toCreate.push(mapped);
    } else if (config.alwaysUpdate) {
      // Full upsert — keep all system fields (and folder) in sync with source
      toUpdate.push({ _id: existing._id, ...mapped });
    } else if (existing.img !== mapped.img || (mapped.folder && existing.folder !== mapped.folder)) {
      // img or folder changed in source — update the existing entry
      toUpdate.push({ _id: existing._id, img: mapped.img, folder: mapped.folder ?? existing.folder });
    }
  }

  if (!toCreate.length && !toUpdate.length) {
    await pack.configure({ locked: true });
    console.log(`Aurore | Pack "${packName}" is already up to date.`);
    return;
  }

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
 * NPC source slot key → { equip field on NpcData, item pack it resolves against }.
 */
const NPC_EQUIP_SLOTS = {
  weapon1: { field: "system.equippedWeapon1", pack: "weapons" },
  weapon2: { field: "system.equippedWeapon2", pack: "weapons" },
  armor:   { field: "system.equippedArmor",   pack: "armors"  },
  gadget:  { field: "system.equippedGadget",  pack: "gadgets" }
};

/**
 * Second pass over the NPC source file: for `kind === "human"` records, resolve
 * each `weapon1` / `weapon2` / `armor` / `gadget` name into an embedded item on
 * the compendium actor and point the matching equip slot at it. Idempotent —
 * clears the NPC's embedded items first, so re-runs rebuild loadouts from source.
 * Monsters are skipped entirely: their gear lives inline in `system.equipment`.
 * Runs after the weapons/armors/gadgets packs have been synced.
 */
async function importNpcEquipment() {
  const npcPack = game.packs.get(`${SYSTEM_ID}.npcs`);
  const records = await fetchSource(PACK_SOURCES.npcs.sourceFile);
  if (!npcPack || !records?.length) return;

  // name → id index for each referenced item pack, built once.
  const itemIndex = {};
  for (const { pack: packName } of Object.values(NPC_EQUIP_SLOTS)) {
    if (itemIndex[packName]) continue;
    const p = game.packs.get(`${SYSTEM_ID}.${packName}`);
    itemIndex[packName] = p
      ? new Map((await p.getIndex()).map(e => [e.name, e._id]))
      : new Map();
  }

  await npcPack.configure({ locked: false });
  const npcByName = new Map((await npcPack.getIndex()).map(e => [e.name, e._id]));

  let equipped = 0;
  for (const record of records) {
    if (record.kind === "monster") continue; // inline system.equipment, nothing to resolve
    const npcId = npcByName.get(record.name);
    if (!npcId) continue;
    const actor = await npcPack.getDocument(npcId);

    if (actor.items.size) {
      await actor.deleteEmbeddedDocuments("Item", actor.items.map(i => i.id));
    }

    const equipUpdate = {};
    for (const [key, slot] of Object.entries(NPC_EQUIP_SLOTS)) {
      const wanted = record[key];
      if (!wanted) continue;
      const srcId = itemIndex[slot.pack].get(wanted);
      if (!srcId) {
        console.warn(`Aurore | NPC "${record.name}": ${key} "${wanted}" not found in "${slot.pack}" pack.`);
        continue;
      }
      const srcItem     = await game.packs.get(`${SYSTEM_ID}.${slot.pack}`).getDocument(srcId);
      const [created]   = await actor.createEmbeddedDocuments("Item", [srcItem.toObject()]);
      equipUpdate[slot.field] = created.id;
    }

    if (Object.keys(equipUpdate).length) {
      await actor.update(equipUpdate);
      equipped++;
    }
  }
  await npcPack.configure({ locked: true });

  if (equipped) console.log(`Aurore | Resolved equipment for ${equipped} NPC(s).`);
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
  await importNpcEquipment();
}
