#!/usr/bin/env node
/**
 * Build equipment data (weapons, armor, adventuring gear, tools...) from 5etools-cn.
 *
 *   node scripts/build-items.js
 *
 * Writes:
 *   data/srd/items.json    SRD 5.2 items only (srd52)              -> safe to commit / ship
 *   data/local/items.json  every 2024 PHB (XPHB) mundane item, plus the SRD 5.2 subset of the
 *                          2024 DMG magic items                    -> git-ignored, personal use only
 *
 * Sources: data/items-base.json (baseitem: weapons, armor, tools, ammunition, foci) and
 * data/items.json (item: gear, packs, mounts, vehicles, magic items). XPHB, plus the XDMG magic
 * items flagged srd52 (potions, scrolls, rings, wands, wondrous items, specific magic weapons and
 * armor). Non-SRD XDMG items and generic variants ("+1 Weapon", "Adamantine Armor", from
 * magicvariants.json) are not built.
 *
 * Weapons and armor carry `roll20Modifiers`, the Roll20 compendium "itemmodifiers" string
 * ("Item Type: Melee Weapon, Damage: 1d8, Damage Type: Slashing, Alternate Damage: 1d10, ...")
 * in English, because the sheet's workers parse those English keys to build attacks and AC.
 */

const { renderEntries, stripTags, DAMAGE_TYPES_ZH, loc, fetchPair, zhIndex, zhLookup, write, writeSplit, runMain } =
  require("./lib/5etools");

const SOURCE = "XPHB";
const DMG_SOURCE = "XDMG"; // magic items: srd52 entries only
/** Item type tables: XPHB first, then XDMG for the magic-only types (Ring, Rod, Wand). */
const TYPE_SOURCES = [SOURCE, DMG_SOURCE];

const DAMAGE_CODES = {
  A: "acid", B: "bludgeoning", C: "cold", F: "fire", O: "force", L: "lightning", N: "necrotic",
  P: "piercing", I: "poison", Y: "psychic", R: "radiant", S: "slashing", T: "thunder",
};

// The Chinese data translates Light as "光线" (light as in illumination); use the rules terms.
const PROPERTIES = {
  A: { key: "ammunition", en: "Ammunition", zh: "弹药" },
  F: { key: "finesse", en: "Finesse", zh: "灵巧" },
  H: { key: "heavy", en: "Heavy", zh: "重型" },
  L: { key: "light", en: "Light", zh: "轻型" },
  LD: { key: "loading", en: "Loading", zh: "装填" },
  R: { key: "reach", en: "Reach", zh: "触及" },
  T: { key: "thrown", en: "Thrown", zh: "投掷" },
  "2H": { key: "twoHanded", en: "Two-Handed", zh: "双手" },
  V: { key: "versatile", en: "Versatile", zh: "多用" },
};

const PROPERTY_NOTES_ZH = { "unless mounted": "骑乘时除外" };

/** Item kind used by the filler: which Roll20 sections an item can go to. */
const KIND_BY_TYPE = {
  M: "weapon", R: "weapon",
  LA: "armor", MA: "armor", HA: "armor", S: "shield",
  A: "ammunition",
  AT: "tool", T: "tool", INS: "tool", GS: "tool",
  SCF: "focus",
  G: "gear", FD: "gear", TAH: "gear",
  P: "potion", SC: "scroll", RG: "ring", WD: "wand", RD: "rod",
  MNT: "mount",
  VEH: "vehicle", SHP: "vehicle", AIR: "vehicle",
};

const typeCode = (t) => (t || "").split("|")[0];

/**
 * Picker category (`category`): weapon / armor / ammo / tool / consumable / magic / gear / other.
 * Magic weapons and armor stay weapon / armor; `magic` (non-null) marks every magic item.
 */
