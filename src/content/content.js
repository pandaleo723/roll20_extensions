// Content script entry point. Runs in every Roll20 frame; the character sheet itself lives
// in a cross-origin iframe (storage.googleapis.com/roll20-cdn/.../legacy-sheets).
// Loaded last (see manifest): core helpers (fields.js, sheet.js, picker.js) and the modules
// (src/modules/*) have registered themselves by now.

console.log(R20U.LOG_PREFIX, "loaded in frame:", location.href.split("?")[0]);

/** Debug helper: summarise what form fields this frame contains. */
function describeFrame() {
  const fields = [...document.querySelectorAll("input, select, textarea")];
  return {
    frame: location.href.split("?")[0],
    totalFields: fields.length,
    attrFields: fields.filter((e) => e.name?.startsWith("attr_")).length,
    repeatingSections: [...document.querySelectorAll(".repcontainer[data-groupname]")].map(
      (c) => `${c.dataset.groupname} (${c.querySelectorAll(":scope > .repitem").length} rows)`
    ),
    nestedIframes: [...document.querySelectorAll("iframe")].map((f) => f.src.split("?")[0]),
    modules: R20U.modules.map((m) => m.id),
  };
}

const isSheetFrame = () => document.querySelector('[name^="attr_"]') !== null;

// The sheet renders some time after the frame loads: poll for it (up to 60s).
let sheetChecks = 0;
const sheetTimer = setInterval(() => {
  if (isSheetFrame()) {
    clearInterval(sheetTimer);
    console.log(R20U.LOG_PREFIX, "sheet frame summary:", describeFrame());
    // Settings changes in the popup (language, modules on/off) -> refresh the buttons.
    R20U.watchSettings(() => R20U.refreshModules());
    R20U.watchSheet();
    console.log(R20U.LOG_PREFIX, "detected classes:", R20U.detectClasses());
  } else if (++sheetChecks >= 60) {
    clearInterval(sheetTimer);
  }
}, 1000);

// Popup "Fill sheet" (whole-sheet JSON fill, debug)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FILL_SHEET") return false;

  const entries = Object.entries(message.data);
  // The message reaches every frame; only the frame that holds the sheet answers.
  if (R20U.countFields(document, entries.map(([k]) => k)) === 0) return false;

  R20U.fillFields(document, entries).then((result) => {
    console.log(R20U.LOG_PREFIX, "fill result:", result);
    sendResponse(result);
  });
  return true; // async response
});
