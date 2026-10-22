#!/usr/bin/env node
/**
 * export-aur-sheet-data.mjs
 * Writes aur-sheet's static data (src/assets/data/*.json) from this system's
 * pack sources. Foundry is the source of truth: never edit aur-sheet's copies.
 *
 * Usage:
 *   npm run data:aur-sheet                    # writes into ../aur-sheet
 *   npm run data:aur-sheet -- <aur-sheet dir>
 *   npm run data:aur-sheet -- --check         # exit 1 if aur-sheet is out of date
 */

import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import { TALENTS } from "../module/config.mjs";
import { htmlToText } from "../module/helpers/aur-sheet-export.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Keep only `fields` (in that order), dropping undefined ones; descriptions become plain text. */
const pick = (record, fields) => Object.fromEntries(
  fields
    .filter(f => record[f] !== undefined)
    .map(f => [f, f === "description" ? htmlToText(record[f]) : record[f]])
);

/** Pack sources are either a flat array or `{ items: [...] }`. */
const recordsOf = data => (Array.isArray(data) ? data : data.items);

/**
 * Build every aur-sheet data file from the pack sources.
 * @param {(packName: string) => object} readPack  Returns the parsed pack source.
 * @param {object} lang                            Parsed lang/fr.json.
 * @returns {Record<string, object[]>}             aur-sheet file name → content.
 */
export function buildAurSheetData(readPack, lang) {
  const from = (pack, fields, filter = () => true) =>
    recordsOf(readPack(pack)).filter(filter).map(r => pick(r, fields));
  const localize = key => key.split(".").reduce((node, part) => node?.[part], lang) ?? key;

  return {
    "weapons.json":      from("weapons", ["id", "name", "description", "trinity", "heavy"]),
    "armors.json":       from("armors",  ["id", "name", "description", "trinity"]),
    "gadgets.json":      from("gadgets", ["id", "name", "description", "trinity"]),
    "powers.json":       from("powers",  ["id", "name", "description", "discipline", "trinity"]),
    "races.json":        from("races",   ["id", "name", "description", "borrowRacialsFrom"]),
    "racials.json":      from("racials", ["id", "name", "description", "raceId", "display"]),
    "common-gifts.json": from("gifts",   ["id", "name", "description"], r => r.kind === "common"),
    "talents.json": Object.entries(TALENTS).map(([id, cfg]) => ({
      id,
      name: localize(cfg.label),
      description: localize(cfg.description),
      type: cfg.type
    }))
  };
}

async function main() {
  const args   = process.argv.slice(2);
  const check  = args.includes("--check");
  const target = resolve(args.find(a => !a.startsWith("--")) ?? join(ROOT, "../aur-sheet"));
  const outDir = join(target, "src/assets/data");

  const sources = {};
  for (const pack of ["weapons", "armors", "gadgets", "powers", "races", "racials", "gifts"]) {
    sources[pack] = JSON.parse(await readFile(join(ROOT, `packs/${pack}/${pack}.json`), "utf8"));
  }
  const lang = JSON.parse(await readFile(join(ROOT, "lang/fr.json"), "utf8"));

  let stale = 0;
  for (const [file, content] of Object.entries(buildAurSheetData(p => sources[p], lang))) {
    const path = join(outDir, file);
    const next = JSON.stringify(content, null, 2) + "\n";
    const current = await readFile(path, "utf8").catch(() => null);
    if (current === next) continue;
    stale++;
    if (check) console.log(`out of date: ${file}`);
    else {
      await writeFile(path, next);
      console.log(`wrote ${file} (${content.length} entries)`);
    }
  }

  if (!stale) console.log(`aur-sheet data is up to date (${outDir})`);
  if (check && stale) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
