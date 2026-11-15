// Generic in-sheet picker overlay: a searchable list shown inside the sheet iframe, used by every
// module (spells, items, features, ...). Rendered in a shadow root so the sheet's CSS doesn't
// leak in (or ours out). Modules supply how a row and its details look; the picker handles
// search, filter chips, ⓘ details, [Current]/[Chosen] marks, duplicate confirmation, keyboard.

var R20U = (globalThis.R20U ??= {});

const PICKER_CSS = `
  :host { all: initial; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483646;
    background: rgba(0,0,0,.35);
    display: flex; align-items: flex-start; justify-content: center;
    font: 13px/1.4 system-ui, "Microsoft JhengHei", "PingFang TC", sans-serif;
  }
  .panel {
    position: relative;
    margin-top: 40px; width: min(480px, calc(100vw - 32px)); max-height: calc(100vh - 80px);
    display: flex; flex-direction: column;
    background: #fff; color: #222; border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.3);
    overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eee; }
  header h2 { flex: 1; margin: 0; font-size: 15px; }
  button { font: inherit; cursor: pointer; border: 1px solid #ccc; background: #f6f6f6; border-radius: 4px; padding: 2px 8px; }
  button.active { background: #b5121b; border-color: #b5121b; color: #fff; }
  button[data-alt] { min-width: 34px; }
  input { margin: 10px 12px 6px; padding: 6px 8px; font: inherit; border: 1px solid #ccc; border-radius: 4px; }
  .chips { padding: 0 12px 8px; border-bottom: 1px solid #eee; }
  .chips:empty { display: none; }
  .chiprow { display: flex; flex-wrap: wrap; gap: 4px; }
  /* sub-filters of the selected chip, under a faint line */
  .chiprow.sub { margin-top: 6px; padding-top: 6px; border-top: 1px dashed #e3d6d6; }
  .chiprow.sub button { background: #fff; }
  .chiprow.sub button.active { background: #c9474e; border-color: #c9474e; }
  .chips button { font-size: 12px; padding: 1px 7px; border-radius: 10px; }
  .chips .hint { color: #888; font-size: 12px; align-self: center; margin-left: 2px; }
  ul { list-style: none; margin: 0; padding: 0 0 8px; overflow-y: auto; position: relative; /* li.offsetTop is relative to the list */ }
  li { padding: 6px 12px; cursor: pointer; border-top: 1px solid #f2f2f2; }
  li:hover, li.focus { background: #fbeaea; }
  .line1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line2 { white-space: normal; color: #666; font-size: 12px; }
  .name { font-weight: 600; }
  .alt { color: #888; margin-left: 6px; }
  .empty { padding: 16px 12px; color: #888; }
  .head { display: flex; align-items: center; gap: 8px; }
  .main { flex: 1; min-width: 0; }
  button.info {
    flex: none; width: 20px; height: 20px; padding: 0; border-radius: 50%;
    font: italic 700 12px/18px Georgia, serif; color: #b5121b; border: 1px solid #b5121b; background: #fff;
  }
  button.info:hover, button.info.active { background: #b5121b; color: #fff; }
  li.expanded { background: #fdf6f6; }
  /* [Chosen]: already in another row -> greyed but still pickable */
  li.chosen .main { opacity: .45; }
  li.chosen:hover .main { opacity: .7; }
  /* [Current]: the entry in the row being edited -> orange, pinned on top */
  li.current { background: #fff4e5; box-shadow: inset 3px 0 0 #e8820c; }
  .badge { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 8px; font-size: 11px; line-height: 16px; vertical-align: 1px; }
  .badge.current { background: #e8820c; color: #fff; }
  .badge.chosen { background: #9a9a9a; color: #fff; }
  .confirm {
    position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; background: #fff8e1; border-top: 1px solid #f0d58c; box-shadow: 0 -4px 12px rgba(0,0,0,.08);
  }
  .confirm .msg { flex: 1; font-size: 12.5px; }
  .confirm button.yes { background: #b5121b; border-color: #b5121b; color: #fff; }
  .details { margin-top: 8px; padding: 8px 10px; background: #fff; border: 1px solid #eadada; border-radius: 6px; cursor: default; }
  .details dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; margin: 0 0 8px; font-size: 12px; }
  .details dt { color: #888; }
  .details dd { margin: 0; }
  .details .desc { margin: 0 0 6px; white-space: pre-line; font-size: 12.5px; line-height: 1.5; }
  .details .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .details .src { color: #999; font-size: 11px; }
  /* machine-translated text (5e-cn "机翻"), shown at the top of the details */
  .details .mt { margin: 0 0 6px; color: #d40000; font-weight: 700; font-size: 12px; }
  .details button.use { background: #b5121b; border-color: #b5121b; color: #fff; }
  .toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;
    background: #222; color: #fff; padding: 8px 14px; border-radius: 6px;
    font: 13px system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.3);
  }
`;

