#!/usr/bin/env node
/**
 * Build "Features & Traits" data from 5etools-cn: feats, backgrounds, species traits,
 * class and subclass features (2024 Player's Handbook, source XPHB).
 *
 *   node scripts/build-traits.js
 *
 * Writes (each to data/srd/ = srd52 entries only, and data/local/ = everything):
 *   feats.json           feats with category (origin / general / fightingStyle / epicBoon)
 *   backgrounds.json     backgrounds with the origin feat they grant, ability scores, proficiencies
 *   species.json         species with their traits and lineage / ancestry variants
 *   class-features.json  class and subclass features, flat, with class / subclass / level
 *
 * Every trait-like record has the fields that map onto Roll20's repeating_traits:
 *   name {en,zh} -> name, traitSource -> source (sheet i18n key: racial / class / feat /
 *   background / item / other), sourceType {en,zh} -> source_type, description {en,zh} -> description.
 *
 * Variable numbers (sense ranges) are templated: the description holds "{darkvision}" and
 * `params.darkvision = { default: 60, unit: "feet" }` carries the value this entry grants
 * (see data/README.md).
 */

const { renderEntries, stripTags, ABILITIES, loc, fetchPair, zhIndex, zhLookup, writeSplit, runMain } =
  require("./lib/5etools");

const SOURCE = "XPHB";
const CLASSES = [
  "barbarian", "bard", "cleric", "druid", "fighter", "monk",
  "paladin", "ranger", "rogue", "sorcerer", "warlock", "wizard",
];

// ---------- templates for variable numbers ----------

const SENSES = {
  darkvision: { en: "Darkvision", zh: "黑暗视觉" },
  blindsight: { en: "Blindsight", zh: "盲视" },
  tremorsense: { en: "Tremorsense", zh: "震颤感知" },
  truesight: { en: "Truesight", zh: "真实视觉" },
};

const templateLog = { templated: [], skipped: [] };

/**
 * Replace a sense's range ("Darkvision with a range of 60 feet" / "60 尺黑暗视觉") with a
 * "{darkvision}" placeholder in both languages. Only applied when, sentence by sentence, the
 * English and Chinese texts mention the same sense with the same single number; otherwise the
 * text is left as-is and logged for review.
 */
function templateSenses(description, label) {
  const enSentences = description.en.split(/(?<=[.!?])\s+|\n/);
  const zhSentences = description.zh.split(/(?<=[。；！？])|\n/);
  const found = {}; // sense -> Set of values
  for (const [key, s] of Object.entries(SENSES)) {
    const re = new RegExp(`\\b${s.en}\\b`, "i");
    for (const sent of enSentences) {
      if (!re.test(sent)) continue;
      const others = Object.values(SENSES).filter((o) => o !== s && new RegExp(`\\b${o.en}\\b`, "i").test(sent));
      const nums = [...sent.matchAll(/(?<!by |additional )\b(\d+)(?:-foot| feet| foot)/g)].map((m) => Number(m[1]));
      if (!nums.length) continue;
      if (others.length || nums.length > 1) {
        templateLog.skipped.push(`${label}: "${sent}"`);
        continue;
      }
      (found[key] ||= new Set()).add(nums[0]);
    }
  }
  const params = {};
  let { en, zh } = description;
  for (const [key, values] of Object.entries(found)) {
    if (values.size !== 1) {
      templateLog.skipped.push(`${label}: ${key} has several ranges (${[...values].join(", ")})`);
      continue;
    }
    const value = [...values][0];
    const s = SENSES[key];
    // "increases by 60 feet" / "增加 60 尺" is an increment, not the sense's range: left as-is.
    const enNum = new RegExp(`(?<!by |additional )\\b${value}(?=-foot| feet| foot)`, "g");
    const zhNum = new RegExp(`(?<!增加\\s*|提升\\s*|\\d)${value}(?=\\s*尺)`, "g");
    const hasSense = (t, name) => new RegExp(`\\b${name}\\b`, "i").test(t);
    const enSent = enSentences.filter((t) => hasSense(t, s.en) && t.match(enNum));
    const zhSent = zhSentences.filter((t) => t.includes(s.zh) && t.match(zhNum));
    if (!zhSent.length || zhSent.length !== enSent.length) {
      templateLog.skipped.push(`${label}: ${key} ${value} ft not matched in Chinese text`);
      continue;
    }
    for (const t of enSent) en = en.replace(t, t.replace(enNum, `{${key}}`));
    for (const t of zhSent) zh = zh.replace(t, t.replace(zhNum, `{${key}}`));
    params[key] = { default: value, unit: "feet" };
  }
  if (!Object.keys(params).length) return { description, params: null };
  templateLog.templated.push(`${label}: ${Object.entries(params).map(([k, p]) => `${k}=${p.default}`).join(", ")}`);
  return { description: { en, zh }, params };
}

