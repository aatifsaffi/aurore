import { TALENTS, MAX_POWERS } from "../config.mjs";
import { highlightItemAoe } from "../canvas/grid-highlight.mjs";
import { XPManager } from "../helpers/xp-manager.mjs";
import { classifyRoll, playCritEffect } from "../helpers/critEffects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class AuroreCharacterSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["aurore", "sheet", "actor", "character"],
    tag: "form",
    position: { width: 740, height: 680 },
    window: { resizable: true },
    form: {
      handler: AuroreCharacterSheet._onSubmitDocument,
      submitOnChange: true,
      closeOnSubmit: false
    },
    dragDrop: [{ dragSelector: "li.item[data-item-id]", dropSelector: ".items-list, .drop-zone, .equip-slot" }],
    actions: {
      editPortrait:    AuroreCharacterSheet._onEditPortrait,
      createItem:      AuroreCharacterSheet._onCreateItem,
      editItem:        AuroreCharacterSheet._onEditItem,
      deleteItem:      AuroreCharacterSheet._onDeleteItem,
      equipItem:       AuroreCharacterSheet._onEquipItem,
      unequipSlot:     AuroreCharacterSheet._onUnequipSlot,
      setTalentFavori: AuroreCharacterSheet._onSetTalentFavori,
      selectSlotItem:  AuroreCharacterSheet._onSelectSlotItem,
      showItemAoe:     AuroreCharacterSheet._onShowItemAoe,
      selectRace:      AuroreCharacterSheet._onSelectRace,
      removeRace:      AuroreCharacterSheet._onRemoveRace,
      selectRacial:    AuroreCharacterSheet._onSelectRacial,
      removeRacial:    AuroreCharacterSheet._onRemoveRacial,
      selectTalent:    AuroreCharacterSheet._onSelectTalent,
      spendXP:         AuroreCharacterSheet._onSpendXP,
      rollMentalStat:  AuroreCharacterSheet._onRollMentalStat
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/aurore/templates/actor/character-sheet.hbs",
      scrollable: [".tab-body"]
    }
  };

  /** Default active tab. Talents tab removed — panel lives in header. @override */
  static tabGroups = { primary: "combat" };


  // ── Form submission ───────────────────────────────────

  /**
   * Persist all form data to the actor document.
   * Explicit handler so `name` and all `system.*` fields are included.
   * @param {Event}            event
   * @param {HTMLFormElement}  form
   * @param {FormDataExtended} formData
   */
  static async _onSubmitDocument(_event, _form, formData) {
    const updateData = foundry.utils.expandObject(formData.object);
    await this.document.update(updateData);
  }

  // ── Context ──────────────────────────────────────────

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor  = this.document;
    const system = actor.system;

    // Expose the actor document directly — base _prepareContext only provides `document`
    context.actor  = actor;
    context.system = system;
    context.config = CONFIG.aurore;
    context.maxPowers = MAX_POWERS;

    // Resolved equipped items (null if slot empty or item not found)
    context.equipped = {
      weapon1: actor.items.get(system.equippedWeapon1) ?? null,
      weapon2: actor.items.get(system.equippedWeapon2) ?? null,
      armor:   actor.items.get(system.equippedArmor)   ?? null,
      gadget:  actor.items.get(system.equippedGadget)  ?? null
    };

    // Mental gauges — capped stats with pre-computed fill percentage
    context.mentalGauges = ["rage", "surprise", "peur", "mental"].map(key => ({
      key,
      label: game.i18n.localize(`AURORE.Mental.${key}`),
      value: system.mental[key],
      pct:   Math.min(100, Math.round((system.mental[key] / 100) * 100))
    }));

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

    // Trinity dominant label (localized)
    const dominant = system.trinityDominant ?? "balanced";
    context.trinityDominantLabel = dominant === "balanced"
      ? game.i18n.localize("AURORE.Trinity.balanced")
      : game.i18n.localize(`AURORE.Trinity.${dominant}`);
    context.trinityDominant = dominant;

    // Tab state — HandlebarsApplicationMixin does not auto-sync active classes
    const activeTab = this.tabGroups.primary ?? "combat";
    context.tabs = {
      primary: Object.fromEntries(
        ["combat", "inventory", "powers", "gifts", "biography", "progression"].map(id => [
          id,
          { cssClass: id === activeTab ? "active" : "" }
        ])
      )
    };

    // XP purchases for the Progression tab
    context.purchases = XPManager.getAvailablePurchases(actor);

    // Favori talent for the header pill
    const favoriKey = system.talentFavori;
    context.talentFavori = favoriKey && TALENTS[favoriKey] ? {
      key:   favoriKey,
      label: game.i18n.localize(TALENTS[favoriKey].label),
      color: TALENTS[favoriKey].type
    } : null;

    // Items by type
    context.items = {
      weapons: actor.items.filter(i => i.type === "weapon"),
      armors:  actor.items.filter(i => i.type === "armor"),
      gadgets: actor.items.filter(i => i.type === "gadget"),
      powers:  actor.items.filter(i => i.type === "power"),
      gifts:   actor.items.filter(i => i.type === "gift"),
      race:    actor.items.find(i => i.type === "race")   ?? null,
      racial:  actor.items.find(i => i.type === "racial") ?? null
    };

    return context;
  }

  // ── Render ────────────────────────────────────────────

  /** @override — wire up tab clicks and restore talent panel state after every render. */
  async _onRender(_context, _options) {
    await super._onRender(_context, _options);

    // HandlebarsApplicationMixin does not auto-sync tabs — handle clicks manually
    this.element.querySelectorAll("nav.tabs .item[data-tab]").forEach(el => {
      el.addEventListener("click", ev => {
        ev.preventDefault();
        const tab   = el.dataset.tab;
        const group = el.dataset.group ?? "primary";
        // Persist state so _prepareContext picks it up on next render
        this.tabGroups[group] = tab;
        // Immediately sync active class on all nav items and panels in this group
        this.element.querySelectorAll(`[data-group="${group}"]`).forEach(node => {
          node.classList.toggle("active", node.dataset.tab === tab);
        });
      });
    });

    // Ensure dragover reaches drop zone containers even when cursor is over a child element.
    // Foundry's DragDrop only binds on the container itself, not its descendants.
    this.element.querySelectorAll(".items-list, .drop-zone, .equip-slot").forEach(zone => {
      zone.addEventListener("dragover", ev => ev.preventDefault());
    });
  }

  // ── Drag & Drop ───────────────────────────────────────

  /** @override */
  _canDragStart(_selector) { return this.isEditable; }

  /** @override */
  _canDragDrop(_selector) { return this.isEditable; }

  /** @override */
  _onDragStart(event) {
    const li = event.currentTarget.closest("li.item[data-item-id]");
    if (!li) return;
    const item = this.document.items.get(li.dataset.itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
  }

  /** @override */
  async _onDrop(event) {
    const data = TextEditor.getDragEventData(event);
    if (data?.type !== "Item") return;

    const ItemCls = foundry.documents.Item;
    const item = await ItemCls.fromDropData(data);
    if (!item) return;

    // Detect equip slot target (works for both .drop-zone and .slot-filled)
    const slotEl    = event.target.closest(".equip-slot[data-slot]");
    const slot      = slotEl?.dataset.slot;
    const slotField = slot ? AuroreCharacterSheet.SLOT_FIELD[slot] : null;

    if (slotField) {
      const expectedType = AuroreCharacterSheet.SLOT_TYPE[slot];

      // TODO(human): handle the type mismatch case
      // If item.type !== expectedType, what should happen?
      // Options: silent return, ui.notifications.warn(...), or equip anyway?
      if (item.type !== expectedType) {
        return ui.notifications.warn(game.i18n.localize("AURORE.Equipment.droppedOnWrongSlot"))
      }

      let itemId;
      if (item.parent?.id === this.document.id) {
        itemId = item.id;
      } else {
        const [created] = await ItemCls.createDocuments([item.toObject()], { parent: this.document });
        itemId = created.id;
      }
      await this.document.update({ [`system.${slotField}`]: itemId });
    } else {
      // Dropped onto inventory list — add from external source only
      if (item.parent?.id !== this.document.id) {
        await ItemCls.createDocuments([item.toObject()], { parent: this.document });
      }
    }
  }

  // ── Actions ───────────────────────────────────────────

  /**
   * Open the FilePicker to change the actor portrait.
   * @param {PointerEvent} event
   */
  static async _onEditPortrait(_event) {
    const fp = new FilePicker({
      type: "image",
      current: this.document.img,
      callback: async path => {
        // Update portrait AND prototype token texture in one call
        await this.document.update({
          img: path,
          "prototypeToken.texture.src": path
        });

        // Sync tokens already placed on any scene
        for (const token of this.document.getActiveTokens(false, true)) {
          await token.update({ "texture.src": path });
        }

        this.render();
      }
    });
    fp.render(true);
  }

  /**
   * Create a new embedded item of the given type.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onCreateItem(_event, target) {
    const type = target.dataset.type;
    const name = game.i18n.localize(`AURORE.ItemTypes.${type}`);
    await foundry.documents.Item.createDocuments([{ name, type }], { parent: this.document });
  }

  /**
   * Open an embedded item's sheet.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onEditItem(_event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    this.document.items.get(itemId)?.sheet.render(true);
  }

  /**
   * Delete an embedded item after confirmation.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onDeleteItem(_event, target) {
    const itemId = target.closest("[data-item-id]").dataset.itemId;
    const item   = this.document.items.get(itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      classes: ["aurore"],
      window: { title: game.i18n.localize("AURORE.Dialog.deleteTitle") },
      content: `<p>${game.i18n.format("AURORE.Dialog.deleteContent", { name: item.name })}</p>`
    });
    if (confirmed) await item.delete();
  }

  /**
   * Equip an item into a specific slot.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onEquipItem(_event, target) {
    const { slot, itemId } = target.dataset;
    const slotKey = {
      weapon1: "equippedWeapon1",
      weapon2: "equippedWeapon2",
      armor:   "equippedArmor",
      gadget:  "equippedGadget"
    }[slot];
    if (!slotKey) return;
    await this.document.update({ [`system.${slotKey}`]: itemId });
  }

  /**
   * Clear an equipment slot.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onUnequipSlot(_event, target) {
    const slot    = target.closest("[data-slot]").dataset.slot;
    const slotKey = {
      weapon1: "equippedWeapon1",
      weapon2: "equippedWeapon2",
      armor:   "equippedArmor",
      gadget:  "equippedGadget"
    }[slot];
    if (!slotKey) return;
    await this.document.update({ [`system.${slotKey}`]: "" });
  }

  /**
   * Toggle the AoE grid highlight for an equipped item (weapon, armor or gadget).
   * @param {PointerEvent} _event
   * @param {HTMLElement}  target  Element carrying data-slot ("weapon1", "weapon2", "armor" or "gadget")
   */
  static async _onShowItemAoe(_event, target) {
    const slot = target.closest("[data-slot]").dataset.slot;
    const slotKey = {
      weapon1: "equippedWeapon1",
      weapon2: "equippedWeapon2",
      armor:   "equippedArmor",
      gadget:  "equippedGadget"
    }[slot];
    if (!slotKey) return;

    const item = this.document.items.get(this.document.system[slotKey]);
    if (!item) return;

    const token = this.document.getActiveTokens()[0];
    if (!token) return ui.notifications.warn(game.i18n.localize("AURORE.Aoe.noToken"));

    highlightItemAoe(token, item);
  }

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

  // ── Mental Stat Rolls ──────────────────────────────────

  /**
   * Roll 1d100 against a mental stat and post result to chat.
   * @param {PointerEvent} _event
   * @param {HTMLElement}  target  Element carrying data-stat
   */
  static async _onRollMentalStat(_event, target) {
    const stat = target.dataset.stat;
    if (!stat) return;

    const actor = this.document;
    const statLabel = game.i18n.localize(`AURORE.Mental.${stat}`);

    const statColorVars = {
      rage: "--trinity-red",
      surprise: "--trinity-green",
      peur: "--trinity-blue",
      mental: "--mental-color"
    };
    const colorVar = statColorVars[stat] || "--text";

    const roll = new Roll("1d100");
    await roll.evaluate();

    const rollTotal = roll.total;
    const critType = classifyRoll(rollTotal);

    const token = actor.getActiveTokens()[0] ?? null;
    await playCritEffect(critType, { token, actor });

    const chatClass = critType !== "normal" ? `aurore-crit-${critType}` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="aurore roll-mental ${chatClass}">
        <p><strong>${actor.name}</strong> lance un dé de <strong style="--roll-color: var(${colorVar});">${statLabel}</strong></p>
        <p>Total: <strong style="--roll-color: var(${colorVar});">${rollTotal}</strong></p>
      </div>`,
      rolls: [roll]
    });
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

  // ── Equipment slot selection ──────────────────────────

  static SLOT_TYPE = Object.freeze({
    weapon1: "weapon", weapon2: "weapon", armor: "armor", gadget: "gadget"
  });

  static SLOT_FIELD = Object.freeze({
    weapon1: "equippedWeapon1", weapon2: "equippedWeapon2",
    armor:   "equippedArmor",   gadget:  "equippedGadget"
  });

  /**
   * Open a picker dialog for an equipment slot and equip the chosen item.
   * @param {PointerEvent} _event
   * @param {HTMLElement}  target  Element carrying data-slot
   */
  static async _onSelectSlotItem(_event, target) {
    const slot     = target.dataset.slot;
    const type     = AuroreCharacterSheet.SLOT_TYPE[slot];
    if (!type) return;

    const dialogId = `aurore-slot-${this.document.id}-${slot}`;
    const existing = foundry.applications.instances.get(dialogId);
    if (existing) { existing.bringToTop(); return; }

    const items = await AuroreCharacterSheet._collectEquipmentItems.call(this, type);
    if (!items.length) {
      const key = `AURORE.Equipment.no${type.charAt(0).toUpperCase() + type.slice(1)}sFound`;
      return ui.notifications.warn(game.i18n.localize(key));
    }

    const titleKey = `AURORE.Equipment.select${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const currentField = AuroreCharacterSheet.SLOT_FIELD[slot];
    const currentId    = this.document.system[currentField];

    const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    // Build <optgroup> sections
    const groups = [
      { label: game.i18n.localize("AURORE.Equipment.groupInventory"), source: "actor" },
      { label: game.i18n.localize("AURORE.Equipment.groupWorld"),     source: "world" },
      { label: game.i18n.localize("AURORE.Equipment.groupCompendium"),source: "compendium" }
    ];

    let optionsHtml = "";
    for (const group of groups) {
      const groupItems = items.filter(i => i.source === group.source);
      if (!groupItems.length) continue;
      const opts = groupItems.map(i => {
        const val = i.source === "actor" ? `actor:${i.id}` : i.uuid;
        const sel = (i.source === "actor" && i.id === currentId) ? " selected" : "";
        return `<option value="${esc(val)}" data-img="${esc(i.img)}" data-stats="${esc(i.stats)}" data-trinity="${esc(i.trinity)}"${sel}>${esc(i.name)}</option>`;
      }).join("");
      optionsHtml += `<optgroup label="${esc(group.label)}">${opts}</optgroup>`;
    }

    const firstItem = items.find(i => (i.source === "actor" && i.id === currentId)) ?? items[0];

    const trinityClasses = ["trinity-red", "trinity-green", "trinity-blue"];
    Hooks.once("renderDialogV2", (_app, html) => {
      const select  = html.querySelector("select[name='key']");
      const imgEl   = html.querySelector(".equip-dialog-img");
      const statsEl = html.querySelector(".equip-dialog-stats");
      if (!select) return;
      // Apply initial trinity border from firstItem
      if (imgEl && firstItem?.trinity) imgEl.classList.add(`trinity-${firstItem.trinity}`);
      select.addEventListener("change", () => {
        const opt = select.selectedOptions[0];
        if (imgEl) {
          imgEl.src = opt?.dataset.img ?? "";
          imgEl.classList.remove(...trinityClasses);
          if (opt?.dataset.trinity) imgEl.classList.add(`trinity-${opt.dataset.trinity}`);
        }
        if (statsEl) statsEl.textContent = opt?.dataset.stats ?? "";
      });
    });

    let key;
    try {
      key = await foundry.applications.api.DialogV2.prompt({
        id: dialogId,
        classes: ["aurore"],
        window: { title: game.i18n.localize(titleKey) },
        content: `<div class="aurore-equip-dialog">
          <img class="equip-dialog-img" src="${esc(firstItem?.img ?? "")}" alt="">
          <div class="equip-dialog-select">
            <select name="key" autofocus>${optionsHtml}</select>
            <div class="equip-dialog-stats">${esc(firstItem?.stats ?? "")}</div>
          </div>
        </div>`,
        ok: {
          label: game.i18n.localize("AURORE.Actions.select"),
          callback: (_e, button) => button.form.elements.key.value
        }
      });
    } catch { return; }

    if (!key) return;

    let itemId;
    if (key.startsWith("actor:")) {
      // Already in inventory — just equip
      itemId = key.slice(6);
    } else {
      // World or compendium — create a copy on the actor then equip
      const doc = await fromUuid(key);
      if (!doc) return;
      const [created] = await foundry.documents.Item.createDocuments(
        [doc.toObject()], { parent: this.document }
      );
      itemId = created.id;
    }

    await this.document.update({ [`system.${currentField}`]: itemId });
  }

  /**
   * Collect items of a given equipment type from actor inventory, world items, and compendium.
   * @param {"weapon"|"armor"|"gadget"} type
   * @returns {Promise<Array>}
   */
  static async _collectEquipmentItems(type) {
    const results = [];
    const SYSTEM_ID = "aurore";

    // Actor's embedded items (equip directly)
    for (const item of this.document.items.filter(i => i.type === type)) {
      results.push({
        name:    item.name,
        uuid:    null,
        id:      item.id,
        img:     item.img ?? "",
        trinity: item.system?.trinity ?? "",
        source:  "actor",
        stats:   AuroreCharacterSheet._equipItemStats(item.system, type)
      });
    }

    // World items (not embedded)
    for (const item of game.items.filter(i => i.type === type)) {
      results.push({
        name:    item.name,
        uuid:    item.uuid,
        id:      null,
        img:     item.img ?? "",
        trinity: item.system?.trinity ?? "",
        source:  "world",
        stats:   AuroreCharacterSheet._equipItemStats(item.system, type)
      });
    }

    // System compendium pack
    const pack = game.packs.get(`${SYSTEM_ID}.${type}s`);
    if (pack) {
      const fieldMap = {
        weapon:  ["system.trinity", "system.damage"],
        armor:   ["system.trinity", "system.ppBonus"],
        gadget:  ["system.trinity", "system.maxUses"]
      };
      const index = await pack.getIndex({ fields: fieldMap[type] ?? [] });
      for (const entry of index) {
        results.push({
          name:    entry.name,
          uuid:    `Compendium.${pack.collection}.${entry._id}`,
          id:      null,
          img:     entry.img ?? "",
          trinity: entry.system?.trinity ?? "",
          source:  "compendium",
          stats:   AuroreCharacterSheet._equipItemStats(entry.system, type)
        });
      }
    }

    return results;
  }

  /**
   * Build a short stat summary string for an equipment item.
   * @param {object} system
   * @param {"weapon"|"armor"|"gadget"} type
   */
  static _equipItemStats(system, type) {
    if (type === "weapon") return `${system?.damage ?? "?"} dmg · ${system?.trinity ?? ""}`;
    if (type === "armor")  return `+${system?.ppBonus ?? "?"} PP · ${system?.trinity ?? ""}`;
    if (type === "gadget") return `${system?.maxUses ?? "?"} charges · ${system?.trinity ?? ""}`;
    return "";
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
