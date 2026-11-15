// In-sheet picker overlay: a searchable list shown inside the sheet iframe.
// Rendered in a shadow root so the sheet's CSS doesn't leak in (or ours out).

var R20F = (globalThis.R20F ??= {});

const PICKER_CSS = `
  :host { all: initial; }
  .backdrop {
    position: fixed; inset: 0; z-index: 2147483646;
    background: rgba(0,0,0,.35);
    display: flex; align-items: flex-start; justify-content: center;
    font: 13px/1.4 system-ui, "Microsoft JhengHei", "PingFang TC", sans-serif;
  }
  .panel {
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
  .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 8px; border-bottom: 1px solid #eee; }
  .chips button { font-size: 12px; padding: 1px 7px; border-radius: 10px; }
  .chips .hint { color: #888; font-size: 12px; align-self: center; margin-left: 2px; }
  ul { list-style: none; margin: 0; padding: 0 0 8px; overflow-y: auto; position: relative; /* li.offsetTop is relative to the list */ }
  li { padding: 6px 12px; cursor: pointer; border-top: 1px solid #f2f2f2; }
  li:hover, li.focus { background: #fbeaea; }
  .line1 { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .line2 { white-space: normal; } /* full range text, wraps if long */
  .name { font-weight: 600; }
  .alt { color: #888; margin-left: 6px; }
  .sep { color: #888; margin: 0 6px; }
  .school { margin-left: 8px; font-style: italic; }
  .comps { margin-left: 10px; }
  .tag { margin-left: 8px; font-size: 12px; color: #b5121b; }
  .tag.ritual { font-style: italic; }
  .tag.conc { font-weight: 700; }
  .line2 { color: #666; font-size: 12px; }
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
  /* [Current]: the spell in the row being edited -> orange, pinned on top */
  li.current { background: #fff4e5; box-shadow: inset 3px 0 0 #e8820c; }
  .badge { display: inline-block; margin-right: 6px; padding: 0 6px; border-radius: 8px; font-size: 11px; line-height: 16px; vertical-align: 1px; }
  .badge.current { background: #e8820c; color: #fff; }
  .badge.chosen { background: #9a9a9a; color: #fff; }
  .panel { position: relative; }
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
  .details .higher { color: #444; }
  .details .foot { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; }
  .details .src { color: #999; font-size: 11px; }
  .details button.use { background: #b5121b; border-color: #b5121b; color: #fff; }
  .toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;
    background: #222; color: #fff; padding: 8px 14px; border-radius: 6px;
    font: 13px system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.3);
  }
`;

const UI_TEXT = {
  zh: { search: "搜索名称…", empty: "没有符合的法术", close: "关闭", all: "全部", ritual: "仪式", conc: "专注",
        heal: "治疗", detected: "（已侦测）", current: "当前", chosen: "已选",
        dupWarn: (n) => `「${n}」已在此法术列表中。仍要再加入一次吗？`, dupYes: "仍然选择", dupNo: "取消",
        altToggle: "显示英文名称" },
  en: { search: "Search by name…", empty: "No matching spells", close: "Close", all: "All", ritual: "ritual", conc: "Conc",
        heal: "healing", detected: "(detected)", current: "Current", chosen: "Chosen",
        dupWarn: (n) => `"${n}" is already in this spell list. Add it again anyway?`, dupYes: "Choose anyway", dupNo: "Cancel",
        altToggle: "Show Chinese names" },
};

function shadowHost() {
  let host = document.getElementById("r20f-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "r20f-host";
    document.body.appendChild(host);
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = PICKER_CSS;
    root.appendChild(style);
  }
  return host.shadowRoot;
}

/** Show a message at the bottom of the sheet. ms = 0 keeps it until removed; returns the element. */
R20F.toast = function (text, ms = 2500) {
  const root = shadowHost();
  root.querySelectorAll(".toast").forEach((t) => t.remove());
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = text;
  root.appendChild(el);
  if (ms) setTimeout(() => el.remove(), ms);
  return el;
};

