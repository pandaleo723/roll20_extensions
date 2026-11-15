// Items module: how an item looks in the picker (list row + ⓘ details), and its filter chips.
//
// Row layout:
//   Name_Main_Lang Name_sub_lang type(italic)  rarity  [Attune]
//   weapons: 1d8 slashing · Versatile (1d10) · Sap     armour: AC 16 · Str 13 · Stealth Disadv.
//   other:   cost · weight
//
// Weapon property / mastery names and rules text come from data/*/item-properties.json
// (R20U.itemView.setGlossary), not from each item.

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
    .details .rule b { font-style: italic; }
  `;

  /** key -> glossary entry ("property:finesse", "mastery:nick"). */
  let glossary = new Map();
  const setGlossary = (entries) => (glossary = new Map((entries || []).map((g) => [g.id, g])));
  const prop = (key) => glossary.get(`property:${key}`);
  const mastery = (key) => key && glossary.get(`mastery:${key}`);

  const L = (zh, en) => ({ zh, en });

  /** Main chips (one at a time). `category` in the data; weapons also list staffs and foci. */
  const CATEGORIES = [
    { key: "weapon", label: L("武器", "Weapons") },
    { key: "armor", label: L("护甲", "Armour") },
    { key: "ammo", label: L("弹药", "Ammo") },
    { key: "gear", label: L("冒险用品", "Gear") },
    { key: "tool", label: L("工具", "Tools") },
    { key: "consumable", label: L("消耗品", "Consumables") },
    { key: "magic", label: L("魔法物品", "Magic items") },
  ];
  const inCategory = (it, key) =>
    key === "magic" ? Boolean(it.magic)
      : key === "weapon" ? it.category === "weapon" || it.staff || it.focus
        : it.category === key;
  const inCategories = (it, selected) => [...selected].some((k) => inCategory(it, k));

  const WEAPON_TYPES = [
    { key: "simple", label: L("简易武器", "Simple"), test: (it) => it.weapon?.category === "simple" },
    { key: "martial", label: L("军用武器", "Martial"), test: (it) => it.weapon?.category === "martial" },
    { key: "staff", label: L("法杖", "Staffs"), test: (it) => it.staff },
    { key: "focus", label: L("法器", "Spellcasting focus"), test: (it) => it.focus },
    { key: "firearm", label: L("枪械", "Firearms"), test: (it) => it.weapon?.firearm },
    { key: "melee", label: L("近战武器", "Melee"), test: (it) => it.weapon?.melee },
    { key: "ranged", label: L("远程武器", "Ranged"), test: (it) => it.weapon?.ranged },
  ];
  const ARMOR_TYPES = ["light", "medium", "heavy", "shield"].map((k, i) => ({
    key: k, label: [L("轻甲", "Light"), L("中甲", "Medium"), L("重甲", "Heavy"), L("盾牌", "Shield")][i],
  }));
  const RARITIES = [
    ["common", "普通", "Common"], ["uncommon", "非普通", "Uncommon"], ["rare", "珍稀", "Rare"],
    ["very rare", "非常珍稀", "Very Rare"], ["legendary", "传说", "Legendary"], ["artifact", "神器", "Artifact"],
  ].map(([key, zh, en]) => ({ key, label: L(zh, en) }));
  const MAGIC_KINDS = [
    ["weapon", "武器", "Weapons"], ["armor", "护甲", "Armour"], ["potion", "药水", "Potions"],
    ["scroll", "卷轴", "Scrolls"], ["ring", "戒指", "Rings"], ["wand", "魔杖", "Wands"], ["rod", "权杖", "Rods"],
    ["wondrous", "奇物", "Wondrous"],
  ].map(([key, zh, en]) => ({ key, label: L(zh, en) }));
  const magicKind = (it) => (it.category === "weapon" || it.category === "armor" ? it.category : it.kind);

  /** Sub-filter rows under the selected main chip (see R20U.openPicker `chips.sub`). */
  function subFilters(key) {
    if (key === "weapon") {
      const ORDER = ["finesse", "light", "thrown", "heavy", "twoHanded", "versatile", "reach", "ammunition", "loading"];
      const props = [...glossary.values()].filter((g) => g.type === "property")
        .sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))
        .map((g) => ({ key: g.key, label: g.name }));
      return [
        // one weapon type at a time
        { options: WEAPON_TYPES, test: (it, sel) => WEAPON_TYPES.some((w) => sel.has(w.key) && w.test(it)) },
        // properties: any of the selected (OR)
        { options: props, multi: true, test: (it, sel) => (it.weapon?.properties || []).some((p) => sel.has(p.key)) },
      ];
    }
    if (key === "armor") return [{ options: ARMOR_TYPES, test: (it, sel) => sel.has(it.armor?.category) }];
    if (key === "magic") {
      return [
        { options: RARITIES, test: (it, sel) => sel.has(it.magic?.rarity) },
        { options: MAGIC_KINDS, test: (it, sel) => sel.has(magicKind(it)) },
      ];
    }
    return [];
  }

  const TEXT = {
    zh: { empty: "没有符合的物品", use: "加入此物品",
          dupWarn: (n) => `「${n}」已在物品栏中。仍要再加入一次吗？`,
          type: "类型", rarity: "稀有度", damage: "伤害", versatile: "双手", range: "射程",
          properties: "词条", mastery: "精通", ac: "护甲等级", strength: "力量需求", stealth: "隐匿",
          stealthDis: "劣势", weight: "重量", cost: "价格", charges: "充能", source: "来源",
          lb: (n) => `${n} 磅`, attuneShort: "同调", acShort: (n) => `AC ${n}`, strShort: (n) => `力量 ${n}`,
          stealthShort: "隐匿劣势", ft: "尺", page: (p) => `${p}页`, sep: "，",
          simple: "简易武器", martial: "军用武器", melee: "近战武器", ranged: "远程武器", mt: "⚠️ 机翻" },
    en: { empty: "No matching items", use: "Add this item",
          dupWarn: (n) => `"${n}" is already in the inventory. Add it again anyway?`,
          type: "Type", rarity: "Rarity", damage: "Damage", versatile: "Two-handed", range: "Range",
          properties: "Properties", mastery: "Mastery", ac: "Armor Class", strength: "Strength", stealth: "Stealth",
          stealthDis: "Disadvantage", weight: "Weight", cost: "Cost", charges: "Charges", source: "Source",
          lb: (n) => `${n} lb.`, attuneShort: "Attune", acShort: (n) => `AC ${n}`, strShort: (n) => `Str ${n}`,
          stealthShort: "Stealth Disadv.", ft: "ft.", page: (p) => `p. ${p}`, sep: ", ",
          simple: "Simple Weapon", martial: "Martial Weapon", melee: "Melee Weapon", ranged: "Ranged Weapon", mt: "" },
  };

  const span = (c, t) => R20U.span(c, t);
  const t = (localized, lang) => localized?.[lang] || localized?.en || "";
  /** 5e-cn marks entries without a named translator as machine-translated ("机翻"). */
  R20U.isMachineTranslated = (entry) => !entry.translator || entry.translator === "机翻";

  /** Properties in the UI language, e.g. "投掷 (20/60)，多用 (1d10)". */
  function propertyList(w, lang) {
    return (w.properties || []).map((p) => {
      let extra = t(p.note, lang);
      if (p.key === "versatile" && w.versatileDamage) extra = w.versatileDamage;
      if ((p.key === "thrown" || p.key === "ammunition") && w.range) extra = `${w.range.normal}/${w.range.long}`;
      const name = t(prop(p.key)?.name, lang) || p.key;
      return extra ? `${name} (${extra})` : name;
    }).join(TEXT[lang].sep);
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
      bits = [`${w.damage} ${t(w.damageType, lang)}`.trim(), propertyList(w, lang), t(mastery(w.mastery)?.name, lang)];
    } else if (it.armor) {
      const a = it.armor;
      bits = [tx.acShort(acText(a)), a.strength && tx.strShort(a.strength), a.stealthDisadvantage && tx.stealthShort];
    } else {
      bits = [t(it.cost, lang), it.weight != null && tx.lb(it.weight)];
    }
    return { line1, line2: [span("", bits.filter(Boolean).join(" · "))] };
  }

  /** "<b>灵巧 Finesse.</b> text" (zh shows both names, like 5e-cn), or "<b>Finesse.</b> text". */
  function rule(heading, text) {
    const p = Object.assign(document.createElement("p"), { className: "desc rule" });
    p.append(Object.assign(document.createElement("b"), { textContent: heading }), ` ${text}`);
    return p;
  }

  function renderDetails(it, { lang }) {
    const tx = TEXT[lang];
    const p = (cls, txt) => Object.assign(document.createElement("p"), { className: cls, textContent: txt });
    const w = it.weapon;
    const a = it.armor;
    const m = mastery(w?.mastery);
    const range = w?.range ? `${w.range.normal}/${w.range.long} ${tx.ft}` : "";
    const weaponKind = w ? [tx[w.category], w.melee ? tx.melee : tx.ranged].filter(Boolean).join(tx.sep) : "";

    const rows = [
      [tx.type, weaponKind || t(it.type, lang)],
      [tx.rarity, it.magic ? [t(it.magic.rarityName, lang), t(it.magic.attunement, lang)].filter(Boolean).join(" · ") : ""],
      [tx.damage, w ? `${w.damage} ${t(w.damageType, lang)}`.trim() : ""],
      [tx.versatile, w?.versatileDamage || ""],
      [tx.range, range],
      [tx.properties, w ? propertyList(w, lang) : ""],
      [tx.mastery, t(m?.name, lang)],
      [tx.ac, a ? acText(a) + (a.dexMax === 2 ? (lang === "zh" ? " + 敏捷（最多 2）" : " + Dex (max 2)")
        : a.dexMax === null && a.category !== "shield" ? (lang === "zh" ? " + 敏捷" : " + Dex") : "") : ""],
      [tx.strength, a?.strength ? String(a.strength) : ""],
      [tx.stealth, a?.stealthDisadvantage ? tx.stealthDis : ""],
      [tx.charges, it.magic?.charges ? String(it.magic.charges) : ""],
      [tx.weight, it.weight != null ? tx.lb(it.weight) : ""],
      [tx.cost, t(it.cost, lang)],
    ];

    const body = [];
    if (lang === "zh" && R20U.isMachineTranslated(it)) body.push(p("mt", tx.mt));
    if (t(it.description, lang)) body.push(p("desc", t(it.description, lang)));
    // Property and mastery rules, like the 5e-cn item page.
    for (const ref of w?.properties || []) {
      const g = prop(ref.key);
      if (!g || !t(g.description, lang)) continue;
      body.push(rule(lang === "zh" ? `${g.name.zh} ${g.name.en}.` : `${g.name.en}.`, t(g.description, lang)));
    }
    if (m && t(m.description, lang)) {
      body.push(rule(lang === "zh" ? `精通：${m.name.zh} ${m.name.en}.` : `Mastery: ${m.name.en}.`, t(m.description, lang)));
    }
    const book = it.source === "XDMG" ? "DMG'24" : "PHB'24";
    return { rows, body, source: `${tx.source}: ${book}, ${tx.page(it.page)}${it.srd52 ? " · SRD 5.2" : ""}` };
  }

  return { CSS, TEXT, CATEGORIES, inCategories, subFilters, setGlossary, mastery, renderRow, renderDetails };
})();
