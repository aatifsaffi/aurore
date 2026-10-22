#!/usr/bin/env node
/**
 * fetch-racial-icons.mjs
 * Downloads one game-icons.net SVG per racial into assets/icons/ and points each
 * record's `img` in packs/racials/racials.json at it.
 *
 * Usage:
 *   npm run icons:racials
 *
 * - Icons come white on transparent, the same format as the other assets/icons/*.svg.
 * - Already-present files are reused, so re-runs only download what's missing.
 * - racials.json is the source of truth (aur-sheet's copy is generated from it by
 *   `npm run data:aur-sheet`, which ignores `img`).
 * - To change an icon, edit its slug in ICONS (browse https://game-icons.net,
 *   the slug is the "<author>/<name>" part of the icon URL).
 */

import { readFile, writeFile, access } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE    = join(ROOT, "packs/racials/racials.json");
const ICON_DIR  = join(ROOT, "assets/icons");
const ICON_PATH = "systems/aurore/assets/icons";
const ICON_URL  = (slug) => `https://game-icons.net/icons/ffffff/transparent/1x1/${slug}.svg`;

/** Racial id → game-icons.net "<author>/<name>" slug. */
const ICONS = {
  "askelon-vat":             "lorc/chemical-tank",    // Cuve d'Askelon
  "hellonde-vat":            "delapouite/rolling-dices",          // Cuve d'Hellonde
  "dominion-origin":         "lorc/mechanical-arm",         // Origine Dominion
  "southern-nations-origin": "delapouite/desert",           // Origine Nations du Sud
  "islander-origin":         "delapouite/island",           // Origine insulaire
  "claw-ascendancy":         "lorc/claw-slashes",                  // Griffes
  "scale-ascendancy":        "delapouite/fish-scales",      // Écailles
  "feather-ascendancy":      "lorc/feather",                // Plumes
  "horn-ascendancy":         "lorc/bull-horns",    // Cornes
  "combat-fabrication":      "delapouite/robot-grab",       // Fabrication combat
  "service-fabrication":     "delapouite/robot-antennas",   // Fabrication service
  "stealth-fabrication":     "lorc/ninja-mask"              // Fabrication furtive
};

const exists = (path) => access(path).then(() => true, () => false);

const data    = JSON.parse(await readFile(SOURCE, "utf8"));
const records = Array.isArray(data) ? data : data.items;
const counts  = { downloaded: 0, reused: 0, unmapped: 0, failed: 0 };

for (const record of records) {
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
console.log(`Racial icons: ${counts.downloaded} downloaded, ${counts.reused} reused, ${counts.unmapped} unmapped, ${counts.failed} failed.`);
if (counts.failed) process.exit(1);
