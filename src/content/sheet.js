// Core sheet helpers shared by all modules: reading sheet values, class detection, adding rows,
// the 📖 buttons, data access, and the module registry.

var R20U = (globalThis.R20U ??= {});

/** Roll20 also renders sections inside hidden print layouts (.printable); we skip those. */
R20U.notPrint = (el) => !el.closest(".printable");

/** The (non-repeating, non-print) sheet field for an attribute. */
R20U.sheetField = function (attrName) {
  return [...document.querySelectorAll(`[name="attr_${attrName}"]`)].find(
    (e) => R20U.notPrint(e) && !e.closest(".repitem") && !e.closest("fieldset") && "value" in e
  );
};

/** The interactive (non-print) container / rows of a repeating section. */
R20U.sectionContainer = (groupName) =>
  [...document.querySelectorAll(`.repcontainer[data-groupname="${groupName}"]`)].find(R20U.notPrint);
R20U.sectionRows = (groupName) => [...(R20U.sectionContainer(groupName)?.querySelectorAll(":scope > .repitem") || [])];

/** Wizard-list subclasses of non-caster classes (Eldritch Knight, Arcane Trickster). */
const WIZARD_SUBCLASS = /eldritch knight|arcane trickster|奥法骑士|奧法騎士|诡术师|詭術師/i;

/**
 * Spellcasting classes of the character: main class (attr_class) plus enabled multiclasses
 * (attr_multiclassN_flag + attr_multiclassN). Values are English (Roll20 option values).
 */
R20U.detectClasses = function () {
  const found = new Set();
  const add = (cls, subclass) => {
    if (R20U.SPELL_CLASSES.includes(cls)) found.add(cls);
    else if (WIZARD_SUBCLASS.test(subclass || "")) found.add("Wizard");
  };
  add(R20U.sheetField("class")?.value, R20U.sheetField("subclass")?.value);
  for (const i of [1, 2, 3]) {
    const flag = R20U.sheetField(`multiclass${i}_flag`);
    const on = flag && (flag.type === "checkbox" ? flag.checked : flag.value && flag.value !== "0");
    if (on) add(R20U.sheetField(`multiclass${i}`)?.value, R20U.sheetField(`multiclass${i}_subclass`)?.value);
  }
  return [...found];
};

/** Click Roll20's "+Add" for a section and resolve with the new row element. */
R20U.addRow = function (groupName) {
  const container = R20U.sectionContainer(groupName);
  const addBtn = [...document.querySelectorAll(`.repcontrol[data-groupname="${groupName}"] .repcontrol_add`)].find(R20U.notPrint);
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
};

/** Data from the background worker: `kind` = "spells" | "items" | ..., `where` = equality filter. */
R20U.getData = (kind, where) => chrome.runtime.sendMessage({ type: "GET_DATA", kind, where });

// ---- filling with progress (one fill at a time) -------------------------------------------

let filling = false;
R20U.isFilling = () => filling;

/**
 * Fill a row with a progress toast. `fields` = [attrName, value] pairs (see R20U.fillFields).
 * @param {string} displayName  shown in the toast
 */
R20U.fillWithProgress = async function (row, fields, displayName, lang) {
  const zh = lang !== "en";
  const progress = R20U.toast(zh ? `正在填入 ${displayName}…` : `Filling ${displayName}…`, 0);
  filling = true;
  try {
    const result = await R20U.fillFields(row, fields, (done, total) => {
      progress.textContent = zh ? `正在填入 ${displayName}… ${done}/${total}` : `Filling ${displayName}… ${done}/${total}`;
    });
    console.log(R20U.LOG_PREFIX, `filled ${displayName}:`, result);
    const msg = zh ? `已填入 ${displayName}` : `Filled ${displayName}`;
    R20U.toast(
      result.missing.length
        ? `${msg}（${zh ? "未找到字段" : "fields not found"}: ${result.missing.join(", ")}）`
        : msg,
      result.missing.length ? 6000 : 2500
    );
    return result;
  } finally {
    filling = false;
  }
};

