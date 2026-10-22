import { SYSTEM_ID, TALENTS } from "../config.mjs";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " " };

/**
 * Convert Foundry HTML descriptions to aur-sheet's text format ("\n" line breaks, **bold**).
 * @param {string} html
 * @returns {string}
 */
export function htmlToText(html) {
  return (html ?? "")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<\/?(strong|b)>/gi, "**")
    // aur-sheet's own color markup (<red>, <green>, <blue>) is kept; other tags are dropped.
    .replace(/<(?!\/?(red|green|blue)>)[^>]+>/gi, "")
    .replace(/&(#x?[0-9a-f]+|\w+);/gi, (match, code) => {
      if (code[0] !== "#") return ENTITIES[code.toLowerCase()] ?? match;
      return String.fromCodePoint(code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10));
    })
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Item type → pack source aur-sheet also ships (ids are shared through `npm run data:aur-sheet`). */
const SOURCE_PACKS = { weapon: "weapons", armor: "armors", gadget: "gadgets", power: "powers", gift: "gifts", racial: "racials" };

let sourcesPromise = null;

/**
 * Load the pack sources once, as item type → (name → record).
 * @returns {Promise<Record<string, Map<string, object>>>}
 */
function loadSources() {
  sourcesPromise ??= Promise.all(Object.entries(SOURCE_PACKS).map(async ([type, pack]) => {
    const data = await foundry.utils.fetchJsonWithTimeout(`systems/${SYSTEM_ID}/packs/${pack}/${pack}.json`).catch(() => []);
    const records = Array.isArray(data) ? data : (data.items ?? []);
    return [type, new Map(records.map(r => [r.name, r]))];
  })).then(Object.fromEntries);
  return sourcesPromise;
}

/**
 * Build the compact (v2) envelope aur-sheet's /render page expands.
 * Items aur-sheet knows are sent as their pack id; anything else (GM-made or
 * edited items) travels inline as { n: name, d: description, c: trinity, h: heavy }.
 * @param {Actor} actor  A character actor.
 * @returns {Promise<object>}
 */
export async function buildAurSheetEnvelope(actor) {
  const system  = actor.system;
  const sources = await loadSources();
  const normalize = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const ofType = type => actor.items.filter(i => i.type === type);

  /** Pack id if aur-sheet has this exact item, else null. */
  const sourceId = item => {
    const id = item.flags?.[SYSTEM_ID]?.sourceId;
    const record = sources[item.type]?.get(item.name);
    if (!record || (id && record.id !== id)) return null;
    const same = htmlToText(record.description) === htmlToText(item.system.description)
      && (record.trinity === undefined || record.trinity === item.system.trinity)
      && (record.heavy === undefined || record.heavy === item.system.heavy);
    return same ? record.id : null;
  };
  /** Id, or the inline item with only the fields its slot shows. */
  const ref = (item, fields = {}) => {
    if (!item) return null;
    return sourceId(item) ?? { n: item.name, d: htmlToText(item.system.description), ...fields };
  };
  const equipmentRef = item => item && ref(item, { c: item.system.trinity, ...(item.type === "weapon" ? { h: item.system.heavy } : {}) });

  const equipped = [system.equippedWeapon1, system.equippedWeapon2, system.equippedArmor, system.equippedGadget]
    .map(id => actor.items.get(id) ?? null);
  const equippedIds = new Set(equipped.filter(Boolean).map(i => i.id));
  const backpackType = item => {
    if (item.type === "weapon") return item.system.heavy ? "weapon-heavy" : "weapon-light";
    return item.type === "extra" ? "consumable" : item.type;
  };

  const race   = ofType("race")[0];
  const racial = ofType("racial")[0];
  const mental = system.mental;

  return {
    v: 2,
    // Stable per actor so the sheet number stays the same across exports.
    id: `AUR-${actor.id.slice(0, 5).toUpperCase()}`,
    n: actor.name,
    s: [system.resources.pv.max, system.resources.pa.max, system.resources.pp.max,
        mental.rage, mental.surprise, mental.peur, mental.mental, mental.cm,
        system.niveau, system.experiencePoints],
    r: race ? normalize(race.name) : "",
    rc: racial ? ref(racial, { dp: racial.system.display, r: racial.system.raceId }) : null,
    t: TALENTS[system.talentFavori] ? system.talentFavori : "",
    g: ofType("gift").map(g => ref(g)),
    p: ofType("power").slice(0, 6).map(p => sourceId(p) ?? { n: p.name }),
    e: equipped.map(equipmentRef),
    b: actor.items
      .filter(i => ["weapon", "armor", "gadget", "extra"].includes(i.type) && !equippedIds.has(i.id))
      .map(i => [(i.type !== "extra" && sourceId(i)) || { n: i.name }, backpackType(i)]),
    // A URL, not base64, to keep the link short; aur-sheet loads it from Foundry (needs CORS).
    img: actor.img && actor.img !== CONST.DEFAULT_TOKEN ? new URL(actor.img, window.location.href).href : null
  };
}

/**
 * Encode an envelope for a URL fragment: base64url(deflate-raw(JSON)).
 * @param {object} envelope
 * @returns {Promise<string>}
 */
export async function encodeEnvelope(envelope) {
  const stream = new Blob([JSON.stringify(envelope)]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Open aur-sheet's render page, which draws the sheet and downloads the PNG.
 * Works from the desktop app too: it opens http links in the system browser.
 * @param {Actor} actor  A character actor.
 */
export async function openInAurSheet(actor) {
  const url = game.settings.get(SYSTEM_ID, "aurSheetUrl").trim().replace(/\/+$/, "");
  if (!url) return ui.notifications.warn(game.i18n.localize("AURORE.AurSheet.noUrl"));
  const data = await encodeEnvelope(await buildAurSheetEnvelope(actor));
  window.open(`${url}/render#${data}`, "_blank");
}
