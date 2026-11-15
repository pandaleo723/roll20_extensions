// Adds 📖 buttons to supported spell sections:
//  - inside each row's edit panel (opened by the row's gear ⚙), so it only shows while editing
//    -> pick a spell and overwrite that row
//  - "📖 +" next to Roll20's "+Add" -> add a new row filled with the picked spell

var R20F = (globalThis.R20F ??= {});

/** Sections we support so far: Roll20 group name -> spell level. */
const SPELL_SECTIONS = {
  "repeating_spell-cantrip": 0,
  "repeating_spell-1": 1,
  "repeating_spell-2": 2,
  "repeating_spell-3": 3,
  "repeating_spell-4": 4,
  "repeating_spell-5": 5,
  "repeating_spell-6": 6,
  "repeating_spell-7": 7,
  "repeating_spell-8": 8,
  "repeating_spell-9": 9,
};

/** Both languages, so the picker title follows its 中/EN toggle. */
const sectionTitle = (level) =>
  level === 0
    ? { zh: "选择戏法", en: "Pick a cantrip" }
    : { zh: `选择 ${level} 环法术`, en: `Pick a level ${level} spell` };

// One stylesheet for our buttons (inline "all: initial" would expand into a huge style attribute).
const BUTTON_CSS = `
  .r20f-btn {
    all: initial;
    display: inline-block;
    margin: 4px 0 6px;
    cursor: pointer;
    font: 13px/1.2 system-ui, "Microsoft JhengHei", sans-serif;
    color: #b5121b;
    padding: 3px 8px;
    border-radius: 4px;
    background: #fff;
    border: 1px solid #b5121b;
    box-shadow: 0 1px 3px rgba(0,0,0,.2);
  }
  .r20f-btn:hover { background: #fbeaea; }
  .r20f-btn.r20f-add { margin: 0 0 0 6px; padding: 2px 6px; vertical-align: middle; }
  @media print { .r20f-btn { display: none !important; } }
`;

function ensureButtonStyle() {
  if (document.getElementById("r20f-style")) return;
  const style = document.createElement("style");
  style.id = "r20f-style";
  style.textContent = BUTTON_CSS;
  document.head.appendChild(style);
}

/** The (non-repeating, non-print) sheet field for an attribute. */
function sheetField(attrName) {
  return [...document.querySelectorAll(`[name="attr_${attrName}"]`)].find(
    (e) => !e.closest(".printable") && !e.closest(".repitem") && !e.closest("fieldset") && "value" in e
  );
}

/** Wizard-list subclasses of non-caster classes (Eldritch Knight, Arcane Trickster). */
const WIZARD_SUBCLASS = /eldritch knight|arcane trickster|奥法骑士|奧法騎士|诡术师|詭術師/i;

/**
 * Spellcasting classes of the character: main class (attr_class) plus enabled multiclasses
 * (attr_multiclassN_flag + attr_multiclassN). Values are English (Roll20 option values).
 */
R20F.detectClasses = function () {
  const found = new Set();
  const add = (cls, subclass) => {
    if (R20F.SPELL_CLASSES.includes(cls)) found.add(cls);
    else if (WIZARD_SUBCLASS.test(subclass || "")) found.add("Wizard");
  };
  add(sheetField("class")?.value, sheetField("subclass")?.value);
  for (const i of [1, 2, 3]) {
    const flag = sheetField(`multiclass${i}_flag`);
    const on = flag && (flag.type === "checkbox" ? flag.checked : flag.value && flag.value !== "0");
    if (on) add(sheetField(`multiclass${i}`)?.value, sheetField(`multiclass${i}_subclass`)?.value);
  }
  return [...found];
};

async function getSpells(level) {
  return chrome.runtime.sendMessage({ type: "GET_SPELLS", level });
}

let filling = false;

async function fillRow(row, spell, lang) {
  const name = spell.name[lang];
  const progress = R20F.toast(lang === "zh" ? `正在填入 ${name}…` : `Filling ${name}…`, 0);
  filling = true;
  try {
    const result = await R20F.fillFields(row, R20F.spellToRowFields(spell, lang), (done, total) => {
      progress.textContent = lang === "zh" ? `正在填入 ${name}… ${done}/${total}` : `Filling ${name}… ${done}/${total}`;
    });
    console.log(R20F.LOG_PREFIX, `filled ${spell.name.en}:`, result);
    const msg = lang === "zh" ? `已填入 ${name}` : `Filled ${name}`;
    R20F.toast(
      result.missing.length
        ? `${msg}（${lang === "zh" ? "未找到字段" : "fields not found"}: ${result.missing.join(", ")}）`
        : msg,
      result.missing.length ? 6000 : 2500
    );
  } finally {
    filling = false;
  }
}

const notPrint = (el) => !el.closest(".printable");

