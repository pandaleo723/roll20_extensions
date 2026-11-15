// Runs in the harness page BEFORE the content scripts. Emulates the bits of Chrome and
// Roll20 the extension relies on, and records what Roll20 would actually save.

(() => {
  // ---- chrome.* stub -------------------------------------------------------
  const store = {};
  try {
    Object.assign(store, JSON.parse(localStorage.getItem("harness-sync") || "{}"));
  } catch {}
  let spellsPromise;
  const storageListeners = [];
  window.chrome = {
    storage: {
      onChanged: { addListener: (fn) => storageListeners.push(fn) },
      sync: {
        get: async (keys) => {
          if (keys == null) return { ...store };
          const list = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, store[k]]));
        },
        set: async (obj) => {
          const changes = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { oldValue: store[k], newValue: v }]));
          Object.assign(store, obj);
          storageListeners.forEach((fn) => fn(changes, "sync"));
          try {
            localStorage.setItem("harness-sync", JSON.stringify(store));
          } catch {}
        },
      },
    },
    runtime: {
      sendMessage: async (m) => {
        if (m?.type !== "GET_SPELLS") return undefined;
        spellsPromise ??= fetch("/harness/spells").then((r) => r.json());
        const spells = await spellsPromise;
        return m.level == null ? spells : spells.filter((s) => s.level === m.level);
      },
      onMessage: { addListener() {} },
    },
  };

  // ---- Roll20 save emulation ----------------------------------------------
  // Same logic as legacy-sheet-server.bundle.js: one change listener with a shared 500 ms debounce;
  // checkbox/radio bypass it only while a window is open.
  window.__saved = {}; // attribute -> value, or "repeating_x_<rowid>_attr" -> value
  window.__changesFired = 0;
  const log = [];
  let timer;
  const notDebounceable = (e) => ["radio", "checkbox"].includes(e?.target?.type);
  const save = (e) => {
    const el = e.target;
    const attr = (el.dataset.attrname || el.name.replace("attr_", "")).toLowerCase();
    const value = ["checkbox", "radio"].includes(el.type) && !el.checked ? "0" : el.value;
    const row = el.closest(".repitem");
    const group = el.closest(".repcontainer")?.dataset.groupname;
    const key = row && group ? `${group}_${row.dataset.reprowid}_${attr}` : attr;
    __saved[key] = value;
    log.unshift(`${key} = ${String(value).slice(0, 60).replace(/\n/g, " ")}`);
    renderBar();
    // Roll20 redraws every repeating row from saved data after each save (store subscription).
    queueMicrotask(populateRepeatingSections);
  };

  // ---- Roll20 row redraw emulation (populateRepeatingSections + fillAttributeValues) ----------
  // Each field gets its saved value, or its default when nothing is saved. Roll20's real defaults
  // come from its server; here we assume the worst: a select's first option, an input's value
  // attribute, a checkbox's checked attribute. Unsaved DOM edits are overwritten, like on Roll20.
  function defaultFor(el) {
    if (el.tagName === "SELECT") return el.querySelector("option[selected]")?.value ?? el.options[0]?.value;
    if (el.type === "checkbox") return el.defaultChecked ? el.value : undefined;
    return el.defaultValue || undefined;
  }
  function populateRepeatingSections() {
    for (const container of document.querySelectorAll(".repcontainer[data-groupname]")) {
      const group = container.dataset.groupname;
      for (const row of container.querySelectorAll(":scope > .repitem")) {
        for (const el of row.querySelectorAll('input[name^="attr_"], select[name^="attr_"], textarea[name^="attr_"]')) {
          if (el.type === "hidden" || el.type === "radio" || el.closest("fieldset")) continue;
          const attr = (el.dataset.attrname || el.name.replace("attr_", "")).toLowerCase();
          const stored = __saved[`${group}_${row.dataset.reprowid}_${attr}`];
          const v = [undefined, null, ""].includes(stored) && defaultFor(el) ? defaultFor(el) : stored;
          if (v === undefined || v === null) continue;
          if (el.type === "checkbox") el.checked = String(v) === el.value;
          else if (el.value !== String(v)) el.value = String(v);
        }
      }
    }
  }
  /** Pretend a row already has saved values (like an existing row on Roll20). */
  window.__seedRow = (row, values) => {
    const group = row.closest(".repcontainer").dataset.groupname;
    for (const [k, v] of Object.entries(values)) __saved[`${group}_${row.dataset.reprowid}_${k}`] = v;
    populateRepeatingSections();
  };
  const debounced = (f) => () => {
    if (timer) {
      if (notDebounceable(f)) return save(f);
      clearTimeout(timer);
      timer = setTimeout(() => {
        save(f);
        timer = undefined;
      }, 500);
    } else {
      save(f);
      timer = setTimeout(() => (timer = undefined), 500);
    }
  };
  document.addEventListener("change", (e) => {
    if (!e.target.name?.startsWith("attr_")) return;
    __changesFired++;
    debounced(e)();
  });

  // Roll20's app prevents its sheet <form> from submitting (buttons like +Add default to submit).
  document.addEventListener("submit", (e) => e.preventDefault(), true);

  // ---- repeating sections: containers + "+Add" ------------------------------
  let rowSeq = 0;
  function ensureRepeating() {
    for (const fs of document.querySelectorAll('fieldset[class*="repeating_"]')) {
      const group = [...fs.classList].find((c) => c.startsWith("repeating_"));
      fs.style.display = "none";
      let container = document.querySelector(`.repcontainer[data-groupname="${group}"]`);
      if (!container) {
        container = Object.assign(document.createElement("div"), { className: "repcontainer" });
        container.dataset.groupname = group;
        fs.after(container);
      }
      let control = document.querySelector(`.repcontrol[data-groupname="${group}"]`);
      if (!control) {
        control = Object.assign(document.createElement("div"), { className: "repcontrol" });
        control.dataset.groupname = group;
        control.innerHTML = '<button class="btn repcontrol_edit">Modify</button><button class="btn repcontrol_add">+Add</button>';
        container.after(control);
      }
      const add = control.querySelector(".repcontrol_add");
      if (add && !add.dataset.harness) {
        add.dataset.harness = "1";
        add.addEventListener("click", () =>
          setTimeout(() => {
            const row = Object.assign(document.createElement("div"), { className: "repitem" });
            row.dataset.reprowid = `-harness${++rowSeq}`;
            row.innerHTML = fs.innerHTML;
            container.append(row);
          }, 150)
        );
      }
    }
  }

  // ---- side bar showing saved values ----------------------------------------
  function renderBar() {
    const bar = document.getElementById("harness-bar");
    if (!bar) return;
    bar.innerHTML = `<b>Roll20 would save</b> <small>(${Object.keys(__saved).length} attrs, ${__changesFired} change events)</small>
      <button id="harness-clear">clear</button><ol></ol>`;
    bar.querySelector("ol").append(
      ...log.slice(0, 80).map((l) => Object.assign(document.createElement("li"), { textContent: l }))
    );
    bar.querySelector("#harness-clear").onclick = () => {
      log.length = 0;
      for (const k in __saved) delete __saved[k];
      __changesFired = 0;
      renderBar();
    };
  }

  // This script is placed after the sheet markup, so the DOM is already there.
  ensureRepeating();
  renderBar();
})();
