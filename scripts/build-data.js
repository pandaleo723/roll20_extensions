#!/usr/bin/env node
/**
 * Build the extension's spell data from 5etools-cn (https://github.com/tjliqy/5etools-cn).
 *
 *   node scripts/build-data.js
 *
 * Writes:
 *   data/srd/spells.json    SRD 5.2 spells only (entries tagged srd52) -> safe to commit / ship
 *   data/local/spells.json  every 2024 PHB (XPHB) spell               -> git-ignored, personal use only
 *
 * Structure (level, range, duration...) comes from the English files in data-bak/,
 * Chinese text comes from data/. Entries are joined on the Chinese file's ENG_name.
 * 5etools markup ({@damage 1d10}, {@condition 目盲|XPHB}...) is converted to plain text.
 */

const { stripTags, renderEntries, DAMAGE_TYPES_ZH, plural, fetchJson, write, runMain } = require("./lib/5etools");

const SPELL_FILE = "spells/spells-xphb.json";

// ---------- structured fields -> display strings ----------

const SCHOOLS = {
  A: "abjuration", C: "conjuration", D: "divination", E: "enchantment",
  V: "evocation", I: "illusion", N: "necromancy", T: "transmutation",
};

const UNITS = {
  action: { en: "action", zh: "动作" },
  bonus: { en: "bonus action", zh: "附赠动作" },
  reaction: { en: "reaction", zh: "反应" },
  minute: { en: "minute", zh: "分钟" },
  hour: { en: "hour", zh: "小时" },
  round: { en: "round", zh: "轮" },
  day: { en: "day", zh: "天" },
};

function formatTime(enTime, zhTime) {
  const t = enTime[0];
  const u = UNITS[t.unit] || { en: t.unit, zh: t.unit };
  const en = `${t.number} ${t.unit === "bonus" ? "bonus action" : plural(t.number, u.en)}`;
  let zh = `${t.number} ${u.zh}`;
  if (t.condition) {
    return { en: `${en}, ${stripTags(t.condition)}`, zh: `${zh}，${stripTags(zhTime[0].condition || t.condition)}` };
  }
  return { en, zh };
}

function formatDistance(d) {
  switch (d.type) {
    case "feet": return { en: `${d.amount} feet`, zh: `${d.amount} 尺` };
    case "miles": return { en: `${d.amount} ${plural(d.amount, "mile")}`, zh: `${d.amount} 里` };
    case "self": return { en: "Self", zh: "自身" };
    case "touch": return { en: "Touch", zh: "触及" };
    case "sight": return { en: "Sight", zh: "视线所及" };
    case "unlimited": return { en: "Unlimited", zh: "无限" };
    default: return { en: d.type, zh: d.type };
  }
}

const SHAPES_ZH = {
  cone: "锥形", line: "线形", cube: "立方", sphere: "球形", radius: "半径",
  emanation: "散发", hemisphere: "半球", cylinder: "圆柱",
};

function formatRange(r) {
  if (r.type === "point") return formatDistance(r.distance);
  if (r.type === "special") return { en: "Special", zh: "特殊" };
  // Area spells centred on the caster: "Self (15-foot cone)"
  const d = r.distance;
  const size = d.type === "miles" ? `${d.amount}-mile` : `${d.amount}-foot`;
  const sizeZh = d.type === "miles" ? `${d.amount} 里` : `${d.amount} 尺`;
  return { en: `Self (${size} ${r.type})`, zh: `自身（${sizeZh}${SHAPES_ZH[r.type] || r.type}）` };
}

function formatDuration(dur) {
  const d = dur[0];
  switch (d.type) {
    case "instant": return { en: "Instantaneous", zh: "立即" };
    case "special": return { en: "Special", zh: "特殊" };
    case "permanent": {
      const trig = (d.ends || []).includes("trigger");
      return trig
        ? { en: "Until dispelled or triggered", zh: "直至被解除或触发" }
        : { en: "Until dispelled", zh: "直至被解除" };
    }
    case "timed": {
      const { type, amount } = d.duration;
      const u = UNITS[type] || { en: type, zh: type };
      const en = `${amount} ${plural(amount, u.en)}`;
      const zh = `${amount} ${u.zh}`;
      // Concentration has its own checkbox (spellconcentration), so it's left out of the text.
      return d.concentration ? { en: `Up to ${en}`, zh: `至多 ${zh}` } : { en, zh };
    }
    default: return { en: d.type, zh: d.type };
  }
}

function formatMaterials(m) {
  if (!m) return "";
  return stripTags(typeof m === "string" ? m : m.text || "");
}