const CATEGORY_BY_KIND = {
  weapon: "weapon", armor: "armor", shield: "armor", ammunition: "ammo", tool: "tool",
  potion: "consumable", scroll: "consumable",
  ring: "magic", wand: "magic", rod: "magic", wondrous: "magic",
  gear: "gear", focus: "gear", mount: "other", vehicle: "other",
};

/** PHB gear that gets used up: category "consumable" (filled as a resource). */
const PHB_CONSUMABLES = new Set([
  "acid", "alchemist's fire", "antitoxin", "basic poison", "holy water", "oil", "rations",
  "healer's kit", "torch", "candle", "caltrops", "ball bearings",
]);

const RARITY = {
  common: { en: "Common", zh: "普通" },
  uncommon: { en: "Uncommon", zh: "非普通" },
  rare: { en: "Rare", zh: "珍稀" },
  "very rare": { en: "Very Rare", zh: "非常珍稀" },
  legendary: { en: "Legendary", zh: "传说" },
  artifact: { en: "Artifact", zh: "神器" },
};

/** Magic item info (rarity, attunement, charges); null for mundane items. */
function magicInfo(en, zh) {
  if (!en.rarity || en.rarity === "none") return null;
  const att = en.reqAttune;
  const zhAtt = typeof zh?.reqAttune === "string" ? zh.reqAttune : att;
  return {
    rarity: en.rarity,
    rarityName: RARITY[en.rarity] || loc(en.rarity, en.rarity),
    attunement: loc(
      att === true ? "Requires Attunement" : att ? `Requires Attunement ${att}` : "",
      att === true ? "需要同调" : att ? `需要同调（${zhAtt}）` : ""
    ),
    charges: en.charges ?? null,
  };
}

/** AC / save bonuses that only apply sometimes (vs ranged attacks, while planted): left out. */
const CONDITIONAL_BONUS = new Set(["arrow-catching shield", "rod of alertness"]);

const signed = (v) => (/^[+-]/.test(String(v)) ? String(v) : `+${v}`);
const ABILITY_WORDS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };

/**
 * Magic bonuses as Roll20 compendium modifiers, i.e. the strings the sheet workers parse:
 * create_attack_from_item (" Attacks ", " Damage "), update_ac ("AC +1"), saves ("Saving Throws
 * +1"), update_spell_info ("Spell Attack +1", "Spell DC +1"), update_attr ("Strength: 19").
 */
function bonusModifiers(en, ranged) {
  const mods = [];
  const conditional = CONDITIONAL_BONUS.has(en.name.toLowerCase());
  // Attack/damage bonuses only on things that attack (the sheet reads them from the item's own
  // attack); e.g. Bracers of Archery's bow bonus can't be expressed here.
  if (en.dmg1) {
    const kind = ranged ? "Ranged" : "Melee";
    const atk = en.bonusWeaponAttack || en.bonusWeapon;
    const dmg = en.bonusWeaponDamage || en.bonusWeapon;
    if (atk) mods.push(`${kind} Attacks ${signed(atk)}`);
    if (dmg) mods.push(`${kind} Damage ${signed(dmg)}`);
  }
  if (en.bonusAc && !conditional) mods.push(`AC ${signed(en.bonusAc)}`);
  if (en.bonusSavingThrow && !conditional) mods.push(`Saving Throws ${signed(en.bonusSavingThrow)}`);
  if (en.bonusAbilityCheck) mods.push(`Ability Checks ${signed(en.bonusAbilityCheck)}`);
  if (en.bonusSpellAttack) mods.push(`Spell Attack ${signed(en.bonusSpellAttack)}`);
  if (en.bonusSpellSaveDc) mods.push(`Spell DC ${signed(en.bonusSpellSaveDc)}`);
  for (const [k, v] of Object.entries(en.ability?.static || {})) {
    if (ABILITY_WORDS[k]) mods.push(`${ABILITY_WORDS[k]}: ${v}`);
  }
  return mods;
}

