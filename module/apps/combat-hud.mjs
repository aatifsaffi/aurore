import { SYSTEM_ID } from "../config.mjs";
import { trinityRingColor } from "../helpers/token-stamp.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

const FALLBACK_IMG = "icons/svg/mystery-man.svg";

/**
 * Combat HUD — a BG3 / Divinity-style overlay shown at the top of the screen
 * while a combat is started: attacker card (active combatant) on the left,
 * defender card (first token targeted by the attacker's controlling user) on
 * the right, and an initiative strip of small portraits between them.
 *
 * Pure render layer over Foundry's Combat document; it never writes to it.
 */
export class AuroreCombatHud extends HandlebarsApplicationMixin(ApplicationV2) {
  /** Singleton instance. @type {AuroreCombatHud|null} */
  static instance = null;

  /** Id of the active combatant at the last render (drives the slide-in animation). */
  _lastCombatantId = null;

  /** @type {number|null} */
  _turnChangeTimer = null;

  /** @override */
  static DEFAULT_OPTIONS = {
    id: "aurore-combat-hud",
    classes: ["aurore", "aurore-combat-hud"],
    window: { frame: false, positioned: false },
    actions: { panToCombatant: AuroreCombatHud._onPanToCombatant }
  };

  /** @override */
  static PARTS = {
    hud: { template: "systems/aurore/templates/apps/combat-hud.hbs" }
  };

  /** Tunables from config. @returns {object} */
  static get settings() {
    return CONFIG[SYSTEM_ID]?.COMBAT_HUD ?? {};
  }

  /**
   * Debounced entry point: show/refresh the HUD when a combat is started and the
   * setting is on, otherwise close it. Safe to call from any hook.
   * @type {Function}
   */
  static refresh = foundry.utils.debounce(() => AuroreCombatHud.#sync(), 50);

  /** Render or close according to the current combat + setting. */
  static #sync() {
    const enabled = game.settings.get(SYSTEM_ID, "combatHudEnabled");
    const combat = game.combat;
    const show = enabled && combat?.started;

    if (!show) {
      const hud = AuroreCombatHud.instance;
      if (hud?.rendered) hud.close();
      return;
    }
    AuroreCombatHud.instance ??= new AuroreCombatHud();
    AuroreCombatHud.instance.render({ force: true });
  }

  /**
   * Pick the user whose targets define the defender: first active non-GM owner
   * of the combatant's actor, else the active GM.
   * @param {Combatant} combatant
   * @returns {User|null}
   */
  static resolveTargetingUser(combatant) {
    const actor = combatant?.actor;
    const owner = actor
      ? game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"))
      : null;
    return owner ?? game.users.activeGM ?? null;
  }

  /**
   * Build the display data for a card.
   * @param {Combatant|Token|TokenDocument} source
   * @returns {object}
   */
  static cardData(source) {
    const isCombatant = source instanceof Combatant;
    const tokenDoc = isCombatant ? source.token : (source.document ?? source);
    const actor = source.actor ?? tokenDoc?.actor ?? null;
    const hiddenFromUser = !game.user.isGM && (source.hidden ?? tokenDoc?.hidden ?? false);

    if (hiddenFromUser || !actor) {
      return {
        name: "???", img: FALLBACK_IMG, trinity: "balanced", color: trinityRingColor(null),
        tokenId: null, isNpc: false, showNumbers: false, hidden: true, isDefeated: false,
        pv: { value: 0, max: 0, pct: 0 }, pp: { value: 0, max: 0, pct: 0 }
      };
    }

    const isNpc = actor.type === "npc";
    const showNumbers = !isNpc || game.user.isGM || actor.isOwner;
    const pool = key => {
      const value = Number(actor.system?.resources?.[key]?.value) || 0;
      const max = Number(actor.system?.resources?.[key]?.max) || 0;
      const pct = max > 0 ? Math.round(Math.min(100, Math.max(0, (value / max) * 100))) : 0;
      return { value, max, pct };
    };

    return {
      name: tokenDoc?.name ?? actor.name,
      isDefeated: AuroreCombatHud.isDefeated(source, tokenDoc, actor),
      img: actor.img || tokenDoc?.texture?.src || FALLBACK_IMG,
      trinity: actor.system?.trinityDominant ?? "balanced",
      color: trinityRingColor(actor),
      tokenId: tokenDoc?.id ?? null,
      isNpc,
      showNumbers,
      hidden: false,
      pv: pool("pv"),
      pp: pool("pp")
    };
  }