/** Common Features & Traits fields; adds `params` when the text was templated. */
function traitFields(name, description, traitSource, sourceType, label) {
  const t = templateSenses(description, label);
  const out = { name, traitSource, sourceType, description: t.description };
  if (t.params) out.params = t.params;
  return out;
}

// ---------- 5etools _versions / _mod ----------

const nameOf = (e) => (typeof e === "object" && e ? e.name : undefined);
const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);

/** Apply a 5etools `_mod.entries` (replaceArr / removeArr / appendArr / insertArr) to entries. */
function applyEntriesMod(entries, mods, label) {
  let out = [...entries];
  for (const m of arr(mods)) {
    switch (m.mode) {
      case "replaceArr": {
        const i = out.findIndex((e) => nameOf(e) === (m.replace?.name ?? m.replace));
        if (i < 0) { console.warn(`${label}: replaceArr target "${m.replace}" not found`); break; }
        out.splice(i, 1, ...arr(m.items));
        break;
      }
      case "removeArr": {
        const names = arr(m.names);
        out = out.filter((e) => !names.includes(nameOf(e)));
        break;
      }
      case "appendArr": out.push(...arr(m.items)); break;
      case "insertArr": out.splice(m.index, 0, ...arr(m.items)); break;
      default: console.warn(`${label}: unsupported _mod mode ${m.mode}`);
    }
  }
  return out;
}

/** Expand `_versions` (plain and _abstract/_implementations) into concrete version objects. */
function expandVersions(entity) {
  const out = [];
  for (const v of entity._versions || []) {
    if (v._abstract) {
      for (const impl of v._implementations || []) {
        let json = JSON.stringify(v._abstract);
        for (const [k, val] of Object.entries(impl._variables || {})) {
          json = json.split(`{{${k}}}`).join(val);
        }
        const { _variables, ...rest } = impl;
        out.push({ ...JSON.parse(json), ...rest });
      }
    } else out.push(v);
  }
  return out;
}

// ---------- feats ----------

const FEAT_CATEGORIES = {
  O: { key: "origin", en: "Origin Feat", zh: "起源专长" },
  G: { key: "general", en: "General Feat", zh: "通用专长" },
  FS: { key: "fightingStyle", en: "Fighting Style Feat", zh: "战斗风格专长" },
  "FS:P": { key: "fightingStyle", en: "Fighting Style Feat", zh: "战斗风格专长", classOnly: "Paladin" },
  "FS:R": { key: "fightingStyle", en: "Fighting Style Feat", zh: "战斗风格专长", classOnly: "Ranger" },
  EB: { key: "epicBoon", en: "Epic Boon Feat", zh: "传奇恩惠专长" },
};

const ARMOR_TRAINING = {
  light: { en: "Light Armor Training", zh: "轻甲受训" },
  medium: { en: "Medium Armor Training", zh: "中甲受训" },
  heavy: { en: "Heavy Armor Training", zh: "重甲受训" },
  shield: { en: "Shield Training", zh: "盾牌受训" },
};

