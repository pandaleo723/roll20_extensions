// Traits module: how feats and backgrounds look in the pickers (list row + ⓘ details), the feat
// chips, and the CSS of the species panel (species.js).
//
// Row layout:
//   Name_Main_Lang Name_sub_lang type(italic)  [Repeatable]
//   feat:       prerequisite (or nothing)
//   background: [加入/已有] origin feat — its first line

var R20U = (globalThis.R20U ??= {});

R20U.traitView = (() => {
  const CSS = `
    .type { margin-left: 8px; font-style: italic; color: #666; }
    .tag { margin-left: 8px; font-size: 12px; color: #b5121b; }
    .line2 .prereq { color: #8a5a00; }
    /* status of a trait on the sheet (background feat, species traits) */
    .st { display: inline-block; flex: none; margin-right: 6px; padding: 0 6px; border-radius: 8px;
          font-size: 11px; line-height: 16px; vertical-align: 1px; }
    .st.add { background: #e3f3e6; color: #1a7f37; }
    .st.update { background: #fff1d6; color: #9a5b00; }
    .st.has { background: #ececec; color: #777; }
    .line2 .feat { color: #333; font-weight: 600; }
    /* species panel: tiles, then the chosen species' traits with checkboxes, then the add bar */
    .species-panel .chips { padding-top: 10px; }
    .species-panel li { cursor: default; }
    .species-panel li:hover { background: transparent; }
    .species-panel li.expanded { background: #fdf6f6; }
    .species-panel .head { cursor: pointer; }
    .species-panel input[type=checkbox] { margin: 0; flex: none; }
    .species-panel li.off .main { opacity: .5; }
    .sp-short { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sp-foot { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid #eee; }
    .sp-meta { flex: 1; color: #666; font-size: 12px; }
    .sp-foot button.use { background: #b5121b; border-color: #b5121b; color: #fff; padding: 3px 14px; }
    .sp-foot button.use:disabled { background: #ddd; border-color: #ddd; color: #888; cursor: default; }
  `;

  /** 📖 picker chips: feat `category`. */
  const FEAT_CATEGORIES = [
    { key: "origin", label: { zh: "起源专长", en: "Origin feats" } },
    { key: "general", label: { zh: "通用专长", en: "General feats" } },
    { key: "fightingStyle", label: { zh: "战斗风格", en: "Fighting styles" } },
    { key: "epicBoon", label: { zh: "传奇恩惠", en: "Epic boons" } },
  ];
  const inCategories = (it, selected) => selected.has(it.category);

  const TEXT = {
    zh: { empty: "没有符合的项目", use: "加入",
          dupWarn: (n) => `「${n}」已在特性栏中。仍要再加入一次吗？`,
          type: "类型", prereq: "先决条件", repeatable: "可复选", yes: "是",
          background: "背景", feat: "起源专长", source: "来源", speed: "速度", darkvision: "黑暗视觉",
          ft: (n) => `${n} 尺`, sizes: { T: "微型", S: "小型", M: "中型", L: "大型" },
          status: { add: "加入", has: "已有" } },
    en: { empty: "Nothing matches", use: "Add",
          dupWarn: (n) => `"${n}" is already in Features & Traits. Add it again anyway?`,
          type: "Type", prereq: "Prerequisite", repeatable: "Repeatable", yes: "Yes",
          background: "Background", feat: "Origin feat", source: "Source", speed: "Speed", darkvision: "Darkvision",
          ft: (n) => `${n} ft.`, sizes: { T: "Tiny", S: "Small", M: "Medium", L: "Large" },
          status: { add: "Add", has: "On sheet" } },
  };

  const span = (c, t) => R20U.span(c, t);
  const t = (localized, lang) => localized?.[lang] || localized?.en || "";
  /** Short text for a feat: its benefit headings ("先攻熟练 · 先攻互换") or its first line. */
  function firstLine(feat, lang) {
    const lines = t(feat.description, lang).split("\n").filter(Boolean);
    if (/获得以下增益|following benefits/i.test(lines[0] || "")) {
      const heads = lines.slice(1).filter((l) => l.length <= 24 && /\.$/.test(l)).map((l) => l.replace(/\.$/, ""));
      if (heads.length) return heads.join(" · ");
    }
    return lines[0] || "";
  }

  function renderRow(it, { lang }) {
    const tx = TEXT[lang];
    if (it.kind === "background") {
      const f = it.originFeat;
      const st = it.featStatus === "add" ? "add" : "has";
      return {
        line1: [span("type", tx.background)],
        line2: [span(`st ${st}`, tx.status[st]), span("feat", t(f.name, lang)), span("", ` — ${firstLine(f, lang)}`)],
      };
    }
    const line1 = [span("type", t(it.sourceType, lang))];
    if (it.repeatable) line1.push(span("tag", tx.repeatable));
    const line2 = t(it.prerequisite, lang)
      ? [span("prereq", `${tx.prereq}${lang === "zh" ? "：" : ": "}${t(it.prerequisite, lang)}`)] : [];
    return { line1, line2 };
  }

  function renderDetails(it, { lang }) {
    const tx = TEXT[lang];
    const p = (cls, txt) => Object.assign(document.createElement("p"), { className: cls, textContent: txt });
    // A background's details are its origin feat's (that's what gets added).
    const feat = it.kind === "background" ? it.originFeat : it;
    const rows = it.kind === "background"
      ? [[tx.feat, t(feat.name, lang)]]
      : [[tx.type, t(feat.sourceType, lang)], [tx.prereq, t(feat.prerequisite, lang)], [tx.repeatable, feat.repeatable ? tx.yes : ""]];
    const body = t(feat.description, lang) ? [p("desc", t(feat.description, lang))] : [];
    return { rows, body, source: `${tx.source}: PHB 2024 p.${feat.page}${feat.srd52 ? " · SRD 5.2" : ""}` };
  }

  return { CSS, TEXT, FEAT_CATEGORIES, inCategories, renderRow, renderDetails };
})();