function formatCost(cp) {
  if (cp == null) return { cp: null, en: "", zh: "" };
  if (cp % 100 === 0) return { cp, en: `${cp / 100} GP`, zh: `${cp / 100} 金币` };
  if (cp % 10 === 0) return { cp, en: `${cp / 10} SP`, zh: `${cp / 10} 银币` };
  return { cp, en: `${cp} CP`, zh: `${cp} 铜币` };
}

function parseRange(r) {
  if (!r) return null;
  const [normal, long] = String(r).split("/").map(Number);
  return { normal, long: long || null };
}

/** Lookup tables from items-base.json: item types, weapon properties, weapon masteries. */
function buildLookups(en, zh) {
  const types = {};
  const zhTypes = new Map((zh.itemType || []).map((t) => [`${t.abbreviation}|${t.source}`, t]));
  for (const src of TYPE_SOURCES) {
    for (const t of en.itemType || []) {
      if (t.source !== src || types[t.abbreviation]) continue;
      const z = zhTypes.get(`${t.abbreviation}|${t.source}`);
      types[t.abbreviation] = loc(t.name, z?.name);
    }
  }

  // Weapon properties and masteries go to their own dictionary (item-properties.json); items
  // only reference them by key.
  const glossary = [];
  const zhProps = new Map((zh.itemProperty || []).map((p) => [`${p.abbreviation}|${p.source}`, p]));
  for (const p of en.itemProperty || []) {
    if (p.source !== SOURCE || !PROPERTIES[p.abbreviation]) continue;
    const z = zhProps.get(`${p.abbreviation}|${p.source}`);
    const def = PROPERTIES[p.abbreviation];
    // entries = [{ name: "Finesse", entries: [...] }]: keep only the body text
    const body = (x) => renderEntries((x?.entries || []).flatMap((e) => e.entries || [e]));
    glossary.push({
      id: `property:${def.key}`,
      type: "property",
      key: def.key,
      // 5etools doesn't flag these srd52, but the weapon properties are in SRD 5.2 ("Weapons" >
      // "Properties", same rules as PHB 2024; 5etools marks them basicRules2024), so they ship.
      srd52: Boolean(p.srd52 || p.basicRules2024),
      source: p.source,
      page: p.page,
      name: loc(def.en, def.zh),
      description: loc(body(p), body(z || p)),
    });
  }

  const masteries = {};
  const zhMast = zhIndex(zh.itemMastery);
  for (const m of en.itemMastery || []) {
    if (m.source !== SOURCE) continue;
    const z = zhLookup(zhMast, m);
    const key = m.name.toLowerCase();
    masteries[m.name] = { key, srd52: Boolean(m.srd52) };
    glossary.push({
      id: `mastery:${key}`,
      type: "mastery",
      key,
      srd52: Boolean(m.srd52),
      source: m.source,
      page: m.page,
      name: loc(m.name, z?.name),
      description: loc(renderEntries(m.entries), renderEntries((z || m).entries)),
    });
  }
  return { types, masteries, glossary };
}

/** [{ key, note }]: the name and rules text come from item-properties.json (`property:<key>`). */
function weaponProperties(item) {
  return (item.property || []).map((p) => {
    const uid = typeof p === "string" ? p : p.uid;
    const note = typeof p === "string" ? "" : p.note || "";
    const code = typeCode(uid);
    return { key: (PROPERTIES[code] || { key: code }).key, code, note: loc(note, PROPERTY_NOTES_ZH[note] || note) };
  });
}