/** Render a feat prerequisite list (alternatives joined with "or"). */
function formatPrerequisite(prereqs, lang) {
  if (!prereqs?.length) return "";
  const or = lang === "en" ? " or " : "或";
  const sep = lang === "en" ? "; " : "；";
  const parts = [];
  const levels = [...new Set(prereqs.map((p) => p.level).filter(Boolean))];
  if (levels.length === 1) parts.push(lang === "en" ? `Level ${levels[0]}+` : `${levels[0]} 级+`);
  const abil = prereqs.flatMap((p) => p.ability || []).map((a) => Object.entries(a)[0]);
  if (abil.length) {
    const score = abil[0][1];
    parts.push(`${abil.map(([k]) => ABILITIES[k][lang]).join(or)} ${score}+`);
  }
  for (const p of prereqs) {
    if (p.feature) parts.push(p.feature.map((f) => (lang === "en" ? `${f} Feature` : `${f}特性`)).join(or));
    if (p.spellcasting2020) parts.push(lang === "en" ? "Spellcasting or Pact Magic Feature" : "施法或契约魔法特性");
    for (const pr of p.proficiency || []) if (pr.armor) parts.push(ARMOR_TRAINING[pr.armor]?.[lang] || pr.armor);
    if (p.otherSummary) parts.push(stripTags(p.otherSummary.entry));
  }
  return [...new Set(parts)].join(sep);
}

function buildFeat(en, zh) {
  const cat = FEAT_CATEGORIES[en.category] || { key: en.category, en: en.category, zh: en.category };
  const label = `feat ${en.name}`;
  const record = {
    id: `${en.name}|${en.source}`.toLowerCase(),
    source: en.source,
    page: en.page,
    srd52: Boolean(en.srd52),
    category: cat.key,
    categoryCode: en.category,
    classOnly: cat.classOnly || "",
    prerequisite: loc(formatPrerequisite(en.prerequisite, "en"), formatPrerequisite((zh || en).prerequisite, "zh")),
    repeatable: Boolean(en.repeatable),
    ...traitFields(
      loc(en.name, zh?.name),
      loc(renderEntries(en.entries), renderEntries((zh || en).entries)),
      "feat",
      loc(cat.en, cat.zh),
      label
    ),
  };
  // Magic Initiate: one variant per spell list ("Magic Initiate; Cleric")
  const enV = expandVersions(en);
  const zhV = zh ? expandVersions(zh) : [];
  if (enV.length) {
    record.variants = enV.map((v, i) => {
      const zv = zhV[i];
      const [, enVar] = v.name.split(/;\s*/);
      const [, zhVar] = (zv?.name || "").split(/[;；]\s*/);
      const enEntries = applyEntriesMod(en.entries, v._mod?.entries, label);
      const zhEntries = zv ? applyEntriesMod(zh.entries, zv._mod?.entries, label) : enEntries;
      const t = templateSenses(loc(renderEntries(enEntries), renderEntries(zhEntries)), `${label} (${enVar})`);
      return {
        id: `${v.name}|${v.source}`.toLowerCase(),
        variant: loc(enVar, zhVar || enVar),
        name: loc(`${en.name} (${enVar})`, `${zh?.name || en.name}（${zhVar || enVar}）`),
        description: t.description,
        ...(t.params ? { params: t.params } : {}),
      };
    });
  }
  record.translator = zh?.translator || "";
  return record;
}

// ---------- backgrounds ----------

/** Text of a background's "Feat:" / "Equipment:" ... list item (both languages share ENG_name). */
function listItem(bg, engName) {
  for (const e of bg.entries || []) {
    for (const it of e.items || []) {
      if ((it.ENG_name || it.name) === engName) return renderEntries(it.entries || [it.entry]);
    }
  }
  return "";
}

function buildBackground(en, zh, featsById) {
  const featKey = Object.keys(en.feats?.[0] || {})[0] || ""; // "magic initiate; cleric|xphb"
  const [featBase, featSrc] = featKey.toLowerCase().split("|");
  const [featName, variant] = featBase.split(/;\s*/);
  const featId = `${featName}|${featSrc}`;
  const feat = featsById.get(featId);
  const featVariant = variant ? feat?.variants?.find((v) => v.id === `${featBase}|${featSrc}`) : null;
  if (!feat) console.warn(`background ${en.name}: feat ${featId} not found`);

  const abilityChoice = en.ability?.[0]?.choose?.weighted?.from || [];
  return {
    id: `${en.name}|${en.source}`.toLowerCase(),
    source: en.source,
    page: en.page,
    srd52: Boolean(en.srd52),
    name: loc(en.name, zh?.name),
    abilityScores: abilityChoice, // +2/+1 or +1/+1/+1 among these
    feat: feat
      ? {
          id: featId,
          variantId: featVariant?.id || "",
          name: featVariant?.name || feat.name,
          srd52: feat.srd52,
        }
      : { id: featId, variantId: "", name: loc(featName, featName), srd52: false },
    skills: Object.keys(en.skillProficiencies?.[0] || {}),
    tools: loc(listItem(en, "Tool Proficiency:"), zh ? listItem(zh, "Tool Proficiency:") : ""),
    equipment: loc(listItem(en, "Equipment:"), zh ? listItem(zh, "Equipment:") : ""),
    traitSource: "background",
    sourceType: loc(en.name, zh?.name),
    description: loc(renderEntries(en.entries), renderEntries((zh || en).entries)),
    translator: zh?.translator || "",
  };
}

