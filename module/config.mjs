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

// ── Armor PP/CM bonuses per Trinity color ─────────────────
export const ARMOR_BONUSES = {
  red:   { ppBonus: 20, cmModifier: -1 },
  green: { ppBonus: 16, cmModifier: 0 },
  blue:  { ppBonus: 12, cmModifier: 1 }
};

// ── Gadget max uses tiers ─────────────────────────────────
export const GADGET_TIERS = {
  1: { label: "X1", uses: 1 },
  2: { label: "X2", uses: 2 },
  3: { label: "X3", uses: 3 }
};

// ── Equipment Slots ───────────────────────────────────────
export const EQUIPMENT_SLOTS = {
  weapon1: "AURORE.Slots.weapon1",
  weapon2: "AURORE.Slots.weapon2",
  armor:   "AURORE.Slots.armor",
  gadget:  "AURORE.Slots.gadget"
};

// ── Inventory / Backpack ──────────────────────────────────
export const BACKPACK_SIZE = 9;

export const ITEM_SLOT_COSTS = {
  consumable:     1,
  "weapon-light": 1,
  "weapon-heavy": 2,
  armor:          3,
  gadget:         1
};

export const BACKPACK_COLORS = {
  consumable:     "#9ca3af",
  "weapon-light": "#a16207",
  "weapon-heavy": "#7c2d12",
  armor:          "#1e3a5f",
  gadget:         "#6d28d9"
};

// ── Power categories ──────────────────────────────────────
export const POWER_CATEGORIES = {
  offensive: "AURORE.Powers.offensive",
  defensive: "AURORE.Powers.defensive",
  healing:   "AURORE.Powers.healing",
  mobility:  "AURORE.Powers.mobility",
  support:   "AURORE.Powers.support",
  stealth:   "AURORE.Powers.stealth",
  combat:    "AURORE.Powers.combat",
  nature:    "AURORE.Powers.nature",
  chance:    "AURORE.Powers.chance",
  magic:     "AURORE.Powers.magic"
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
  success: 50,   // roll <= this is a critical success
  failure: 65   // roll >= this is a critical failure
};

// ── AoE Shapes (for grid highlight) ──────────────────────
export const AOE_SHAPES = {
  circle: "AURORE.AoeShapes.circle",
  cone:   "AURORE.AoeShapes.cone",
  line:   "AURORE.AoeShapes.line",
  square: "AURORE.AoeShapes.square",
  around: "AURORE.AoeShapes.around"
};

// ── Max powers per character ──────────────────────────────
export const MAX_POWERS = 6;

// ── AoE Pattern Legend ─────────────────────────────────────
// Single source of truth for char-notation aoePattern strings ("..e.eeee")
// used in compendium source JSON. `index` is the stored integer value,
// `color` the render color for grid-highlight (null = off/skip).
export const AOE_PATTERN_LEGEND = {
  ".": { key: "off",     index: 0, color: null,      label: null },
  "e": { key: "enemy",   index: 1, color: "#ff3322",  label: "AURORE.AoeColors.enemy" },
  "a": { key: "ally",    index: 2, color: "#22cc55",  label: "AURORE.AoeColors.ally" },
  "n": { key: "neutral", index: 3, color: "#2288ff",  label: "AURORE.AoeColors.neutral" },
  "s": { key: "special", index: 4, color: "#ffcc00",  label: "AURORE.AoeColors.special" }
};
