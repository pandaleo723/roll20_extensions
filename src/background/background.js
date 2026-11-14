// Background service worker: loads the bundled spell data and answers queries
// from the content script (content scripts on other origins can't read
// extension files directly without exposing them to the page).

const DATA_FILES = ["data/srd/spells.json", "data/local/spells.json"];

let spellsPromise = null;

async function loadSpells() {
  const byId = new Map();
  for (const file of DATA_FILES) {
    try {
      const res = await fetch(chrome.runtime.getURL(file));
      if (!res.ok) continue;
      for (const spell of await res.json()) byId.set(spell.id, spell); // later files override
      console.log(`[Roll20 Sheet Filler] loaded ${file}`);
    } catch {
      // data/local is optional and usually missing
    }
  }
  return [...byId.values()];
}

function getSpells() {
  spellsPromise ??= loadSpells();
  return spellsPromise;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_SPELLS") return false;
  getSpells().then((spells) => {
    const { level } = message;
    sendResponse(level == null ? spells : spells.filter((s) => s.level === level));
  });
  return true; // async response
});
