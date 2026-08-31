import { TALENTS } from "../config.mjs";
import { XPManager } from "../helpers/xp-manager.mjs";
import { AuroreActorSheetV2 } from "./actor-sheet.mjs";

export class AuroreCharacterSheet extends AuroreActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["character"],
    position: { width: 740, height: 680 },
    actions: {
      setTalentFavori: AuroreCharacterSheet._onSetTalentFavori,
      selectTalent:    AuroreCharacterSheet._onSelectTalent,
      selectRace:      AuroreCharacterSheet._onSelectRace,
      removeRace:      AuroreCharacterSheet._onRemoveRace,
      selectRacial:    AuroreCharacterSheet._onSelectRacial,
      removeRacial:    AuroreCharacterSheet._onRemoveRacial,
      spendXP:         AuroreCharacterSheet._onSpendXP
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/aurore/templates/actor/character-sheet.hbs",
      scrollable: [".tab-body"]
    }
  };

  /** @override */
  static TABS = ["combat", "inventory", "powers", "gifts", "biography", "progression"];

  /** @override */
  static tabGroups = { primary: "combat" };

  // ── Context ──────────────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor  = this.document;
    const system = actor.system;

    // Talent grid grouped by Trinity color, with isFavori flag
    context.talentsByColor = ["red", "green", "blue"].map(color => ({
      color,
      colorLabel: game.i18n.localize(`AURORE.Trinity.${color}`),
      talents: Object.entries(TALENTS)
        .filter(([, cfg]) => cfg.type === color)
        .map(([key, cfg]) => ({
          key,
          label:    game.i18n.localize(cfg.label),
          bonus:    system.talentBonuses[key] ?? 0,
          isFavori: system.talentFavori === key
        }))
    }));

    // Favori talent for the header pill
    const favoriKey = system.talentFavori;
    context.talentFavori = favoriKey && TALENTS[favoriKey] ? {
      key:   favoriKey,
      label: game.i18n.localize(TALENTS[favoriKey].label),
      color: TALENTS[favoriKey].type
    } : null;

    // XP purchases for the Progression tab
    context.purchases = XPManager.getAvailablePurchases(actor);

    // Character-only item groups
    context.items.gifts  = actor.items.filter(i => i.type === "gift");
    context.items.race    = actor.items.find(i => i.type === "race")   ?? null;
    context.items.racial  = actor.items.find(i => i.type === "racial") ?? null;

    return context;
  }

  // ── Talents ───────────────────────────────────────────

  /**
   * Set the favourite talent.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onSetTalentFavori(_event, target) {
    const talent  = target.dataset.talent;
    const current = this.document.system.talentFavori;
    // Toggle off if clicking the already-active star
    await this.document.update({ "system.talentFavori": current === talent ? "" : talent });
  }

  /**
   * Open a 3-column talent picker dialog with live description preview.
   */
  static async _onSelectTalent(_event) {
    const current = this.document.system.talentFavori;
    const esc     = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    const MENTAL_FOR_COLOR = { red: "rage", green: "surprise", blue: "peur" };

    // Group talents by Trinity color, preserving config order
    const byColor = { red: [], green: [], blue: [] };
    for (const [key, cfg] of Object.entries(TALENTS)) {
      byColor[cfg.type].push({
        key,
        label:       game.i18n.localize(cfg.label),
        color:       cfg.type,
        description: game.i18n.localize(cfg.description)
      });
    }

    const buildCol = (color) => {
      const mentalLabel = game.i18n.localize(`AURORE.Mental.${MENTAL_FOR_COLOR[color]}`);
      const rows = byColor[color].map(t => {
        const sel = t.key === current ? " tp-selected" : "";
        return `<button type="button" class="talent-pick${sel}"
                  data-key="${t.key}" data-color="${t.color}"
                  data-description="${esc(t.description)}">${t.label}</button>`;
      }).join("");
      return `<div class="talent-pick-col" data-color="${color}">
        <div class="talent-pick-header">${mentalLabel}</div>
        ${rows}
      </div>`;
    };

    // Resolve initial description state
    const initialCfg = current && TALENTS[current] ? TALENTS[current] : null;
    const initialDesc      = initialCfg ? game.i18n.localize(initialCfg.description) : "";
    const initialColor     = initialCfg?.type ?? "";
    const initialTypeLabel = initialColor
      ? game.i18n.localize(`AURORE.Mental.${MENTAL_FOR_COLOR[initialColor]}`) : "";

    Hooks.once("renderDialogV2", (_app, html) => {
      const hiddenInput = html.querySelector("input[name='talent']");
      const descEl      = html.querySelector(".talent-dialog-desc");

      html.querySelectorAll(".talent-pick").forEach(btn => {
        btn.addEventListener("click", () => {
          const wasSelected = btn.classList.contains("tp-selected");
          // Deselect all
          html.querySelectorAll(".talent-pick").forEach(b => b.classList.remove("tp-selected"));
          if (!wasSelected) {
            // Select clicked
            btn.classList.add("tp-selected");
            hiddenInput.value = btn.dataset.key;
            if (descEl) {
              descEl.dataset.color     = btn.dataset.color;
              descEl.dataset.typeLabel = game.i18n.localize(`AURORE.Mental.${MENTAL_FOR_COLOR[btn.dataset.color]}`);
              descEl.innerHTML         = btn.dataset.description;
            }
          } else {
            // Toggle off — clear
            hiddenInput.value = "";
            if (descEl) { descEl.dataset.color = ""; descEl.dataset.typeLabel = ""; descEl.innerHTML = ""; }
          }
        });
      });
    });

    let key;
    try {
      key = await foundry.applications.api.DialogV2.prompt({
        classes: ["aurore"],
        rejectClose: true,
        window: { title: game.i18n.localize("AURORE.Talents.selectTitle") },
        content: `<div class="aurore-talent-dialog">
          <input type="hidden" name="talent" value="${current ?? ""}">
          <div class="talent-pick-grid">
            ${buildCol("red")}${buildCol("green")}${buildCol("blue")}
          </div>
          <div class="talent-dialog-desc"
               data-color="${initialColor}"
               data-type-label="${initialTypeLabel}">${initialDesc}</div>
        </div>`,
        ok: {
          label: game.i18n.localize("AURORE.Actions.select"),
          callback: (_e, button) => button.form.elements.talent.value
        }
      });
    } catch { return; }

    // Empty string = clear the talent (valid); null/undefined = cancelled or window closed
    if (key == null) return;
    await this.document.update({ "system.talentFavori": key });
  }

  // ── XP ────────────────────────────────────────────────

  /**
   * Spend XP on a purchase and apply the upgrade.
   * @param {PointerEvent} _event
   * @param {HTMLElement}  target  Element carrying data-purchase-id
   */
  static async _onSpendXP(_event, target) {
    const purchaseId = target.dataset.purchaseId;
    if (!purchaseId) return;
    await XPManager.executePurchase(this.document, purchaseId);
  }

  // ── Race / Racial selection ───────────────────────────

  /**
   * Open a dialog to pick a race from world items + system compendium.
   */
  static async _onSelectRace(_event) {
    const races = await AuroreCharacterSheet._collectItemsOfType("race");
    if (!races.length) {
      return ui.notifications.warn(game.i18n.localize("AURORE.Race.noRacesFound"));
    }

    // Pre-select the race already equipped on the actor (match by name)
    const currentRace = this.document.items.find(i => i.type === "race");
    const selectedIdx = currentRace
      ? Math.max(0, races.findIndex(r => r.name === currentRace.name))
      : 0;

    const esc     = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const options = races.map((r, i) =>
      `<option value="${r.uuid}" data-img="${esc(r.img)}" data-description="${esc(r.description)}"${i === selectedIdx ? " selected" : ""}>${r.name}</option>`
    ).join("");
    const initial = races[selectedIdx] ?? {};

    Hooks.once("renderDialogV2", (_app, html) => {
      const select  = html.querySelector("select[name='uuid']");
      const imgEl   = html.querySelector(".race-dialog-img");
      const descEl  = html.querySelector(".race-dialog-desc");
      if (!select) return;
      select.addEventListener("change", () => {
        const opt = select.selectedOptions[0];
        if (imgEl)  imgEl.src          = opt?.dataset.img         ?? "";
        if (descEl) descEl.innerHTML   = opt?.dataset.description ?? "";
      });
    });

    let uuid;
    try {
      uuid = await foundry.applications.api.DialogV2.prompt({
        classes: ["aurore"],
        window: { title: game.i18n.localize("AURORE.Race.selectTitle") },
        content: `<div class="aurore-race-dialog">
          <img class="race-dialog-img" src="${initial.img ?? ""}" alt="">
          <div class="race-dialog-select">
            <label>${game.i18n.localize("AURORE.Race.selectLabel")}</label>
            <select name="uuid" autofocus>${options}</select>
          </div>
          <div class="race-dialog-desc">${initial.description ?? ""}</div>
        </div>`,
        ok: {
          label: game.i18n.localize("AURORE.Actions.select"),
          callback: (_e, button) => button.form.elements.uuid.value
        }
      });
    } catch { return; }

    if (!uuid) return;
    const raceDoc = await fromUuid(uuid);
    if (!raceDoc) return;

    // Replace race (and any existing racial — they're coupled)
    const existing = this.document.items.filter(i => i.type === "race" || i.type === "racial");
    if (existing.length) {
      await foundry.documents.Item.deleteDocuments(existing.map(i => i.id), { parent: this.document });
    }
    await foundry.documents.Item.createDocuments([raceDoc.toObject()], { parent: this.document });

    // Auto-select the first matching racial (no dialog)
    await AuroreCharacterSheet._autoSelectFirstRacial.call(this, raceDoc);
  }

  /**
   * Remove the current race (and racial) from the actor.
   */
  static async _onRemoveRace(_event) {
    const toDelete = this.document.items
      .filter(i => i.type === "race" || i.type === "racial")
      .map(i => i.id);
    if (toDelete.length) {
      await foundry.documents.Item.deleteDocuments(toDelete, { parent: this.document });
    }
  }

  /**
   * Open a dialog to pick a racial ability, filtered to the current race when possible.
   */
  static async _onSelectRacial(_event) {
    const currentRace = this.document.items.find(i => i.type === "race");
    const allRacials  = await AuroreCharacterSheet._collectItemsOfType("racial");

    if (!allRacials.length) {
      return ui.notifications.warn(game.i18n.localize("AURORE.Racial.noRacialsFound"));
    }

    // Filter racials by the actor's current race raceId, supporting Mixti's borrowRacialsFrom
    let racials = allRacials;
    let hint = "";
    if (currentRace) {
      const raceSystem = currentRace.system;
      // Allowed raceIds: the race's own id + any borrowed ones (Mixti)
      const raceName = currentRace.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const allowedIds = new Set([raceName]);
      for (const borrowed of (raceSystem.borrowRacialsFrom ?? [])) {
        allowedIds.add(borrowed.toLowerCase());
      }
      const filtered = allRacials.filter(r => r.raceId && allowedIds.has(r.raceId.toLowerCase()));
      if (filtered.length) racials = filtered;
      hint = `<p class="hint">${game.i18n.format("AURORE.Racial.filterHint", { race: currentRace.name })}</p>`;
    }

    // Escape HTML for use in data attributes
    const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    // Pre-select the racial already equipped on the actor (match by name)
    const currentRacial = this.document.items.find(i => i.type === "racial");
    const selectedIdx   = currentRacial
      ? Math.max(0, racials.findIndex(r => r.name === currentRacial.name))
      : 0;

    const options = racials.map((r, i) =>
      `<option value="${r.uuid}" data-description="${esc(r.description)}"${i === selectedIdx ? " selected" : ""}>${r.name}</option>`
    ).join("");

    const initialDesc = racials[selectedIdx]?.description ?? "";

    // Attach live description preview after the dialog renders.
    // (Inline onchange is stripped by Foundry's DOMParser — use a render hook instead.)
    Hooks.once("renderDialogV2", (_app, html) => {
      const select  = html.querySelector("select[name='uuid']");
      const descDiv = html.querySelector(".racial-desc");
      if (!select || !descDiv) return;
      select.addEventListener("change", () => {
        descDiv.innerHTML = select.selectedOptions[0]?.dataset.description ?? "";
      });
    });

    let uuid;
    try {
      uuid = await foundry.applications.api.DialogV2.prompt({
        classes: ["aurore"],
        window: { title: game.i18n.localize("AURORE.Racial.selectTitle") },
        content: `${hint}<div class="form-group aurore-racial-dialog">
          <label>${game.i18n.localize("AURORE.Racial.selectLabel")}</label>
          <select name="uuid" autofocus>${options}</select>
          <div class="racial-desc">${initialDesc}</div>
        </div>`,
        ok: {
          label: game.i18n.localize("AURORE.Actions.select"),
          callback: (_e, button) => button.form.elements.uuid.value
        }
      });
    } catch { return; }

    if (!uuid) return;
    const racialDoc = await fromUuid(uuid);
    if (!racialDoc) return;

    const existing = this.document.items.filter(i => i.type === "racial");
    if (existing.length) {
      await foundry.documents.Item.deleteDocuments(existing.map(i => i.id), { parent: this.document });
    }
    await foundry.documents.Item.createDocuments([racialDoc.toObject()], { parent: this.document });
  }

  /**
   * Remove the current racial ability from the actor.
   */
  static async _onRemoveRacial(_event) {
    const racial = this.document.items.find(i => i.type === "racial");
    if (racial) await racial.delete();
  }

  /**
   * Auto-select the first racial matching a given race document (no dialog).
   * Called after a race is chosen to immediately provide a default racial.
   * @param {Item} raceDoc  The newly selected race document
   */
  static async _autoSelectFirstRacial(raceDoc) {
    const allRacials = await AuroreCharacterSheet._collectItemsOfType("racial");
    if (!allRacials.length) return;

    const normalize = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const raceName   = normalize(raceDoc.name);
    const allowedIds = new Set([raceName]);
    for (const borrowed of (raceDoc.system?.borrowRacialsFrom ?? [])) {
      allowedIds.add(normalize(borrowed));
    }

    const match = allRacials.find(r => r.raceId && allowedIds.has(normalize(r.raceId)));
    if (!match) return;

    const racialDoc = await fromUuid(match.uuid);
    if (!racialDoc) return;
    await foundry.documents.Item.createDocuments([racialDoc.toObject()], { parent: this.document });
  }

  /**
   * Collect items of a given type from world items and the matching system compendium pack.
   * @param {"race"|"racial"} type
   * @returns {Promise<Array<{name: string, uuid: string}>>}
   */
  static async _collectItemsOfType(type) {
    const results = [];
    const SYSTEM_ID = "aurore";

    // World items first
    for (const item of game.items.filter(i => i.type === type)) {
      results.push({
        name:        item.name,
        uuid:        item.uuid,
        img:         item.img                  ?? "",
        raceId:      item.system?.raceId       ?? "",
        description: item.system?.description  ?? ""
      });
    }

    // System compendium pack: "aurore.races" / "aurore.racials"
    // `img` is included in the default index fields; only system fields need to be requested explicitly
    const pack = game.packs.get(`${SYSTEM_ID}.${type}s`);
    if (pack) {
      const index = await pack.getIndex({ fields: ["system.raceId", "system.description"] });
      for (const entry of index) {
        results.push({
          name:        entry.name,
          uuid:        `Compendium.${pack.collection}.${entry._id}`,
          img:         entry.img               ?? "",
          raceId:      entry.system?.raceId    ?? "",
          description: entry.system?.description ?? ""
        });
      }
    }

    return results;
  }
}