/** Generic picker text; each module adds its own (list name, empty text, "use" label). */
const PICKER_TEXT = {
  zh: { search: "搜索名称…", close: "关闭", all: "全部", detected: "（已侦测）", current: "当前", chosen: "已选",
        dupYes: "仍然选择", dupNo: "取消", info: "查看详情", altToggle: "显示英文名称" },
  en: { search: "Search by name…", close: "Close", all: "All", detected: "(detected)", current: "Current", chosen: "Chosen",
        dupYes: "Choose anyway", dupNo: "Cancel", info: "Show details", altToggle: "Show Chinese names" },
};

/** `<span class=...>text</span>`; shared with module renderers. */
R20U.span = (className, textContent) => Object.assign(document.createElement("span"), { className, textContent });

function shadowHost() {
  let host = document.getElementById("r20u-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "r20u-host";
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PICKER_CSS;
    root.appendChild(style);
  }
  return host.shadowRoot;
}

/** Add a module's picker CSS once. */
function ensureModuleCss(root, id, css) {
  if (!css || root.querySelector(`style[data-module="${id}"]`)) return;
  const style = document.createElement("style");
  style.dataset.module = id;
  style.textContent = css;
  root.appendChild(style);
}

/** Show a message at the bottom of the sheet. ms = 0 keeps it until removed; returns the element. */
R20U.toast = function (text, ms = 2500) {
  const root = shadowHost();
  root.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  root.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
};

/**
 * Open the picker.
 * @param {object} o
 * @param {string} o.module                       module id (for its CSS)
 * @param {string} [o.css]                        module CSS for row/details content
 * @param {{zh: string, en: string}} o.title
 * @param {object[]} o.items                      entries with at least `id` and `name: {zh, en}`
 * @param {"zh"|"en"} o.lang
 * @param {object} o.text                         per language: { empty, use, dupWarn(name) }
 * @param {(item, ctx) => {line1: Node[], line2: Node[]}} o.renderRow
 *        ctx = { lang, showAlt }; the picker adds the [Current]/[Chosen] badge, name(s) and ⓘ itself
 *        unless the module returns its own name nodes (see `ownName`)
 * @param {(item, ctx) => {rows: [string, string][], body: Node[], source?: string}} [o.renderDetails]
 * @param {object} [o.chips]                      optional filter chips
 * @param {{key: string, label: {zh: string, en: string}}[]} o.chips.options
 * @param {string[]} [o.chips.selected]           initially selected keys ([] = all)
 * @param {string[]} [o.chips.detected]           keys detected on the sheet (shown as a hint)
 * @param {(item, selected: Set<string>) => boolean} o.chips.test
 * @param {boolean} [o.chips.single]              one chip at a time (clicking it again = all)
 * @param {(key: string) => object[]} [o.chips.sub]  with `single`: sub-filter rows for the selected
 *        chip, each { options: [{key, label}], multi?: boolean, test(item, selected: Set) }; a row
 *        filters only while something in it is selected; `multi` rows match any selected key (OR)
 * @param {boolean} [o.expandCurrent]             open the [Current] entry's ⓘ details at once
 * @param {boolean} [o.showAltName]               also show the name in the other language
 * @param {(show: boolean) => void} [o.onAltToggle]
 * @param {string} [o.currentName]                name in the row being edited -> [Current], pinned on top
 * @param {string[]} [o.chosenNames]              names in the section's other rows -> [Chosen], greyed
 * @param {(item, lang: string) => void} o.onPick
 */
