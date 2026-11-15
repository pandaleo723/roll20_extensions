// Background service worker: loads the bundled data files and answers queries from the content
// scripts (content scripts on other origins can't read extension files directly without
// exposing them to the page).
//
// Message: { type: "GET_DATA", kind: "spells" | "items" | "feats" | ..., where?: { key: value } }
// Each kind is read from data/srd/<kind>.json, then data/local/<kind>.json if present
// (local entries override SRD ones with the same id).

const cache = new Map(); // kind -> Promise<entries[]>

async function loadKind(kind) {
  const byId = new Map();
  for (const dir of ["srd", "local"]) {
    const file = `data/${dir}/${kind}.json`;
    try {
      const res = await fetch(chrome.runtime.getURL(file));
      if (!res.ok) continue;
      for (const entry of await res.json()) byId.set(entry.id, entry);
      console.log(`[Roll20 Utils] loaded ${file}`);
    } catch {
      // data/local is optional and usually missing
    }
  }
  return [...byId.values()];
}

const KINDS = /^[a-z][a-z-]*$/; // file names only, never paths

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "GET_DATA" || !KINDS.test(message.kind || "")) return false;
  if (!cache.has(message.kind)) cache.set(message.kind, loadKind(message.kind));
  cache.get(message.kind).then((entries) => {
    const where = Object.entries(message.where || {});
    sendResponse(where.length ? entries.filter((e) => where.every(([k, v]) => e[k] === v)) : entries);
  });
  return true; // async response
});
