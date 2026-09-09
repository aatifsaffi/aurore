import { SYSTEM_ID } from "../config.mjs";

/**
 * Auto-stamped token images — composite an actor portrait into a circular crop
 * with a Trinity-coloured ring border, upload it, and set it as the token
 * texture. Driven by `CONFIG.aurore.TOKEN_STAMP` plus optional per-actor /
 * per-token framing overrides in `flags.aurore.stamp` (see the "Token framing"
 * dialog and specs/07-token-stamp.md).
 *
 * Every filesystem / network / canvas operation fails **silently**: on any
 * problem we `console.debug` and leave the existing `texture.src` untouched.
 */

const DEFAULT_PORTRAITS = new Set(["", "icons/svg/mystery-man.svg", "icons/svg/cowled.svg"]);

/** @returns {typeof FilePicker} the v13+ FilePicker implementation, with a legacy fallback. */
function filePicker() {
  return foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
}

/** @returns {number} `v` coerced to a finite number, or `fallback`. */
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Small, fast, stable string hash (cyrb53) → 14-hex-char string.
 * @param {string} str
 * @returns {string}
 */
function hashString(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * Load an image source as something `CanvasRenderingContext2D.drawImage` accepts.
 * @param {string} src  A Foundry-relative path, or an http(s)/data URL.
 * @returns {Promise<ImageBitmap|HTMLImageElement>}
 */
export async function loadBitmap(src) {
  const url = /^(https?:|data:)/i.test(src) ? src : foundry.utils.getRoute(src);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`fetch ${resp.status} for ${src}`);
  const blob = await resp.blob();
  try {
    return await createImageBitmap(blob);
  } catch (_e) {
    // Formats without an intrinsic size (some SVGs) — go through <img>.
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`decode failed for ${src}`));
      img.src = URL.createObjectURL(blob);
    });
  }
}

/** Per-src cache for the ring template (resolves to null if it can't be loaded). */
const _templateCache = new Map();
export function loadTemplate(src) {
  if (!src) return Promise.resolve(null);
  if (!_templateCache.has(src)) {
    _templateCache.set(src, loadBitmap(src).catch(err => {
      console.debug(`${SYSTEM_ID} | token-stamp: ring template unavailable (${src}), using code-drawn ring:`, err);
      return null;
    }));
  }
  return _templateCache.get(src);
}

/**
 * Trinity ring colour for an actor's dominant equipment balance.
 * @param {Actor} actor
 * @returns {string} hex
 */
export function trinityRingColor(actor) {
  const cfg = CONFIG.aurore.TOKEN_STAMP;
  const dominant = actor?.system?.trinityDominant ?? "balanced";
  return cfg.colors?.[dominant] ?? cfg.colors?.balanced ?? "#9aa0b4";
}

/**
 * Merge the composed framing for an actor / token:
 * `CONFIG.aurore.TOKEN_STAMP` defaults ← actor prototype flag ← token flag.
 * @param {Actor} actor
 * @param {TokenDocument|null} [tokenDoc]
 * @returns {object} the resolved framing (all fields present)
 */
export function resolveFraming(actor, tokenDoc = null) {
  const cfg = CONFIG.aurore.TOKEN_STAMP;
  const proto = foundry.utils.getProperty(actor ?? {}, `prototypeToken.flags.${SYSTEM_ID}.stamp`) ?? {};
  const tok = tokenDoc?.getFlag?.(SYSTEM_ID, "stamp") ?? {};
  const f = { ...proto, ...tok };
  const ringColor = f.ringColor || "";
  return {
    size: cfg.size ?? 400,
    quality: cfg.quality ?? 0.92,
    format: cfg.format ?? "image/webp",
    ring: cfg.ring ?? {},
    scale: num(f.scale, cfg.portraitScale ?? 1),
    offsetX: num(f.offsetX, 0),
    offsetY: num(f.offsetY, 0),
    insetRatio: num(f.insetRatio, cfg.ring?.insetRatio ?? 0.85),
    illustrationRotation: num(f.illustrationRotation, cfg.illustrationRotation ?? 0),
    background: f.background ?? cfg.background ?? "",
    ringColor,                                       // "" ⇒ follow Trinity
    color: ringColor || trinityRingColor(actor)      // final ring colour to draw
  };
}

/**
 * Draw the ring onto a 2d context.
 * @param {CanvasRenderingContext2D|OffscreenCanvasRenderingContext2D} ctx
 * @param {ImageBitmap|HTMLImageElement|null} tmpl
 * @param {object} f  resolved framing (uses `f.color`, `f.ring`)
 * @param {number} size
 */
