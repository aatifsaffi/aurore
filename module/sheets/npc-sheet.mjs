import { AuroreActorSheetV2 } from "./actor-sheet.mjs";

/**
 * NPC sheet. Shares the character sheet's architecture (header + tabs +
 * equipment slots + inventory + powers) via {@link AuroreActorSheetV2}, minus
 * the character-only concepts: talents, race/racial, gifts, gold and XP.
 */
export class AuroreNpcSheet extends AuroreActorSheetV2 {

  /** @override */
  static DEFAULT_OPTIONS = {
    classes: ["npc"],
    position: { width: 680, height: 620 }
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
}
