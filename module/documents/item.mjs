export class AuroreItem extends Item {
  /** Free-form extras get a bag icon instead of Foundry's generic one. @override */
  async _preCreate(data, options, user) {
    if (this.type === "extra" && !data.img) {
      this.updateSource({ img: "systems/aurore/assets/icons/knapsack.svg" });
    }
    return super._preCreate(data, options, user);
  }
}