function drawRing(ctx, tmpl, f, size) {
  const R = size / 2;
  const ringW = f.ring?.width ?? 24;

  if (tmpl) {
    // Tint the greyscale template while keeping its bevel: multiply by the
    // colour, then clip back to the template's alpha.
    const scratch = new OffscreenCanvas(size, size);
    const s = scratch.getContext("2d");
    s.drawImage(tmpl, 0, 0, size, size);
    s.globalCompositeOperation = "multiply";
    s.fillStyle = f.color;
    s.fillRect(0, 0, size, size);
    s.globalCompositeOperation = "destination-in";
    s.drawImage(tmpl, 0, 0, size, size);
    ctx.drawImage(scratch, 0, 0);
    return;
  }
  if (f.ring?.mode === "off") return;

  ctx.lineWidth = ringW;
  ctx.strokeStyle = f.color;
  ctx.beginPath();
  ctx.arc(R, R, R - ringW / 2, 0, Math.PI * 2);
  ctx.stroke();
  if (f.ring?.bevel) {
    const bw = Math.max(1, ringW * 0.18);
    ctx.lineWidth = bw;
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath();
    ctx.arc(R, R, R - ringW + bw, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.arc(R, R, R - bw, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Composite the circular-cropped portrait + ring onto an OffscreenCanvas.
 * Pure/synchronous — the caller supplies already-loaded bitmaps so this can
 * drive a live preview.
 * @param {ImageBitmap|HTMLImageElement} bmp   the portrait
 * @param {ImageBitmap|HTMLImageElement|null} tmpl  the ring template, or null
 * @param {object} f  resolved framing (see {@link resolveFraming})
 * @returns {OffscreenCanvas}
 */
export function composeStamp(bmp, tmpl, f) {
  const size = f.size ?? 400;
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const R = size / 2;
  const ringW = f.ring?.width ?? 24;
  const inner = tmpl ? R * (f.insetRatio ?? 0.85) : R - ringW;

  // Circular crop: optional background fill, then the portrait "cover"-fit,
  // scaled by `f.scale` and panned by `f.offsetX/offsetY` (fractions of size).
  ctx.save();
  ctx.beginPath();
  ctx.arc(R, R, Math.max(1, inner), 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  if (f.background) {
    ctx.fillStyle = f.background;
    ctx.fillRect(0, 0, size, size);
  }
  if (bmp) {
    const rot = (f.illustrationRotation ?? 0) * Math.PI / 180;
    if (rot) {
      ctx.translate(R, R);
      ctx.rotate(rot);
      ctx.translate(-R, -R);
    }
    const iw = bmp.naturalWidth || bmp.width;
    const ih = bmp.naturalHeight || bmp.height;
    const scale = Math.max(size / iw, size / ih) * (f.scale ?? 1);
    const dw = iw * scale, dh = ih * scale;
    const dx = (size - dw) / 2 + (f.offsetX ?? 0) * size;
    const dy = (size - dh) / 2 + (f.offsetY ?? 0) * size;
    ctx.drawImage(bmp, dx, dy, dw, dh);
  }
  ctx.restore();

  drawRing(ctx, tmpl, f, size);
  return canvas;
}

/**
 * Render the stamped texture to a Blob.
 * @param {string} portraitSrc
 * @param {object} framing  resolved framing (see {@link resolveFraming})
 * @returns {Promise<Blob>}
 */
async function renderStampedTexture(portraitSrc, framing) {
  const bmp = await loadBitmap(portraitSrc);
  const tmpl = framing.ring?.mode === "off" ? null : await loadTemplate(framing.ring?.templateSrc);
  return composeStamp(bmp, tmpl, framing).convertToBlob({
    type: framing.format ?? "image/webp",
    quality: framing.quality ?? 0.92
  });
}

/**
 * Best-effort `mkdir -p` under the "data" source.
 * @param {string} path
 */
async function ensureDir(path) {
  try {
    await filePicker().createDirectory("data", path);
  } catch (_e) {
    // Already exists, or genuinely can't be made — the upload call will surface
    // the latter and be caught by the caller.
  }
}

/**
 * Upload the composite as `<uploadDir>/<world>/<actorId>.webp` (overwriting).
 * @param {Actor} actor
 * @param {Blob}  blob
 * @returns {Promise<string>} the stored path
 */
async function uploadStamp(actor, blob) {
  const cfg = CONFIG.aurore.TOKEN_STAMP;
  const base = cfg.uploadDir ?? "aurore-tokens";
  const dir = `${base}/${game.world.id}`;
  await ensureDir(base);
  await ensureDir(dir);
  const file = new File([blob], `${actor.id}.webp`, { type: blob.type || "image/webp" });
  const res = await filePicker().upload("data", dir, file, {}, { notify: false });
  return res?.path ?? `${dir}/${actor.id}.webp`;
}

/**
 * Reasons to skip stamping (all silent).
 * @param {Actor} actor
 * @param {TokenDocument} [tokenDoc]
 * @returns {string|null} a reason string, or null to proceed
 */
function skipReason(actor, tokenDoc) {
  const cfg = CONFIG.aurore.TOKEN_STAMP;
  if (!cfg?.enabled) return "disabled in config";
  try {
    if (!game.settings.get(SYSTEM_ID, "autoStampTokens")) return "disabled in settings";
  } catch (_e) { /* setting not registered yet — treat as enabled */ }
  if (!actor) return "no actor";
  if (actor.getFlag(SYSTEM_ID, "noStamp")) return "noStamp flag";
  const src = actor.img;
  if (!src || DEFAULT_PORTRAITS.has(src)) return "no portrait";
  if (/\.(webm|gif|apng)(\?|$)/i.test(src)) return "animated portrait";
  if (actor.prototypeToken?.randomImg || tokenDoc?.texture?.src?.includes("*")) return "wildcard token";
  if (!game.user.can("FILES_UPLOAD")) return "no FILES_UPLOAD permission";
  return null;
}

/**
 * Generate + upload the stamped texture for an actor, unless it's already
 * current (cache hit via `flags.aurore.tokenStamp`) or a skip reason applies.
 * @param {Actor} actor
 * @param {{force?: boolean, tokenDoc?: TokenDocument}} [opts]
 * @returns {Promise<{src: string, key: string}|null>}
 */
async function generateAndUpload(actor, { force = false, tokenDoc } = {}) {
  const reason = skipReason(actor, tokenDoc);
  if (reason) {
    console.debug(`${SYSTEM_ID} | token-stamp skipped for "${actor?.name}": ${reason}`);
    return null;
  }

  const f = resolveFraming(actor, tokenDoc);
  const key = hashString([
    actor.img, f.color, f.size, f.quality, f.scale, f.offsetX, f.offsetY,
    f.insetRatio, f.illustrationRotation, f.background, JSON.stringify(f.ring ?? {})
  ].join("|"));

  if (!force && actor.getFlag(SYSTEM_ID, "tokenStamp") === key) return null;

  try {
    const blob = await renderStampedTexture(actor.img, f);
    const path = await uploadStamp(actor, blob);
    return { src: `${path}?v=${key.slice(0, 8)}`, key };
  } catch (err) {
    console.debug(`${SYSTEM_ID} | token-stamp failed for "${actor?.name}":`, err);
    return null;
  }
}

/**
 * Persist the stamp result to the actor's prototype token + cache flag.
 * @param {Actor} actor
 * @param {{src: string, key: string}} result
 */
async function persistToActor(actor, result) {
  if (!actor.isOwner) return;
  try {
    await actor.update({
      "prototypeToken.texture.src": result.src,
      [`flags.${SYSTEM_ID}.tokenStamp`]: result.key
    });
  } catch (err) {
    console.debug(`${SYSTEM_ID} | token-stamp: actor update failed for "${actor?.name}":`, err);
  }
}

/**
 * Stamp a placed token. Sets the token's `texture.src` and, on the first
 * successful stamp for the actor, writes it back to the prototype token so
 * later drops are born stamped (no flash).
 * @param {TokenDocument} tokenDocument
 * @param {{force?: boolean}} [opts]
 */
export async function stampToken(tokenDocument, { force = false } = {}) {
  const actor = tokenDocument?.actor;
  if (!actor) return;

  const result = await generateAndUpload(actor, { force, tokenDoc: tokenDocument });
  if (!result) return;

  try {
    await tokenDocument.update({ "texture.src": result.src });
  } catch (err) {
    console.debug(`${SYSTEM_ID} | token-stamp: token update failed:`, err);
  }
  await persistToActor(actor, result);
}

/**
 * Stamp an actor's prototype token only (used after a portrait or framing
 * change). Does not touch already-placed tokens.
 * @param {Actor} actor
 * @param {{force?: boolean}} [opts]
 */
export async function stampActorPrototype(actor, { force = false } = {}) {
  const result = await generateAndUpload(actor, { force });
  if (!result) return;
  await persistToActor(actor, result);
}