/** "1 action" / "1 动作" without a reaction's long trigger text. */
const shortTime = (text) => text.split(/[，,]/)[0];

/** Component labels; Chinese as on the 5etools-cn site (声音 / 姿势 / 材料), one character each. */
const COMPONENT_LABELS = { zh: { v: "声", s: "姿", m: "材" }, en: { v: "V", s: "S", m: "M" } };

const span = (className, textContent) => Object.assign(document.createElement("span"), { className, textContent });

/**
 * Layout:
 *   Name_Main_Lang Name_sub_lang school(italic)  ritual Conc
 *   castingTime · range · damage damageType  [components]
 * ritual is italic, Conc bold; both at the end of line 1 to keep line 2 short.
 */
const DETAIL_TEXT = {
  zh: { time: "施法时间", range: "距离", comps: "成分", duration: "持续时间", save: "豁免", classes: "职业",
        source: "来源", conc: "专注，", use: "使用此法术", compsFull: { v: "声音", s: "姿势", m: "材料" } },
  en: { time: "Casting Time", range: "Range", comps: "Components", duration: "Duration", save: "Saving Throw",
        classes: "Classes", source: "Source", conc: "Concentration, ", use: "Use this spell",
        compsFull: { v: "V", s: "S", m: "M" } },
};

/** Full spell details, shown under a row when its ⓘ is open. */
function renderDetails(s, lang, onUse) {
  const t = DETAIL_TEXT[lang];
  const box = Object.assign(document.createElement("div"), { className: "details" });
  // Reading the details must not pick the spell (the row's click handler).
  box.addEventListener("click", (e) => e.stopPropagation());

  const comps = ["v", "s", "m"].filter((c) => s.components[c]).map((c) => t.compsFull[c]);
  const materials = s.materials?.[lang];
  const duration = (s.concentration ? t.conc : "") + s.duration[lang];
  const rows = [
    [t.time, s.castingTime[lang]],
    [t.range, s.range[lang]],
    [t.comps, comps.join(", ") + (materials ? (lang === "zh" ? `（${materials}）` : ` (${materials})`) : "")],
    [t.duration, lang === "en" && s.concentration ? t.conc + s.duration.en.replace(/^Up/, "up") : duration],
    [t.save, s.save ? [R20F.ABILITY_NAMES?.[s.save]?.[lang] || s.save, s.saveSuccess?.[lang]].filter(Boolean).join(" · ") : ""],
    [t.classes, (s.classes || []).map((c) => R20F.CLASS_NAMES[c]?.[lang] || c).join(", ")],
  ].filter(([, v]) => v);

  const dl = document.createElement("dl");
  for (const [k, v] of rows) dl.append(Object.assign(document.createElement("dt"), { textContent: k }),
    Object.assign(document.createElement("dd"), { textContent: v }));
  box.append(dl, Object.assign(document.createElement("p"), { className: "desc", textContent: s.description[lang] }));
  if (s.higherLevels?.[lang]) {
    box.append(Object.assign(document.createElement("p"), { className: "desc higher", textContent: s.higherLevels[lang] }));
  }
  const foot = Object.assign(document.createElement("div"), { className: "foot" });
  foot.append(span("src", `${t.source}: PHB 2024 p.${s.page}${s.srd52 ? " · SRD 5.2" : ""}`));
  const use = Object.assign(document.createElement("button"), { className: "use", textContent: t.use });
  use.addEventListener("click", onUse);
  foot.append(use);
  box.append(foot);
  return box;
}

/**
 * @param {object} [opts]
 * @param {boolean} [opts.expanded]       show the details under the row
 * @param {() => void} [opts.onToggleInfo] ⓘ clicked
 * @param {() => void} [opts.onUse]        "use this spell" in the details
 * @param {""|"current"|"chosen"} [opts.state] already in the row being edited / in another row
 */
