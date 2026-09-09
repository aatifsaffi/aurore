import { SYSTEM_ID } from "../config.mjs";
import {
  loadBitmap, loadTemplate, composeStamp, resolveFraming, trinityRingColor,
  stampToken, stampActorPrototype
} from "../helpers/token-stamp.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Numeric sliders shown in the dialog. */
const SLIDERS = [
  { key: "scale",      label: "AURORE.TokenStamp.Scale",   min: 0.30, max: 1.60, step: 0.01 },
  { key: "offsetX",    label: "AURORE.TokenStamp.OffsetX", min: -0.50, max: 0.50, step: 0.01 },
  { key: "offsetY",    label: "AURORE.TokenStamp.OffsetY", min: -0.50, max: 0.50, step: 0.01 },
  { key: "insetRatio", label: "AURORE.TokenStamp.Inset",   min: 0.50, max: 1.00, step: 0.01 }
];

/**
 * "Token framing" — a small live-preview editor for how an actor portrait is
 * composed inside the stamped token image (zoom, pan, ring inset, ring colour,
 * background). Writes `flags.aurore.stamp` on the actor's prototype token, or
 * on a specific placed token when one is passed, then re-stamps.
 */
export class TokenStampConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  /**
   * @param {{actor: Actor, token?: TokenDocument|null}} opts
   */
  constructor({ actor, token = null } = {}) {
    super({ id: `aurore-token-stamp-${token?.id ?? actor?.id ?? "new"}` });
    this.actor = actor;
    this.token = token;         // TokenDocument ⇒ per-token; null ⇒ prototype
    this._portrait = null;      // cached ImageBitmap
    this._template = null;      // cached ring template bitmap (or null)
    this._draft = {};           // live, unsaved slider/colour values
  }

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["aurore", "aurore-token-stamp-config"],
    tag: "form",
    window: { title: "AURORE.TokenStamp.Configure", icon: "fa-solid fa-crop-simple", resizable: false },
    position: { width: 540, height: "auto" },
    form: { handler: TokenStampConfig._onSubmit, closeOnSubmit: true },
    actions: { reset: TokenStampConfig._onReset }
  };

  /** @override */
  static PARTS = {
    body: { template: "systems/aurore/templates/apps/token-stamp-config.hbs" }
  };

  /** @override */
  get title() {
    const scope = this.token?.name ?? this.actor?.name ?? "";
    return `${game.i18n.localize("AURORE.TokenStamp.Configure")} — ${scope}`;
  }

  /** Currently-stored framing flag for the active target. @returns {object} */
  _stored() {
    const src = this.token
      ? this.token.getFlag(SYSTEM_ID, "stamp")
      : foundry.utils.getProperty(this.actor, `prototypeToken.flags.${SYSTEM_ID}.stamp`);
    return foundry.utils.deepClone(src ?? {});
  }

  /** Resolved framing = config defaults ← stored flag ← live draft. @returns {object} */
  _framing() {
    const base = resolveFraming(this.actor, this.token);
    const merged = foundry.utils.mergeObject(base, { ...this._stored(), ...this._draft }, { inplace: false });
    merged.color = merged.ringColor || trinityRingColor(this.actor);
    return merged;
  }

  /** @override */
  async _prepareContext() {
    const f = this._framing();
    return {
      isToken: !!this.token,
      trinityColor: trinityRingColor(this.actor),
      f,
      sliders: SLIDERS.map(s => ({ ...s, value: f[s.key], display: Number(f[s.key]).toFixed(2) }))
    };
  }

  /** @override */
  async _onRender(_context, _options) {
    const root = this.element;
    this._canvas = root.querySelector("canvas.preview");

    try {
      this._portrait ??= await loadBitmap(this.actor.img);
    } catch (err) {
      console.debug(`${SYSTEM_ID} | token-stamp config: portrait failed to load:`, err);
    }
    const ring = this._framing().ring;
    if (this._template === null && ring?.mode !== "off") {
      this._template = await loadTemplate(ring?.templateSrc);
    }

    root.querySelectorAll("input").forEach(el => el.addEventListener("input", () => this._onInput()));
    this._drawPreview();
  }

  /** Collect the current inputs into `_draft` and redraw the preview. */
  _onInput() {
    const root = this.element;
    const d = {};
    for (const el of root.querySelectorAll("input[data-framing]")) {
      d[el.name] = Number(el.value);
      const out = root.querySelector(`output[data-for="${el.name}"]`);
      if (out) out.textContent = Number(el.value).toFixed(2);
    }
    const useTrinity = root.querySelector("input[name='useTrinity']")?.checked;
    d.ringColor = useTrinity ? "" : (root.querySelector("input[name='ringColor']")?.value ?? "");
    const bgOff = root.querySelector("input[name='bgTransparent']")?.checked;
    d.background = bgOff ? "" : (root.querySelector("input[name='background']")?.value ?? "#ffffff");
    this._draft = d;
    this._drawPreview();
  }

  /** Re-composite the stamp into the preview canvas. */
  _drawPreview() {
    if (!this._canvas) return;
    const cx = this._canvas.getContext("2d");
    const W = this._canvas.width;
    cx.clearRect(0, 0, W, W);
    if (!this._portrait) return;
    const f = this._framing();
    const tmpl = f.ring?.mode === "off" ? null : this._template;
    cx.drawImage(composeStamp(this._portrait, tmpl, f), 0, 0, W, W);
  }

  /** Read the current inputs into a plain flag object. @returns {object} */
  _collect() {
    const root = this.element;
    const stamp = {};
    for (const el of root.querySelectorAll("input[data-framing]")) stamp[el.name] = Number(el.value);
    const useTrinity = root.querySelector("input[name='useTrinity']")?.checked;
    stamp.ringColor = useTrinity ? "" : (root.querySelector("input[name='ringColor']")?.value ?? "");
    const bgOff = root.querySelector("input[name='bgTransparent']")?.checked;
    stamp.background = bgOff ? "" : (root.querySelector("input[name='background']")?.value ?? "#ffffff");
    return stamp;
  }

  /** Re-stamp the active target with `{ force: true }`. */
  async _reStamp() {
    if (this.token) await stampToken(this.token, { force: true });
    else await stampActorPrototype(this.actor, { force: true });
  }

  /**
   * Form submit — persist the framing flag, then re-stamp.
   * @this {TokenStampConfig}
   */
  static async _onSubmit(_event, _form, _formData) {
    const stamp = this._collect();
    if (this.token) await this.token.setFlag(SYSTEM_ID, "stamp", stamp);
    else await this.actor.update({ [`prototypeToken.flags.${SYSTEM_ID}.stamp`]: stamp });
    await this._reStamp();
  }

  /**
   * Reset — clear the framing flag for the active target, re-stamp, close.
   * @this {TokenStampConfig}
   */
  static async _onReset(event) {
    event.preventDefault();
    if (this.token) await this.token.unsetFlag(SYSTEM_ID, "stamp");
    else await this.actor.update({ [`prototypeToken.flags.${SYSTEM_ID}.-=stamp`]: null });
    this._draft = {};
    await this._reStamp();
    this.close();
  }
}

/**
 * Open the framing dialog.
 * @param {{actor: Actor, token?: TokenDocument|null}} opts
 * @returns {TokenStampConfig}
 */
export function openTokenStampConfig(opts) {
  return new TokenStampConfig(opts).render(true);
}
