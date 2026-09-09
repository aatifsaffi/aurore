import { SYSTEM_ID, RESOURCES, MENTAL_STATS, TALENTS, TRINITY, TOKEN_STAMP, TOKEN_DEFAULTS, AOE_SHAPES, POWER_CATEGORIES } from "./module/config.mjs";
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
import { highlightItemAoe, clearAllAoe, onTokenMoved, clearAoeForToken, clearAoeForActor } from "./module/canvas/grid-highlight.mjs";
import { DEFAULT_CRIT_SUCCESS_EFFECT, DEFAULT_CRIT_FAILURE_EFFECT } from "./module/helpers/critEffects.mjs";
import { stampToken } from "./module/helpers/token-stamp.mjs";
import { openTokenStampConfig } from "./module/apps/token-stamp-config.mjs";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing Aurore system`);


  // Store config on game object for global access
  CONFIG[SYSTEM_ID] = { RESOURCES, MENTAL_STATS, TALENTS, TRINITY, TOKEN_STAMP, TOKEN_DEFAULTS, AOE_SHAPES, POWER_CATEGORIES };

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

  // ── Token stamp ───────────────────────────────────────
  game.settings.register(SYSTEM_ID, "autoStampTokens", {
    name: "AURORE.Settings.AutoStampTokens",
    hint: "AURORE.Settings.AutoStampTokensHint",
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
});

Hooks.once("ready", () => {
  importAllPacks();
});

Hooks.on("canvasReady", clearAllAoe);

// Prototype-token defaults for new actors: show the nameplate (and, for owners,
// the resource bars) on hover. Tunables live in config's TOKEN_DEFAULTS.
Hooks.on("preCreateActor", (actor) => {
  if (!["character", "npc"].includes(actor.type)) return;
  const { displayName, displayBars } = CONFIG[SYSTEM_ID]?.TOKEN_DEFAULTS ?? {};
  const update = {};
  if (Number.isFinite(displayName)) update["prototypeToken.displayName"] = displayName;
  if (Number.isFinite(displayBars)) update["prototypeToken.displayBars"] = displayBars;
  if (Object.keys(update).length) actor.updateSource(update);
});

// When an NPC token is dropped on a scene, size it to an N×N block of cells
// from the actor's `system.size` (belt-and-suspenders over the synced
// prototype token, e.g. for actors whose prototype token drifted).
Hooks.on("preCreateToken", (tokenDoc, data) => {
  const actor = tokenDoc.actor;
  if (actor?.type !== "npc") return;
  const span = Math.max(1, Math.round(Number(actor.system?.size) || 1));
  if (data.width === span && data.height === span) return;
  tokenDoc.updateSource({ width: span, height: span });
});

// Rotate the token as it's created (not a post-create update, so no spin
// animation) to counter the baked-in illustration rotation.
Hooks.on("preCreateToken", (tokenDoc, data) => {
  if (!["character", "npc"].includes(tokenDoc.actor?.type)) return;
  const rot = CONFIG[SYSTEM_ID]?.TOKEN_STAMP?.tokenRotation;
  if (Number.isFinite(rot) && data.rotation !== rot) tokenDoc.updateSource({ rotation: rot });
});

// Drop any highlight anchored to a token/actor that no longer exists.
Hooks.on("deleteToken", tokenDoc => clearAoeForToken(tokenDoc.id));
Hooks.on("deleteActor", actor => clearAoeForActor(actor.id));

// ── Token stamp ──────────────────────────────────────────
// When a token is placed on a scene, generate its circular Trinity-ring image
// (once per actor; later drops are born stamped via the prototype token).
// Only the creating client does the work.
Hooks.on("createToken", (tokenDoc, _options, userId) => {
  if (userId === game.userId) stampToken(tokenDoc);
});

// Manual "regenerate token image" control on the token HUD.
Hooks.on("renderTokenHUD", (hud, html) => {
  if (!game.user.can("FILES_UPLOAD")) return;
  const tokenDoc = hud.object?.document;
  if (!["character", "npc"].includes(tokenDoc?.actor?.type)) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  const col = root?.querySelector(".col.left") ?? root?.querySelector(".col.right");
  if (!col || col.querySelector('[data-action="aurore-restamp"]')) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "control-icon";
  btn.dataset.action = "aurore-restamp";
  btn.title = game.i18n.localize("AURORE.TokenStamp.Regenerate");
  btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';
  btn.addEventListener("click", () => stampToken(tokenDoc, { force: true }));
  col.appendChild(btn);
});

// "Token framing" button in the Token / Prototype Token config footer.
Hooks.on("renderTokenConfig", (app, html) => {
  const actor = app.actor ?? app.document?.actor ?? app.token?.actor;
  if (!["character", "npc"].includes(actor?.type)) return;

  const root = html instanceof HTMLElement ? html : html?.[0];
  const footer = root?.querySelector("footer.form-footer") ?? root?.querySelector(".form-footer") ?? root?.querySelector("footer");
  if (!footer || footer.querySelector('[data-action="aurore-stamp-config"]')) return;

  const token = app.isPrototype ? null
    : (app.document?.documentName === "Token" ? app.document : (app.token ?? null));

  const btn = document.createElement("button");
  btn.type = "button";
  btn.dataset.action = "aurore-stamp-config";
  btn.innerHTML = `<i class="fa-solid fa-crop-simple"></i> ${game.i18n.localize("AURORE.TokenStamp.Configure")}`;
  btn.addEventListener("click", () => openTokenStampConfig({ actor, token }));
  footer.prepend(btn);
});

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
