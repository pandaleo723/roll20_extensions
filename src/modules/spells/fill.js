// Spells module: maps a spell from data/*/spells.json onto the fields of a Roll20
// "D&D 5E by Roll20" repeating spell row (repeating_spell-cantrip, -1, -2, ...).
//
// Every field we manage is always written, with an empty/"none" value when the spell doesn't
// use it, so replacing e.g. Fireball with Blade Ward leaves no stale damage behind.
// Fields that already hold the right value are skipped by fillFields (no time cost).
//
// Order = the order of the fields in the row's ⚙ edit panel (top to bottom), so the user sees
// the panel fill in sequence. Panel order on the "D&D 5E by Roll20" sheet:
//   name, school, ritual, casting time, range, (target), V, S, M, materials, concentration,
//   duration, spell ability, (innate), output, spell attack, damage, damage type, damage 2,
//   damage type 2, healing, add ability mod, cantrip progression (cantrips only), save,
//   save effect, upcast dice, upcast die type, (upcast bonus, include desc), description,
//   at higher levels   — fields in () are left alone.

var R20U = (globalThis.R20U ??= {});

/**
 * Returns [attrName, value] pairs, in fill order.
 * @param {object} spell
 * @param {"zh"|"en"} lang
 */
R20U.spellToRowFields = function (spell, lang) {
  const t = (localized) => localized?.[lang] || localized?.en || "";
  const isHeal = Boolean(spell.healing);
  // ATTACK only for spells that roll something (damage, healing, attack roll);
  // save-only spells (e.g. Friends) stay as spell cards.
  const isAttack = Boolean(spell.damage || isHeal || spell.attack !== "None");
  const roll = (value) => (isAttack ? value : ""); // roll-only fields are cleared on spell cards

  return [
    ["spellname", t(spell.name)],
    ["spellschool", spell.school],
    ["spellritual", spell.ritual],
    ["spellcastingtime", t(spell.castingTime)],
    ["spellrange", t(spell.range)],
    ["spellcomp_v", spell.components.v],
    ["spellcomp_s", spell.components.s],
    ["spellcomp_m", spell.components.m],
    ["spellcomp_materials", t(spell.materials)],
    ["spellconcentration", spell.concentration],
    ["spellduration", t(spell.duration)],
    // "spell" (法術) = the character's spellcasting ability; "0*" (無) when the spell doesn't use it
    ["spell_ability", spell.usesSpellcastingAbility ? "spell" : "0*"],
    // Output early (as on the panel): switching it makes the sheet create/remove the linked
    // attack row; later field changes update that attack.
    ["spelloutput", isAttack ? "ATTACK" : "SPELLCARD"],
    ["spellattack", isAttack ? spell.attack : "None"],
    // Base dice (e.g. "1d10"); spell_damage_progression makes the sheet scale cantrips.
    ["spelldamage", roll(spell.damage || "")],
    ["spelldamagetype", roll(t(spell.damageType))],
    ["spelldamage2", roll(spell.damage2 || "")],
    ["spelldamagetype2", roll(t(spell.damageType2))],
    // Healing spells use the sheet's own healing field (e.g. Cure Wounds "2d8")
    ["spellhealing", roll(spell.healing || "")],
    // "+ spellcasting ability modifier" on the damage/healing roll
    ["spelldmgmod", isAttack && spell.addSpellMod ? "Yes" : false],
    // Scaling with CHARACTER level (戲法進度): only cantrip rows have this field.
    ...(spell.level === 0 ? [["spell_damage_progression", roll(spell.cantripProgression || "")]] : []),
    ["spellsave", spell.save || ""],
    ["spellsavesuccess", t(spell.saveSuccess)],
    // Scaling with SPELL SLOT level (升環施法傷害), e.g. Fireball +1d6 per slot above 3rd.
    // Cantrips never upcast.
    ["spellhldie", roll(spell.upcast?.count || "")],
    ["spellhldietype", roll(spell.upcast?.die || "")],
    ["spelldescription", t(spell.description)],
    ["spellathigherlevels", t(spell.higherLevels)],
  ];
};