/** Damage dice for the base (lowest) level, plus per-level scaling if present. */
function damageInfo(spell) {
  const scaling = Array.isArray(spell.scalingLevelDice) ? spell.scalingLevelDice[0] : spell.scalingLevelDice;
  if (scaling) {
    const levels = Object.keys(scaling.scaling).map(Number).sort((a, b) => a - b);
    // e.g. True Strike: extra damage only from level 5 -> no base damage at level 1
    const dice = levels[0] === 1 ? scaling.scaling[1] : "";
    return { dice, cantripScaling: true, type: firstDamageType(spell) };
  }
  const m = JSON.stringify(spell.entries).match(/\{@damage ([^}|]+)/);
  return { dice: m ? m[1] : "", cantripScaling: false, type: firstDamageType(spell) };
}

/** Damage type written right after the first damage roll ("{@damage 1d10} Piercing damage"). */
function firstDamageType(spell) {
  const m = JSON.stringify(spell.entries).match(/\{@damage [^}]+\} (\w+) damage/i);
  const t = m?.[1].toLowerCase();
  return t && DAMAGE_TYPES_ZH[t] ? t : spell.damageInflict?.[0] || "";
}

/**
 * Roll20 spell_damage_progression for cantrips:
 *  "Cantrip Dice"  dice count grows 1->2->3->4 at levels 1/5/11/17 with the same die (Fire Bolt)
 *  "Cantrip Beam"  more beams (Eldritch Blast)
 *  ""              anything else (Shillelagh changes die size, True Strike starts at level 5)
 */
function cantripProgression(spell) {
  if (spell.level !== 0) return "";
  const scaling = Array.isArray(spell.scalingLevelDice) ? spell.scalingLevelDice[0] : spell.scalingLevelDice;
  if (scaling) {
    const levels = Object.keys(scaling.scaling).map(Number).sort((a, b) => a - b);
    const parsed = levels.map((l) => scaling.scaling[l].match(/^(\d+)d(\d+)$/));
    const sameDieCounting =
      levels.join() === "1,5,11,17" &&
      parsed.every((m, i) => m && Number(m[1]) === i + 1 && m[2] === parsed[0][2]);
    return sameDieCounting ? "Cantrip Dice" : "";
  }
  return /\bbeams?\b/i.test(renderEntries(spell.entriesHigherLevel || [])) ? "Cantrip Beam" : "";
}

/**
 * Extra dice per spell slot above the spell's level (Roll20 "升環施法傷害" spellhldie/spellhldietype),
 * from "{@scaledamage 8d6|3-9|1d6}" (Fireball: +1d6) or "{@scaledice 2d8|1-9|2d8}" (Cure Wounds: +2d8).
 */
function upcastDice(spell) {
  if (spell.level === 0) return null;
  const m = JSON.stringify(spell.entriesHigherLevel || []).match(/\{@scale(?:damage|dice) [^|}]+\|[^|}]+\|(\d+)(d\d+)\}/);
  return m ? { count: m[1], die: m[2] } : null;
}

/** "Melee" / "Ranged" / "None": 5etools spellAttack tag, else "melee/ranged spell attack" in the text. */
function attackType(spell) {
  const tag = spell.spellAttack?.[0];
  if (tag === "M") return "Melee";
  if (tag === "R") return "Ranged";
  const text = renderEntries(spell.entries);
  if (/melee spell attack/i.test(text)) return "Melee";
  if (/ranged spell attack/i.test(text)) return "Ranged";
  return "None";
}

/** "{@damage 5d6} Fire damage and/plus {@damage 5d6} Radiant damage" -> second roll. */
function secondDamage(spell) {
  const m = JSON.stringify(spell.entries).match(
    /\{@damage [^}|]+\} (\w+) damage,? (?:and|plus) \{@damage ([^}|]+)\} (\w+) damage/i
  );
  if (!m || m[1].toLowerCase() === m[3].toLowerCase()) {
    return { damage2: "", damageType2: { en: "", zh: "" } };
  }
  const type = m[3].toLowerCase();
  return { damage2: m[2], damageType2: { en: type, zh: DAMAGE_TYPES_ZH[type] || type } };
}

/** Healing amount ("2d8", "70", "4d8 + 15") for spells tagged HL (healing), else "". */
function healingInfo(spell) {
  if (!(spell.miscTags || []).includes("HL")) return "";
  const text = renderEntries(spell.entries);
  const m = text.match(
    /(?:regains?|restoring|restore up to) (?:a number of Hit Points equal to |Hit Points equal to )?(\d+d\d+(?: ?\+ ?\d+)?|\d+)(?= |\.|,)/i
  );
  return m ? m[1].replace(/ ?\+ ?/, " + ") : "";
}

