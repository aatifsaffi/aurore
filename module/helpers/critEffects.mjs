import { SYSTEM_ID, CRIT_THRESHOLDS } from "../config.mjs";

/** JB2A omits the `_Regular` segment on effects that have no Complete/patron variant. */
export const DEFAULT_CRIT_SUCCESS_EFFECT = "modules/JB2A_DnD5e/Library/Generic/Healing/HealingAbility_01_Green_400x400.webm";
export const DEFAULT_CRIT_FAILURE_EFFECT = "modules/JB2A_DnD5e/Library/Generic/Explosion/Explosion_01_Orange_400x400.webm";

/**
 * Per-type animation tuning. A crit success blooms under the token (an aura the
 * character stands in, so it rides along if the token moves); a crit failure
 * detonates over the square where it happened, fast and hard, and stays put.
 */
const CRIT_EFFECT_PRESETS = {
  critSuccess: {
    attach: true,
    scale: 1.2,
    playbackRate: 0.9,
    fadeIn: 250,
    fadeOut: 500,
    belowTokens: true,
    opacity: 0.9,
  },
  critFailure: {
    attach: false,
    scale: 1.6,
    playbackRate: 1.25,
    fadeIn: 0,
    fadeOut: 300,
    belowTokens: false,
    opacity: 1,
  },
};

let sequencerWarningShown = false;

/**
 * Classify a d100 roll result as critical success, critical failure, or normal.
 * @param {number} total - The roll total (1–100)
 * @returns {"critSuccess" | "critFailure" | "normal"}
 */
export function classifyRoll(total) {  
  if (total <= CRIT_THRESHOLDS.success) return "critSuccess";
  if (total >= CRIT_THRESHOLDS.failure) return "critFailure";
  return "normal";
}

/**
 * Play a critical roll animation via Sequencer+JB2A, with fallback for missing modules.
 * Broadcasts to all connected clients.
 * @param {string} type - "critSuccess" | "critFailure" | "normal"
 * @param {object} params - { token: Token | null, actor: Actor }
 */
export async function playCritEffect(type, { token, actor }) {
  if (type === "normal") return;

  const enabled = game.settings.get(SYSTEM_ID, "critAnimationsEnabled");
  if (!enabled) return;

  const sequencerActive = game.modules.get("sequencer")?.active;
  if (!sequencerActive) {
    if (!sequencerWarningShown) {
      console.warn(
        "[Aurore] Sequencer module is required for crit animations. Install it to enable visual effects."
      );
      sequencerWarningShown = true;
    }
    await _fallbackChatHighlight(type, actor);
    return;
  }

  if (!token) {
    await _fallbackChatHighlight(type, actor);
    return;
  }

  const jb2aActive = game.modules.get("JB2A_DnD5e")?.active;
  const effectKey = type === "critSuccess" ? "critSuccessEffect" : "critFailureEffect";
  let effectFile = game.settings.get(SYSTEM_ID, effectKey);

  if (!effectFile) {
    effectFile = type === "critSuccess" ? DEFAULT_CRIT_SUCCESS_EFFECT : DEFAULT_CRIT_FAILURE_EFFECT;
  }

  if (!jb2aActive && effectFile.includes("JB2A")) {
    if (!sequencerWarningShown) {
      console.warn(
        "[Aurore] JB2A module is recommended for crit animations. Without it, only fallback chat highlights will appear."
      );
      sequencerWarningShown = true;
    }
    await _fallbackChatHighlight(type, actor);
    return;
  }

  const preset = CRIT_EFFECT_PRESETS[type];

  try {
    const effect = new Sequence().effect().file(effectFile);

    if (preset.attach) effect.attachTo(token);
    else effect.atLocation(token);

    await effect
      .scale(preset.scale)
      .playbackRate(preset.playbackRate)
      .fadeIn(preset.fadeIn)
      .fadeOut(preset.fadeOut)
      .belowTokens(preset.belowTokens)
      .opacity(preset.opacity)
      .forUsers(game.users.map(u => u.id))
      .play();
  } catch (err) {
    console.error("[Aurore] Error playing crit effect:", err);
    await _fallbackChatHighlight(type, actor);
  }
}

/**
 * Fallback: post a styled chat message when Sequencer or JB2A is unavailable.
 * @param {string} type - "critSuccess" | "critFailure"
 * @param {object} actor - The actor that rolled
 */
async function _fallbackChatHighlight(type, actor) {
  const label =
    type === "critSuccess"
      ? game.i18n.localize("AURORE.Chat.CritSuccess")
      : game.i18n.localize("AURORE.Chat.CritFailure");

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="aurore roll-mental aurore-crit-${type}">
      <p><strong>${actor.name}</strong></p>
      <p style="color: ${type === 'critSuccess' ? 'gold' : 'crimson'};">${label}</p>
    </div>`,
  });
}
