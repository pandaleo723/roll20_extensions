# Roll20 Utils Extension

An open-source Chrome extension (Manifest V3) with helper tools for [Roll20](https://app.roll20.net).
Each tool is a module you can switch on or off.

Modules for the D&D 5e character sheet ("D&D 5E by Roll20" sheet), in Chinese or English:

- **Spell picker**: pick a spell from a searchable list and the extension fills the whole spell
  row: school, casting time, range, components, duration, description, attack/save, damage or
  healing, cantrip scaling and upcast dice.
- **Item picker**: pick a weapon, armour, gear, tool, consumable or magic item and it is added to
  the inventory; the sheet then builds the weapon's attack, counts armour in your AC and tracks
  consumables and ammo as resources.
- **Traits picker**: 📖 picks a feat (origin, general, fighting style, epic boon) into Features &
  Traits; 👥 Background + adds a background's origin feat; 🧝 Species + picks a species and lineage
  and adds the ticked traits (Relentless Endurance, Darkvision, ...). Traits already there are skipped.

> **Unofficial fan project.** Not affiliated with, endorsed or sponsored by Roll20 or
> Wizards of the Coast. **The game data is not mine**: see [Data sources & disclaimer](#data-sources--disclaimer).

## Features

- 📖 buttons in every spell section (cantrips to 9th level):
  - inside a row's ⚙ edit panel: replace that row's spell
  - **📖 +** next to Roll20's **+Add**: add a new row with the picked spell
- Searchable spell list with:
  - class filter, auto-detected from the sheet (incl. multiclass) or set by hand
  - spell details (ⓘ) without leaving the list
  - markers for spells already on the sheet ([Current] / [Chosen])
  - Chinese or English text, optionally showing the name in the other language
- Fills the fields Roll20 uses for rolls: attack or spell card output, damage / healing,
  cantrip progression, upcast dice, spellcasting ability, saves
- 📖 buttons in the inventory: inside a row's "i" details (replace that item) and **📖 +**
  next to **+Add**
- Searchable item list (PHB 2024 equipment + the SRD 5.2 magic items of the DMG 2024) with
  category chips (weapons, armour, ammo, gear, tools, consumables, magic items) and details
  (damage, properties, mastery, AC, rarity, weight, cost, description)
- Fills name, count, weight, properties, modifiers (Roll20 compendium format, so the sheet creates
  the attack, AC and magic bonuses), notes (description + weapon mastery), *has attack* for
  weapons and *use as resource* for consumables and ammo (e.g. Arrows ×20)
- Features & Traits buttons: **📖** picks a feat (origin, general, fighting style, epic boon),
  **👥 Background +** adds a background's origin feat (filed under that background),
  **🧝 Species +** picks a species and lineage and adds the ticked traits; traits already on the
  sheet are skipped
- Settings: quick settings in the toolbar popup, all settings on the options page; each picker can
  be switched on or off
- Saves reliably: edits are paced to match how the Roll20 sheet saves changes

## Install (from source)

Requirements: Chrome (or another Chromium browser) and [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/pandaleo723/roll20_extensions.git
```

```bash
cd roll20_extensions
```

The bundled data files (`data/srd/`) are included in the repo. To (re)build them:

```bash
node scripts/build-all.js
```

Then in Chrome:
1. Open `chrome://extensions` and turn on **Developer mode**.
2. Click **Load unpacked** and select the project folder.
3. Open (or refresh) a character sheet on Roll20.

## Use

1. Open a character on Roll20 and go to the spells page.
2. Click **📖 +** next to **+Add** in a spell section, or open a spell row's ⚙ and click
   **📖 Pick from list**.
3. Search, optionally filter by class, then click a spell. Filling takes a few seconds
   (about 0.6 s per changed field) because Roll20 only saves one edit at a time.
4. Items: on the inventory, click **📖 +** next to **+Add**, or open an item row's **i** details
   and click **📖 Pick from list**. Filter by category, then click an item.
5. Feats, backgrounds, species: in Features & Traits, use **📖 +**, **👥 Background +** or
   **🧝 Species +**.

Settings: click the toolbar icon, or open the options page (**All settings** in the popup, or
right-click the icon → **Options**): language, other-language names, modules on/off, class filter.

## Development

**Adding a module:**
1. Create `src/modules/<id>/`. Register it with `R20U.registerModule({ id, inject })`, and reuse
   `R20U.injectSectionButtons`, `R20U.openPicker` and `R20U.fillWithProgress`
   (see `src/modules/spells/`).
2. Add its scripts to `manifest.json`, before `src/content/content.js`.
3. Add an entry to `R20U.MODULES` (`src/shared/settings.js`) and a card in `src/popup/popup.html`.

```
manifest.json                Extension config (permissions, scripts)
src/background/background.js Loads the data files, answers content-script queries
src/content/                 Core, runs inside the Roll20 sheet: field filling (fields.js),
                             sheet helpers + 📖 buttons + module registry (sheet.js),
                             generic picker (picker.js), entry point (content.js)
src/modules/<name>/          One folder per module, e.g. spells/: module.js (buttons, picker
                             wiring), view.js (list row + details), fill.js (data -> sheet fields)
src/shared/settings.js       Settings, module list and UI text shared by popup and content scripts
src/popup/                   Settings page, used as both the toolbar popup and the options page
                             (manifest options_ui; two columns in a wide tab)
scripts/build-all.js         Builds data/ from 5etools-cn (spells, items, feats, species, ...)
scripts/lib/5etools.js       Shared build helpers: fetch, 5etools markup -> plain text
data/srd/                    Generated SRD 5.2 data (committed)
tools/harness/               Local test page that emulates the Roll20 sheet
```

- **Testing without Roll20:** `node tools/harness/serve.js` runs the content scripts against a
  saved copy of a sheet and shows what Roll20 would save. See
  [tools/harness/README.md](tools/harness/README.md).
- **Debugging:** the sheet runs in a cross-origin iframe
  (`storage.googleapis.com/roll20-cdn/.../legacy-sheets/index.html`). In DevTools, filter the
  console by `Roll20 Utils`, and switch the console context (top-left, `top`) to that
  frame to inspect sheet fields.
- After editing code: reload the extension on `chrome://extensions`, then refresh the Roll20 tab.

## Data sources & disclaimer

**I do not own any of the game data used by this extension, and I claim no rights to it.**
It is downloaded and converted by the scripts in [`scripts/`](scripts/) from these sources;
all credit belongs to them:

| Source | What | Licence |
|---|---|---|
| [5etools-cn](https://github.com/tjliqy/5etools-cn) (Chinese mirror of [5etools](https://5e.tools)) | Raw data the build scripts read (English and Chinese, same structure) | Code and English data: MIT; Chinese translations: [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |
| [System Reference Document 5.2](https://www.dndbeyond.com/srd) by Wizards of the Coast LLC | The English rules text that is included in this repo | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) |
| Community translators collated by "DND Common Library" via 5etools-cn | The Chinese text included in this repo (credited per entry in the `translator` field) | [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/) |

- See [data/README.md](data/README.md) for the full attribution text and file formats.
- *Dungeons & Dragons*, *D&D* and related names are trademarks of Wizards of the Coast LLC.
  *Roll20* is a trademark of Roll20, Inc. They are used here only to describe compatibility.
- Rights holders: if you believe something here should not be included, please
  [open an issue](https://github.com/pandaleo723/roll20_extensions/issues) and it will be removed.

## Privacy

The extension collects no data and makes no network requests. See [PRIVACY.md](PRIVACY.md).

## Licence

- **Code:** [MIT](LICENSE).
- **Data** in `data/`: under the licences of its sources (above). Because the Chinese text is
  CC BY-NC-SA 4.0, **the bundled data, and builds of the extension that include it, may only be
  used and shared non-commercially**, with attribution and under the same licence.

## Roadmap

- [x] Spell picker for all spell levels (zh/en, class filter, details, duplicate markers)
- [x] Item picker: weapons, armour, gear, consumables and SRD magic items (inventory → attacks,
  AC, resources)
- [ ] Generic magic variants (+1 weapons/armour), equipment packs, starting equipment
- [x] Feats, backgrounds and species traits (Features & Traits; only missing traits are added)
- [ ] Class features (Features & Traits)
- [ ] Optional in-extension data import
