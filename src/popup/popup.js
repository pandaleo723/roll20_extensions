// Popup: lets the user paste character JSON and sends it to the content script.

const STORAGE_KEY = "lastCharacterJson";

// Keys are Roll20 attribute names WITHOUT the "attr_" prefix.
// Check real names by right-clicking a sheet field > Inspect.
const SAMPLE = {
  character_name: "Thalia Brightbow",
  strength: 10,
  dexterity: 16,
  constitution: 14,
  intelligence: 12,
  wisdom: 13,
  charisma: 8,
  hp: 24,
  hp_max: 24,
  ac: 15,
};

const dataEl = document.getElementById("data");
const statusEl = document.getElementById("status");

function setStatus(text, kind = "") {
  statusEl.textContent = text;
  statusEl.className = kind;
}

// Restore whatever was pasted last time.
chrome.storage.local.get(STORAGE_KEY).then((stored) => {
  dataEl.value = stored[STORAGE_KEY] ?? "";
});

// ---- Settings (shared with the in-sheet picker via chrome.storage.sync) ----
const langEl = document.getElementById("lang");
const altEl = document.getElementById("showAltName");
const autoEl = document.getElementById("autoClass");
const classBox = document.getElementById("classBox");
const classesEl = document.getElementById("classes");
const savedEl = document.getElementById("saved");

let savedTimer;
async function save(patch) {
  await R20U.saveSettings(patch);
  savedEl.textContent = R20U.ui(langEl.value).saved;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (savedEl.textContent = ""), 1500);
}

function selectedClasses() {
  return [...classesEl.querySelectorAll("input:checked")].map((cb) => cb.value);
}

/** Show every label in the chosen language only. */
function applyLanguage(lang) {
  const ui = R20U.ui(lang);
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = ui[el.dataset.i18n] ?? ""));
  classesEl.querySelectorAll("[data-class]").forEach((el) => (el.textContent = R20U.CLASS_NAMES[el.dataset.class][lang]));
  for (const mod of R20U.MODULES) {
    const card = document.querySelector(`.module[data-module="${mod.id}"]`);
    if (!card) continue;
    card.querySelector(".module-name").textContent = mod.name[lang];
    card.querySelector(".module-desc").textContent = mod.desc[lang];
  }
  renderBeta(ui);
}

/** Yellow beta notice with links to the issue tracker and the repository. */
function renderBeta(ui) {
  const box = document.getElementById("beta");
  const link = (href, text) => Object.assign(document.createElement("a"), { href, textContent: text, target: "_blank", rel: "noopener" });
  const title = Object.assign(document.createElement("strong"), { textContent: ui.betaTitle });
  const items = document.createElement("ul");
  for (const a of [link(R20U.ISSUES_URL, ui.betaIssues), link(R20U.REPO_URL, ui.betaRepo)]) {
    const li = document.createElement("li");
    li.append(a);
    items.append(li);
  }
  box.replaceChildren(title, document.createTextNode(" " + ui.betaText), items);
}

// Chrome adds "update_url" to the manifest of Web Store installs; unpacked (local/dev) builds
// have none. The JSON fill is a debug tool, so it only shows in local builds.
const isStoreInstall = "update_url" in chrome.runtime.getManifest();
// Hidden rather than removed: the code below still wires up its buttons.
if (isStoreInstall) document.getElementById("debug").hidden = true;

/** Module cards: the switch enables/disables the module; its settings fade when it's off. */
function setupModules(s) {
  for (const mod of R20U.MODULES) {
    const card = document.querySelector(`.module[data-module="${mod.id}"]`);
    if (!card) continue;
    const toggle = card.querySelector(".module-toggle");
    const settingsBox = card.querySelector(".module-settings");
    const sync = () => settingsBox?.classList.toggle("off", !toggle.checked);
    toggle.checked = s.modules?.[mod.id] !== false;
    sync();
    toggle.addEventListener("change", async () => {
      sync();
      const { modules = {} } = await R20U.getSettings();
      save({ modules: { ...modules, [mod.id]: toggle.checked } });
    });
  }
}

R20U.getSettings().then((s) => {
  langEl.value = s.lang === "en" ? "en" : "zh";
  altEl.checked = s.showAltName;
  autoEl.checked = s.autoClass;
  setupModules(s);
  classesEl.replaceChildren(
    ...R20U.SPELL_CLASSES.map((c) => {
      const label = document.createElement("label");
      label.className = "check";
      const cb = Object.assign(document.createElement("input"), { type: "checkbox", value: c });
      cb.checked = s.classFilter.includes(c);
      cb.addEventListener("change", () => save({ classFilter: selectedClasses() }));
      const name = document.createElement("span");
      name.dataset.class = c;
      label.append(cb, name);
      return label;
    })
  );
  classBox.hidden = s.autoClass; // manual filter only matters when auto-detect is off
  applyLanguage(langEl.value);
});

langEl.addEventListener("change", () => {
  applyLanguage(langEl.value);
  save({ lang: langEl.value });
});
altEl.addEventListener("change", () => save({ showAltName: altEl.checked }));
autoEl.addEventListener("change", () => {
  classBox.hidden = autoEl.checked;
  save({ autoClass: autoEl.checked });
});

// Popup -> options page (the same page in a tab; manifest "options_ui"). Hidden there by CSS.
document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("sample").addEventListener("click", () => {
  dataEl.value = JSON.stringify(SAMPLE, null, 2);
});

document.getElementById("fill").addEventListener("click", async () => {
  let data;
  try {
    data = JSON.parse(dataEl.value);
  } catch (err) {
    setStatus(`Invalid JSON: ${err.message}`, "error");
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: dataEl.value });

  // Note: tab.url is not available without the "tabs" permission, so we don't
  // check the URL here; if no Roll20 frame answers, the catch below reports it.
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("No active tab found.", "error");
    return;
  }

  try {
    const result = await chrome.tabs.sendMessage(tab.id, { type: "FILL_SHEET", data });
    if (!result) throw new Error("no sheet answered");
    const lines = [`Filled ${result.filled.length}: ${result.filled.join(", ")}`];
    if (result.missing.length) lines.push(`Not found: ${result.missing.join(", ")}`);
    setStatus(lines.join("\n"), "ok");
  } catch {
    setStatus(
      "No character sheet fields found.\n" +
        "- Is a character sheet open?\n" +
        "- Did you refresh the Roll20 tab after loading the extension?\n" +
        "- Do the JSON keys match the sheet's attr_ names?",
      "error"
    );
  }
});
