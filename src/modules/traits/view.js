// Traits module: how a feat / background looks in the picker (list row + ⓘ details), its chips.
//
// Row layout:
//   Name_Main_Lang Name_sub_lang type(italic)  [Repeatable]
//   feat:       prerequisite (or nothing)
//   background: ability scores · origin feat

var R20U = (globalThis.R20U ??= {});

R20U.traitView = (() => {
  const CSS = `
    .type { margin-left: 8px; font-style: italic; color: #666; }
    .tag { margin-left: 8px; font-size: 12px; color: #b5121b; }
    .line2 .prereq { color: #8a5a00; }
  `;

  /** Picker chips: feat `category`, or "background". */
  const CATEGORIES = [
    { key: "origin", label: { zh: "起源专长", en: "Origin feats" } },
    { key: "general", label: { zh: "通用专长", en: "General feats" } },
    { key: "fightingStyle", label: { zh: "战斗风格", en: "Fighting styles" } },
    { key: "epicBoon", label: { zh: "传奇恩惠", en: "Epic boons" } },
    { key: "background", label: { zh: "背景", en: "Backgrounds" } },
  ];
  const inCategories = (it, selected) => selected.has(it.kind === "background" ? "background" : it.category);

  const TEXT = {
    zh: { empty: "没有符合的专长或背景", use: "加入",
          dupWarn: (n) => `「${n}」已在特性栏中。仍要再加入一次吗？`,
          type: "类型", prereq: "先决条件", repeatable: "可复选", yes: "是", abilities: "属性值",
          feat: "专长", source: "来源" },
    en: { empty: "No matching feats or backgrounds", use: "Add",
          dupWarn: (n) => `"${n}" is already in Features & Traits. Add it again anyway?`,
          type: "Type", prereq: "Prerequisite", repeatable: "Repeatable", yes: "Yes", abilities: "Ability scores",
          feat: "Feat", source: "Source" },
  };

  const ABILITY_KEYS = { str: "Strength", dex: "Dexterity", con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma" };
  const abilityList = (keys, lang) =>
    (keys || []).map((k) => R20U.ABILITY_NAMES[ABILITY_KEYS[k]]?.[lang] || k).join(lang === "zh" ? "，" : ", ");

  const span = (c, t) => R20U.span(c, t);
  const t = (localized, lang) => localized?.[lang] || localized?.en || "";

  function renderRow(it, { lang }) {
    const tx = TEXT[lang];
    const line1 = [span("type", t(it.kind === "background" ? { zh: "背景", en: "Background" } : it.sourceType, lang))];
    if (it.repeatable) line1.push(span("tag", tx.repeatable));
    const line2 = it.kind === "background"
      ? [span("", [abilityList(it.abilityScores, lang), it.feat && t(it.feat.name, lang)].filter(Boolean).join(" · "))]
      : t(it.prerequisite, lang) ? [span("prereq", `${tx.prereq}${lang === "zh" ? "：" : ": "}${t(it.prerequisite, lang)}`)] : [];
    return { line1, line2 };
  }

  function renderDetails(it, { lang }) {
    const tx = TEXT[lang];
    const p = (cls, txt) => Object.assign(document.createElement("p"), { className: cls, textContent: txt });
    const bg = it.kind === "background";
    const rows = bg
      ? [[tx.abilities, abilityList(it.abilityScores, lang)], [tx.feat, t(it.feat?.name, lang)]]
      : [[tx.type, t(it.sourceType, lang)], [tx.prereq, t(it.prerequisite, lang)], [tx.repeatable, it.repeatable ? tx.yes : ""]];
    const body = t(it.description, lang) ? [p("desc", t(it.description, lang))] : [];
    return { rows, body, source: `${tx.source}: PHB 2024 p.${it.page}${it.srd52 ? " · SRD 5.2" : ""}` };
  }

  return { CSS, TEXT, CATEGORIES, inCategories, renderRow, renderDetails };
})();
