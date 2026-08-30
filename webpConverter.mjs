#!/usr/bin/env node
/**
 * webpConverter.mjs
 * Converts PNG/JPG/JPEG images to WebP in-place (or to a target directory).
 *
 * Usage:
 *   node webpConverter.mjs <input>         # file or directory, converts in-place
 *   node webpConverter.mjs <input> <out>   # writes to <out> directory
 *
 * Examples:
 *   node webpConverter.mjs assets/races/valien.png
 *   node webpConverter.mjs assets/races/
 *   node webpConverter.mjs assets/races/ assets/races/converted/
 *
 * Requires: sharp  →  npm install sharp
 */

import { readdir, stat, mkdir } from "fs/promises";
import { join, extname, basename, dirname } from "path";
import { execSync } from "child_process";

// Resolve sharp from local node_modules or global install
let sharp;
try {
  sharp = (await import("sharp")).default;
} catch {
  try {
    const globalRoot = execSync("npm root -g").toString().trim();
    sharp = (await import(`file://${globalRoot}/sharp/lib/index.js`)).default;
  } catch {
    console.error("sharp not found. Run:  npm install sharp  (or:  npm install -g sharp)");
    process.exit(1);
  }
}

const QUALITY   = 85;                           // 80–90 is transparent to most eyes
const EXTS      = new Set([".png", ".jpg", ".jpeg"]);

async function convertFile(src, outDir) {
  const ext    = extname(src).toLowerCase();
  if (!EXTS.has(ext)) return;

  const name   = basename(src, ext) + ".webp";
  const dest   = join(outDir ?? dirname(src), name);

  const before = (await stat(src)).size;
  await sharp(src).webp({ quality: QUALITY }).toFile(dest);
  const after  = (await stat(dest)).size;
  const saved  = (((before - after) / before) * 100).toFixed(1);

  console.log(`  ✓  ${basename(src)}  →  ${name}  (${kb(before)} → ${kb(after)}, -${saved}%)`);
}

async function convertDir(srcDir, outDir) {
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(srcDir, entry.name);
    if (entry.isDirectory()) {
      const nested = outDir ? join(outDir, entry.name) : undefined;
      await convertDir(full, nested);
    } else {
      await convertFile(full, outDir);
    }
  }
}

function kb(bytes) {
  return (bytes / 1024).toFixed(1) + " KB";
}

async function mixImages(srcA, srcB, dest) {
  const { width, height } = await sharp(srcA).metadata();

  // Get both images as raw RGB buffers (same size, same channel count)
  const { data: pixA, info } = await sharp(srcA)
    .resize(width, height).toColourspace("srgb").raw()
    .toBuffer({ resolveWithObject: true });
  const { data: pixB } = await sharp(srcB)
    .resize(width, height).toColourspace("srgb").raw()
    .toBuffer({ resolveWithObject: true });

  // Average every channel value for a true 50/50 blend
  const mixed = Buffer.allocUnsafe(pixA.length);
  for (let i = 0; i < pixA.length; i++) {
    mixed[i] = (pixA[i] + pixB[i]) >> 1;
  }

  await sharp(mixed, { raw: { width: info.width, height: info.height, channels: info.channels } })
    .webp({ quality: QUALITY })
    .toFile(dest);
  console.log(`  ✓  mixed  →  ${dest}`);
}

// ── Main ──────────────────────────────────────────────────

const [,, input, output] = process.argv;

// --mix <imgA> <imgB> <dest>
if (input === "--mix") {
  const [,,, a, b, dest] = process.argv;
  if (!a || !b || !dest) {
    console.error("Usage: node webpConverter.mjs --mix <imgA> <imgB> <dest>");
    process.exit(1);
  }
  await mixImages(a, b, dest);
  console.log("Done.");
  process.exit(0);
}

if (!input) {
  console.error("Usage: node webpConverter.mjs <file|dir> [outDir]\n" +
                "       node webpConverter.mjs --mix <imgA> <imgB> <dest>");
  process.exit(1);
}

const info = await stat(input).catch(() => null);
if (!info) {
  console.error(`Not found: ${input}`);
  process.exit(1);
}

if (output) await mkdir(output, { recursive: true });

if (info.isDirectory()) {
  console.log(`Converting directory: ${input}\n`);
  await convertDir(input, output);
} else {
  await convertFile(input, output ? output : undefined);
}

console.log("\nDone.");