function renderItem(s, lang, { expanded = false, onToggleInfo, onUse, state = "", showAlt = true } = {}) {
  const text = UI_TEXT[lang];
  const other = lang === "zh" ? "en" : "zh";
  const li = document.createElement("li");
  li.classList.toggle("expanded", expanded);
  if (state) li.classList.add(state);

  const l1 = Object.assign(document.createElement("div"), { className: "line1" });
  if (state) l1.append(span(`badge ${state}`, text[state]));
  l1.append(span("name", s.name[lang]));
  if (showAlt) l1.append(span("alt", s.name[other]));
  l1.append(span("school", R20F.SCHOOL_NAMES[s.school]?.[lang] || s.school));
  if (s.ritual) l1.append(span("tag ritual", text.ritual));
  if (s.concentration) l1.append(span("tag conc", text.conc));

  const roll = s.healing ? `${s.healing} ${text.heal}` : s.damage && `${s.damage} ${s.damageType[lang]}`.trim();
  const comps = ["v", "s", "m"].filter((c) => s.components[c]).map((c) => COMPONENT_LABELS[lang][c]);
  const l2 = Object.assign(document.createElement("div"), { className: "line2" });
  l2.append(span("", [shortTime(s.castingTime[lang]), s.range[lang], roll].filter(Boolean).join(" · ")));
  if (comps.length) l2.append(span("comps", `[${comps.join(", ")}]`));

  const info = Object.assign(document.createElement("button"), {
    className: "info", textContent: "i", title: lang === "zh" ? "查看详情" : "Show details",
  });
  info.classList.toggle("active", expanded);
  info.addEventListener("click", (e) => {
    e.stopPropagation(); // don't pick the spell
    onToggleInfo?.();
  });

  const head = Object.assign(document.createElement("div"), { className: "head" });
  const main = Object.assign(document.createElement("div"), { className: "main" });
  main.append(l1, l2);
  head.append(main, info);
  li.append(head);
  if (expanded) li.append(renderDetails(s, lang, onUse));
  return li;
}

/**
 * Open the picker.
 * @param {object} opts
 * @param {{zh: string, en: string}} opts.title   localized title (follows the language toggle)
 * @param {object[]} opts.spells
 * @param {string} opts.lang                      "zh" | "en"
 * @param {string[]} [opts.classes]               initial class filter ([] = all classes)
 * @param {string[]} [opts.detectedClasses]       classes detected on the sheet (marked in the UI)
 * @param {(spell: object, lang: string) => void} opts.onPick
 * @param {boolean} [opts.showAltName]            also show the name in the other language
 * @param {(show: boolean) => void} [opts.onAltToggle]
 * @param {string} [opts.currentName]             spell name in the row being edited -> [Current], pinned on top
 * @param {string[]} [opts.chosenNames]           spell names in the section's other rows -> [Chosen], greyed
 */
