export class AuroreActor extends Actor {
  /** @override */
  prepareDerivedData() {
    super.prepareDerivedData();
  }

  /**
   * Normalise an NPC `size` into a positive integer number of cells per axis.
   * @param {number} value
   * @returns {number}
   */
  static _npcCellSpan(value) {
    return Math.max(1, Math.round(Number(value) || 1));
  }

  /**
   * Seed the prototype token footprint from `system.size` so every token
   * dropped on the canvas afterwards inherits an N×N block of cells.
   * @override
   */
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;

    if (this.type === "npc") {
      const span = AuroreActor._npcCellSpan(this.system?.size);
      this.updateSource({ "prototypeToken.width": span, "prototypeToken.height": span });
    }
  }

  /**
   * When an NPC's `system.size` changes, resize the prototype token in the same
   * update and flag the change so already-placed tokens get resized too.
   * @override
   */
  async _preUpdate(changed, options, user) {
    const allowed = await super._preUpdate(changed, options, user);
    if (allowed === false) return false;

    const newSize = foundry.utils.getProperty(changed, "system.size");
    if (this.type === "npc" && newSize !== undefined) {
      const span = AuroreActor._npcCellSpan(newSize);
      foundry.utils.setProperty(changed, "prototypeToken.width", span);
      foundry.utils.setProperty(changed, "prototypeToken.height", span);
      options.auroreCellSpan = span;
    }
  }

  /** @override */
  _onUpdate(changed, options, userId) {
    super._onUpdate(changed, options, userId);

    if (!options.auroreCellSpan || game.user.id !== userId) return;
    const span = options.auroreCellSpan;

    // Batch a Token update per scene that holds a token for this actor.
    const bySceneId = new Map();
    for (const tokenDoc of this.getActiveTokens(false, true)) {
      if (!tokenDoc.parent) continue;
      const list = bySceneId.get(tokenDoc.parent.id) ?? [];
      list.push({ _id: tokenDoc.id, width: span, height: span });
      bySceneId.set(tokenDoc.parent.id, list);
    }
    for (const [sceneId, updates] of bySceneId) {
      game.scenes.get(sceneId)?.updateEmbeddedDocuments("Token", updates);
    }
  }
}