/** Click Roll20's "+Add" and resolve with the new row element. */
function addRow(groupName) {
  const container = [...document.querySelectorAll(`.repcontainer[data-groupname="${groupName}"]`)].find(notPrint);
  const addBtn = [...document.querySelectorAll(`.repcontrol[data-groupname="${groupName}"] .repcontrol_add`)].find(notPrint);
  if (!container || !addBtn) return Promise.reject(new Error(`can't find +Add for ${groupName}`));

  const before = new Set(container.querySelectorAll(":scope > .repitem"));
  addBtn.click();

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const check = () => {
      const added = [...container.querySelectorAll(":scope > .repitem")].find((r) => !before.has(r));
      if (added) return resolve(added);
      if (Date.now() - started > 3000) return reject(new Error("new row did not appear"));
      setTimeout(check, 50);
    };
    check();
  });
}

/** @param {Element|null} row  row to overwrite, or null to add a new row first */
async function openSpellPicker(groupName, row) {
  const ui = R20F.ui(R20F.settings.lang);
  if (filling) {
    R20F.toast(ui.waitFill);
    return;
  }
  const level = SPELL_SECTIONS[groupName];
  const [settings, spells] = await Promise.all([R20F.getSettings(), getSpells(level)]);
  if (!spells?.length) {
    R20F.toast(ui.noData);
    return;
  }
  // Read the class when the picker opens, so a class change on the sheet is picked up.
  const detected = settings.autoClass ? R20F.detectClasses() : [];

  // Spell names already in this section: the row being edited is "current", the others "chosen".
  const nameOf = (r) => R20F.editableFields(r, "spellname")[0]?.value?.trim() || "";
  const container = [...document.querySelectorAll(`.repcontainer[data-groupname="${groupName}"]`)].find(notPrint);
  const otherNames = [...(container?.querySelectorAll(":scope > .repitem") || [])]
    .filter((r) => r !== row)
    .map(nameOf)
    .filter(Boolean);

  R20F.openPicker({
    currentName: row ? nameOf(row) : "",
    chosenNames: otherNames,
    title: sectionTitle(level),
    spells,
    lang: settings.lang === "en" ? "en" : "zh",
    classes: settings.autoClass ? detected : settings.classFilter,
    detectedClasses: detected,
    showAltName: settings.showAltName,
    onAltToggle: (showAltName) => R20F.saveSettings({ showAltName }),
    onPick: async (spell, pickedLang) => {
      try {
        await fillRow(row || (await addRow(groupName)), spell, pickedLang);
      } catch (err) {
        console.warn(R20F.LOG_PREFIX, err);
        R20F.toast(String(err.message || err));
      }
    },
  });
}

/**
 * @param {string} kind  "row" (text = pickFromList) or "add" (text "📖 +", title = addFromList);
 *                       labels come from R20F.UI_STRINGS and follow the language setting.
 */
function makeButton(kind, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `r20f-btn r20f-${kind}`;
  labelButton(btn);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

function labelButton(btn) {
  const ui = R20F.ui(R20F.settings.lang);
  if (btn.classList.contains("r20f-add")) {
    btn.textContent = "📖 +";
    btn.title = ui.addFromList;
  } else {
    btn.textContent = ui.pickFromList;
  }
}

/** Re-label existing buttons after the language setting changes in the popup. */
R20F.relabelButtons = () => document.querySelectorAll(".r20f-btn").forEach(labelButton);

/** Idempotent: adds any missing buttons. Called on load and whenever the sheet DOM changes. */
R20F.injectSectionButtons = function () {
  ensureButtonStyle();
  for (const groupName of Object.keys(SPELL_SECTIONS)) {
    document
      .querySelectorAll(`.repcontainer[data-groupname="${groupName}"] > .repitem`)
      .forEach((row) => {
        // The sheet also renders each section inside hidden print layouts; skip those.
        if (row.closest(".printable")) return;
        if (row.querySelector(".r20f-btn")) return;
        // The gear's edit panel; it is only visible while the gear is open.
        const panel = row.querySelector(".options");
        if (!panel) return;
        panel.prepend(makeButton("row", () => openSpellPicker(groupName, row)));
      });

    // "📖 +" next to Roll20's +Add: add a new row filled with the picked spell.
    const control = [...document.querySelectorAll(`.repcontrol[data-groupname="${groupName}"]`)].find(notPrint);
    if (control && !control.querySelector(".r20f-btn")) {
      const btn = makeButton("add", () => openSpellPicker(groupName, null));
      const addBtn = control.querySelector(".repcontrol_add");
      if (addBtn) addBtn.after(btn);
      else control.append(btn);
    }
  }
};

R20F.watchSections = function () {
  let pending = false;
  const run = () => {
    pending = false;
    R20F.injectSectionButtons();
  };
  new MutationObserver(() => {
    if (!pending) {
      pending = true;
      setTimeout(run, 300);
    }
  }).observe(document.body, { childList: true, subtree: true });
  run();
};
