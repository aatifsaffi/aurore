#!/usr/bin/env node
/**
 * fetch-power-icons.mjs
 * Downloads one game-icons.net SVG per power into assets/icons/ and points each
 * record's `img` in packs/powers/powers.json at it.
 *
 * Usage:
 *   npm run icons:powers
 *
 * - Icons come white on transparent, the same format as the other assets/icons/*.svg.
 * - Already-present files are reused, so re-runs only download what's missing.
 * - powers.json is the source of truth (aur-sheet's copy is generated from it by
 *   `npm run data:aur-sheet`, which ignores `img`).
 * - To change an icon, edit its slug in ICONS (browse https://game-icons.net,
 *   the slug is the "<author>/<name>" part of the icon URL).
 */

import { readFile, writeFile, access } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const ROOT      = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE    = join(ROOT, "packs/powers/powers.json");
const ICON_DIR  = join(ROOT, "assets/icons");
const ICON_PATH = "systems/aurore/assets/icons";
const ICON_URL  = (slug) => `https://game-icons.net/icons/ffffff/transparent/1x1/${slug}.svg`;

/** Power id → game-icons.net "<author>/<name>" slug. */
const ICONS = {
  // Passifs
  "PAS-01": "delapouite/rolling-dices",   // Affinité RAGE
  "PAS-02": "lorc/crossed-swords",        // Engagement
  "PAS-03": "lorc/sentry-gun",            // Sentinelle
  "PAS-04": "lorc/crowned-skull",         // Domination
  "PAS-05": "lorc/shield-reflect",        // Renforcement
  "PAS-06": "lorc/bloody-sword",          // Prix du sang
  "PAS-07": "andymeneely/riposte",        // Contre-coup
  "PAS-08": "lorc/processor",             // Implants de RAGE
  "PAS-09": "delapouite/rolling-dices",   // Affinité SURPRISE
  "PAS-10": "lorc/target-arrows",         // Point faible
  "PAS-11": "delapouite/sai",             // Ambidextrie
  "PAS-12": "delapouite/achilles-heel",   // Coupe-jarret
  "PAS-13": "lorc/swords-emblem",         // Maître d'arme
  "PAS-14": "lorc/decapitation",          // Goût du meurtre
  "PAS-15": "lorc/double-shot",           // Combo
  "PAS-16": "lorc/processor",             // Implants de SURPRISE
  "PAS-17": "delapouite/rolling-dices",   // Affinité PEUR
  "PAS-18": "sbed/battery-pack",          // Surcharge
  "PAS-19": "lorc/hidden",                // Embuscade
  "PAS-20": "lorc/bolt-shield",           // Protection
  "PAS-21": "delapouite/team-idea",       // Esprit d'équipe
  "PAS-22": "lorc/meditation",            // Concentration
  "PAS-23": "lorc/backup",                // Soutien
  "PAS-24": "lorc/processor",             // Implants de PEUR
  // Auromancie
  "AUR-01": "lorc/life-tap",              // Drain Boréale
  "AUR-02": "lorc/mushroom-cloud",        // Explosion Boréale
  "AUR-03": "delapouite/palette",         // Couleur de l'Aurore
  "AUR-04": "lorc/portal",                // Don de l'Aurore
  "AUR-05": "lorc/cloak-dagger",          // Manteau Boréale
  "AUR-06": "lorc/teleport",              // Voyage Boréale
  "AUR-07": "lorc/chained-heart",         // Chaîne Boréale
  "AUR-08": "lorc/terror",                // Terreur Boréale
  "AUR-09": "lorc/puppet",                // Maître de l'Aurore
  "AUR-10": "lorc/sacrificial-dagger",    // Sacrifice à l'Aurore
  // Navigation
  "NAV-01": "lorc/sunbeams",              // Éruption Solaire
  "NAV-02": "lorc/sun-radiations",        // Frappe Solaire
  "NAV-03": "willdabeast/orb-wand",       // Orbe Aveuglante
  "NAV-04": "lorc/fire-silhouette",       // Combustion Spontanée
  "NAV-05": "sbed/lava",                  // Boule de magma
  "NAV-06": "lorc/burning-dot",           // Sabotage
  "NAV-07": "lorc/volcano",               // Puit de lave
  "NAV-08": "lorc/fire-axe",              // Armes solaires
  "NAV-09": "lorc/floating-crystal",      // Charge en Hélium
  "NAV-10": "lorc/poison-bottle",         // Charge en Hydrogène
  "NAV-11": "willdabeast/chain-lightning",// Éclair en Chaîne
  "NAV-12": "lorc/tornado",               // Oeil du Cyclone
  "NAV-13": "lorc/body-swapping",         // Échange Jolien
  "NAV-14": "darkzaitzev/smoke-bomb",     // Sublimation
  "NAV-15": "lorc/lightning-arc",         // Décharge électrique
  "NAV-16": "sbed/electric",              // Distortion électrique
  "NAV-17": "delapouite/steam-blast",     // Souffle Tellurique
  "NAV-18": "lorc/stone-tower",           // Piliers de Terre
  "NAV-19": "lorc/earth-crack",           // Secousse Tellurique
  "NAV-20": "lorc/ice-shield",            // Armure de Glace
  "NAV-21": "lorc/wolf-trap",             // Pièges de terre
  "NAV-22": "lorc/ice-cube",              // Surface gelée
  "NAV-23": "delapouite/boulder-dash",    // Frappe Fossile
  "NAV-24": "lorc/earth-spit"             // Armes telluriques
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
console.log(`Power icons: ${counts.downloaded} downloaded, ${counts.reused} reused, ${counts.unmapped} unmapped, ${counts.failed} failed.`);
if (counts.failed) process.exit(1);
