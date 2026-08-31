import { highlightItemAoe } from "../canvas/grid-highlight.mjs";
import { classifyRoll, playCritEffect } from "../helpers/critEffects.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

/**
 * Shared base class for every Aurore actor sheet (character, npc).
 *
 * Provides the pieces both sheets need identically:
 *  - explicit form submission,
 *  - portrait editing,
 *  - embedded item CRUD,
 *  - the four equipment slots (weapon1 / weapon2 / armor / gadget) with a
 *    world + compendium picker dialog,
 *  - AoE grid highlight,
 *  - mental-stat d100 rolls,
 *  - drag & drop onto slots / inventory,
 *  - manual tab syncing.
 *
 * Subclasses declare their own `PARTS` (template) and `TABS` (nav order), and
 * extend `_prepareContext` for any type-specific data.
 */
export class AuroreActorSheetV2 extends HandlebarsApplicationMixin(ActorSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["aurore", "sheet", "actor"],
    tag: "form",
    window: { resizable: true },
    form: {
      handler: AuroreActorSheetV2._onSubmitDocument,
      submitOnChange: true,
      closeOnSubmit: false
    },
    dragDrop: [{ dragSelector: "li.item[data-item-id]", dropSelector: ".items-list, .drop-zone, .equip-slot" }],
    actions: {
      editPortrait:   AuroreActorSheetV2._onEditPortrait,
      createItem:     AuroreActorSheetV2._onCreateItem,
      editItem:       AuroreActorSheetV2._onEditItem,
      deleteItem:     AuroreActorSheetV2._onDeleteItem,
      equipItem:      AuroreActorSheetV2._onEquipItem,
      unequipSlot:    AuroreActorSheetV2._onUnequipSlot,
      selectSlotItem: AuroreActorSheetV2._onSelectSlotItem,
      showItemAoe:    AuroreActorSheetV2._onShowItemAoe,
      rollMentalStat: AuroreActorSheetV2._onRollMentalStat
    }
  };

  /** Tab ids in nav order. Subclasses override. @type {string[]} */
  static TABS = ["combat", "inventory", "powers", "biography"];

  /** Default active tab. @override */
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

    // Base _prepareContext only provides `document` — expose the rest.
    context.actor  = actor;
    context.system = system;
    context.config = CONFIG.aurore;

    // Pre-enriched biography for the <prose-mirror> element (ApplicationV2 has no
    // {{editor}} button wiring — the custom element handles its own edit toggle).
    context.enrichedBiography = await TextEditor.enrichHTML(system.biography ?? "", {
      secrets:    actor.isOwner,
      relativeTo: actor,
      rollData:   actor.getRollData?.() ?? {}
    });

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

    // Trinity dominant label (localized)
    const dominant = system.trinityDominant ?? "balanced";
    context.trinityDominant = dominant;
    context.trinityDominantLabel = dominant === "balanced"
      ? game.i18n.localize("AURORE.Trinity.balanced")
      : game.i18n.localize(`AURORE.Trinity.${dominant}`);

    // Tab state — HandlebarsApplicationMixin does not auto-sync active classes
    const tabs = this.constructor.TABS;
    const activeTab = this.tabGroups.primary ?? tabs[0];
    context.tabs = {
      primary: Object.fromEntries(
        tabs.map(id => [id, { cssClass: id === activeTab ? "active" : "" }])
      )
    };

    // Items by type — subclasses may add more (gifts, race, racial…)
    context.items = {
      weapons: actor.items.filter(i => i.type === "weapon"),
      armors:  actor.items.filter(i => i.type === "armor"),
      gadgets: actor.items.filter(i => i.type === "gadget"),
      powers:  actor.items.filter(i => i.type === "power")
    };

    return context;
  }

  // ── Render ────────────────────────────────────────────

  /** @override — wire up tab clicks and drop-zone dragover after every render. */
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

    // Ensure dragover reaches drop-zone containers even when the cursor is over a
    // child element. Foundry's DragDrop only binds on the container itself.
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
    const slotField = slot ? AuroreActorSheetV2.SLOT_FIELD[slot] : null;

    if (slotField) {
      const expectedType = AuroreActorSheetV2.SLOT_TYPE[slot];
      if (item.type !== expectedType) {
        return ui.notifications.warn(game.i18n.localize("AURORE.Equipment.droppedOnWrongSlot"));
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
   * Also syncs the prototype token and any placed tokens.
   * @param {PointerEvent} event
   */
  static async _onEditPortrait(_event) {
    const fp = new FilePicker({
      type: "image",
      current: this.document.img,
      callback: async path => {
        await this.document.update({
          img: path,
          "prototypeToken.texture.src": path
        });
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
    const slotField = AuroreActorSheetV2.SLOT_FIELD[slot];
    if (!slotField) return;
    await this.document.update({ [`system.${slotField}`]: itemId });
  }

  /**
   * Clear an equipment slot.
   * @param {PointerEvent} event
   * @param {HTMLElement}  target
   */
  static async _onUnequipSlot(_event, target) {
    const slot      = target.closest("[data-slot]").dataset.slot;
    const slotField = AuroreActorSheetV2.SLOT_FIELD[slot];
    if (!slotField) return;
    await this.document.update({ [`system.${slotField}`]: "" });
  }

  /**
   * Toggle the AoE grid highlight for an equipped item (weapon, armor or gadget).
   * @param {PointerEvent} _event
   * @param {HTMLElement}  target  Element carrying data-slot
   */
  static async _onShowItemAoe(_event, target) {
    const slot      = target.closest("[data-slot]").dataset.slot;
    const slotField = AuroreActorSheetV2.SLOT_FIELD[slot];
    if (!slotField) return;

    const item = this.document.items.get(this.document.system[slotField]);
    if (!item) return;

    const token = this.document.getActiveTokens()[0];
    if (!token) return ui.notifications.warn(game.i18n.localize("AURORE.Aoe.noToken"));

    highlightItemAoe(token, item);
  }

  // ── Mental Stat Rolls ──────────────────────────────────

  /**
   * Roll 1d100 against a mental stat and post the result to chat.
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
    const slot = target.dataset.slot;
    const type = AuroreActorSheetV2.SLOT_TYPE[slot];
    if (!type) return;

    const dialogId = `aurore-slot-${this.document.id}-${slot}`;
    const existing = foundry.applications.instances.get(dialogId);
    if (existing) { existing.bringToTop(); return; }

    const items = await AuroreActorSheetV2._collectEquipmentItems.call(this, type);
    if (!items.length) {
      const key = `AURORE.Equipment.no${type.charAt(0).toUpperCase() + type.slice(1)}sFound`;
      return ui.notifications.warn(game.i18n.localize(key));
    }

    const titleKey     = `AURORE.Equipment.select${type.charAt(0).toUpperCase() + type.slice(1)}`;
    const currentField = AuroreActorSheetV2.SLOT_FIELD[slot];
    const currentId    = this.document.system[currentField];

    const esc = s => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

    // Build <optgroup> sections
    const groups = [
      { label: game.i18n.localize("AURORE.Equipment.groupInventory"),  source: "actor" },
      { label: game.i18n.localize("AURORE.Equipment.groupWorld"),      source: "world" },
      { label: game.i18n.localize("AURORE.Equipment.groupCompendium"), source: "compendium" }
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
      itemId = key.slice(6);
    } else {
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
   * Collect items of a given equipment type from actor inventory, world items,
   * and the matching system compendium.
   * @param {"weapon"|"armor"|"gadget"} type
   * @returns {Promise<Array>}
   */
  static async _collectEquipmentItems(type) {
    const results = [];
    const SYSTEM_ID = "aurore";

    for (const item of this.document.items.filter(i => i.type === type)) {
      results.push({
        name:    item.name,
        uuid:    null,
        id:      item.id,
        img:     item.img ?? "",
        trinity: item.system?.trinity ?? "",
        source:  "actor",
        stats:   AuroreActorSheetV2._equipItemStats(item.system, type)
      });
    }

    for (const item of game.items.filter(i => i.type === type)) {
      results.push({
        name:    item.name,
        uuid:    item.uuid,
        id:      null,
        img:     item.img ?? "",
        trinity: item.system?.trinity ?? "",
        source:  "world",
        stats:   AuroreActorSheetV2._equipItemStats(item.system, type)
      });
    }

    const pack = game.packs.get(`${SYSTEM_ID}.${type}s`);
    if (pack) {
      const fieldMap = {
        weapon: ["system.trinity", "system.damage"],
        armor:  ["system.trinity", "system.ppBonus"],
        gadget: ["system.trinity", "system.maxUses"]
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
          stats:   AuroreActorSheetV2._equipItemStats(entry.system, type)
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
}
