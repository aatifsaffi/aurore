import { AuroreActorSheetV2 } from "./actor-sheet.mjs";
import { highlightItemAoe } from "../canvas/grid-highlight.mjs";

/**
 * NPC sheet. Shares the character sheet's architecture (header + tabs +
 * equipment slots + inventory + powers) via {@link AuroreActorSheetV2}, minus
 * the character-only concepts: talents, race/racial, gifts, gold and XP.
 *
 * NPC-specific: `kind === "monster"` swaps the four compendium equipment slots
 * for the inline `system.equipment` list, and every NPC gets a `passif` block.
 */
export class AuroreNpcSheet extends AuroreActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 680, height: 620 },
    actions: {
      showEquipmentAoe: AuroreNpcSheet._onShowEquipmentAoe
    }
  };

  /** @override */
  static PARTS = {
    sheet: {
      template: "systems/aurore/templates/actor/npc-sheet.hbs",
      scrollable: [".tab-body"]
    }
  };

  /** @override */
  static TABS = ["combat", "inventory", "powers", "biography"];

  /** @override */
  static tabGroups = { primary: "combat" };

  /** @override */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system  = this.document.system;

    context.isMonster = system.kind === "monster";

    // Decorate inline monster equipment for the template. `index` is the array
    // position — the AoE action resolves the entry back through it.
    context.monsterEquipment = (system.equipment ?? []).map((entry, index) => {
      const pattern = entry.aoePattern ?? "";
      return {
        index,
        name:        entry.name,
        description: entry.description ?? "",
        img:         entry.img ?? "",
        category:    entry.category ?? "attack",
        isBoreale:   entry.category === "boreale",
        trinity:     entry.trinity ?? "",
        damage:      entry.damage ?? 0,
        range:       entry.range ?? 1,
        aoeSize:     entry.aoeSize ?? 0,
        hasAoe:      !!pattern && pattern !== "[]" && pattern !== "[0]"
      };
    });

    return context;
  }

  /**
   * Toggle the AoE grid highlight for one inline monster equipment entry.
   * Builds a minimal item-shaped object so {@link highlightItemAoe} can consume
   * it exactly like an equipped weapon.
   * @param {PointerEvent} _event
   * @param {HTMLElement}  target  Element carrying data-equip-index
   */
  static async _onShowEquipmentAoe(_event, target) {
    const index = Number(target.closest("[data-equip-index]")?.dataset.equipIndex);
    const entry = this.document.system.equipment?.[index];
    if (!entry) return;

    const token = this.document.getActiveTokens()[0];
    if (!token) return ui.notifications.warn(game.i18n.localize("AURORE.Aoe.noToken"));

    highlightItemAoe(token, {
      id:     `${this.document.id}-equip-${index}`,
      parent: { id: this.document.id },
      system: {
        aoeSize:        entry.aoeSize ?? 0,
        aoePattern:     entry.aoePattern ?? "",
        range:          entry.range ?? 1,
        highlightColor: "#ff000044"
      }
    });
  }
}
