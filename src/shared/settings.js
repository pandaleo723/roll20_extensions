// Settings + labels shared by the popup and the content scripts (both load this file).

var R20U = (globalThis.R20U ??= {});

/** Spellcasting classes in the spell data; values match Roll20's attr_class options. */
R20U.SPELL_CLASSES = ["Artificer", "Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Warlock", "Wizard"];

R20U.CLASS_NAMES = {
  Artificer: { zh: "奇械师", en: "Artificer" },
  Bard: { zh: "吟游诗人", en: "Bard" },
  Cleric: { zh: "牧师", en: "Cleric" },
  Druid: { zh: "德鲁伊", en: "Druid" },
  Paladin: { zh: "圣武士", en: "Paladin" },
  Ranger: { zh: "游侠", en: "Ranger" },
  Sorcerer: { zh: "术士", en: "Sorcerer" },
  Warlock: { zh: "魔契师", en: "Warlock" },
  Wizard: { zh: "法师", en: "Wizard" },
};

R20U.SCHOOL_NAMES = {
  abjuration: { zh: "防护系", en: "Abjuration" },
  conjuration: { zh: "咒法系", en: "Conjuration" },
  divination: { zh: "预言系", en: "Divination" },
  enchantment: { zh: "附魔系", en: "Enchantment" },
  evocation: { zh: "塑能系", en: "Evocation" },
  illusion: { zh: "幻术系", en: "Illusion" },
  necromancy: { zh: "死灵系", en: "Necromancy" },
  transmutation: { zh: "变化系", en: "Transmutation" },
};

R20U.ABILITY_NAMES = {
  Strength: { zh: "力量", en: "Strength" },
  Dexterity: { zh: "敏捷", en: "Dexterity" },
  Constitution: { zh: "体质", en: "Constitution" },
  Intelligence: { zh: "智力", en: "Intelligence" },
  Wisdom: { zh: "感知", en: "Wisdom" },
  Charisma: { zh: "魅力", en: "Charisma" },
};

/**
 * Helper modules, shown in the popup with an on/off switch. Content-script code for each lives in
 * src/modules/<id>/ and registers itself with R20U.registerModule (src/content/sheet.js).
 */
R20U.MODULES = [
  {
    id: "spells",
    name: { zh: "法术选择器", en: "Spell picker" },
    desc: { zh: "在角色卡法术栏加入 📖 按钮，从列表选择并填入法术。", en: "📖 buttons in the sheet's spell sections: pick a spell from a list and fill the row." },
  },
];

/** Project links shown in the popup's beta notice. */
R20U.REPO_URL = "https://github.com/pandaleo723/roll20_extensions";
R20U.ISSUES_URL = `${R20U.REPO_URL}/issues`;

R20U.DEFAULT_SETTINGS = {
  lang: "zh", // language of the UI and of the game text: "zh" | "en"
  showAltName: true, // in picker lists, also show the name in the other language
  modules: { spells: true }, // module id -> enabled (missing = enabled)
  autoClass: true, // spells: filter the list by the class(es) detected on the sheet
  classFilter: [], // spells: classes to filter by when autoClass is off ([] = all classes)
};

/** UI text for the sheet buttons, messages and popup (single language, per settings.lang). */
R20U.UI_STRINGS = {
  zh: {
    pickFromList: "📖 从列表选择法术",
    addFromList: "从列表新增法术",
    waitFill: "请等待目前的填入完成",
    noData: "没有载入法术资料 — 请执行 scripts/build-data.js",
    // popup
    popupHint: "Roll20 小工具：开启的模块会在角色卡上加入 📖 按钮。",
    betaTitle: "测试版 (Beta)",
    betaText: "目前为测试版本，可能仍有问题。",
    betaIssues: "回报问题 / 建议新功能",
    betaRepo: "欢迎 Fork 并提交合并请求一起改进",
    settings: "通用设定",
    modulesTitle: "模块",
    language: "语言",
    showAltName: "列表同时显示英文名称",
    autoClass: "自动侦测角色职业并筛选",
    autoClassHint: "开启时，法术列表会按角色卡上的职业（含兼职）筛选。",
    manualClass: "手动职业筛选",
    manualClassHint: "都不勾选 = 显示全部职业",
    saved: "已保存",
    jsonFill: "JSON 填入（调试）",
    jsonHint: "填入整张角色卡的字段：在下方贴上 JSON，然后按「填入」。",
    jsonLabel: "角色资料 (JSON)",
    fill: "填入",
    sample: "载入范例",
  },
  en: {
    pickFromList: "📖 Pick from list",
    addFromList: "Add a spell from the list",
    waitFill: "Please wait for the current fill to finish",
    noData: "No spell data loaded — run scripts/build-data.js",
    popupHint: "Roll20 helpers: enabled modules add 📖 buttons to the character sheet.",
    betaTitle: "Beta",
    betaText: "This is a beta version and may still have issues.",
    betaIssues: "Report an issue / request a feature",
    betaRepo: "Fork it and send a pull request to help improve it",
    settings: "General",
    modulesTitle: "Modules",
    language: "Language",
    showAltName: "Also show Chinese names in lists",
    autoClass: "Auto-detect class & filter",
    autoClassHint: "On: the spell list is filtered by the class(es) on the sheet, incl. multiclass.",
    manualClass: "Manual class filter",
    manualClassHint: "None ticked = all classes",
    saved: "Saved",
    jsonFill: "JSON fill (debug)",
    jsonHint: "Fill whole-sheet fields: paste JSON below, then click Fill.",
    jsonLabel: "Character data (JSON)",
    fill: "Fill sheet",
    sample: "Load sample",
  },
};

/** UI strings for a language ("zh" by default). */
R20U.ui = (lang) => R20U.UI_STRINGS[lang === "en" ? "en" : "zh"];

/**
 * Live settings for long-running pages (content scripts): loaded once, then kept in sync with
 * chrome.storage changes made in the popup. `listener(settings)` runs on every change.
 */
R20U.settings = { ...R20U.DEFAULT_SETTINGS };
R20U.watchSettings = function (listener) {
  R20U.getSettings().then((s) => {
    Object.assign(R20U.settings, s);
    listener?.(R20U.settings);
  });
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      for (const [k, { newValue }] of Object.entries(changes)) {
        if (k in R20U.DEFAULT_SETTINGS) R20U.settings[k] = newValue ?? R20U.DEFAULT_SETTINGS[k];
      }
      listener?.(R20U.settings);
    });
  } catch {
    // no chrome.storage (e.g. the extension was reloaded under an open tab)
  }
};

R20U.getSettings = async function () {
  try {
    const stored = await chrome.storage.sync.get(Object.keys(R20U.DEFAULT_SETTINGS));
    return { ...R20U.DEFAULT_SETTINGS, ...stored };
  } catch {
    return { ...R20U.DEFAULT_SETTINGS };
  }
};

R20U.saveSettings = async function (patch) {
  try {
    await chrome.storage.sync.set(patch);
  } catch {
    // storage unavailable (e.g. extension reloaded under an open tab): ignore
  }
};
