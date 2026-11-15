// Traits module, Features & Traits (repeating_traits). Two pickers:
//  - 📖 (row ⚙ panel, and "📖 +" by +Add): one feat into the row / a new row.
//  - 👥 + (after "📖 +"): a background or species (each lineage its own entry). Adds every trait
//    it gives that isn't on the sheet yet, each as a new row: a background adds its own row
//    plus its origin feat; a species adds all its traits (Relentless Endurance, Darkvision, ...).
// Mapping in fill.js, look in view.js.

var R20U = (globalThis.R20U ??= {});

(() => {
  const MODULE_ID = "traits";
  const SECTION = "repeating_traits";
  const FEAT_TITLE = { zh: "选择专长", en: "Pick a feat" };
  const ORIGIN_TITLE = { zh: "按背景或种族加入特性", en: "Add traits from a background or species" };

  const rowName = (row) => R20U.editableFields(row, "name")[0]?.value?.trim() || "";
  const rowDesc = (row) => R20U.editableFields(row, "description")[0]?.value || "";
  const norm = (n) => String(n || "").trim().toLowerCase().replace(/\s+/g, " ");
  const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  /**
   * Whether a row name contains this name as a whole: "坚韧不屈 Relentless Endurance" has both
   * "坚韧不屈" and "Relentless Endurance"; "幸运儿" (Lucky) does not have "幸运" (Luck).
   */
  const nameIn = (rowNameNorm, name) => {
    const n = norm(name);
    return Boolean(n) && new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(n)}($|[^\\p{L}\\p{N}])`, "u").test(rowNameNorm);
  };

  /** Feats with variants (Magic Initiate) become one entry per variant, e.g. "Magic Initiate (Cleric)". */
  function flattenFeats(feats) {
    return feats.flatMap((f) => {
      const base = { ...f, kind: "feat" };
      delete base.variants;
      if (!f.variants?.length) return [base];
      return f.variants.map((v) => ({ ...base, ...v, parentId: f.id }));
    });
  }

  const byName = (a, b) => a.name.en.localeCompare(b.name.en);

  async function loadFeats() {
    return flattenFeats((await R20U.getData("feats")) || []).sort(byName);
  }

  /**
   * Add the traits that aren't on the sheet yet, each as a new row, in order. A row "has" a trait
   * when its name contains the trait's zh or en name. Traits with a value (Darkvision 120) also
   * need that value in the row's description; if not, that row is overwritten with the new one.
   */
  async function addMissingTraits(groupName, traits, lang) {
    const ui = R20U.ui(lang);
    const rows = R20U.sectionRows(groupName).map((row) => ({ row, name: norm(rowName(row)) }));
    const count = { added: 0, updated: 0, skipped: 0 };
    for (const trait of traits) {
      const found = rows.find((r) => nameIn(r.name, trait.name.zh) || nameIn(r.name, trait.name.en));
      const values = R20U.traitParamValues(trait);
      if (found && values.every((v) => rowDesc(found.row).includes(v))) {
        count.skipped++;
        continue;
      }
      const row = found?.row || (await R20U.addRow(groupName));
      await R20U.fillWithProgress(row, R20U.traitToRowFields(trait, lang), trait.name[lang], lang);
      if (found) count.updated++;
      else {
        count.added++;
        rows.push({ row, name: norm(trait.name[lang]) });
      }
    }
    R20U.toast(ui.traitsAdded(count), 5000);
  }

  function busy() {
    if (!R20U.isFilling()) return false;
    R20U.toast(R20U.ui(R20U.settings.lang).waitFill);
    return true;
  }

  /** 📖: pick one feat. @param {Element|null} row  row to overwrite, or null to add a new row first */
  async function openFeatPicker(groupName, row) {
    if (busy()) return;
    const [settings, feats] = await Promise.all([R20U.getSettings(), loadFeats()]);
    if (!feats.length) return R20U.toast(R20U.ui(settings.lang).noTraitData);
    const view = R20U.traitView;
    R20U.openPicker({
      module: MODULE_ID,
      css: view.CSS,
      title: FEAT_TITLE,
      items: feats,
      lang: settings.lang,
      text: view.TEXT,
      renderRow: view.renderRow,
      renderDetails: view.renderDetails,
      chips: { options: view.FEAT_CATEGORIES, selected: [], test: view.inCategories },
      showAltName: settings.showAltName,
      onAltToggle: (showAltName) => R20U.saveSettings({ showAltName }),
      currentName: row ? rowName(row) : "",
      chosenNames: R20U.sectionRows(groupName).filter((r) => r !== row).map(rowName).filter(Boolean),
      onPick: async (feat, lang) => {
        try {
          const target = row || (await R20U.addRow(groupName));
          await R20U.fillWithProgress(target, R20U.traitToRowFields(feat, lang), feat.name[lang], lang);
        } catch (err) {
          console.warn(R20U.LOG_PREFIX, err);
          R20U.toast(String(err.message || err));
        }
      },
    });
  }

  /** The traits a background gives: its own row, then its origin feat (if in the data). */
  function backgroundTraits(background, feats) {
    const ref = background.feat;
    const feat = ref && (feats.find((f) => f.id === (ref.variantId || ref.id)) || feats.find((f) => f.id === ref.id));
    return [background, feat].filter(Boolean);
  }

  /** 👥: pick a background or species; adds all its traits that are missing. */
  async function openOriginPicker(groupName) {
    if (busy()) return;
    const [settings, feats, bgData, speciesData] = await Promise.all([
      R20U.getSettings(), loadFeats(), R20U.getData("backgrounds"), R20U.getData("species"),
    ]);
    const items = [
      ...R20U.speciesEntries(speciesData || []).sort(byName),
      ...(bgData || []).map((b) => ({ ...b, kind: "background" })).sort(byName),
    ];
    if (!items.length) return R20U.toast(R20U.ui(settings.lang).noTraitData);
    const view = R20U.traitView;
    R20U.openPicker({
      module: MODULE_ID,
      css: view.CSS,
      title: ORIGIN_TITLE,
      items,
      lang: settings.lang,
      text: view.TEXT,
      renderRow: view.renderRow,
      renderDetails: view.renderDetails,
      chips: { options: view.ORIGIN_CATEGORIES, selected: [], test: view.inCategories },
      showAltName: settings.showAltName,
      onAltToggle: (showAltName) => R20U.saveSettings({ showAltName }),
      onPick: async (entry, lang) => {
        try {
          const traits = entry.kind === "species" ? entry.traits : backgroundTraits(entry, feats);
          await addMissingTraits(groupName, traits, lang);
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
      const ui = () => R20U.ui(R20U.settings.lang);
      R20U.injectSectionButtons(MODULE_ID, [SECTION], {
        rowLabel: () => ({ text: ui().pickFeat }),
        addLabel: () => ({ text: "📖 +", title: ui().addFeat }),
        onRow: openFeatPicker,
        onAdd: (groupName) => openFeatPicker(groupName, null),
      });
      R20U.injectSectionButtons(MODULE_ID, [SECTION], {
        key: "traits-origin",
        addLabel: () => ({ text: "👥 +", title: ui().addOrigin }),
        onAdd: openOriginPicker,
      });
    },
  });
})();