R20U.openPicker = function (o) {
  const { title, items, text: modText, renderRow, renderDetails, chips: chipCfg, onPick, onAltToggle } = o;
  let lang = o.lang === "en" ? "en" : "zh";
  let showAlt = o.showAltName ?? true;

  // Names on the sheet may be in either language (or edited case/spacing).
  const norm = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
  const namesOf = (it) => [it.name.zh, it.name.en];
  const chosenSet = new Set((o.chosenNames || []).map(norm));
  const current = norm(o.currentName);
  const stateOf = (it) =>
    current && namesOf(it).some((n) => norm(n) === current) ? "current"
      : namesOf(it).some((n) => chosenSet.has(norm(n))) ? "chosen" : "";

  const root = shadowHost();
  ensureModuleCss(root, o.module, o.css);
  root.querySelector(".backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = `
    <div class="panel" role="dialog" aria-modal="true">
      <header>
        <h2></h2>
        <button data-alt></button>
        <button data-close>✕</button>
      </header>
      <input type="search" />
      <div class="chips"></div>
      <ul></ul>
    </div>`;
  root.appendChild(backdrop);

  const panel = backdrop.querySelector(".panel");
  const altBtn = backdrop.querySelector("[data-alt]");
  const titleEl = backdrop.querySelector("h2");
  const input = backdrop.querySelector("input");
  const chipsEl = backdrop.querySelector(".chips");
  const list = backdrop.querySelector("ul");
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey, true);
  };

  // Only offer chips that match something in this list (e.g. no Paladin cantrips).
  const chipOptions = (chipCfg?.options || []).filter((c) => items.some((it) => chipCfg.test(it, new Set([c.key]))));
  const selected = new Set((chipCfg?.selected || []).filter((k) => chipOptions.some((c) => c.key === k)));
  let shown = [];
  let focusIdx = 0;
  let expandedId = null; // entry whose ⓘ details are open
  if (o.expandCurrent) expandedId = items.find((it) => stateOf(it) === "current")?.id ?? null;

  // Sub-filter rows of the selected chip (single mode): definitions + one Set of keys per row.
  let subRows = [];
  let subSel = [];
  const mainPass = (it) => selected.size === 0 || chipCfg.test(it, selected);
  function resetSub() {
    const key = chipCfg?.single && selected.size === 1 ? [...selected][0] : null;
    const inMain = items.filter(mainPass);
    // Only offer sub-chips that match something under the selected chip.
    subRows = (key && chipCfg.sub ? chipCfg.sub(key) || [] : [])
      .map((row) => ({ ...row, options: row.options.filter((c) => inMain.some((it) => row.test(it, new Set([c.key])))) }))
      .filter((row) => row.options.length > 1);
    subSel = subRows.map(() => new Set());
  }
  const subPass = (it) => subRows.every((row, i) => subSel[i].size === 0 || row.test(it, subSel[i]));

  function renderChips() {
    chipsEl.replaceChildren();
    if (!chipOptions.length) return;
    const t = PICKER_TEXT[lang];
    const chip = (label, active, onClick) => {
      const b = Object.assign(document.createElement("button"), { textContent: label });
      b.classList.toggle("active", active);
      b.addEventListener("click", () => {
        onClick();
        focusIdx = 0;
        render();
      });
      return b;
    };
    const row = (cls) => Object.assign(document.createElement("div"), { className: cls });

    const main = row("chiprow");
    main.append(
      chip(t.all, selected.size === 0, () => {
        selected.clear();
        resetSub();
      }),
      ...chipOptions.map((c) =>
        chip(c.label[lang], selected.has(c.key), () => {
          const on = selected.has(c.key);
          if (chipCfg.single) selected.clear();
          on ? selected.delete(c.key) : selected.add(c.key);
          resetSub();
        })
      )
    );
    const detected = chipOptions.filter((c) => (chipCfg.detected || []).includes(c.key));
    if (detected.length) {
      main.append(R20U.span("hint", detected.map((c) => c.label[lang]).join(", ") + t.detected));
    }
    chipsEl.append(main);

    subRows.forEach((def, i) => {
      const sub = row("chiprow sub");
      const sel = subSel[i];
      sub.append(...def.options.map((c) =>
        chip(c.label[lang], sel.has(c.key), () => {
          const on = sel.has(c.key);
          if (!def.multi) sel.clear();
          on ? sel.delete(c.key) : sel.add(c.key);
        })
      ));
      chipsEl.append(sub);
    });
  }

  function renderDetailsBox(it, onUse) {
    const d = renderDetails(it, { lang, showAlt });
    const box = Object.assign(document.createElement("div"), { className: "details" });
    // Reading the details must not pick the entry (the row's click handler).
    box.addEventListener("click", (e) => e.stopPropagation());
    const dl = document.createElement("dl");
    for (const [k, v] of d.rows || []) {
      if (v) dl.append(Object.assign(document.createElement("dt"), { textContent: k }),
        Object.assign(document.createElement("dd"), { textContent: v }));
    }
    box.append(dl, ...(d.body || []));
    const foot = Object.assign(document.createElement("div"), { className: "foot" });
    foot.append(R20U.span("src", d.source || ""));
    const use = Object.assign(document.createElement("button"), { className: "use", textContent: modText[lang].use });
    use.addEventListener("click", onUse);
    foot.append(use);
    box.append(foot);
    return box;
  }

  function renderEntry(it, i) {
    const t = PICKER_TEXT[lang];
    const state = stateOf(it);
    const expanded = expandedId === it.id;
    const li = document.createElement("li");
    li.classList.toggle("expanded", expanded);
    li.classList.toggle("focus", i === focusIdx);
    if (state) li.classList.add(state);

    const { line1 = [], line2 = [] } = renderRow(it, { lang, showAlt });
    const l1 = Object.assign(document.createElement("div"), { className: "line1" });
    if (state) l1.append(R20U.span(`badge ${state}`, t[state]));
    l1.append(R20U.span("name", it.name[lang]));
    if (showAlt) l1.append(R20U.span("alt", it.name[lang === "zh" ? "en" : "zh"]));
    l1.append(...line1);
    const l2 = Object.assign(document.createElement("div"), { className: "line2" });
    l2.append(...line2);

    const head = Object.assign(document.createElement("div"), { className: "head" });
    const main = Object.assign(document.createElement("div"), { className: "main" });
    main.append(l1, l2);
    head.append(main);
    if (renderDetails) {
      const info = Object.assign(document.createElement("button"), { className: "info", textContent: "i", title: t.info });
      info.classList.toggle("active", expanded);
      info.addEventListener("click", (e) => {
        e.stopPropagation(); // don't pick the entry
        expandedId = expanded ? null : it.id;
        focusIdx = i;
        const scroll = list.scrollTop;
        render();
        list.scrollTop = scroll; // re-render without jumping
        if (expandedId) {
          // Bring the opened entry to the top of the list. Near the end of the list the
          // browser clamps the scroll, so the last entries just scroll as far as they can.
          list.scrollTo({ top: list.querySelector("li.expanded").offsetTop, behavior: "smooth" });
        }
      });
      head.append(info);
    }
    li.append(head);
    const pick = () => choose(it);
    if (expanded) li.append(renderDetailsBox(it, pick));
    li.addEventListener("click", pick);
    return li;
  }

  function render() {
    const t = PICKER_TEXT[lang];
    titleEl.textContent = title[lang] || title.en;
    input.placeholder = t.search;
    backdrop.querySelector("[data-close]").title = t.close;
    altBtn.textContent = lang === "zh" ? "EN" : "中";
    altBtn.title = t.altToggle;
    altBtn.classList.toggle("active", showAlt);
    renderChips();

    const q = input.value.trim().toLowerCase();
    shown = items.filter(
      (it) =>
        (!q || namesOf(it).some((n) => n.toLowerCase().includes(q))) && mainPass(it) && subPass(it)
    );
    // The row's current entry is pinned to the top.
    shown.sort((a, b) => (stateOf(b) === "current") - (stateOf(a) === "current"));
    focusIdx = Math.min(focusIdx, Math.max(shown.length - 1, 0));

    list.replaceChildren(
      ...(shown.length
        ? shown.map(renderEntry)
        : [Object.assign(document.createElement("li"), { className: "empty", textContent: modText[lang].empty })])
    );
  }

  /** Pick an entry; one already in another row asks for confirmation first. */
  function choose(it) {
    if (stateOf(it) !== "chosen") {
      close();
      onPick(it, lang);
      return;
    }
    const t = PICKER_TEXT[lang];
    panel.querySelector(".confirm")?.remove();
    const bar = Object.assign(document.createElement("div"), { className: "confirm" });
    const yes = Object.assign(document.createElement("button"), { className: "yes", textContent: t.dupYes });
    const no = Object.assign(document.createElement("button"), { textContent: t.dupNo });
    yes.addEventListener("click", () => {
      close();
      onPick(it, lang);
    });
    no.addEventListener("click", () => bar.remove());
    bar.append(R20U.span("msg", modText[lang].dupWarn(it.name[lang])), no, yes);
    panel.append(bar);
    yes.focus();
  }

  function onKey(e) {
    if (e.key === "Escape") {
      const bar = panel.querySelector(".confirm");
      return bar ? bar.remove() : close();
    }
    if (panel.querySelector(".confirm")) return; // let the confirm buttons handle keys
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusIdx = (focusIdx + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
      render();
      list.querySelector(".focus")?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && shown[focusIdx]) {
      e.preventDefault();
      choose(shown[focusIdx]);
    }
  }

  backdrop.addEventListener("click", (e) => e.target === backdrop && close());
  backdrop.querySelector("[data-close]").addEventListener("click", close);
  altBtn.addEventListener("click", () => {
    showAlt = !showAlt;
    onAltToggle?.(showAlt);
    const scroll = list.scrollTop;
    render();
    list.scrollTop = scroll;
  });
  input.addEventListener("input", () => {
    focusIdx = 0;
    render();
  });
  document.addEventListener("keydown", onKey, true);

  resetSub();
  render();
  input.focus();
};
