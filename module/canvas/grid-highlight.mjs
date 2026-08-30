import { AOE_PATTERN_LEGEND } from "../config.mjs";

const LAYER_PREFIX = "aurore.aoe";

// Degrees added to a token's rotation before orienting the pattern, so that a
// token at rotation 0 renders the authored pattern turned -90° (facing right).
const PATTERN_ROTATION_OFFSET = -90;

// Map<itemId, { token: Token, item: Item }> — tracks active highlights.
// Works for any AoE-bearing item (weapon, armor, …).
const _active = new Map();

// Maps aoePattern cell values (AOE_PATTERN_LEGEND index) → 24-bit RGB colors (0 = off/skip)
const PATTERN_COLORS = Object.values(AOE_PATTERN_LEGEND)
  .sort((a, b) => a.index - b.index)
  .map(def => def.color ? parseInt(def.color.slice(1), 16) : 0);

/**
 * Returns pixel-space [x, y] pairs for all grid cells within `range` squares of (cx, cy).
 * @param {number} cx     Top-left pixel x of the origin cell
 * @param {number} cy     Top-left pixel y of the origin cell
 * @param {number} range  Range in grid squares
 * @returns {Array<[number, number]>}
 */
function _getCellsInRange(cx, cy, range) {
  const size  = canvas.grid.size;
  const cells = [];

  for (let dx = -range; dx <= range; dx++) {
    for (let dy = -range; dy <= range; dy++) {
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      if (dist <= range) {
        cells.push([cx + dx * size, cy + dy * size]);
      }
    }
  }

  return cells;
}

/**
 * Paint one highlight layer at (cx, cy) for the given item.
 * Extracted so both initial draw and token-move redraw share the same logic.
 * @param {string} layerName
 * @param {number} cx        Top-left pixel x of the token's origin cell
 * @param {number} cy        Top-left pixel y of the token's origin cell
 * @param {number} rotation  Token rotation in degrees (clockwise on screen)
 * @param {Item}   item      Any AoE-bearing item (weapon, armor, …)
 */
function _drawHighlight(layerName, cx, cy, rotation, item) {
  const gridSize = canvas.grid.size;
  const radius   = Math.max(0, item.system.aoeSize ?? 0);

  let pattern;
  try { pattern = JSON.parse(item.system.aoePattern || "[]"); } catch { pattern = []; }

  const hasPattern = pattern.some(v => v !== 0);

  if (hasPattern) {
    const size  = 2 * radius + 1;
    // Rotate each cell offset around the origin cell so the pattern follows the
    // token's facing. Screen y points down, so this matrix rotates clockwise.
    const angle = (((rotation ?? 0) + PATTERN_ROTATION_OFFSET) * Math.PI) / 180;
    const cos   = Math.cos(angle);
    const sin   = Math.sin(angle);
    const painted = new Set();

    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        const colorIdx = pattern[row * size + col] ?? 0;
        if (!colorIdx) continue;

        const ox = col - radius;
        const oy = row - radius;
        const rx = Math.round(ox * cos - oy * sin);
        const ry = Math.round(ox * sin + oy * cos);

        // Two source cells can snap onto the same grid cell at odd angles.
        const key = `${rx},${ry}`;
        if (painted.has(key)) continue;
        painted.add(key);

        canvas.interface.grid.highlightPosition(layerName, {
          x: cx + rx * gridSize,
          y: cy + ry * gridSize,
          color: PATTERN_COLORS[colorIdx],
          alpha: 0.35
        });
      }
    }
  } else {
    const hex   = (item.system.highlightColor ?? "#ff000044").replace("#", "");
    const r     = parseInt(hex.slice(0, 2), 16);
    const g     = parseInt(hex.slice(2, 4), 16);
    const b     = parseInt(hex.slice(4, 6), 16);
    const a     = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 0.27;
    const color = (r << 16) | (g << 8) | b;
    const range = item.system.range ?? 1;
    for (const [x, y] of _getCellsInRange(cx, cy, range)) {
      canvas.interface.grid.highlightPosition(layerName, { x, y, color, alpha: a });
    }
  }
}

/**
 * Toggle the AoE highlight for an item (weapon, armor, …) on the canvas. Only one
 * AoE renders at a time — any previously drawn highlight is cleared first so they
 * never stack.
 * @param {Token} token
 * @param {Item}  item
 * @returns {boolean} true when activating, false when deactivating
 */
export function highlightItemAoe(token, item) {
  const layerName = `${LAYER_PREFIX}.${item.id}`;

  // Clicking the already-active item toggles it off.
  const wasActive = _active.has(item.id);

  // Wipe every currently-rendered AoE so highlights never superimpose.
  clearAllAoe();

  if (wasActive) return false;

  const layer = canvas.interface.grid.addHighlightLayer(layerName);
  layer.clear();
  _drawHighlight(layerName, token.document.x, token.document.y, token.document.rotation, item);

  _active.set(item.id, { token, item });
  return true;
}

/**
 * Redraw all highlights whose token just moved or rotated. Call from updateToken hook.
 * @param {TokenDocument} tokenDoc
 */
export function onTokenMoved(tokenDoc) {
  for (const [itemId, { token, item }] of _active) {
    if (token.id !== tokenDoc.id) continue;
    const layerName = `${LAYER_PREFIX}.${itemId}`;
    const layer = canvas.interface.grid.addHighlightLayer(layerName);
    layer.clear();
    _drawHighlight(layerName, tokenDoc.x, tokenDoc.y, tokenDoc.rotation, item);
  }
}

/** Clear all active AoE layers (call on scene change). */
export function clearAllAoe() {
  for (const [itemId] of _active) {
    canvas.interface.grid.clearHighlightLayer(`${LAYER_PREFIX}.${itemId}`);
  }
  _active.clear();
}

/**
 * Post a weapon AoE info card to the chat log.
 * @param {Actor}  actor
 * @param {Item}   weapon
 * @param {string} tokenId
 */
export async function postAoeChatCard(actor, weapon, tokenId) {
  const range   = weapon.system.range   ?? 1;
  const aoeSize = weapon.system.aoeSize ?? 0;

  const content = `<div class="aurore aurore-aoe-card">
    <img src="${weapon.img}" class="aoe-card-icon" alt="">
    <div class="aoe-card-body">
      <strong class="aoe-card-name">${weapon.name}</strong>
      <span>${game.i18n.localize("AURORE.Weapon.range")} : ${range} case${range !== 1 ? "s" : ""}</span>
      <span>${game.i18n.localize("AURORE.Weapon.aoeSize")} : ${aoeSize} case${aoeSize !== 1 ? "s" : ""}</span>
    </div>
    <button class="aoe-show-btn"
            data-actor-id="${actor.id}"
            data-weapon-id="${weapon.id}"
            data-token-id="${tokenId}">
      <i class="fas fa-bullseye"></i>
      ${game.i18n.localize("AURORE.Aoe.show")}
    </button>
  </div>`;

  await ChatMessage.create({
    content,
    speaker: ChatMessage.getSpeaker({ actor })
  });
}
