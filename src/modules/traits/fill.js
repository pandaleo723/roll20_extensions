// Traits module: maps a feat or background (data/*/feats.json, backgrounds.json) onto the fields
// of a Roll20 "D&D 5E by Roll20" Features & Traits row (repeating_traits).
//
// Row edit panel, top to bottom: name, source (dropdown, options carry only data-i18n keys
// racial/class/feat/background/item/other; matched by key in fields.js), source_type, description.

var R20U = (globalThis.R20U ??= {});

(() => {
  const PREREQ = { zh: "先决条件", en: "Prerequisite" };

  /** "{darkvision} feet" -> "120 feet", from the trait's `params` defaults. */
  const fillTemplate = (text, params) =>
    text.replace(/\{(\w+)\}/g, (m, k) => (params?.[k]?.default != null ? String(params[k].default) : m));

  /** Text for the row's description; a feat's prerequisite goes on its first line. */
  R20U.traitDescription = function (entry, lang) {
    const t = (localized) => localized?.[lang] || localized?.en || "";
    const parts = [];
    const pre = t(entry.prerequisite);
    if (pre) parts.push(lang === "zh" ? `${PREREQ.zh}：${pre}` : `${PREREQ.en}: ${pre}`);
    if (t(entry.description)) parts.push(fillTemplate(t(entry.description), entry.params));
    return parts.join("\n\n");
  };

  /**
   * Species as picker entries: one per species without lineages, one per lineage otherwise
   * ("Elf (Drow Lineage)"). A lineage's traits replace the base trait they extend
   * (Darkvision -> Darkvision 120, "Elven Lineage" -> "Elven Lineage (Drow)").
   */
  R20U.speciesEntries = function (species) {
    return species.flatMap((s) => {
      // speciesId / speciesName / lineageName: for the species panel's two tile rows.
      const base = { ...s, kind: "species", speciesId: s.id, speciesName: s.name, lineageName: null };
      delete base.lineages;
      if (!s.lineages?.length) return [base];
      return s.lineages.map((l) => {
        const extends_ = (lt, b) => lt.name.en === b.name.en || lt.name.en.startsWith(`${b.name.en} (`);
        const used = new Set();
        const traits = s.traits.map((b) => {
          const lt = l.traits.find((x) => extends_(x, b));
          if (lt) used.add(lt);
          return lt || b;
        });
        traits.push(...l.traits.filter((lt) => !used.has(lt)));
        return {
          ...base,
          id: l.id,
          lineageName: l.name,
          name: l.traits[0]?.sourceType || { en: `${s.name.en} (${l.name.en})`, zh: `${s.name.zh}（${l.name.zh}）` },
          speed: l.speed ?? s.speed,
          senses: l.senses ?? s.senses,
          traits,
        };
      });
    });
  };

  /**
   * Values a trait's existing row must contain to count as up to date (e.g. ["120"] for
   * Darkvision 120); [] when any row with the trait's name will do.
   */
  R20U.traitParamValues = (trait) =>
    Object.values(trait.params || {}).filter((p) => p.default != null).map((p) => String(p.default));

  /**
   * Returns [attrName, value] pairs, in fill order (edit panel top to bottom).
   * Every field is written, so replacing one trait with another leaves nothing stale.
   * @param {object} entry  feat (or feat variant) / background
   * @param {"zh"|"en"} lang
   */
  R20U.traitToRowFields = function (entry, lang) {
    const t = (localized) => localized?.[lang] || localized?.en || "";
    return [
      ["name", t(entry.name)],
      ["source", entry.traitSource || "other"],
      ["source_type", t(entry.sourceType)],
      ["description", R20U.traitDescription(entry, lang)],
    ];
  };
})();
