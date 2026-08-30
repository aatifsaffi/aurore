import { XP_COSTS } from "../config.mjs";

export class XPManager {

  /**
   * Get all available XP purchases for an actor.
   * @param {Actor} actor
   * @returns {Array<{id: string, label: string, cost: number, type: string, details: string, affordable: boolean}>}
   */
  static getAvailablePurchases(actor) {
    const purchases = [];
    const sys = actor.system;
    const xp  = sys.experiencePoints;

    const levelCost = XP_COSTS.levelUp(sys.niveau);
    purchases.push({
      id:         "level-up",
      label:      game.i18n.localize("AURORE.XP.LevelUp"),
      cost:       levelCost,
      type:       "levelUp",
      details:    `Niveau ${sys.niveau} → ${sys.niveau + 1}`,
      affordable: xp >= levelCost
    });

    purchases.push({
      id:         "pv-increase",
      label:      "+1 PV Max",
      cost:       XP_COSTS.pvIncrease,
      type:       "resource",
      details:    `PV max ${sys.resources.pv.max} → ${sys.resources.pv.max + 1}`,
      affordable: xp >= XP_COSTS.pvIncrease,
      resource:   "pv"
    });

    purchases.push({
      id:         "pp-increase",
      label:      "+1 PP Max",
      cost:       XP_COSTS.ppIncrease,
      type:       "resource",
      details:    `PP max ${sys.resources.pp.max} → ${sys.resources.pp.max + 1}`,
      affordable: xp >= XP_COSTS.ppIncrease,
      resource:   "pp"
    });

    purchases.push({
      id:         "pa-increase",
      label:      "+1 PA Max",
      cost:       XP_COSTS.paIncrease,
      type:       "resource",
      details:    `PA max ${sys.resources.pa.max} → ${sys.resources.pa.max + 1}`,
      affordable: xp >= XP_COSTS.paIncrease,
      resource:   "pa"
    });

    purchases.push({
      id:         "cm-increase",
      label:      "+1 CM",
      cost:       XP_COSTS.cmIncrease,
      type:       "mental",
      details:    `CM ${sys.mental.cm} → ${sys.mental.cm + 1}`,
      affordable: xp >= XP_COSTS.cmIncrease,
      stat:       "cm"
    });

    return purchases;
  }

  /**
   * Execute an XP purchase, deducting cost and applying the upgrade.
   * Posts a confirmation to chat on success.
   * @param {Actor}  actor
   * @param {string} purchaseId
   * @returns {Promise<boolean>}
   */
  static async executePurchase(actor, purchaseId) {
    const purchases = this.getAvailablePurchases(actor);
    const purchase  = purchases.find(p => p.id === purchaseId);

    if (!purchase || !purchase.affordable) {
      ui.notifications.warn("AURORE.XP.NotEnough", { localize: true });
      return false;
    }

    const updateData = {
      "system.experiencePoints": actor.system.experiencePoints - purchase.cost
    };

    switch (purchase.type) {
      case "levelUp":
        updateData["system.niveau"] = actor.system.niveau + 1;
        break;
      case "resource": {
        const resource = purchase.resource;
        updateData[`system.resources.${resource}.max`] = actor.system.resources[resource].max + 1;
        break;
      }
      case "mental": {
        const stat = purchase.stat;
        updateData[`system.mental.${stat}`] = actor.system.mental[stat] + 1;
        break;
      }
    }

    await actor.update(updateData);

    ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${actor.name}</strong> a dépensé <strong>${purchase.cost} XP</strong> : ${purchase.details}</p>`
    });

    return true;
  }
}