// ---- 📖 buttons ---------------------------------------------------------------------------

// One stylesheet for our buttons (inline "all: initial" would expand into a huge style attribute).
const BUTTON_CSS = `
  .r20u-btn {
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
  .r20u-btn:hover { background: #fbeaea; }
  .r20u-btn.r20u-add { margin: 0 0 0 6px; padding: 2px 6px; vertical-align: middle; }
  @media print { .r20u-btn { display: none !important; } }
`;

function ensureButtonStyle() {
  if (document.getElementById("r20u-style")) return;
  const style = document.createElement("style");
  style.id = "r20u-style";
  style.textContent = BUTTON_CSS;
  document.head.appendChild(style);
}

/**
 * A button owned by a module. `label()` returns { text, title } in the current language and is
 * re-run when the language changes.
 */
R20U.makeButton = function (moduleId, kind, label, onClick) {
  ensureButtonStyle();
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `r20u-btn r20u-${kind}`;
  btn.dataset.module = moduleId;
  btn._r20uLabel = label;
  applyLabel(btn);
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
};

function applyLabel(btn) {
  const { text, title = "" } = btn._r20uLabel();
  btn.textContent = text;
  btn.title = title;
}

/**
 * Standard buttons for repeating sections:
 *  - inside each row's edit panel (opened by the row's gear ⚙) -> onRow(groupName, row)
 *  - next to Roll20's "+Add" ("📖 +")                        -> onAdd(groupName)
 * `rowPanel` = selector of the row's edit panel (default ".options"; the inventory uses
 * ".subitem", shown by the row's "i" toggle). Idempotent; skips print layouts.
 */
R20U.injectSectionButtons = function (moduleId, groupNames, { rowLabel, addLabel, onRow, onAdd, rowPanel = ".options" }) {
  for (const groupName of groupNames) {
    for (const row of R20U.sectionRows(groupName)) {
      if (row.querySelector(`.r20u-btn[data-module="${moduleId}"]`)) continue;
      const panel = row.querySelector(rowPanel); // only visible while the gear / "i" is open
      if (panel) panel.prepend(R20U.makeButton(moduleId, "row", rowLabel, () => onRow(groupName, row)));
    }
    const control = [...document.querySelectorAll(`.repcontrol[data-groupname="${groupName}"]`)].find(R20U.notPrint);
    if (control && !control.querySelector(`.r20u-btn[data-module="${moduleId}"]`)) {
      const btn = R20U.makeButton(moduleId, "add", addLabel, () => onAdd(groupName));
      const addBtn = control.querySelector(".repcontrol_add");
      if (addBtn) addBtn.after(btn);
      else control.append(btn);
    }
  }
};

// ---- module registry ----------------------------------------------------------------------

/**
 * Modules register here; the entry point (content.js) runs them.
 * @param {{ id: string, inject: () => void }} mod  inject() adds the module's buttons (idempotent)
 */
R20U.modules = [];
R20U.registerModule = (mod) => R20U.modules.push(mod);

const moduleEnabled = (id) => R20U.settings.modules?.[id] !== false;

/** Add buttons for enabled modules, remove those of disabled ones, relabel for the language. */
R20U.refreshModules = function () {
  for (const mod of R20U.modules) {
    if (moduleEnabled(mod.id)) mod.inject();
    else document.querySelectorAll(`.r20u-btn[data-module="${mod.id}"]`).forEach((b) => b.remove());
  }
  document.querySelectorAll(".r20u-btn").forEach((b) => b._r20uLabel && applyLabel(b));
};

/** Re-run refreshModules (debounced) whenever the sheet DOM changes, e.g. a new row. */
R20U.watchSheet = function () {
  let pending = false;
  new MutationObserver(() => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      R20U.refreshModules();
    }, 300);
  }).observe(document.body, { childList: true, subtree: true });
  R20U.refreshModules();
};