// ---------- species ----------

const namedEntries = (entries) => (entries || []).filter((e) => typeof e === "object" && e.name);

function speciesTraits(enEntries, zhEntries, sourceType, label) {
  const zhList = namedEntries(zhEntries);
  return namedEntries(enEntries).map((e, i) => {
    const z = zhList.find((x) => x.ENG_name === e.name) || zhList[i];
    return {
      id: e.name.toLowerCase(),
      ...traitFields(
        loc(e.name, z?.name),
        loc(renderEntries(e.entries), renderEntries((z || e).entries)),
        "racial",
        sourceType,
        `${label} / ${e.name}`
      ),
    };
  });
}

function senses(o) {
  const s = {};
  for (const k of Object.keys(SENSES)) if (o[k] != null) s[k] = o[k];
  return s;
}

function buildSpecies(en, zh) {
  const label = `species ${en.name}`;
  const sourceType = loc(en.name, zh?.name);
  const traits = speciesTraits(en.entries, zh?.entries, sourceType, label);
  const baseJson = new Map(namedEntries(en.entries).map((e) => [e.name, JSON.stringify(e)]));

  const enV = expandVersions(en);
  const zhV = zh ? expandVersions(zh) : [];
  const lineages = enV.map((v, i) => {
    const zv = zhV[i];
    const enEntries = applyEntriesMod(en.entries, v._mod?.entries, `${label} ${v.name}`);
    const zhEntries = zv && zh ? applyEntriesMod(zh.entries, zv._mod?.entries, `${label} ${v.name} (zh)`) : enEntries;
    // "Elf; Drow Lineage" -> "Drow Lineage"; "Dragonborn (Black)" -> "Black"
    const short = (n) => (n || "").split(/[;；]\s*/)[1] || (n || "").match(/[(（](.+)[)）]/)?.[1] || n || "";
    const vName = loc(short(v.name), short(zv?.name) || short(v.name));
    const vSourceType = loc(`${en.name} (${vName.en})`, `${zh?.name || en.name}（${vName.zh}）`);
    const all = speciesTraits(enEntries, zhEntries, vSourceType, `${label} (${vName.en})`);
    const enNames = new Set(namedEntries(enEntries).map((e) => e.name));
    const changedNames = new Set(
      namedEntries(enEntries).filter((e) => baseJson.get(e.name) !== JSON.stringify(e)).map((e) => e.name)
    );
    return {
      id: `${v.name}|${v.source || en.source}`.toLowerCase(),
      name: vName,
      speed: v.speed ?? en.speed,
      senses: { ...senses(en), ...senses(v) },
      resist: v.resist || en.resist || [],
      // Only the traits this lineage replaces or adds; the rest are the species' base traits.
      traits: all.filter((t) => changedNames.has(t.name.en)),
      removedTraits: [...baseJson.keys()].filter((n) => !enNames.has(n)),
    };
  });

  return {
    id: `${en.name}|${en.source}`.toLowerCase(),
    source: en.source,
    page: en.page,
    srd52: Boolean(en.srd52),
    name: sourceType,
    size: en.size || [],
    speed: en.speed,
    senses: senses(en),
    resist: en.resist || [],
    traits,
    lineages,
    translator: zh?.translator || "",
  };
}

// ---------- class features ----------

