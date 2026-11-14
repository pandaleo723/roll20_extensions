// Adds 📖 buttons to supported spell sections:
//  - inside each row's edit panel (opened by the row's gear ⚙), so it only shows while editing
//    -> pick a spell and overwrite that row
//  - "📖 +" next to Roll20's "+Add" -> add a new row filled with the picked spell

var R20F = (globalThis.R20F ??= {});

/** Sections we support so far: Roll20 group name -> spell level. */
const SPELL_SECTIONS = {
  "repeating_spell-cantrip": 0,
};

const SECTION_TITLES = {
  0: { zh: "选择戏法", en: "Pick a cantrip" },
};

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

async function getLang() {
  try {
    const { lang } = await chrome.storage.sync.get("lang");
    return lang === "en" ? "en" : "zh";
  } catch {
    return "zh";
  }
}

function setLang(lang) {
  chrome.storage.sync.set({ lang }).catch(() => {});
}

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
  if (filling) {
    R20F.toast("请等待目前的填入完成 / Please wait for the current fill to finish");
    return;
  }
  const level = SPELL_SECTIONS[groupName];
  const [lang, spells] = await Promise.all([getLang(), getSpells(level)]);
  if (!spells?.length) {
    R20F.toast("No spell data loaded — run scripts/build-data.js");
    return;
  }
  R20F.openPicker({
    title: SECTION_TITLES[level]?.[lang] || `Level ${level}`,
    spells,
    lang,
    onLangChange: setLang,
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

function makeButton(text, title, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "r20f-btn";
  btn.textContent = text;
  btn.title = title;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick();
  });
  return btn;
}

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
        panel.prepend(
          makeButton("📖 从列表选择法术 / Pick from list", "", () => openSpellPicker(groupName, row))
        );
      });

    // "📖 +" next to Roll20's +Add: add a new row filled with the picked spell.
    const control = [...document.querySelectorAll(`.repcontrol[data-groupname="${groupName}"]`)].find(notPrint);
    if (control && !control.querySelector(".r20f-btn")) {
      const btn = makeButton("📖 +", "从列表新增 / Add from list", () => openSpellPicker(groupName, null));
      btn.classList.add("r20f-add");
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
