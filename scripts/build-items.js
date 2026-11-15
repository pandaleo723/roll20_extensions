#!/usr/bin/env node
/**
 * Build equipment data (weapons, armor, adventuring gear, tools...) from 5etools-cn.
 *
 *   node scripts/build-items.js
 *
 * Writes:
 *   data/srd/items.json    SRD 5.2 items only (srd52)              -> safe to commit / ship
 *   data/local/items.json  every 2024 PHB (XPHB) mundane item      -> git-ignored, personal use only
 *
 * Sources: data/items-base.json (baseitem: weapons, armor, tools, ammunition, foci) and
 * data/items.json (item: gear, packs, mounts, vehicles...), XPHB only. Magic items (XDMG) are
 * deliberately left out (2024 DMG, outside "PHB only").
 *
 * Weapons and armor carry `roll20Modifiers`, the Roll20 compendium "itemmodifiers" string
 * ("Item Type: Melee Weapon, Damage: 1d8, Damage Type: Slashing, Alternate Damage: 1d10, ...")
 * in English, because the sheet's workers parse those English keys to build attacks and AC.
 */

const { renderEntries, stripTags, DAMAGE_TYPES_ZH, loc, fetchPair, zhIndex, zhLookup, writeSplit, runMain } =
  require("./lib/5etools");

const SOURCE = "XPHB";

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
  MNT: "mount",
  VEH: "vehicle", SHP: "vehicle", AIR: "vehicle",
};

const typeCode = (t) => (t || "").split("|")[0];

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
  for (const t of en.itemType || []) {
    if (t.source !== SOURCE) continue;
    const z = zhTypes.get(`${t.abbreviation}|${t.source}`);
    types[t.abbreviation] = loc(t.name, z?.name);
  }

  const propText = {};
  const zhProps = new Map((zh.itemProperty || []).map((p) => [`${p.abbreviation}|${p.source}`, p]));
  for (const p of en.itemProperty || []) {
    if (p.source !== SOURCE) continue;
    const z = zhProps.get(`${p.abbreviation}|${p.source}`);
    // entries = [{ name: "Finesse", entries: [...] }]: keep only the body text
    const body = (x) => renderEntries((x?.entries || []).flatMap((e) => e.entries || [e]));
    propText[p.abbreviation] = { en: body(p), zh: body(z || p) };
  }

  const masteries = {};
  const zhMast = zhIndex(zh.itemMastery);
  for (const m of en.itemMastery || []) {
    if (m.source !== SOURCE) continue;
    const z = zhLookup(zhMast, m);
    masteries[m.name] = {
      srd52: Boolean(m.srd52),
      name: loc(m.name, z?.name),
      description: loc(renderEntries(m.entries), renderEntries((z || m).entries)),
    };
  }
  return { types, propText, masteries };
}

function weaponProperties(item, lk) {
  return (item.property || []).map((p) => {
    const uid = typeof p === "string" ? p : p.uid;
    const note = typeof p === "string" ? "" : p.note || "";
    const code = typeCode(uid);
    const def = PROPERTIES[code] || { key: code, en: code, zh: code };
    return {
      key: def.key,
      name: loc(def.en, def.zh),
      note: loc(note, PROPERTY_NOTES_ZH[note] || note),
      // Property rules text has no srd52 flag of its own in 5etools -> local build only.
      description: lk.propText[code] || loc("", ""),
    };
  });
}

/** "Finesse, Light, Thrown" (English, matched by the sheet: /finesse/i picks STR or DEX). */
const roll20Properties = (props) =>
  props.map((p) => (p.note.en ? `${p.name.en} (${p.note.en})` : p.name.en)).join(", ");

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function weaponFields(item, lk) {
  const code = typeCode(item.type);
  const props = weaponProperties(item, lk);
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
      properties: props,
      mastery,
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
    roll20Modifiers: shield ? `Item Type: Shield, AC: ${item.ac}` : `Item Type: ${typeEn}, AC: ${item.ac}`,
  };
}

function buildItem(en, zh, lk) {
  const code = typeCode(en.type);
  const kind = KIND_BY_TYPE[code] || "other";
  const record = {
    id: `${en.name}|${en.source}`.toLowerCase(),
    source: en.source,
    page: en.page,
    srd52: Boolean(en.srd52),
    kind,
    type: { code, ...(lk.types[code] || loc(code, code)) },
    name: loc(en.name, zh?.name),
    weight: en.weight ?? null, // pounds (Roll20 itemweight)
    cost: formatCost(en.value),
    roll20Properties: "",
    roll20Modifiers: "",
  };
  if (en.weapon || kind === "weapon") Object.assign(record, weaponFields(en, lk));
  if (kind === "armor" || kind === "shield") Object.assign(record, armorFields(en, lk));
  if (kind === "ammunition") record.roll20Modifiers = "Item Type: Ammunition";
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

/** SRD build: drop text that has no srd52 flag (weapon property rules, non-SRD masteries). */
function srdSafe(item) {
  if (!item.weapon) return item;
  const weapon = {
    ...item.weapon,
    properties: item.weapon.properties.map((p) => ({ ...p, description: loc("", "") })),
    mastery: item.weapon.mastery?.srd52 ? item.weapon.mastery : null,
  };
  return { ...item, weapon };
}

async function main() {
  const [base, items] = await Promise.all([fetchPair("items-base.json"), fetchPair("items.json")]);
  const lk = buildLookups(base.en, base.zh);
  const zhBase = zhIndex(base.zh.baseitem);
  const zhItems = zhIndex(items.zh.item);

  const out = [];
  for (const [list, zhMap] of [[base.en.baseitem, zhBase], [items.en.item, zhItems]]) {
    for (const en of list) {
      if (en.source !== SOURCE) continue;
      const zh = zhLookup(zhMap, en);
      if (!zh) console.warn(`no Chinese entry for ${en.name}`);
      out.push(buildItem(en, zh, lk));
    }
  }
  const order = ["weapon", "armor", "shield", "ammunition", "focus", "tool", "gear", "mount", "vehicle", "other"];
  out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.name.en.localeCompare(b.name.en));

  // Report what was left out, so the user can decide about the 2024 DMG.
  const xdmg = items.en.item.filter((i) => i.source === "XDMG");
  console.log(`skipped XDMG items: ${xdmg.length} (${xdmg.filter((i) => i.srd52).length} srd52)`);

  writeSplit("items.json", out, "items", srdSafe);
}

module.exports = { main };
runMain(module, main);
