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
    margin-top: 40px; width: min(440px, calc(100vw - 32px)); max-height: calc(100vh - 80px);
    display: flex; flex-direction: column;
    background: #fff; color: #222; border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.3);
    overflow: hidden;
  }
  header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid #eee; }
  header h2 { flex: 1; margin: 0; font-size: 15px; }
  button { font: inherit; cursor: pointer; border: 1px solid #ccc; background: #f6f6f6; border-radius: 4px; padding: 2px 8px; }
  button.active { background: #b5121b; border-color: #b5121b; color: #fff; }
  input { margin: 10px 12px; padding: 6px 8px; font: inherit; border: 1px solid #ccc; border-radius: 4px; }
  ul { list-style: none; margin: 0; padding: 0 0 8px; overflow-y: auto; }
  li { padding: 6px 12px; cursor: pointer; border-top: 1px solid #f2f2f2; }
  li:hover, li.focus { background: #fbeaea; }
  .name { font-weight: 600; }
  .alt { color: #888; font-weight: 400; margin-left: 6px; }
  .meta { color: #666; font-size: 12px; }
  .empty { padding: 16px 12px; color: #888; }
  .toast {
    position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2147483647;
    background: #222; color: #fff; padding: 8px 14px; border-radius: 6px;
    font: 13px system-ui, sans-serif; box-shadow: 0 4px 14px rgba(0,0,0,.3);
  }
`;

const UI_TEXT = {
  zh: { search: "搜索名称…", empty: "没有符合的法术", close: "关闭", cantrip: "戏法" },
  en: { search: "Search by name…", empty: "No matching spells", close: "Close", cantrip: "cantrip" },
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

/**
 * Open the picker.
 * @param {object} opts
 * @param {string} opts.title
 * @param {object[]} opts.spells
 * @param {string} opts.lang  "zh" | "en"
 * @param {(spell: object, lang: string) => void} opts.onPick
 * @param {(lang: string) => void} [opts.onLangChange]
 */
R20F.openPicker = function ({ title, spells, lang, onPick, onLangChange }) {
  const root = shadowHost();
  root.querySelector(".backdrop")?.remove();

  const backdrop = document.createElement("div");
  backdrop.className = "backdrop";
  backdrop.innerHTML = `
    <div class="panel" role="dialog" aria-modal="true">
      <header>
        <h2></h2>
        <button data-lang="zh">中</button>
        <button data-lang="en">EN</button>
        <button data-close>✕</button>
      </header>
      <input type="search" />
      <ul></ul>
    </div>`;
  root.appendChild(backdrop);

  const titleEl = backdrop.querySelector("h2");
  const input = backdrop.querySelector("input");
  const list = backdrop.querySelector("ul");
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey, true);
  };

  let shown = [];
  let focusIdx = 0;

  function render() {
    const text = UI_TEXT[lang];
    titleEl.textContent = title;
    input.placeholder = text.search;
    backdrop.querySelector("[data-close]").title = text.close;
    backdrop.querySelectorAll("[data-lang]").forEach((b) =>
      b.classList.toggle("active", b.dataset.lang === lang)
    );

    const q = input.value.trim().toLowerCase();
    shown = spells.filter(
      (s) => !q || s.name.en.toLowerCase().includes(q) || s.name.zh.toLowerCase().includes(q)
    );
    focusIdx = Math.min(focusIdx, Math.max(shown.length - 1, 0));

    list.replaceChildren(
      ...(shown.length
        ? shown.map((s, i) => {
            const li = document.createElement("li");
            li.classList.toggle("focus", i === focusIdx);
            const other = lang === "zh" ? s.name.en : s.name.zh;
            const bits = [
              s.level === 0 ? text.cantrip : `L${s.level}`,
              s.school,
              s.range[lang],
              s.damage && `${s.damage} ${s.damageType[lang]}`,
              s.save && `${s.save} save`,
            ].filter(Boolean);
            li.innerHTML = `<div class="name"></div><div class="meta"></div>`;
            li.querySelector(".name").textContent = s.name[lang];
            const alt = document.createElement("span");
            alt.className = "alt";
            alt.textContent = other;
            li.querySelector(".name").appendChild(alt);
            li.querySelector(".meta").textContent = bits.join(" · ");
            li.addEventListener("click", () => {
              close();
              onPick(s, lang);
            });
            return li;
          })
        : [Object.assign(document.createElement("li"), { className: "empty", textContent: text.empty })])
    );
  }

  function onKey(e) {
    if (e.key === "Escape") return close();
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusIdx = (focusIdx + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
      render();
      list.querySelector(".focus")?.scrollIntoView({ block: "nearest" });
    }
    if (e.key === "Enter" && shown[focusIdx]) {
      e.preventDefault();
      const s = shown[focusIdx];
      close();
      onPick(s, lang);
    }
  }

  backdrop.addEventListener("click", (e) => e.target === backdrop && close());
  backdrop.querySelector("[data-close]").addEventListener("click", close);
  backdrop.querySelectorAll("[data-lang]").forEach((b) =>
    b.addEventListener("click", () => {
      lang = b.dataset.lang;
      onLangChange?.(lang);
      render();
    })
  );
  input.addEventListener("input", () => {
    focusIdx = 0;
    render();
  });
  document.addEventListener("keydown", onKey, true);

  render();
  input.focus();
};
