// Traits module, Features & Traits (repeating_traits). Buttons by +Add:
//  - 📖 + (and 📖 in each row's ⚙ panel): pick one feat into a new row / that row.
//  - 👥 背景 +: pick a background; adds its origin feat unless it's already on the sheet.
//  - 🧝 种族 +: species panel (species.js): one species, one lineage, then tick the traits to add.
// Only missing traits are added. Mapping in fill.js, look in view.js.

var R20U = (globalThis.R20U ??= {});

(() => {
  const MODULE_ID = "traits";
  const SECTION = "repeating_traits";
  const FEAT_TITLE = { zh: "选择专长", en: "Pick a feat" };
  const BG_TITLE = { zh: "按背景加入起源专长", en: "Add a background's origin feat" };

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

  const sheetRows = (groupName) => R20U.sectionRows(groupName).map((row) => ({ row, name: norm(rowName(row)) }));

  /**
   * Where a trait stands on the sheet: "add" (no row has its name), "has" (a row has it, and any
   * value it needs, e.g. Darkvision 120), or "update" (a row has it with another value).
   */
  function traitStatus(rows, trait) {
    const found = rows.find((r) => nameIn(r.name, trait.name.zh) || nameIn(r.name, trait.name.en));
    if (!found) return { status: "add" };
    const ok = R20U.traitParamValues(trait).every((v) => rowDesc(found.row).includes(v));
    return { status: ok ? "has" : "update", row: found.row };
  }

  /** Add / update the given traits (re-checked against the sheet now), each in its own row. */
  async function addTraits(groupName, traits, lang) {
    const ui = R20U.ui(lang);
    const rows = sheetRows(groupName);
    const count = { added: 0, updated: 0, skipped: 0 };
    for (const trait of traits) {
      const { status, row: found } = traitStatus(rows, trait);
      if (status === "has") {
        count.skipped++;
        continue;
      }
      const row = found || (await R20U.addRow(groupName));
      await R20U.fillWithProgress(row, R20U.traitToRowFields(trait, lang), trait.name[lang], lang);
      if (found) count.updated++;
      else {
        count.added++;
        rows.push({ row, name: norm(trait.name[lang]) });
      }
    }
    R20U.toast(ui.traitsAdded(count), 5000);
  }

  const fail = (err) => {
    console.warn(R20U.LOG_PREFIX, err);
    R20U.toast(String(err.message || err));
  };

  function busy() {
    if (!R20U.isFilling()) return false;
    R20U.toast(R20U.ui(R20U.settings.lang).waitFill);
    return true;
  }

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
  const loadFeats = async () => flattenFeats((await R20U.getData("feats")) || []).sort(byName);

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
          fail(err);
        }
      },
    });
  }

  /** 👥 背景: each background with its origin feat and whether the sheet has it. */
  async function openBackgroundPicker(groupName) {
    if (busy()) return;
    const [settings, feats, bgData] = await Promise.all([R20U.getSettings(), loadFeats(), R20U.getData("backgrounds")]);
    const rows = sheetRows(groupName);
    const items = (bgData || []).map((b) => {
      const ref = b.feat;
      const feat = ref && (feats.find((f) => f.id === (ref.variantId || ref.id)) || feats.find((f) => f.id === ref.id));
      return { ...b, kind: "background", originFeat: feat, featStatus: feat ? traitStatus(rows, feat).status : "" };
    }).filter((b) => b.originFeat).sort(byName);
    if (!items.length) return R20U.toast(R20U.ui(settings.lang).noTraitData);
    const view = R20U.traitView;
    R20U.openPicker({
      module: MODULE_ID,
      css: view.CSS,
      title: BG_TITLE,
      items,
      lang: settings.lang,
      text: view.TEXT,
      renderRow: view.renderRow,
      renderDetails: view.renderDetails,
      showAltName: settings.showAltName,
      onAltToggle: (showAltName) => R20U.saveSettings({ showAltName }),
      onPick: async (bg, lang) => {
        try {
          await addTraits(groupName, [bg.originFeat], lang);
        } catch (err) {
          fail(err);
        }
      },
    });
  }

  /** 🧝 种族: the species panel; adds the ticked traits. */
  async function openSpecies(groupName) {
    if (busy()) return;
    const [settings, speciesData] = await Promise.all([R20U.getSettings(), R20U.getData("species")]);
    const species = R20U.speciesEntries([...(speciesData || [])].sort(byName));
    if (!species.length) return R20U.toast(R20U.ui(settings.lang).noTraitData);
    const rows = sheetRows(groupName);
    R20U.openSpeciesPanel({
      module: MODULE_ID,
      entries: species,
      lang: settings.lang,
      statusOf: (trait) => traitStatus(rows, trait).status,
      onAdd: (traits, lang) => addTraits(groupName, traits, lang).catch(fail),
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
        key: "traits-background",
        addLabel: () => ({ text: ui().bgButton, title: ui().bgButtonHint }),
        onAdd: openBackgroundPicker,
      });
      R20U.injectSectionButtons(MODULE_ID, [SECTION], {
        key: "traits-species",
        addLabel: () => ({ text: ui().speciesButton, title: ui().speciesButtonHint }),
        onAdd: openSpecies,
      });
    },
  });
})();
