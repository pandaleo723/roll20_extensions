// Shared helpers for reading/writing Roll20 legacy sheet fields.
// Content script files share one scope, so everything hangs off a single namespace.

var R20U = (globalThis.R20U ??= {});

R20U.LOG_PREFIX = "[Roll20 Utils]";

/*
 * How Roll20 saves edits (from legacy-sheet-server bundle):
 *  1. ONE change listener on the sheet, wrapped in a shared 500 ms debounce. A change with no
 *     window open saves immediately and opens a window; a change inside the window replaces the
 *     pending one (saved at the end), so earlier ones in a burst are lost. Checkbox/radio changes
 *     inside an open window save immediately and don't touch the window.
 *  2. After every save, populateRepeatingSections() redraws ALL repeating rows from the saved
 *     data: a field gets its saved value, or the section default when nothing is saved. Any value
 *     we put in the DOM but haven't saved yet is overwritten (dropdowns revert to defaults, text on
 *     existing rows reverts to the old text).
 *
 * So: one text/select change at a time, each with no window open (= saved immediately), and the
 * DOM value is set right before its own change event. Checkboxes ride along right after a paced
 * change, while its window is open.
 */
const DEBOUNCE_GAP_MS = 560;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Inputs for a Roll20 attribute inside `root` (whole document or one repeating row).
 * Legacy sheets name inputs "attr_<attribute>". The same attribute can appear several times
 * (visible input + hidden mirror, PC/NPC views...). Hidden mirrors are skipped when a real
 * input exists, so e.g. a checkbox isn't overwritten through its hidden copy.
 */
R20U.editableFields = function (root, attrName) {
  const all = [
    ...root.querySelectorAll(
      `input[name="attr_${attrName}"], select[name="attr_${attrName}"], textarea[name="attr_${attrName}"]`
    ),
  ].filter((el) => !el.readOnly && !el.disabled);
  const visible = all.filter((el) => el.type !== "hidden");
  return visible.length ? visible : all;
};

/** The DOM value `el` should get for `value`, or null if impossible (e.g. no such option). */
function resolveValue(el, value) {
  if (el.type === "checkbox") return Boolean(value);
  if (el.tagName === "SELECT") {
    // Match option value first, then value/label ignoring case.
    const want = String(value).trim().toLowerCase();
    const opts = [...el.options];
    const opt =
      opts.find((o) => o.value === String(value)) ||
      opts.find((o) => o.value.trim().toLowerCase() === want || o.text.trim().toLowerCase() === want);
    if (!opt) {
      console.warn(R20U.LOG_PREFIX, `no option "${value}" in ${el.name}; options:`,
        opts.map((o) => `${o.value}=${o.text.trim()}`));
      return null;
    }
    return opt.value;
  }
  return String(value);
}

const currentValue = (el) => (el.type === "checkbox" ? el.checked : el.value);

/** What the field shows when nothing is saved: the template's selected/first option, checked state or value. */
function defaultValue(el) {
  if (el.type === "checkbox") return el.defaultChecked;
  if (el.tagName === "SELECT") return (el.querySelector("option[selected]") || el.options[0])?.value;
  return el.defaultValue;
}

function setValue(el, v) {
  if (el.type === "checkbox") el.checked = v;
  else el.value = v;
}

function fireChange(el) {
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Fill attributes inside `root`, paced so Roll20 saves every one.
 * @param {Element|Document} root
 * @param {Array<[string, any]>} data  [attrName, value] pairs, filled in this order
 *                                     (put fields that trigger sheet workers last)
 * @param {(done: number, total: number) => void} [onProgress]
 */
R20U.fillFields = async function (root, data, onProgress) {
  const filled = [];
  const missing = [];
  const instant = []; // checkbox jobs
  const paced = []; // text / select / textarea jobs

  for (const [attrName, value] of data) {
    const els = R20U.editableFields(root, attrName).filter((el) => el.type !== "radio");
    const target = els.length ? resolveValue(els[0], value) : null;
    if (target === null) {
      missing.push(attrName);
      continue;
    }
    filled.push(attrName);
    (els[0].type === "checkbox" ? instant : paced).push({ els, target });
  }

  // Set every copy of the field right before firing; Roll20 needs one change event per attribute.
  // Returns false when the field already shows the target value (nothing to save).
  const apply = ({ els, target }) => {
    // Skip only when the field shows the target AND that can't just be its unsaved default:
    // a new row's dropdown shows its first option (e.g. abjuration) without Roll20 having it saved.
    const alreadySaved =
      els.every((el) => currentValue(el) === target) &&
      (target !== defaultValue(els[0]) || (target === "" && els[0].tagName !== "SELECT"));
    if (alreadySaved) return false;
    els.forEach((el) => setValue(el, target));
    return true;
  };

  let done = 0;
  const total = paced.length;
  for (const job of paced) {
    if (apply(job)) {
      fireChange(job.els[0]);
      // Checkboxes save immediately while this change's debounce window is open.
      instant.splice(0).forEach((cb) => apply(cb) && fireChange(cb.els[0]));
      await sleep(DEBOUNCE_GAP_MS);
    }
    onProgress?.(++done, total);
  }
  // Only checkboxes changed (or none of the paced fields needed a save).
  for (const cb of instant) {
    if (apply(cb)) {
      fireChange(cb.els[0]);
      await sleep(DEBOUNCE_GAP_MS);
    }
  }
  return { filled, missing };
};

/** How many of these attributes exist in `root` (cheap, synchronous). */
R20U.countFields = (root, attrNames) =>
  attrNames.filter((n) => R20U.editableFields(root, n).length).length;
