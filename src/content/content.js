// Content script entry point. Runs in every Roll20 frame; the character sheet itself lives
// in a cross-origin iframe (storage.googleapis.com/roll20-cdn/.../legacy-sheets).
// Helpers come from fields.js, spells.js, picker.js and sections.js (loaded first, see manifest).

console.log(R20F.LOG_PREFIX, "loaded in frame:", location.href.split("?")[0]);

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
  };
}

const isSheetFrame = () => document.querySelector('[name^="attr_"]') !== null;

// The sheet renders some time after the frame loads: poll for it (up to 60s).
let sheetChecks = 0;
const sheetTimer = setInterval(() => {
  if (isSheetFrame()) {
    clearInterval(sheetTimer);
    console.log(R20F.LOG_PREFIX, "sheet frame summary:", describeFrame());
    R20F.watchSections();
  } else if (++sheetChecks >= 60) {
    clearInterval(sheetTimer);
  }
}, 1000);

// Popup "Fill sheet" (whole-sheet JSON fill)
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FILL_SHEET") return false;

  const entries = Object.entries(message.data);
  // The message reaches every frame; only the frame that holds the sheet answers.
  if (R20F.countFields(document, entries.map(([k]) => k)) === 0) return false;

  R20F.fillFields(document, entries).then((result) => {
    console.log(R20F.LOG_PREFIX, "fill result:", result);
    sendResponse(result);
  });
  return true; // async response
});