/** True when the spell adds the spellcasting modifier to its damage/healing roll. */
function addsSpellMod(spell) {
  return /(\d+d\d+|Hit Points equal to [^.]*?) plus your spellcasting ability modifier/i.test(
    renderEntries(spell.entries)
  );
}

/** "Half damage" text for save spells that deal half on a success. */
function saveSuccessInfo(spell) {
  if (!spell.savingThrow) return { en: "", zh: "" };
  return /half as much damage/i.test(renderEntries(spell.entries))
    ? { en: "Half damage", zh: "伤害减半" }
    : { en: "", zh: "" };
}

// ---------- build ----------

/**
 * Classes whose spell list has the spell, e.g. ["Sorcerer", "Wizard", "Artificer"], from 5etools'
 * generated lookup (all class sources, e.g. XPHB + EFA for the Artificer). Names match the values
 * of Roll20's attr_class.
 */
function spellClasses(lookup, en) {
  const bySource = lookup?.[en.source.toLowerCase()]?.[en.name.toLowerCase()]?.class || {};
  return [...new Set(Object.values(bySource).flatMap((o) => Object.keys(o)))].sort();
}

function buildSpell(en, zh, lookup) {
  const dmg = damageInfo(en);
  return {
    id: `${en.name}|${en.source}`.toLowerCase(),
    source: en.source,
    page: en.page,
    srd52: Boolean(en.srd52),
    level: en.level,
    classes: spellClasses(lookup, en),
    school: SCHOOLS[en.school] || en.school,
    ritual: Boolean(en.meta?.ritual),
    concentration: en.duration.some((d) => d.concentration),
    components: {
      v: Boolean(en.components.v),
      s: Boolean(en.components.s),
      m: Boolean(en.components.m),
    },
    attack: attackType(en),
    save: en.savingThrow?.[0] ? en.savingThrow[0][0].toUpperCase() + en.savingThrow[0].slice(1) : "",
    damage: dmg.dice,
    cantripScaling: dmg.cantripScaling,
    cantripProgression: cantripProgression(en),
    upcast: upcastDice(en),
    damageType: { en: dmg.type, zh: DAMAGE_TYPES_ZH[dmg.type] || dmg.type },
    // Second damage roll only when the spell always deals both (e.g. Flame Strike fire + radiant);
    // "choose one of" spells like Chromatic Orb keep only the first.
    ...secondDamage(en),
    healing: healingInfo(en),
    addSpellMod: addsSpellMod(en),
    // Spell uses the caster's spellcasting ability (attack roll, save DC, or "+ spellcasting
    // ability modifier" in its text). Maps to Roll20 spell_ability = "spell".
    usesSpellcastingAbility:
      attackType(en) !== "None" || Boolean(en.savingThrow) || /spellcasting ability/i.test(renderEntries(en.entries)),
    saveSuccess: saveSuccessInfo(en),
    name: { en: en.name, zh: zh?.name || en.name },
    castingTime: formatTime(en.time, (zh || en).time),
    range: formatRange(en.range),
    duration: formatDuration(en.duration),
    materials: {
      en: formatMaterials(en.components.m),
      zh: formatMaterials((zh || en).components.m),
    },
    description: {
      en: renderEntries(en.entries),
      zh: renderEntries((zh || en).entries),
    },
    higherLevels: {
      en: renderEntries(en.entriesHigherLevel || []),
      zh: renderEntries((zh || en).entriesHigherLevel || []),
    },
    translator: zh?.translator || "",
  };
}

async function main() {
  const [enFile, zhFile, classLookup] = await Promise.all([
    fetchJson(`data-bak/${SPELL_FILE}`),
    fetchJson(`data/${SPELL_FILE}`),
    // English copy: keyed by English spell name, English class names
    fetchJson("data-bak/generated/gendata-spell-source-lookup.json"),
  ]);
  const zhByName = new Map(zhFile.spell.map((s) => [s.ENG_name, s]));

  const spells = enFile.spell.map((en) => {
    const zh = zhByName.get(en.name);
    if (!zh) console.warn(`no Chinese entry for ${en.name}`);
    return buildSpell(en, zh, classLookup);
  });
  const noClass = spells.filter((s) => !s.classes.length).map((s) => s.name.en);
  if (noClass.length) console.warn(`no class list for: ${noClass.join(", ")}`);
  spells.sort((a, b) => a.level - b.level || a.name.en.localeCompare(b.name.en));

  write("data/srd/spells.json", spells.filter((s) => s.srd52), "spells");
  write("data/local/spells.json", spells, "spells");
}

module.exports = { main };
runMain(module, main);
