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
  await R20F.saveSettings(patch);
  savedEl.textContent = R20F.ui(langEl.value).saved;
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (savedEl.textContent = ""), 1500);
}

function selectedClasses() {
  return [...classesEl.querySelectorAll("input:checked")].map((cb) => cb.value);
}

/** Show every label in the chosen language only. */
function applyLanguage(lang) {
  const ui = R20F.ui(lang);
  document.documentElement.lang = lang;
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = ui[el.dataset.i18n] ?? ""));
  classesEl.querySelectorAll("[data-class]").forEach((el) => (el.textContent = R20F.CLASS_NAMES[el.dataset.class][lang]));
}

R20F.getSettings().then((s) => {
  langEl.value = s.lang === "en" ? "en" : "zh";
  altEl.checked = s.showAltName;
  autoEl.checked = s.autoClass;
  classesEl.replaceChildren(
    ...R20F.SPELL_CLASSES.map((c) => {
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
  classBox.disabled = s.autoClass;
  applyLanguage(langEl.value);
});

langEl.addEventListener("change", () => {
  applyLanguage(langEl.value);
  save({ lang: langEl.value });
});
altEl.addEventListener("change", () => save({ showAltName: altEl.checked }));
autoEl.addEventListener("change", () => {
  classBox.disabled = autoEl.checked;
  save({ autoClass: autoEl.checked });
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
