// Traits module: 📖 buttons in Features & Traits (repeating_traits), a picker for feats and
// backgrounds, and filling the picked entry into the row (mapping in fill.js, look in view.js).
//
// Picking a background also adds its origin feat as a second row, unless a row with that feat's
// name (either language) is already there.

var R20U = (globalThis.R20U ??= {});

(() => {
  const MODULE_ID = "traits";
  const SECTION = "repeating_traits";
  const TITLE = { zh: "选择专长或背景", en: "Pick a feat or background" };

  const rowName = (row) => R20U.editableFields(row, "name")[0]?.value?.trim() || "";
  const norm = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");

  /** Feats with variants (Magic Initiate) become one entry per variant, e.g. "Magic Initiate (Cleric)". */
  function flattenFeats(feats) {
    return feats.flatMap((f) => {
      const base = { ...f, kind: "feat" };
      delete base.variants;
      if (!f.variants?.length) return [base];
      return f.variants.map((v) => ({ ...base, ...v, parentId: f.id }));
    });
  }

  /** Add the background's origin feat as a new row if no row has it yet. */
  async function addBackgroundFeat(groupName, background, feats, lang) {
    const ui = R20U.ui(lang);
    const ref = background.feat;
    if (!ref) return;
    const feat = feats.find((f) => f.id === (ref.variantId || ref.id)) || feats.find((f) => f.id === ref.id);
    const featName = feat?.name || ref.name;
    const names = new Set(R20U.sectionRows(groupName).map(rowName).map(norm));
    if ([featName.zh, featName.en].some((n) => names.has(norm(n)))) {
      R20U.toast(ui.bgFeatExists(featName[lang] || featName.en));
      return;
    }
    if (!feat) {
      R20U.toast(ui.bgFeatMissing(featName[lang] || featName.en), 5000);
      return;
    }
    const row = await R20U.addRow(groupName);
    await R20U.fillWithProgress(row, R20U.traitToRowFields(feat, lang), feat.name[lang], lang);
  }

  /** @param {Element|null} row  row to overwrite, or null to add a new row first */
  async function openTraitPicker(groupName, row) {
    const ui = R20U.ui(R20U.settings.lang);
    if (R20U.isFilling()) {
      R20U.toast(ui.waitFill);
      return;
    }
    const [settings, featData, bgData] = await Promise.all([
      R20U.getSettings(), R20U.getData("feats"), R20U.getData("backgrounds"),
    ]);
    const feats = flattenFeats(featData || []);
    const backgrounds = (bgData || []).map((b) => ({ ...b, kind: "background" }));
    const byName = (a, b) => a.name.en.localeCompare(b.name.en);
    const items = [...feats.sort(byName), ...backgrounds.sort(byName)];
    if (!items.length) {
      R20U.toast(ui.noTraitData);
      return;
    }
    const view = R20U.traitView;

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
      currentName: row ? rowName(row) : "",
      chosenNames: R20U.sectionRows(groupName).filter((r) => r !== row).map(rowName).filter(Boolean),
      onPick: async (entry, lang) => {
        try {
          const target = row || (await R20U.addRow(groupName));
          await R20U.fillWithProgress(target, R20U.traitToRowFields(entry, lang), entry.name[lang], lang);
          if (entry.kind === "background") await addBackgroundFeat(groupName, entry, feats, lang);
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
        rowLabel: () => ({ text: R20U.ui(R20U.settings.lang).pickTrait }),
        addLabel: () => ({ text: "📖 +", title: R20U.ui(R20U.settings.lang).addTrait }),
        onRow: openTraitPicker,
        onAdd: (groupName) => openTraitPicker(groupName, null),
      });
    },
  });
})();
