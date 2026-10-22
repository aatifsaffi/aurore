export const SYSTEM_ID = "aurore";

// ── Resources (value/max pools) ───────────────────────────
export const RESOURCES = {
  pv: { label: "AURORE.Resources.pv", abbr: "PV", default: 20, color: "#eb1414" },
  pa: { label: "AURORE.Resources.pa", abbr: "PA", default: 3,  color: "#f5a623" },
  pp: { label: "AURORE.Resources.pp", abbr: "PP", default: 0,  color: "#0400ff" }
};

// ── Mental Stats (/100 for rage/surprise/peur, unbounded for mental/cm) ──
export const MENTAL_STATS = {
  rage:     { label: "AURORE.Mental.rage",     default: 0, max: 100, color: "#5b2821" },
  surprise: { label: "AURORE.Mental.surprise", default: 0, max: 100, color: "#485528" },
  peur:     { label: "AURORE.Mental.peur",     default: 0, max: 100, color: "#2f3e4f" },
  mental:   { label: "AURORE.Mental.mental",   default: 0 },
  cm:       { label: "AURORE.Mental.cm",       default: 5 }
};

// ── Talents (fixed set, 3 per Trinity color) ──────────────
export const TALENTS = {
  authority:    { label: "AURORE.Talents.authority",    type: "red",   description: "AURORE.Talents.authority_desc" },
  endurance:    { label: "AURORE.Talents.endurance",    type: "red",   description: "AURORE.Talents.endurance_desc" },
  shiver:       { label: "AURORE.Talents.shiver",       type: "red",   description: "AURORE.Talents.shiver_desc" },
  composure:    { label: "AURORE.Talents.composure",    type: "green", description: "AURORE.Talents.composure_desc" },
  perception:   { label: "AURORE.Talents.perception",   type: "green", description: "AURORE.Talents.perception_desc" },
  coordination: { label: "AURORE.Talents.coordination", type: "green", description: "AURORE.Talents.coordination_desc" },
  empathy:      { label: "AURORE.Talents.empathy",      type: "blue",  description: "AURORE.Talents.empathy_desc" },
  encyclopedia: { label: "AURORE.Talents.encyclopedia", type: "blue",  description: "AURORE.Talents.encyclopedia_desc" },
  logic:        { label: "AURORE.Talents.logic",        type: "blue",  description: "AURORE.Talents.logic_desc" }
};

// ── Trinity Colors ────────────────────────────────────────
export const TRINITY = {
  red:   { label: "AURORE.Trinity.red",   color: "#c0392b" },
  green: { label: "AURORE.Trinity.green", color: "#27ae60" },
  blue:  { label: "AURORE.Trinity.blue",  color: "#2980b9" }
};

// ── Token stamp (auto circular ring token image) ─────────
// On token creation we composite the actor portrait into a circular crop with
// a Trinity-coloured ring border and upload it as the token texture.
// All tunables live here (see specs/07-token-stamp.md).
export const TOKEN_STAMP = {
  enabled: true,
  size: 400,                      // output px, square
  portraitScale: 0.72,           // <1 shrinks the artwork inside the circular crop
  illustrationRotation: 0,       // degrees to rotate the portrait inside the crop (ring stays put)
  background: "#ffffff",         // fill inside the crop behind the portrait ("" / null = transparent)
  ring: {
    mode: "auto",                 // "auto" = template if it loads, else code-drawn; "off" = crop only
    templateSrc: "systems/aurore/assets/token-stamp/img.png",
    insetRatio: 0.95,             // template mode: portrait clip radius ÷ (size / 2)
    width: 24,                    // code-drawn fallback: ring width in px at output size
    bevel: true                   // code-drawn fallback: light/dark edge strokes
  },
  format: "image/webp",
  quality: 0.92,
  uploadDir: "aurore-tokens",     // under the "data" source; "/<world-id>" is appended
  // red/green/blue reuse the TRINITY hexes; "balanced" is a placeholder for now.
  colors: {
    red:      TRINITY.red.color,
    green:    TRINITY.green.color,
    blue:     TRINITY.blue.color,
    balanced: "#9aa0b4"
  }
};

