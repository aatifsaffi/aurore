import { AOE_PATTERN_LEGEND } from "../config.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;
const { TextEditor } = foundry.applications.ux;

// Number of distinct cell states (off + one per AOE_PATTERN_LEGEND color) to cycle through.
const AOE_CELL_STATE_COUNT = Object.keys(AOE_PATTERN_LEGEND).length;

export class AuroreItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["aurore", "sheet", "item"],
    position: { width: 480, height: 500 },
    window: { resizable: true },
    form: {
      handler:        AuroreItemSheet._onSubmitDocument,
      submitOnChange: true,
      closeOnSubmit:  false
    },
    actions: {
      editPortrait: AuroreItemSheet._onEditPortrait
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/aurore/templates/item/item-sheet.hbs",
      scrollable: [""]
    }
  };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const item = this.document;

    // Expose the item document directly — base _prepareContext only provides `document`
    context.item     = item;
    context.system   = item.system;
    context.itemType = item.type;
    context.config   = CONFIG.aurore;

    // Pre-enriched description for the <prose-mirror> element (ApplicationV2 has no
    // {{editor}} button wiring — the custom element handles its own edit toggle).
    context.enrichedDescription = await TextEditor.enrichHTML(item.system.description ?? "", {
      secrets:    item.isOwner,
      relativeTo: item
    });

    context.trinityChoices = Object.fromEntries(
      Object.entries(CONFIG.aurore.TRINITY).map(([k, v]) => [k, game.i18n.localize(v.label)])
    );

    context.powerTypeChoices = {
      active:  game.i18n.localize("AURORE.Powers.typeActive"),
      passive: game.i18n.localize("AURORE.Powers.typePassive")
    };

    context.powerCategoryChoices = Object.fromEntries(
      Object.entries(CONFIG.aurore.POWER_CATEGORIES ?? {}).map(([k, v]) => [k, game.i18n.localize(v)])
    );

    context.talentChoices = Object.fromEntries(
      Object.entries(CONFIG.aurore.TALENTS).map(([k, v]) => [k, game.i18n.localize(v.label)])
    );

    if (["weapon", "armor", "gadget"].includes(item.type)) {
      context.aoeGrid = AuroreItemSheet._buildGridContext(item);
    }

    return context;
  }

  /**
   * Build the AoE grid context. Size = (2 × aoeSize + 1)².
   * Cell color values: 0=off, 1=red, 2=green, 3=blue, 4=yellow, 5=gray (movement).
   * @param {Item} item
   * @returns {{ size: number, cells: Array<Array<object>> }}
   */
  static _buildGridContext(item) {
    const radius = Math.max(0, item.system.aoeSize ?? 0);
    const size   = 2 * radius + 1;
    const center = radius;

    let pattern;
    try {
      pattern = JSON.parse(item.system.aoePattern || "[]");
    } catch {
      pattern = [];
    }
    const total = size * size;
    while (pattern.length < total) pattern.push(0);

    return {
      size,
      cells: Array.from({ length: size }, (_, row) =>
        Array.from({ length: size }, (_, col) => ({
          row,
          col,
          color:    pattern[row * size + col] ?? 0,
          isCenter: row === center && col === center
        }))
      )
    };
  }

  /** @override — wire up AoE grid cell clicks. */
  async _onRender(_context, _options) {
    this.element.querySelectorAll(".aoe-grid-cell:not(.is-center)").forEach(cell => {
      cell.addEventListener("click", ev => this._onGridCellClick(ev));
    });
  }

  /**
   * Cycle a cell through: off → red → green → blue → yellow → gray → off.
   * @param {PointerEvent} event
   */
  async _onGridCellClick(event) {
    const cell   = event.currentTarget;
    const row    = parseInt(cell.dataset.row);
    const col    = parseInt(cell.dataset.col);
    const item   = this.document;
    const radius = Math.max(0, item.system.aoeSize ?? 0);
    const size   = 2 * radius + 1;
    const total  = size * size;

    let pattern;
    try {
      pattern = JSON.parse(item.system.aoePattern || "[]");
    } catch {
      pattern = [];
    }
    while (pattern.length < total) pattern.push(0);

    const idx = row * size + col;
    pattern[idx] = (pattern[idx] + 1) % AOE_CELL_STATE_COUNT;

    // Optimistic visual update
    cell.dataset.color = pattern[idx];

    await item.update({ "system.aoePattern": JSON.stringify(pattern) });
  }

  /**
   * Persist form data; clear aoePattern when aoeSize changes.
   */
  static async _onSubmitDocument(_event, _form, formData) {
    const updateData = foundry.utils.expandObject(formData.object);
    if (updateData.system?.aoeSize !== undefined) {
      if (Number(updateData.system.aoeSize) !== this.document.system.aoeSize) {
        updateData.system.aoePattern = "";
      }
    }
    await this.document.update(updateData);
  }

  /**
   * Open the FilePicker to change the item image.
   * @param {PointerEvent} event
   */
  static async _onEditPortrait(event) {
    const fp = new FilePicker({
      type: "image",
      current: this.document.img,
      callback: async path => {
        await this.document.update({ img: path });
        this.render();
      }
    });
    fp.render(true);
  }
}
