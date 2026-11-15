// Items module: maps an item from data/*/items.json onto the fields of a Roll20
// "D&D 5E by Roll20" inventory row (repeating_inventory).
//
// The sheet's own workers do the rest (checked in the sheet source, see test/fixtures):
//  - itemmodifiers "Item Type: Melee Weapon, Damage: 1d4, ..." + hasattack -> attack row
//    (create_attack_from_item), " Attacks +1" / " Damage +1" -> its magic bonus
//  - "AC: 16" / "AC +1" on an equipped item -> AC (update_ac); "Saving Throws +1", "Spell DC +1",
//    "Strength: 19" -> saves, spellcasting, ability scores
//  - itemproperties containing "Finesse" -> STR or DEX for the attack
//  - useasresource -> a resource row counting itemcount
// Every managed field is always written, so replacing a Longsword with a Rope leaves no attack.

var R20U = (globalThis.R20U ??= {});

(() => {
  /** "Arrows (20)" bought as a bundle -> filled as 20 × "Arrows", so the count can be a resource. */
  function ammoBundle(item) {
    const c = item.contents;
    return item.category === "ammo" && c?.length === 1 && c[0].quantity > 1 ? c[0].quantity : 0;
  }

  const stripBundleCount = (name) => name.replace(/\s*[（(]\s*\d+\s*[)）]\s*$/, "");

  /** Text for the item's notes (itemcontent): magic info, description, weapon mastery. */
  R20U.itemContent = function (item, lang) {
    const t = (localized) => localized?.[lang] || localized?.en || "";
    const zh = lang === "zh";
    const parts = [];
    if (item.magic) {
      parts.push([t(item.type), t(item.magic.rarityName), t(item.magic.attunement)].filter(Boolean)
        .join(zh ? "，" : ", "));
    }
    if (t(item.description)) parts.push(t(item.description));
    const m = R20U.itemView.mastery(item.weapon?.mastery); // from item-properties.json
    if (m) parts.push(`${zh ? "武器精通" : "Mastery"}: ${t(m.name)}${t(m.description) ? ` — ${t(m.description)}` : ""}`);
    return parts.join("\n\n");
  };

  const DAMAGE_TYPES_ZH = {
    Acid: "强酸", Bludgeoning: "钝击", Cold: "寒冷", Fire: "火焰", Force: "力场", Lightning: "闪电",
    Necrotic: "黯蚀", Piercing: "穿刺", Poison: "毒素", Psychic: "心灵", Radiant: "光耀", Slashing: "挥砍",
    Thunder: "雷鸣",
  };

  /**
   * The Roll20 modifiers with the damage type values in the UI language
   * ("Damage Type: 穿刺"): the sheet copies them into the attack as text. The keys stay English,
   * because the sheet's workers look for "Damage Type:", "Item Type:"...
   */
  R20U.localizedModifiers = (mods, lang) =>
    lang !== "zh" ? mods : mods.replace(/(Damage Type: )([A-Za-z]+)/g, (all, key, type) => key + (DAMAGE_TYPES_ZH[type] || type));

  /**
   * Returns [attrName, value] pairs, in fill order.
   * @param {object} item
   * @param {"zh"|"en"} lang
   */
  R20U.itemToRowFields = function (item, lang) {
    const t = (localized) => localized?.[lang] || localized?.en || "";
    const bundle = ammoBundle(item);
    const count = bundle || 1;
    const weight = item.weight == null ? "" : bundle ? Math.round((item.weight / bundle) * 1000) / 1000 : item.weight;
    // Only real weapons get an attack (a Staff of Charming is a wondrous item, a Rod of Lordly
    // Might has no damage dice in the data).
    const hasAttack = item.category === "weapon" && /Damage:/.test(item.roll20Modifiers || "");
    const isResource = item.category === "consumable" || item.category === "ammo";

    return [
      ["itemname", bundle ? stripBundleCount(t(item.name)) : t(item.name)],
      ["itemcount", String(count)],
      ["itemweight", String(weight)],
      // Properties stay English (the sheet looks for "Finesse" -> STR/DEX); modifiers keep English
      // keys (Item Type, Damage, AC...) with damage type values in the UI language.
      ["itemproperties", item.roll20Properties || ""],
      ["itemmodifiers", R20U.localizedModifiers(item.roll20Modifiers || "", lang)],
      ["itemcontent", R20U.itemContent(item, lang)],
      // Checkboxes last: the sheet builds the attack / resource from the values saved above.
      ["equipped", true],
      ["useasresource", isResource],
      ["hasattack", hasAttack],
    ];
  };
})();