// ── Prototype token defaults ────────────────────────────
// Applied to every new character/npc actor's prototype token (preCreateActor).
// Values are CONST.TOKEN_DISPLAY_MODES: 0 NONE · 10 CONTROL · 20 OWNER_HOVER
// · 30 HOVER · 40 OWNER · 50 ALWAYS.
export const TOKEN_DEFAULTS = {
  displayName: 30,   // nameplate shown to everyone on hover
  displayBars: 20    // resource bars shown to owners on hover
};

// ── Combat HUD (top-of-screen duel cards + initiative strip) ──
// Sizes in px; exposed as CSS custom properties on the HUD root.
// See specs/08-combat-hud.md.
export const COMBAT_HUD = {
  cardWidth: 220,          // big attacker / defender card
  cardHeight: 300,
  stripCardWidth: 64,      // initiative strip card
  stripCardHeight: 80,
  stripMaxVisible: 8,      // strip scrolls beyond this many cards
  animationMs: 400,        // slide-in on turn change
  topOffset: 48,           // px from top of viewport (clears #navigation)
  defeatedIcon: "icons/svg/skull.svg" // overlay on defeated cards
};

// ── NPC kinds ─────────────────────────────────────────────
// "human"   — plays like a character: equips items from the compendiums.
// "monster" — carries its own inline `system.equipment` (max NPC_MAX_EQUIPMENT),
//             specific to that creature and not sourced from any pack.
export const NPC_KINDS = {
  human:   "AURORE.Npc.kind.human",
  monster: "AURORE.Npc.kind.monster"
};

export const NPC_MAX_EQUIPMENT = 4;

// ── Monster equipment categories ─────────────────────────
// Tags one inline `system.equipment` entry. "attack" gear carries a Trinity
// color (red/green/blue); "boreale" gear is an aurora / emotional-magic power
// that sits outside the Trinity, so its `trinity` field is left blank.
export const NPC_EQUIPMENT_CATEGORIES = {
  attack:  "AURORE.Npc.equipmentCategory.attack",
  boreale: "AURORE.Npc.equipmentCategory.boreale"
};

// ── Power disciplines ─────────────────────────────────────
// Passif / navigation powers carry a Trinity color; auromancie (aurora magic)
// sits outside the Trinity, so its `trinity` is blank.
export const POWER_DISCIPLINES = {
  passif:     "AURORE.Powers.discipline.passif",
  navigation: "AURORE.Powers.discipline.navigation",
  auromancie: "AURORE.Powers.discipline.auromancie"
};

// ── XP cost formulas ──────────────────────────────────────
export const XP_COSTS = {
  levelUp:    (currentLevel) => currentLevel * 100,
  pvIncrease: 10,
  ppIncrease: 15,
  paIncrease: 25,
  cmIncrease: 20
};

// ── Critical roll thresholds (d100, inclusive) ────────────
// Widen these to force crits while testing animations.
export const CRIT_THRESHOLDS = {
  success: 5,   // roll <= this is a critical success
  failure: 95   // roll >= this is a critical failure
};

// ── AoE Pattern Legend ─────────────────────────────────────
// Single source of truth for char-notation aoePattern strings ("..e.eeee")
// used in compendium source JSON. `index` is the stored integer value,
// `color` the render color for grid-highlight (null = off/skip), `border`
// an outline color so a highlighted cell reads against similarly-toned grid
// backgrounds (e.g. movement's gray fill on a gray canvas grid).
export const AOE_PATTERN_LEGEND = {
  ".": { key: "off",      index: 0, color: null,      border: null,      label: null },
  "e": { key: "enemy",    index: 1, color: "#ff3322",  border: "#ff6b5b", label: "AURORE.AoeColors.enemy" },
  "a": { key: "ally",     index: 2, color: "#22cc55",  border: "#5cff8f", label: "AURORE.AoeColors.ally" },
  "n": { key: "neutral",  index: 3, color: "#2288ff",  border: "#5cc3ff", label: "AURORE.AoeColors.neutral" },
  "s": { key: "special",  index: 4, color: "#ffcc00",  border: "#ffe680", label: "AURORE.AoeColors.special" },
  "m": { key: "movement", index: 5, color: "#808080",  border: "#ffffff", label: "AURORE.AoeColors.movement" }
};
