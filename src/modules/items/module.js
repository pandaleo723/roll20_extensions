// Items module: 📖 buttons in the inventory (repeating_inventory), the item picker, and filling
// the picked item into the row (mapping in fill.js, list look in view.js).

var R20U = (globalThis.R20U ??= {});

(() => {
  const MODULE_ID = "items";
  const SECTION = "repeating_inventory";
  const TITLE = { zh: "选择物品", en: "Pick an item" };

  const itemName = (row) => R20U.editableFields(row, "itemname")[0]?.value?.trim() || "";

  /** @param {Element|null} row  row to overwrite, or null to add a new row first */
  async function openItemPicker(groupName, row) {
    const ui = R20U.ui(R20U.settings.lang);
    if (R20U.isFilling()) {
      R20U.toast(ui.waitFill);
      return;
    }
    const [settings, all] = await Promise.all([R20U.getSettings(), R20U.getData("items")]);
    // Mounts and vehicles ("other") don't belong in a character's inventory.
    const items = (all || []).filter((it) => it.category && it.category !== "other");
    if (!items.length) {
      R20U.toast(ui.noItemData);
      return;
    }
    const view = R20U.itemView;

    R20U.openPicker({
      module: MODULE_ID,
      css: view.CSS,
      title: TITLE,
      items,
      lang: settings.lang,
      text: view.TEXT,
      renderRow: view.renderRow,
      renderDetails: view.renderDetails,
      chips: { options: view.CATEGORIES, selected: [], test: view.inCategories },
      showAltName: settings.showAltName,
      onAltToggle: (showAltName) => R20U.saveSettings({ showAltName }),
      // Items already in the inventory: the row being edited is "current", the others "chosen".
      currentName: row ? itemName(row) : "",
      chosenNames: R20U.sectionRows(groupName).filter((r) => r !== row).map(itemName).filter(Boolean),
      onPick: async (item, lang) => {
        try {
          const target = row || (await R20U.addRow(groupName));
          await R20U.fillWithProgress(target, R20U.itemToRowFields(item, lang), item.name[lang], lang);
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
      R20U.injectSectionButtons(MODULE_ID, [SECTION], {
        // Inventory rows have no ⚙ panel: their details open with the row's "i" toggle.
        rowPanel: ".subitem",
        rowLabel: () => ({ text: R20U.ui(R20U.settings.lang).pickItem }),
        addLabel: () => ({ text: "📖 +", title: R20U.ui(R20U.settings.lang).addItem }),
        onRow: openItemPicker,
        onAdd: (groupName) => openItemPicker(groupName, null),
      });
    },
  });
})();