R20F.openPicker = function ({
  title, spells, lang, classes = [], detectedClasses = [], onPick, showAltName = true, onAltToggle,
  currentName = "", chosenNames = [],
}) {
  // Names on the sheet may be in either language (or edited case/spacing).
  const norm = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
  const matches = (s, name) => [s.name.zh, s.name.en].some((n) => norm(n) === norm(name));
  const chosenSet = new Set(chosenNames.map(norm));
  const stateOf = (s) =>
    currentName && matches(s, currentName) ? "current"
      : chosenSet.has(norm(s.name.zh)) || chosenSet.has(norm(s.name.en)) ? "chosen" : "";
  const root = shadowHost();
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
  let showAlt = showAltName;
  const titleEl = backdrop.querySelector("h2");
  const input = backdrop.querySelector("input");
  const chips = backdrop.querySelector(".chips");
  const list = backdrop.querySelector("ul");
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey, true);
  };

  // Only offer classes that have spells in this list (e.g. no Paladin cantrips).
  const available = R20F.SPELL_CLASSES.filter((c) => spells.some((s) => s.classes?.includes(c)));
  let selected = new Set(classes.filter((c) => available.includes(c)));
  let shown = [];
  let focusIdx = 0;
  let expandedId = null; // spell whose ⓘ details are open

  function renderChips() {
    const text = UI_TEXT[lang];
    const chip = (label, active, onClick) => {
      const b = Object.assign(document.createElement("button"), { textContent: label });
      b.classList.toggle("active", active);
      b.addEventListener("click", onClick);
      return b;
    };
    chips.replaceChildren(
      chip(text.all, selected.size === 0, () => {
        selected.clear();
        focusIdx = 0;
        render();
      }),
      ...available.map((c) =>
        chip(R20F.CLASS_NAMES[c]?.[lang] || c, selected.has(c), () => {
          selected.has(c) ? selected.delete(c) : selected.add(c);
          focusIdx = 0;
          render();
        })
      )
    );
    const detected = detectedClasses.filter((c) => available.includes(c));
    if (detected.length) {
      chips.append(
        Object.assign(document.createElement("span"), {
          className: "hint",
          textContent: detected.map((c) => R20F.CLASS_NAMES[c]?.[lang] || c).join(", ") + text.detected,
        })
      );
    }
  }

  function render() {
    const text = UI_TEXT[lang];
    titleEl.textContent = title[lang] || title.en;
    input.placeholder = text.search;
    backdrop.querySelector("[data-close]").title = text.close;
    altBtn.textContent = lang === "zh" ? "EN" : "中";
    altBtn.title = text.altToggle;
    altBtn.classList.toggle("active", showAlt);
    renderChips();

    const q = input.value.trim().toLowerCase();
    shown = spells.filter(
      (s) =>
        (!q || s.name.en.toLowerCase().includes(q) || s.name.zh.toLowerCase().includes(q)) &&
        (selected.size === 0 || s.classes?.some((c) => selected.has(c)))
    );
    // The row's current spell is pinned to the top.
    shown.sort((a, b) => (stateOf(b) === "current") - (stateOf(a) === "current"));
    focusIdx = Math.min(focusIdx, Math.max(shown.length - 1, 0));

    list.replaceChildren(
      ...(shown.length
        ? shown.map((s, i) => {
            const pick = () => choose(s);
            const li = renderItem(s, lang, {
              showAlt,
              state: stateOf(s),
              expanded: expandedId === s.id,
              onToggleInfo: () => {
                expandedId = expandedId === s.id ? null : s.id;
                focusIdx = i;
                const scroll = list.scrollTop;
                render();
                list.scrollTop = scroll; // re-render without jumping
                if (expandedId) {
                  // Bring the opened spell to the top of the list. Near the end of the list the
                  // browser clamps the scroll, so the last spells just scroll as far as they can.
                  const opened = list.querySelector("li.expanded");
                  list.scrollTo({ top: opened.offsetTop, behavior: "smooth" });
                }
              },
              onUse: pick,
            });
            li.classList.toggle("focus", i === focusIdx);
            li.addEventListener("click", pick);
            return li;
          })
        : [Object.assign(document.createElement("li"), { className: "empty", textContent: text.empty })])
    );
  }

  /** Pick a spell; a spell already in another row asks for confirmation first. */
  function choose(s) {
    if (stateOf(s) !== "chosen") {
      close();
      onPick(s, lang);
      return;
    }
    const text = UI_TEXT[lang];
    panel.querySelector(".confirm")?.remove();
    const bar = Object.assign(document.createElement("div"), { className: "confirm" });
    const yes = Object.assign(document.createElement("button"), { className: "yes", textContent: text.dupYes });
    const no = Object.assign(document.createElement("button"), { textContent: text.dupNo });
    yes.addEventListener("click", () => {
      close();
      onPick(s, lang);
    });
    no.addEventListener("click", () => bar.remove());
    bar.append(span("msg", text.dupWarn(s.name[lang])), no, yes);
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

  render();
  input.focus();
};
