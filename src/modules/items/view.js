// Items module: how an item looks in the picker (list row + ⓘ details), and its category chips.
//
// Row layout:
//   Name_Main_Lang Name_sub_lang type(italic)  rarity  [A]
//   weapons: 1d8 slashing · Versatile (1d10) · Sap     armour: AC 16 · Str 13 · Stealth Disadv.
//   other:   cost · weight

var R20U = (globalThis.R20U ??= {});

R20U.itemView = (() => {
  const CSS = `
    .type { margin-left: 8px; font-style: italic; color: #666; }
    .tag { margin-left: 8px; font-size: 12px; color: #b5121b; }
    .tag.rarity { font-style: italic; }
    .tag.attune { font-weight: 700; }
    .rarity-uncommon { color: #1a7f37; }
    .rarity-rare { color: #0b5cad; }
    .rarity-very-rare { color: #7a2fb5; }
    .rarity-legendary, .rarity-artifact { color: #b55a00; }
    .details .mastery { color: #444; }
  `;

  /** Picker chips (`category` in the data; "magic" = any item with `magic`). */
  const CATEGORIES = [
    { key: "weapon", label: { zh: "武器", en: "Weapons" } },
    { key: "armor", label: { zh: "护甲", en: "Armour" } },
    { key: "ammo", label: { zh: "弹药", en: "Ammo" } },
    { key: "gear", label: { zh: "冒险用品", en: "Gear" } },
    { key: "tool", label: { zh: "工具", en: "Tools" } },
    { key: "consumable", label: { zh: "消耗品", en: "Consumables" } },
    { key: "magic", label: { zh: "魔法物品", en: "Magic items" } },
  ];
  const inCategories = (it, selected) => selected.has(it.category) || (selected.has("magic") && Boolean(it.magic));

  const TEXT = {
    zh: { empty: "没有符合的物品", use: "加入此物品",
          dupWarn: (n) => `「${n}」已在物品栏中。仍要再加入一次吗？`,
          type: "类型", rarity: "稀有度", damage: "伤害", versatile: "双手", range: "射程", reach: "触及",
          properties: "词条", mastery: "武器精通", ac: "护甲等级", strength: "力量需求", stealth: "隐匿",
          stealthDis: "劣势", weight: "重量", cost: "价格", charges: "充能", source: "来源",
          lb: (n) => `${n} 磅`, attuneShort: "同调", acShort: (n) => `AC ${n}`, strShort: (n) => `力量 ${n}`,
          stealthShort: "隐匿劣势", ft: "尺" },
    en: { empty: "No matching items", use: "Add this item",
          dupWarn: (n) => `"${n}" is already in the inventory. Add it again anyway?`,
          type: "Type", rarity: "Rarity", damage: "Damage", versatile: "Two-handed", range: "Range", reach: "Reach",
          properties: "Properties", mastery: "Mastery", ac: "Armor Class", strength: "Strength", stealth: "Stealth",
          stealthDis: "Disadvantage", weight: "Weight", cost: "Cost", charges: "Charges", source: "Source",
          lb: (n) => `${n} lb.`, attuneShort: "Attune", acShort: (n) => `AC ${n}`, strShort: (n) => `Str ${n}`,
          stealthShort: "Stealth Disadv.", ft: "ft." },
  };

  const span = (c, t) => R20U.span(c, t);
  const t = (localized, lang) => localized?.[lang] || localized?.en || "";

  /** Properties in the UI language, e.g. "投掷 (20/60), 多用 (1d10)". */
  function propertyList(w, lang) {
    return (w.properties || []).map((p) => {
      let extra = t(p.note, lang);
      if (p.key === "versatile" && w.versatileDamage) extra = w.versatileDamage;
      if ((p.key === "thrown" || p.key === "ammunition") && w.range) extra = `${w.range.normal}/${w.range.long}`;
      return extra ? `${t(p.name, lang)} (${extra})` : t(p.name, lang);
    }).join(lang === "zh" ? "，" : ", ");
  }

  const acText = (a) => (a.category === "shield" ? `+${a.ac}` : String(a.ac));

  function renderRow(it, { lang }) {
    const tx = TEXT[lang];
    const line1 = [span("type", t(it.type, lang))];
    if (it.magic) {
      line1.push(span(`tag rarity rarity-${it.magic.rarity.replace(/\s+/g, "-")}`, t(it.magic.rarityName, lang)));
      if (t(it.magic.attunement, "en")) line1.push(span("tag attune", tx.attuneShort));
    }

    let bits;
    if (it.weapon) {
      const w = it.weapon;
      bits = [`${w.damage} ${t(w.damageType, lang)}`.trim(), propertyList(w, lang), t(w.mastery?.name, lang)];
    } else if (it.armor) {
      const a = it.armor;
      bits = [tx.acShort(acText(a)), a.strength && tx.strShort(a.strength), a.stealthDisadvantage && tx.stealthShort];
    } else {
      bits = [t(it.cost, lang), it.weight != null && tx.lb(it.weight)];
    }
    return { line1, line2: [span("", bits.filter(Boolean).join(" · "))] };
  }

  function renderDetails(it, { lang }) {
    const tx = TEXT[lang];
    const p = (cls, txt) => Object.assign(document.createElement("p"), { className: cls, textContent: txt });
    const w = it.weapon;
    const a = it.armor;
    const range = w?.range ? `${w.range.normal}/${w.range.long} ${tx.ft}` : "";

    const rows = [
      [tx.type, t(it.type, lang)],
      [tx.rarity, it.magic ? [t(it.magic.rarityName, lang), t(it.magic.attunement, lang)].filter(Boolean).join(" · ") : ""],
      [tx.damage, w ? `${w.damage} ${t(w.damageType, lang)}`.trim() : ""],
      [tx.versatile, w?.versatileDamage || ""],
      [tx.range, range],
      [tx.properties, w ? propertyList(w, lang) : ""],
      [tx.mastery, t(w?.mastery?.name, lang)],
      [tx.ac, a ? acText(a) + (a.dexMax === 2 ? (lang === "zh" ? " + 敏捷（最多 2）" : " + Dex (max 2)")
        : a.dexMax === null && a.category !== "shield" ? (lang === "zh" ? " + 敏捷" : " + Dex") : "") : ""],
      [tx.strength, a?.strength ? String(a.strength) : ""],
      [tx.stealth, a?.stealthDisadvantage ? tx.stealthDis : ""],
      [tx.charges, it.magic?.charges ? String(it.magic.charges) : ""],
      [tx.weight, it.weight != null ? tx.lb(it.weight) : ""],
      [tx.cost, t(it.cost, lang)],
    ];

    const body = [];
    if (t(it.description, lang)) body.push(p("desc", t(it.description, lang)));
    if (w?.mastery && t(w.mastery.description, lang)) {
      const name = t(w.mastery.name, lang);
      const desc = t(w.mastery.description, lang);
      body.push(p("desc mastery", lang === "zh" ? `${tx.mastery}（${name}）：${desc}` : `${tx.mastery} (${name}): ${desc}`));
    }
    const book = it.source === "XDMG" ? "DMG 2024" : "PHB 2024";
    return { rows, body, source: `${tx.source}: ${book} p.${it.page}${it.srd52 ? " · SRD 5.2" : ""}` };
  }

  return { CSS, TEXT, CATEGORIES, inCategories, renderRow, renderDetails };
})();
