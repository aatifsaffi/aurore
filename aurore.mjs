import { SYSTEM_ID, RESOURCES, MENTAL_STATS, TALENTS, TRINITY, AOE_SHAPES, POWER_CATEGORIES } from "./module/config.mjs";
import { CharacterData } from "./module/data-models/character.mjs";
import { NpcData } from "./module/data-models/npc.mjs";
import { WeaponData } from "./module/data-models/weapon.mjs";
import { ArmorData } from "./module/data-models/armor.mjs";
import { GadgetData } from "./module/data-models/gadget.mjs";
import { PowerData } from "./module/data-models/power.mjs";
import { RaceData } from "./module/data-models/race.mjs";
import { RacialData } from "./module/data-models/racial.mjs";
import { GiftData } from "./module/data-models/gift.mjs";
import { AuroreActor } from "./module/documents/actor.mjs";
import { AuroreItem } from "./module/documents/item.mjs";
import { AuroreCharacterSheet } from "./module/sheets/character-sheet.mjs";
import { AuroreNpcSheet } from "./module/sheets/npc-sheet.mjs";
import { AuroreItemSheet } from "./module/sheets/item-sheet.mjs";
import { importAllPacks } from "./module/helpers/compendium-import.mjs";
import { highlightItemAoe, clearAllAoe, onTokenMoved } from "./module/canvas/grid-highlight.mjs";
import { DEFAULT_CRIT_SUCCESS_EFFECT, DEFAULT_CRIT_FAILURE_EFFECT } from "./module/helpers/critEffects.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing Aurore system`);


  // Store config on game object for global access
  CONFIG[SYSTEM_ID] = { RESOURCES, MENTAL_STATS, TALENTS, TRINITY, AOE_SHAPES, POWER_CATEGORIES };

  // ── Handlebars helpers ────────────────────────────────
  Handlebars.registerHelper("or", (...args) => { args.pop(); return args.some(Boolean); });
  Handlebars.registerHelper("and", (...args) => { args.pop(); return args.every(Boolean); });
  Handlebars.registerHelper("concat", (...args) => { args.pop(); return args.join(""); });

  // Register custom document classes
  CONFIG.Actor.documentClass = AuroreActor;
  CONFIG.Item.documentClass = AuroreItem;

  // Register data models — Actors
  CONFIG.Actor.dataModels.character = CharacterData;
  CONFIG.Actor.dataModels.npc = NpcData;

  // Register data models — Items
  CONFIG.Item.dataModels.weapon = WeaponData;
  CONFIG.Item.dataModels.armor = ArmorData;
  CONFIG.Item.dataModels.gadget = GadgetData;
  CONFIG.Item.dataModels.power = PowerData;
  CONFIG.Item.dataModels.race = RaceData;
  CONFIG.Item.dataModels.racial = RacialData;
  CONFIG.Item.dataModels.gift = GiftData;

  // Register sheets — use fully-qualified namespace (v13+)
  const { Actors: ActorsColl, Items: ItemsColl } = foundry.documents.collections;

  ActorsColl.unregisterSheet("core", foundry.appv1.sheets.ActorSheet);
  ActorsColl.registerSheet(SYSTEM_ID, AuroreCharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "AURORE.Sheets.Character"
  });
  ActorsColl.registerSheet(SYSTEM_ID, AuroreNpcSheet, {
    types: ["npc"],
    makeDefault: true,
    label: "AURORE.Sheets.Npc"
  });

  ItemsColl.unregisterSheet("core", foundry.appv1.sheets.ItemSheet);
  ItemsColl.registerSheet(SYSTEM_ID, AuroreItemSheet, {
    types: ["weapon", "armor", "gadget", "power", "race", "racial", "gift"],
    makeDefault: true,
    label: "AURORE.Sheets.Item"
  });

  // Token resource bars
  CONFIG.Actor.trackableAttributes = {
    character: {
      bar: ["resources.pv", "resources.pp"],
      value: ["resources.pa.value", "mental.cm", "experiencePoints"]
    },
    npc: {
      bar: ["resources.pv", "resources.pp"],
      value: ["resources.pa.value", "mental.cm"]
    }
  };

  // ── Crit animation settings ────────────────────────────
  game.settings.register(SYSTEM_ID, "critAnimationsEnabled", {
    name: "AURORE.Settings.CritAnimationsEnabled",
    hint: "AURORE.Settings.CritAnimationsEnabledHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });

  game.settings.register(SYSTEM_ID, "critSuccessEffect", {
    name: "AURORE.Settings.CritSuccessEffect",
    hint: "AURORE.Settings.CritSuccessEffectHint",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_CRIT_SUCCESS_EFFECT
  });

  game.settings.register(SYSTEM_ID, "critFailureEffect", {
    name: "AURORE.Settings.CritFailureEffect",
    hint: "AURORE.Settings.CritFailureEffectHint",
    scope: "world",
    config: true,
    type: String,
    default: DEFAULT_CRIT_FAILURE_EFFECT
  });
});

Hooks.once("ready", () => {
  importAllPacks();
});

Hooks.on("canvasReady", clearAllAoe);

Hooks.on("updateToken", (tokenDoc, changes) => {
  if (changes.x !== undefined || changes.y !== undefined || changes.rotation !== undefined) {
    onTokenMoved({
      ...tokenDoc,
      id: tokenDoc.id,
      x: changes.x ?? tokenDoc.x,
      y: changes.y ?? tokenDoc.y,
      rotation: changes.rotation ?? tokenDoc.rotation,
    });
  }
});

Hooks.on("renderChatMessageHTML", (_msg, html) => {
  for (const btn of html.querySelectorAll(".aoe-show-btn")) {
    btn.addEventListener("click", async () => {
      const { actorId, weaponId, tokenId } = btn.dataset;
      const actor = game.actors.get(actorId);
      const weapon = actor?.items.get(weaponId);
      const token = canvas.tokens.get(tokenId) ?? actor?.getActiveTokens()[0];

      if (!weapon || !token) return ui.notifications.warn(game.i18n.localize("AURORE.Aoe.noToken"));
      highlightItemAoe(token, weapon);
    });
  }
});

Hooks.once("ready", async () => {
  if (game.user.isGM && game.settings.get("core", "tokenAutoRotate") !== false) {
    await game.settings.set("core", "tokenAutoRotate", false);
  }
});