function buildClassFeatures(className, en, zh) {
  const cls = en.class.find((c) => c.source === SOURCE);
  const zcls = zh.class.find((c) => c.source === SOURCE);
  const clsName = loc(cls.name, zcls?.name);

  const enSub = en.subclass.filter((s) => s.source === SOURCE);
  const zhSub = zh.subclass.filter((s) => s.source === SOURCE);
  const subByShort = new Map(enSub.map((s, i) => [s.shortName, { en: s, zh: zhSub[i] }]));

  const out = [];
  const add = (f, z, sub) => {
    if (f.name === "Subclass Feature") return; // placeholder: "you gain a feature from your subclass"
    const subName = sub ? loc(sub.en.name, sub.zh?.name) : null;
    const sourceType = sub
      ? loc(`${clsName.en} ${f.level} (${subName.en})`, `${clsName.zh} ${f.level}（${subName.zh}）`)
      : loc(`${clsName.en} ${f.level}`, `${clsName.zh} ${f.level}`);
    const record = {
      id: [f.name, cls.name, SOURCE, sub?.en.shortName || "", f.level].join("|").toLowerCase(),
      source: f.source,
      page: f.page,
      srd52: Boolean(f.srd52),
      className: clsName,
      subclass: sub ? { shortName: loc(sub.en.shortName, sub.zh?.shortName), name: subName } : null,
      level: f.level,
      ...traitFields(
        loc(f.name, z?.name),
        loc(renderEntries(f.entries), renderEntries((z || f).entries)),
        "class",
        sourceType,
        `${cls.name}${sub ? "/" + sub.en.shortName : ""} ${f.level} ${f.name}`
      ),
      translator: z?.translator || "",
    };
    // The level-3 entry named after the subclass is its introduction (flavour + feature list).
    if (sub && f.name === sub.en.name) record.subclassIntro = true;
    out.push(record);
  };

  const enCf = en.classFeature.filter((f) => f.source === SOURCE);
  const zhCf = zh.classFeature.filter((f) => f.source === SOURCE);
  enCf.forEach((f, i) => add(f, zhCf[i]?.ENG_name === f.name ? zhCf[i] : null, null));

  const enScf = en.subclassFeature.filter((f) => f.source === SOURCE);
  const zhScf = zh.subclassFeature.filter((f) => f.source === SOURCE);
  enScf.forEach((f, i) => {
    const sub = subByShort.get(f.subclassShortName);
    if (!sub) return console.warn(`${className}: subclass ${f.subclassShortName} not found`);
    add(f, zhScf[i]?.ENG_name === f.name ? zhScf[i] : null, sub);
  });
  return out;
}

// ---------- main ----------

async function main() {
  const [feats, backgrounds, races, ...classFiles] = await Promise.all([
    fetchPair("feats.json"),
    fetchPair("backgrounds.json"),
    fetchPair("races.json"),
    ...CLASSES.map((c) => fetchPair(`class/class-${c}.json`)),
  ]);

  const zhFeats = zhIndex(feats.zh.feat);
  const featRecords = feats.en.feat
    .filter((f) => f.source === SOURCE)
    .map((f) => buildFeat(f, zhLookup(zhFeats, f)))
    .sort((a, b) => a.categoryCode.localeCompare(b.categoryCode) || a.name.en.localeCompare(b.name.en));
  const featsById = new Map(featRecords.map((f) => [f.id, f]));

  const zhBg = zhIndex(backgrounds.zh.background);
  const bgRecords = backgrounds.en.background
    .filter((b) => b.source === SOURCE)
    .map((b) => buildBackground(b, zhLookup(zhBg, b), featsById));

  const zhRaces = zhIndex(races.zh.race);
  const speciesRecords = races.en.race
    .filter((r) => r.source === SOURCE)
    .map((r) => buildSpecies(r, zhLookup(zhRaces, r)));

  const classRecords = CLASSES.flatMap((c, i) => buildClassFeatures(c, classFiles[i].en, classFiles[i].zh));

  // SRD build of a background whose granted feat is not SRD: keep the reference, not the text.
  writeSplit("feats.json", featRecords, "feats");
  writeSplit("backgrounds.json", bgRecords, "backgrounds");
  writeSplit("species.json", speciesRecords, "species");
  writeSplit("class-features.json", classRecords, "class features");

  console.log(`templated ${templateLog.templated.length} entries:`);
  templateLog.templated.forEach((t) => console.log(`  ${t}`));
  if (templateLog.skipped.length) {
    console.log(`not templated (review):`);
    templateLog.skipped.forEach((t) => console.log(`  ${t}`));
  }
}

module.exports = { main };
runMain(module, main);
