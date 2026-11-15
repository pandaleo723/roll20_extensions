// Traits module: maps a feat or background (data/*/feats.json, backgrounds.json) onto the fields
// of a Roll20 "D&D 5E by Roll20" Features & Traits row (repeating_traits).
//
// Row edit panel, top to bottom: name, source (dropdown, options carry only data-i18n keys
// racial/class/feat/background/item/other; matched by key in fields.js), source_type, description.

var R20U = (globalThis.R20U ??= {});

(() => {
  const PREREQ = { zh: "先决条件", en: "Prerequisite" };

  /** Text for the row's description; a feat's prerequisite goes on its first line. */
  R20U.traitDescription = function (entry, lang) {
    const t = (localized) => localized?.[lang] || localized?.en || "";
    const parts = [];
    const pre = t(entry.prerequisite);
    if (pre) parts.push(lang === "zh" ? `${PREREQ.zh}：${pre}` : `${PREREQ.en}: ${pre}`);
    if (t(entry.description)) parts.push(t(entry.description));
    return parts.join("\n\n");
  };

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
