// Content script: runs inside every frame of app.roll20.net
// (the character sheet usually lives in an iframe, hence "all_frames" in the manifest).

const LOG_PREFIX = "[Roll20 Sheet Filler]";
console.log(LOG_PREFIX, "loaded in frame:", location.href);

/**
 * Find the editable sheet fields for a Roll20 attribute name.
 * Legacy Roll20 sheets name their inputs "attr_<attribute>", e.g. attr_strength.
 * The same attribute often appears several times (PC / NPC / vehicle views,
 * hidden copies), so return every editable match, not just the first.
 */
function findFields(attrName) {
  const all = [
    ...document.querySelectorAll(
      `input[name="attr_${attrName}"], select[name="attr_${attrName}"], textarea[name="attr_${attrName}"]`
    ),
  ];
  return all.filter((el) => !el.readOnly && !el.disabled);
}

/** Set a value and fire the events Roll20 listens for, so the change is saved. */
function setFieldValue(el, value) {
  if (el.type === "checkbox") {
    el.checked = Boolean(value);
  } else if (el.type === "radio") {
    // Radios share a name; pick the one whose value matches.
    const radio = document.querySelector(
      `input[type="radio"][name="${el.name}"][value="${String(value)}"]`
    );
    if (!radio) return false;
    radio.checked = true;
    el = radio;
  } else {
    el.value = String(value);
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/** Fill every key of `data` whose field exists in this frame. */
function fillSheet(data) {
  const filled = [];
  const missing = [];
  for (const [attrName, value] of Object.entries(data)) {
    const els = findFields(attrName);
    // Radios share one name: setFieldValue picks the right one, so call it once.
    const targets = els[0]?.type === "radio" ? [els[0]] : els;
    const ok = targets.map((el) => setFieldValue(el, value)).some(Boolean);
    (ok ? filled : missing).push(attrName);
  }
  return { filled, missing };
}

/** Debug helper: summarise what form fields this frame contains. */
function describeFrame() {
  const fields = [...document.querySelectorAll("input, select, textarea")];
  return {
    frame: location.href.split("?")[0],
    totalFields: fields.length,
    attrFields: fields.filter((e) => e.name?.startsWith("attr_")).length,
    sampleFields: fields.slice(0, 25).map((e) => ({
      tag: e.tagName.toLowerCase(),
      type: e.type,
      name: e.name,
      id: e.id,
      class: String(e.className).slice(0, 60),
    })),
    nestedIframes: [...document.querySelectorAll("iframe")].map((f) => f.src.split("?")[0]),
    shadowHosts: [...document.querySelectorAll("*")].filter((e) => e.shadowRoot).length,
  };
}

// The sheet renders some time after the frame loads, so log a summary after a delay.
setTimeout(() => console.log(LOG_PREFIX, "frame summary:", describeFrame()), 5000);

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "FILL_SHEET") return false;

  const result = fillSheet(message.data);
  console.log(LOG_PREFIX, "fill result:", result);
  if (result.filled.length === 0) {
    console.log(LOG_PREFIX, "nothing filled here; frame summary:", describeFrame());
  }

  // The message reaches every frame; only the frame that actually holds
  // the sheet answers, so the popup gets a meaningful reply.
  if (result.filled.length > 0) {
    sendResponse(result);
  }
  return false;
});
