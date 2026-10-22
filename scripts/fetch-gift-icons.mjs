#!/usr/bin/env node
/**
 * fetch-gift-icons.mjs
 * Downloads one game-icons.net SVG per common gift into assets/icons/ and points each
 * record's `img` in packs/gifts/gifts.json at it.
 *
 * Usage:
 *   npm run icons:gifts
 *
 * - Icons come white on transparent, the same format as the other assets/icons/*.svg.
 * - Already-present files are reused, so re-runs only download what's missing.
 * - Racial records (RAC-xx) are skipped: their icons come from racials.json.
 * - gifts.json is the source of truth (aur-sheet's copy is generated from it by
 *   `npm run data:aur-sheet`, which ignores `img`).
 * - To change an icon, edit its slug in ICONS (browse https://game-icons.net,
 *   the slug is the "<author>/<name>" part of the icon URL).
 */

import { readFile, writeFile, access } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE    = join(ROOT, "packs/gifts/gifts.json");
const ICON_DIR  = join(ROOT, "assets/icons");
const ICON_PATH = "systems/aurore/assets/icons";
const ICON_URL  = (slug) => `https://game-icons.net/icons/ffffff/transparent/1x1/${slug}.svg`;

/** Common gift id → game-icons.net "<author>/<name>" slug. */
const ICONS = {
  "COM-01": "delapouite/backpack",          // Mule
  "COM-02": "lorc/run",                     // Mobile
  "COM-03": "delapouite/eye-target",        // Vigilant
  "COM-04": "delapouite/executioner-hood",  // Bourreau
  "COM-05": "delapouite/half-dead",         // Increvable
  "COM-06": "lorc/paw-heart",               // Ami des bêtes
  "COM-07": "delapouite/weight-lifting-up", // Haltérophilie
  "COM-08": "lorc/cracked-shield",          // Recherche de faille
  "COM-09": "lorc/hood",                    // Rôdeur
  "COM-10": "delapouite/first-aid-kit",     // Médecin de guerre
  "COM-11": "lorc/grenade",                 // Artificier
  "COM-12": "lorc/crown",                   // Domination
  "COM-13": "delapouite/modern-city",       // Urbex
  "COM-14": "delapouite/lynx-head",         // Oeil de lynx
  "COM-15": "lorc/brain",                   // Super Instinct
  "COM-16": "lorc/sword-clash",             // Logique martiale
  "COM-17": "lorc/open-book",               // Science du combat
  "COM-18": "delapouite/team-idea",         // Esprit d'équipe
  "COM-19": "lorc/aura",                    // Affinité avec l'Aurore
  "COM-20": "lorc/compass",                 // Affinité avec la Navigation
  "COM-21": "lorc/orbital",                 // Affinité avec la Gravitation
  "COM-22": "lorc/wolf-howl",               // Loup solitaire
  "COM-23": "lorc/broken-heart",            // Canon de verre
  "COM-24": "lorc/scales",                  // Combattant équilibré
  "COM-25": "lorc/heartburn",               // Combattant émotionnel
  "COM-26": "lorc/checked-shield"           // Résistant
};

const exists = (path) => access(path).then(() => true, () => false);

const data    = JSON.parse(await readFile(SOURCE, "utf8"));
const records = Array.isArray(data) ? data : data.items;
const counts  = { downloaded: 0, reused: 0, unmapped: 0, failed: 0 };

for (const record of records) {
  if (record.kind !== "common") continue;
  const slug = ICONS[record.id];
  if (!slug) {
    console.warn(`No icon mapped for ${record.id} "${record.name}" — img left as is.`);
    counts.unmapped++;
    continue;
  }

  const name = slug.split("/").pop();
  const file = join(ICON_DIR, `${name}.svg`);

  if (await exists(file)) {
    counts.reused++;
  } else {
    const res = await fetch(ICON_URL(slug));
    if (!res.ok) {
      console.error(`${record.id} "${record.name}": ${ICON_URL(slug)} → HTTP ${res.status}`);
      counts.failed++;
      continue;
    }
    await writeFile(file, await res.text());
    counts.downloaded++;
  }

  record.img = `${ICON_PATH}/${name}.svg`;
}

await writeFile(SOURCE, JSON.stringify(data, null, 2) + "\n");
console.log(`Gift icons: ${counts.downloaded} downloaded, ${counts.reused} reused, ${counts.unmapped} unmapped, ${counts.failed} failed.`);
if (counts.failed) process.exit(1);
