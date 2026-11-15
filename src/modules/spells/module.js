// Spells module: 📖 buttons in every spell section (cantrips to 9th level), the spell picker,
// and filling the picked spell into the row (mapping in fill.js, list look in view.js).

var R20U = (globalThis.R20U ??= {});

(() => {
  const MODULE_ID = "spells";

  /** Roll20 group name -> spell level. */
  const SPELL_SECTIONS = {
    "repeating_spell-cantrip": 0,
    "repeating_spell-1": 1,
    "repeating_spell-2": 2,
    "repeating_spell-3": 3,
    "repeating_spell-4": 4,
    "repeating_spell-5": 5,
    "repeating_spell-6": 6,
    "repeating_spell-7": 7,
    "repeating_spell-8": 8,
    "repeating_spell-9": 9,
  };

  /** Both languages, so the title follows the language setting. */
  const sectionTitle = (level) =>
    level === 0
      ? { zh: "选择戏法", en: "Pick a cantrip" }
      : { zh: `选择 ${level} 环法术`, en: `Pick a level ${level} spell` };

  const spellName = (row) => R20U.editableFields(row, "spellname")[0]?.value?.trim() || "";

  /** @param {Element|null} row  row to overwrite, or null to add a new row first */
  async function openSpellPicker(groupName, row) {
    const ui = R20U.ui(R20U.settings.lang);
    if (R20U.isFilling()) {
      R20U.toast(ui.waitFill);
      return;
    }
    const level = SPELL_SECTIONS[groupName];
    const [settings, spells] = await Promise.all([R20U.getSettings(), R20U.getData("spells", { level })]);
    if (!spells?.length) {
      R20U.toast(ui.noData);
      return;
    }
    // Read the class when the picker opens, so a class change on the sheet is picked up.
    const detected = settings.autoClass ? R20U.detectClasses() : [];
    const view = R20U.spellView;

    R20U.openPicker({
      module: MODULE_ID,
      css: view.CSS,
      title: sectionTitle(level),
      items: spells,
      lang: settings.lang,
      text: view.TEXT,
      renderRow: view.renderRow,
      renderDetails: view.renderDetails,
      chips: {
        options: R20U.SPELL_CLASSES.map((c) => ({ key: c, label: R20U.CLASS_NAMES[c] })),
        selected: settings.autoClass ? detected : settings.classFilter,
        detected,
        test: (s, selected) => s.classes?.some((c) => selected.has(c)),
      },
      showAltName: settings.showAltName,
      onAltToggle: (showAltName) => R20U.saveSettings({ showAltName }),
      // Spells already in this section: the row being edited is "current", the others "chosen".
      currentName: row ? spellName(row) : "",
      chosenNames: R20U.sectionRows(groupName).filter((r) => r !== row).map(spellName).filter(Boolean),
      onPick: async (spell, lang) => {
        try {
          const target = row || (await R20U.addRow(groupName));
          await R20U.fillWithProgress(target, R20U.spellToRowFields(spell, lang), spell.name[lang], lang);
        } catch (err) {
          console.warn(R20U.LOG_PREFIX, err);
          R20U.toast(String(err.message || err));
        }
      },
    });
  }

  R20U.registerModule({
    id: MODULE_ID,
    inject() {
      R20U.injectSectionButtons(MODULE_ID, Object.keys(SPELL_SECTIONS), {
        rowLabel: () => ({ text: R20U.ui(R20U.settings.lang).pickFromList }),
        addLabel: () => ({ text: "📖 +", title: R20U.ui(R20U.settings.lang).addFromList }),
        onRow: openSpellPicker,
        onAdd: (groupName) => openSpellPicker(groupName, null),
      });
    },
  });
})();