/** "Finesse, Light, Thrown" (English, matched by the sheet: /finesse/i picks STR or DEX). */
const roll20Properties = (props) =>
  props.map((p) => {
    const en = PROPERTIES[p.code]?.en || p.key;
    return p.note.en ? `${en} (${p.note.en})` : en;
  }).join(", ");

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function weaponFields(item, lk) {
  const code = typeCode(item.type);
  const props = weaponProperties(item);
  const has = (k) => props.some((p) => p.key === k);
  const dmgType = DAMAGE_CODES[item.dmgType] || "";
  const range = parseRange(item.range);
  const ranged = code === "R";
  const mastery = (item.mastery || []).map((m) => lk.masteries[typeCode(m.uid || m)]).filter(Boolean)[0] || null;

  const typeEn = lk.types[code]?.en || (ranged ? "Ranged Weapon" : "Melee Weapon");
  const mods = [`Item Type: ${typeEn}`];
  if (item.dmg1) mods.push(`Damage: ${item.dmg1}`);
  if (dmgType) mods.push(`Damage Type: ${cap(dmgType)}`);
  if (item.dmg2) mods.push(`Alternate Damage: ${item.dmg2}`, `Alternate Damage Type: ${cap(dmgType)}`);
  if (item.range) mods.push(`Range: ${item.range}`);
  mods.push(...bonusModifiers(item, ranged));

  return {
    weapon: {
      category: item.weaponCategory || "",
      melee: !ranged,
      ranged,
      damage: item.dmg1 || "",
      damageType: loc(dmgType, DAMAGE_TYPES_ZH[dmgType] || dmgType),
      versatileDamage: item.dmg2 || "",
      range, // normal/long in feet: thrown or ranged weapons only
      reach: has("reach"),
      properties: props.map(({ key, note }) => ({ key, note })),
      mastery: mastery?.key || null, // -> item-properties.json `mastery:<key>`
      firearm: Boolean(item.firearm),
      ammoType: item.ammoType ? item.ammoType.split("|")[0] : "",
      // Attack/damage ability: finesse -> STR or DEX (higher); ranged -> DEX; else STR.
      // Roll20 atkattr_base / dmgattr: "@{strength_mod}" / "@{dexterity_mod}".
      ability: has("finesse") ? "str-or-dex" : ranged ? "dex" : "str",
    },
    roll20Properties: roll20Properties(props),
    roll20Modifiers: mods.join(", "),
  };
}

function armorFields(item, lk) {
  const code = typeCode(item.type);
  const shield = code === "S";
  const typeEn = lk.types[code]?.en || "";
  return {
    armor: {
      category: { LA: "light", MA: "medium", HA: "heavy", S: "shield" }[code],
      ac: item.ac,
      // Dex bonus: light = full, medium = max 2, heavy = none; shield adds to AC.
      dexMax: { LA: null, MA: 2, HA: 0, S: null }[code],
      strength: item.strength ? Number(item.strength) : null,
      stealthDisadvantage: Boolean(item.stealth),
    },
    roll20Properties: item.stealth ? "Stealth Disadvantage" : "",
    roll20Modifiers: [shield ? `Item Type: Shield, AC: ${item.ac}` : `Item Type: ${typeEn}, AC: ${item.ac}`,
      ...bonusModifiers(item, false)].join(", "),
  };
}