  /**
   * Whether a card's subject is defeated: the combatant's defeated flag when it
   * is in the current combat, else the actor's "defeated" status effect.
   * @param {Combatant|Token|TokenDocument} source
   * @param {TokenDocument|null} tokenDoc
   * @param {Actor} actor
   * @returns {boolean}
   */
  static isDefeated(source, tokenDoc, actor) {
    const combatant = source instanceof Combatant
      ? source
      : game.combat?.combatants.find(c => c.tokenId === tokenDoc?.id);
    if (combatant) return combatant.isDefeated;
    return actor.statuses?.has(CONFIG.specialStatusEffects.DEFEATED) ?? false;
  }

  /** @override */
  async _prepareContext(_options) {
    const combat = game.combat;
    const combatant = combat?.combatant ?? null;
    const attacker = combatant ? AuroreCombatHud.cardData(combatant) : null;

    // Defender = first target of the controlling user that isn't the attacker.
    let defender = null;
    let extraTargets = 0;
    const user = AuroreCombatHud.resolveTargetingUser(combatant);
    if (user && combatant) {
      const targets = [...(user.targets ?? [])].filter(t =>
        t.id !== combatant.tokenId && (game.user.isGM || !t.document.hidden));
      if (targets.length) {
        defender = AuroreCombatHud.cardData(targets[0]);
        extraTargets = targets.length - 1;
      }
    }

    const strip = (combat?.turns ?? [])
      .filter(c => c.token && c.actor && (game.user.isGM || !c.hidden))
      .map(c => {
        const card = AuroreCombatHud.cardData(c);
        return {
          ...card,
          id: c.id,
          isActive: c.id === combatant?.id,
          isTargeted: !!defender && defender.tokenId === c.tokenId
        };
      });

    return {
      round: combat?.round ?? 0,
      attacker,
      defender,
      extraTargets,
      strip,
      defeatedIcon: AuroreCombatHud.settings.defeatedIcon ?? "icons/svg/skull.svg"
    };
  }

  /** @override */
  async _onRender(_context, _options) {
    const root = this.element;
    const cfg = AuroreCombatHud.settings;
    const vars = {
      "--hud-card-width": `${cfg.cardWidth}px`,
      "--hud-card-height": `${cfg.cardHeight}px`,
      "--hud-strip-width": `${cfg.stripCardWidth}px`,
      "--hud-strip-height": `${cfg.stripCardHeight}px`,
      "--hud-strip-max": `${cfg.stripMaxVisible}`,
      "--hud-anim-ms": `${cfg.animationMs}ms`,
      "--hud-top": `${cfg.topOffset}px`
    };
    for (const [key, val] of Object.entries(vars)) {
      if (!val.startsWith("undefined") && !val.startsWith("NaN")) root.style.setProperty(key, val);
    }

    const activeId = game.combat?.combatant?.id ?? null;
    if (activeId !== this._lastCombatantId) {
      root.classList.add("aurore-combat-hud--turn-change");
      clearTimeout(this._turnChangeTimer);
      this._turnChangeTimer = setTimeout(
        () => root.classList.remove("aurore-combat-hud--turn-change"),
        (cfg.animationMs ?? 400) + 100
      );
      this._lastCombatantId = activeId;
    }

    root.querySelector(".hud-strip-card.active")
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }

  /** @override */
  async _preClose(options) {
    clearTimeout(this._turnChangeTimer);
    this._lastCombatantId = null;
    return super._preClose?.(options);
  }

  /**
   * Pan the canvas to a combatant's token (and select it if owned).
   * @this {AuroreCombatHud}
   * @param {PointerEvent} _event
   * @param {HTMLElement} target
   */
  static _onPanToCombatant(_event, target) {
    const token = canvas.tokens?.get(target.dataset.tokenId);
    if (!token) return;
    canvas.animatePan({ x: token.center.x, y: token.center.y });
    if (token.isOwner) token.control({ releaseOthers: true });
  }
}
