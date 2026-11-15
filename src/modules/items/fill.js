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
    const m = item.weapon?.mastery;
    if (m) parts.push(`${zh ? "武器精通" : "Mastery"}: ${t(m.name)}${t(m.description) ? ` — ${t(m.description)}` : ""}`);
    return parts.join("\n\n");
  };

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
      // English on purpose: the sheet parses these (Finesse -> STR/DEX, Item Type, Damage, AC...).
      ["itemproperties", item.roll20Properties || ""],
      ["itemmodifiers", item.roll20Modifiers || ""],
      ["itemcontent", R20U.itemContent(item, lang)],
      // Checkboxes last: the sheet builds the attack / resource from the values saved above.
      ["equipped", true],
      ["useasresource", isResource],
      ["hasattack", hasAttack],
    ];
  };
})();