function buildItem(en, zh, lk) {
  const code = typeCode(en.type);
  const kind = KIND_BY_TYPE[code] || (en.wondrous || en.staff ? "wondrous" : "other");
  const magic = magicInfo(en, zh);
  const category = kind === "gear" && PHB_CONSUMABLES.has(en.name.toLowerCase())
    ? "consumable"
    : CATEGORY_BY_KIND[kind] || (magic ? "magic" : "other");
  const typeName = lk.types[code] || (kind === "wondrous" ? loc("Wondrous Item", "奇物") : loc(code, code));
  const record = {
    id: `${en.name}|${en.source}`.toLowerCase(),
    source: en.source,
    page: en.page,
    srd52: Boolean(en.srd52),
    kind,
    category,
    type: { code, ...typeName },
    name: loc(en.name, zh?.name),
    magic,
    // Picker sub-filters: a staff, or usable as a spellcasting focus.
    staff: Boolean(en.staff) || /quarterstaff/i.test(en.name),
    focus: kind === "focus" || Boolean(en.focus),
    weight: en.weight ?? null, // pounds (Roll20 itemweight)
    cost: formatCost(en.value),
    roll20Properties: "",
    roll20Modifiers: "",
  };
  if (en.weapon || kind === "weapon") Object.assign(record, weaponFields(en, lk));
  if (kind === "armor" || kind === "shield") Object.assign(record, armorFields(en, lk));
  if (kind === "ammunition") record.roll20Modifiers = "Item Type: Ammunition";
  // Other magic items (potions, rings, wands, wondrous...): item type plus bonuses (AC +1, ...).
  if (magic && !record.roll20Modifiers) {
    record.roll20Modifiers = [`Item Type: ${typeName.en}`, ...bonusModifiers(en, false)].join(", ");
  }
  if (en.packContents) {
    record.contents = en.packContents.map((c) =>
      typeof c === "string"
        ? { id: c.toLowerCase(), quantity: 1 }
        : { id: (c.item || c.special || "").toLowerCase(), quantity: c.quantity || 1 }
    );
  }
  record.description = loc(renderEntries(en.entries || []), renderEntries((zh || en).entries || []));
  record.translator = zh?.translator || "";
  return record;
}

/** SRD build: drop references to text without an srd52 flag (non-SRD masteries). */
const srdSafe = (srdMasteries) => (item) => {
  if (!item.weapon?.mastery || srdMasteries.has(item.weapon.mastery)) return item;
  return { ...item, weapon: { ...item.weapon, mastery: null } };
};

async function main() {
  const [base, items] = await Promise.all([fetchPair("items-base.json"), fetchPair("items.json")]);
  const lk = buildLookups(base.en, base.zh);
  const zhBase = zhIndex(base.zh.baseitem);
  const zhItems = zhIndex(items.zh.item);

  const out = [];
  // XPHB base items (no XDMG firearms/sci-fi), XPHB items, and XDMG magic items in the SRD.
  const wanted = [
    [base.en.baseitem, zhBase, (en) => en.source === SOURCE],
    [items.en.item, zhItems, (en) => en.source === SOURCE || (en.source === DMG_SOURCE && en.srd52)],
  ];
  for (const [list, zhMap, keep] of wanted) {
    for (const en of list) {
      if (!keep(en)) continue;
      const zh = zhLookup(zhMap, en);
      if (!zh) console.warn(`no Chinese entry for ${en.name}`);
      out.push(buildItem(en, zh, lk));
    }
  }
  const order = ["weapon", "armor", "shield", "ammunition", "focus", "tool", "gear", "potion", "scroll",
    "ring", "rod", "wand", "wondrous", "mount", "vehicle", "other"];
  // Mundane items first, then magic items; each by kind, then name.
  out.sort((a, b) => Boolean(a.magic) - Boolean(b.magic) || order.indexOf(a.kind) - order.indexOf(b.kind) ||
    a.name.en.localeCompare(b.name.en));

  // Report what was left out, for reference when widening the scope.
  const xdmg = items.en.item.filter((i) => i.source === DMG_SOURCE);
  console.log(`XDMG items: ${xdmg.filter((i) => i.srd52).length} srd52 built, ${xdmg.filter((i) => !i.srd52).length} non-SRD skipped`);

  const srdMasteries = new Set(lk.glossary.filter((g) => g.type === "mastery" && g.srd52).map((g) => g.key));
  writeSplit("items.json", out, "items", srdSafe(srdMasteries));

  // Property / mastery dictionary. The SRD copy keeps every property name (the picker needs them)
  // but no rules text without an srd52 flag, and only the SRD masteries.
  write("data/local/item-properties.json", lk.glossary, "properties/masteries");
  write("data/srd/item-properties.json", lk.glossary
    .filter((g) => g.type === "property" || g.srd52)
    .map((g) => (g.srd52 ? g : { ...g, description: loc("", "") })), "properties/masteries");
}

module.exports = { main };
runMain(module, main);
