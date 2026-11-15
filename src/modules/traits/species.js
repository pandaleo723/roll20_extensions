// Traits module: the species panel (🧝 种族 +). Not a list: choose one species (square tiles),
// then one lineage (tiles under a dashed line, only for species that have lineages); the panel
// shows that species' traits, each with a checkbox, a status (加入 / 更新 / 已有) and an ⓘ for
// the full text. "加入 N 项" adds the ticked ones.
// Built for species only for now; may move into the shared picker when class features need it.

var R20U = (globalThis.R20U ??= {});

(() => {
  const TEXT = {
    zh: { title: "按种族加入特性", pickSpecies: "选择一个种族", pickLineage: "选择血统",
          add: (n) => `加入 ${n} 项`, close: "关闭", info: "查看详情",
          status: { add: "加入", update: "更新", has: "已有" },
          statusHint: { add: "特性栏还没有，将新增一行", update: "特性栏已有但数值不同，将更新该行", has: "特性栏已有，跳过" } },
    en: { title: "Add species traits", pickSpecies: "Choose a species", pickLineage: "Choose a lineage",
          add: (n) => `Add ${n}`, close: "Close", info: "Show details",
          status: { add: "Add", update: "Update", has: "On sheet" },
          statusHint: { add: "Not on the sheet yet: adds a new row", update: "On the sheet with another value: updates that row",
                        has: "Already on the sheet: skipped" } },
  };

  const t = (localized, lang) => localized?.[lang] || localized?.en || "";
  const el = (tag, className, text) => Object.assign(document.createElement(tag), { className: className || "", textContent: text ?? "" });

  /**
   * @param {object} o
   * @param {string} o.module
   * @param {object[]} o.entries        R20U.speciesEntries(...) (one per species / lineage)
   * @param {"zh"|"en"} o.lang
   * @param {boolean} [o.showAltName]
   * @param {(trait) => "add"|"update"|"has"} o.statusOf
   * @param {(traits: object[], lang: string) => void} o.onAdd
   */
  R20U.openSpeciesPanel = function (o) {
    const lang = o.lang === "en" ? "en" : "zh";
    const tx = TEXT[lang];
    const vt = R20U.traitView.TEXT[lang];
    const root = R20U.pickerRoot(o.module, R20U.traitView.CSS);

    // species id -> { name, entries }  (entries: the species itself, or one per lineage)
    const species = new Map();
    for (const e of o.entries) {
      if (!species.has(e.speciesId)) species.set(e.speciesId, { name: e.speciesName, entries: [] });
      species.get(e.speciesId).entries.push(e);
    }

    // Start on the species written on the sheet, if it matches one (zh or en).
    const onSheet = String(R20U.sheetField("race")?.value || "").trim().toLowerCase();
    let speciesId = [...species].find(([, s]) => onSheet && [s.name.zh, s.name.en].some((n) => n.toLowerCase() === onSheet))?.[0] || null;
    let entry = null; // the chosen species/lineage entry
    let checked = new Map(); // trait -> ticked
    let expanded = new Set(); // traits with ⓘ open

    const backdrop = el("div", "backdrop");
    backdrop.innerHTML = `
      <div class="panel species-panel" role="dialog" aria-modal="true">
        <header><h2></h2><button data-close>✕</button></header>
        <div class="chips"></div>
        <ul></ul>
        <footer class="sp-foot"><span class="sp-meta"></span><button class="use sp-add"></button></footer>
      </div>`;
    root.appendChild(backdrop);
    const chipsEl = backdrop.querySelector(".chips");
    const list = backdrop.querySelector("ul");
    const meta = backdrop.querySelector(".sp-meta");
    const addBtn = backdrop.querySelector(".sp-add");
    backdrop.querySelector("h2").textContent = tx.title;
    backdrop.querySelector("[data-close]").title = tx.close;

    const close = () => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey, true);
    };
    const onKey = (e) => e.key === "Escape" && close();

    function choose(newEntry) {
      entry = newEntry;
      checked = new Map((entry?.traits || []).map((tr) => [tr, o.statusOf(tr) !== "has"]));
      expanded = new Set();
      render();
    }

    function selectSpecies(id) {
      speciesId = id;
      const s = species.get(id);
      choose(s.entries.length === 1 && !s.entries[0].lineageName ? s.entries[0] : null);
    }

    function tile(label, active, onClick) {
      const b = el("button", active ? "active" : "", label);
      b.addEventListener("click", onClick);
      return b;
    }

    function renderTiles() {
      const main = el("div", "chiprow single");
      for (const [id, s] of species) main.append(tile(t(s.name, lang), id === speciesId, () => selectSpecies(id)));
      chipsEl.replaceChildren(main);
      const s = speciesId && species.get(speciesId);
      if (s && s.entries.some((e) => e.lineageName)) {
        const sub = el("div", "chiprow single sub");
        for (const e of s.entries) sub.append(tile(t(e.lineageName, lang), e === entry, () => choose(e)));
        chipsEl.append(sub);
      }
    }

    function renderTrait(tr) {
      const status = o.statusOf(tr);
      const li = el("li", `sp-trait${expanded.has(tr) ? " expanded" : ""}${checked.get(tr) ? "" : " off"}`);
      const head = el("label", "head");
      const box = Object.assign(document.createElement("input"), { type: "checkbox", checked: checked.get(tr), disabled: status === "has" });
      box.addEventListener("change", () => {
        checked.set(tr, box.checked);
        render();
      });
      const badge = el("span", `st ${status}`, tx.status[status]);
      badge.title = tx.statusHint[status];
      const main = el("div", "main");
      const l1 = el("div", "line1");
      l1.append(el("span", "name", t(tr.name, lang)));
      if (o.showAltName ?? true) l1.append(el("span", "alt", t(tr.name, lang === "zh" ? "en" : "zh")));
      main.append(l1, el("div", "line2 sp-short", R20U.traitDescription(tr, lang).split("\n")[0]));
      const info = el("button", `info${expanded.has(tr) ? " active" : ""}`, "i");
      info.title = tx.info;
      info.addEventListener("click", (e) => {
        e.preventDefault(); // inside the label: don't toggle the checkbox
        expanded.has(tr) ? expanded.delete(tr) : expanded.add(tr);
        render();
      });
      head.append(box, badge, main, info);
      li.append(head);
      if (expanded.has(tr)) {
        const details = el("div", "details");
        details.append(el("p", "desc", R20U.traitDescription(tr, lang)));
        li.append(details);
      }
      return li;
    }

    function render() {
      const scroll = list.scrollTop;
      renderTiles();
      if (!entry) {
        list.replaceChildren(el("li", "empty", speciesId ? tx.pickLineage : tx.pickSpecies));
        meta.textContent = "";
      } else {
        list.replaceChildren(...entry.traits.map(renderTrait));
        meta.textContent = [
          (entry.size || []).map((s) => vt.sizes[s] || s).join(" / "),
          entry.speed && `${vt.speed} ${vt.ft(entry.speed)}`,
          entry.senses?.darkvision && `${vt.darkvision} ${vt.ft(entry.senses.darkvision)}`,
        ].filter(Boolean).join(" · ");
      }
      const n = entry ? entry.traits.filter((tr) => checked.get(tr)).length : 0;
      addBtn.textContent = tx.add(n);
      addBtn.disabled = n === 0;
      list.scrollTop = scroll;
    }

    addBtn.addEventListener("click", () => {
      const traits = entry.traits.filter((tr) => checked.get(tr));
      close();
      o.onAdd(traits, lang);
    });
    backdrop.addEventListener("click", (e) => e.target === backdrop && close());
    backdrop.querySelector("[data-close]").addEventListener("click", close);
    document.addEventListener("keydown", onKey, true);

    if (speciesId) selectSpecies(speciesId);
    else render();
  };
})();
