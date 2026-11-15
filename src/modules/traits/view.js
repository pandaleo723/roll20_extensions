// Traits module: how feats, backgrounds and species look in the pickers (list row + ⓘ details),
// and their chips. Two pickers: 📖 feats, 👥 origin (background / species).
//
// Row layout:
//   Name_Main_Lang Name_sub_lang type(italic)  [Repeatable]
//   feat:       prerequisite (or nothing)
//   background: ability scores · origin feat
//   species:    trait names

var R20U = (globalThis.R20U ??= {});

R20U.traitView = (() => {
  const CSS = `
    .type { margin-left: 8px; font-style: italic; color: #666; }
    .tag { margin-left: 8px; font-size: 12px; color: #b5121b; }
    .line2 .prereq { color: #8a5a00; }
    .details .trait-name { font-weight: 600; }
  `;

  /** 📖 picker chips: feat `category`. */
  const FEAT_CATEGORIES = [
    { key: "origin", label: { zh: "起源专长", en: "Origin feats" } },
    { key: "general", label: { zh: "通用专长", en: "General feats" } },
    { key: "fightingStyle", label: { zh: "战斗风格", en: "Fighting styles" } },
    { key: "epicBoon", label: { zh: "传奇恩惠", en: "Epic boons" } },
  ];
  /** 👥 picker chips: entry `kind`. */
  const ORIGIN_CATEGORIES = [
    { key: "species", label: { zh: "种族", en: "Species" } },
    { key: "background", label: { zh: "背景", en: "Backgrounds" } },
  ];
  const KIND_NAME = {
    species: { zh: "种族", en: "Species" },
    background: { zh: "背景", en: "Background" },
  };
  const inCategories = (it, selected) => selected.has(it.kind === "feat" ? it.category : it.kind);

  const TEXT = {
    zh: { empty: "没有符合的项目", use: "加入",
          dupWarn: (n) => `「${n}」已在特性栏中。仍要再加入一次吗？`,
          type: "类型", prereq: "先决条件", repeatable: "可复选", yes: "是", abilities: "属性值",
          feat: "专长", source: "来源", speed: "速度", darkvision: "黑暗视觉", size: "体型",
          ft: (n) => `${n} 尺`, sizes: { T: "微型", S: "小型", M: "中型", L: "大型" } },
    en: { empty: "Nothing matches", use: "Add",
          dupWarn: (n) => `"${n}" is already in Features & Traits. Add it again anyway?`,
          type: "Type", prereq: "Prerequisite", repeatable: "Repeatable", yes: "Yes", abilities: "Ability scores",
          feat: "Feat", source: "Source", speed: "Speed", darkvision: "Darkvision", size: "Size",
          ft: (n) => `${n} ft.`, sizes: { T: "Tiny", S: "Small", M: "Medium", L: "Large" } },
  };

  const ABILITY_KEYS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  const abilityList = (keys, lang) =>
    (keys || []).map((k) => R20U.ABILITY_NAMES[ABILITY_KEYS[k]]?.[lang] || k).join(lang === "zh" ? "，" : ", ");

  const span = (c, t) => R20U.span(c, t);
  const t = (localized, lang) => localized?.[lang] || localized?.en || "";
  const sep = (lang) => (lang === "zh" ? "，" : ", ");

  function renderRow(it, { lang }) {
    const tx = TEXT[lang];
    const line1 = [span("type", t(KIND_NAME[it.kind] || it.sourceType, lang))];
    if (it.repeatable) line1.push(span("tag", tx.repeatable));
    let line2 = [];
    if (it.kind === "background") {
      line2 = [span("", [abilityList(it.abilityScores, lang), it.feat && t(it.feat.name, lang)].filter(Boolean).join(" · "))];
    } else if (it.kind === "species") {
      line2 = [span("", it.traits.map((tr) => t(tr.name, lang)).join(sep(lang)))];
    } else if (t(it.prerequisite, lang)) {
      line2 = [span("prereq", `${tx.prereq}${lang === "zh" ? "：" : ": "}${t(it.prerequisite, lang)}`)];
    }
    return { line1, line2 };
  }

  function renderDetails(it, { lang }) {
    const tx = TEXT[lang];
    const p = (cls, txt) => Object.assign(document.createElement("p"), { className: cls, textContent: txt });
    let rows;
    let body;
    if (it.kind === "species") {
      rows = [
        [tx.size, (it.size || []).map((s) => tx.sizes[s] || s).join(" / ")],
        [tx.speed, it.speed ? tx.ft(it.speed) : ""],
        [tx.darkvision, it.senses?.darkvision ? tx.ft(it.senses.darkvision) : ""],
      ];
      body = it.traits.map((tr) => {
        const el = p("desc", "");
        el.append(span("trait-name", t(tr.name, lang)), document.createTextNode(lang === "zh" ? "：" : ". "),
          document.createTextNode(R20U.traitDescription(tr, lang)));
        return el;
      });
    } else if (it.kind === "background") {
      rows = [[tx.abilities, abilityList(it.abilityScores, lang)], [tx.feat, t(it.feat?.name, lang)]];
      body = t(it.description, lang) ? [p("desc", t(it.description, lang))] : [];
    } else {
      rows = [[tx.type, t(it.sourceType, lang)], [tx.prereq, t(it.prerequisite, lang)], [tx.repeatable, it.repeatable ? tx.yes : ""]];
      body = t(it.description, lang) ? [p("desc", t(it.description, lang))] : [];
    }
    return { rows, body, source: `${tx.source}: PHB 2024 p.${it.page}${it.srd52 ? " · SRD 5.2" : ""}` };
  }

  return { CSS, TEXT, FEAT_CATEGORIES, ORIGIN_CATEGORIES, inCategories, renderRow, renderDetails };
})();
