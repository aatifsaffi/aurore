const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

export class AuroreNpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["aurore", "sheet", "actor", "npc"],
    position: { width: 600, height: 500 },
    window: { resizable: true },
    actions: {}
  };

  static PARTS = {
    sheet: { template: "systems/aurore/templates/actor/npc-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    context.system = actor.system;
    context.config = CONFIG.aurore;
    return context;
  }
}
