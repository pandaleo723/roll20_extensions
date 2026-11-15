// Spells module: how a spell looks in the picker (list row + ⓘ details).
//
// Row layout:
//   Name_Main_Lang Name_sub_lang school(italic)  ritual Conc
//   castingTime · range · damage damageType  [components]
// (the picker adds the [Current]/[Chosen] badge and the names; we add the rest)

var R20U = (globalThis.R20U ??= {});

R20U.spellView = (() => {
  const CSS = `
    .school { margin-left: 8px; font-style: italic; }
    .comps { margin-left: 10px; }
    .tag { margin-left: 8px; font-size: 12px; color: #b5121b; }
    .tag.ritual { font-style: italic; }
    .tag.conc { font-weight: 700; }
    .details .higher { color: #444; }
  `;

  const TEXT = {
    zh: { ritual: "仪式", conc: "专注", heal: "治疗", empty: "没有符合的法术", use: "使用此法术",
          dupWarn: (n) => `「${n}」已在此法术列表中。仍要再加入一次吗？`,
          time: "施法时间", range: "距离", comps: "成分", duration: "持续时间", save: "豁免", classes: "职业",
          source: "来源", concPrefix: "专注，" },
    en: { ritual: "ritual", conc: "Conc", heal: "healing", empty: "No matching spells", use: "Use this spell",
          dupWarn: (n) => `"${n}" is already in this spell list. Add it again anyway?`,
          time: "Casting Time", range: "Range", comps: "Components", duration: "Duration", save: "Saving Throw",
          classes: "Classes", source: "Source", concPrefix: "Concentration, " },
  };

  /** Short labels in the list; Chinese as on the 5etools-cn site (声音 / 姿势 / 材料), one character. */
  const COMPONENT_SHORT = { zh: { v: "声", s: "姿", m: "材" }, en: { v: "V", s: "S", m: "M" } };
  const COMPONENT_FULL = { zh: { v: "声音", s: "姿势", m: "材料" }, en: { v: "V", s: "S", m: "M" } };

  /** "1 action" / "1 动作" without a reaction's long trigger text. */
  const shortTime = (text) => text.split(/[，,]/)[0];
  const span = (c, t) => R20U.span(c, t);

  function renderRow(s, { lang }) {
    const t = TEXT[lang];
    const line1 = [span("school", R20U.SCHOOL_NAMES[s.school]?.[lang] || s.school)];
    if (s.ritual) line1.push(span("tag ritual", t.ritual));
    if (s.concentration) line1.push(span("tag conc", t.conc));

    const roll = s.healing ? `${s.healing} ${t.heal}` : s.damage && `${s.damage} ${s.damageType[lang]}`.trim();
    const comps = ["v", "s", "m"].filter((c) => s.components[c]).map((c) => COMPONENT_SHORT[lang][c]);
    const line2 = [span("", [shortTime(s.castingTime[lang]), s.range[lang], roll].filter(Boolean).join(" · "))];
    if (comps.length) line2.push(span("comps", `[${comps.join(", ")}]`));
    return { line1, line2 };
  }

  function renderDetails(s, { lang }) {
    const t = TEXT[lang];
    const comps = ["v", "s", "m"].filter((c) => s.components[c]).map((c) => COMPONENT_FULL[lang][c]);
    const materials = s.materials?.[lang];
    const duration = s.concentration
      ? t.concPrefix + (lang === "en" ? s.duration.en.replace(/^Up/, "up") : s.duration[lang])
      : s.duration[lang];
    const p = (cls, txt) => Object.assign(document.createElement("p"), { className: cls, textContent: txt });
    const body = [];
    // 5e-cn marks entries without a named translator as machine-translated ("机翻").
    if (lang === "zh" && (!s.translator || s.translator === "机翻")) body.push(p("mt", "⚠️ 机翻"));
    body.push(p("desc", s.description[lang]));
    if (s.higherLevels?.[lang]) body.push(p("desc higher", s.higherLevels[lang]));
    return {
      rows: [
        [t.time, s.castingTime[lang]],
        [t.range, s.range[lang]],
        [t.comps, comps.join(", ") + (materials ? (lang === "zh" ? `（${materials}）` : ` (${materials})`) : "")],
        [t.duration, duration],
        [t.save, s.save ? [R20U.ABILITY_NAMES?.[s.save]?.[lang] || s.save, s.saveSuccess?.[lang]].filter(Boolean).join(" · ") : ""],
        [t.classes, (s.classes || []).map((c) => R20U.CLASS_NAMES[c]?.[lang] || c).join(", ")],
      ],
      body,
      source: `${t.source}: PHB 2024 p.${s.page}${s.srd52 ? " · SRD 5.2" : ""}`,
    };
  }

  return { CSS, TEXT, renderRow, renderDetails };
})();
