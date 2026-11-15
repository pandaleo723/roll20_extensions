# Roll20 Sheet Filler

An open-source Chrome extension (Manifest V3) that helps you fill a D&D 5e character sheet on
[Roll20](https://app.roll20.net) (the "D&D 5E by Roll20" sheet). Pick a spell from a searchable
list, in Chinese or English, and the extension fills the whole spell row for you: school,
casting time, range, components, duration, description, attack/save, damage or healing,
cantrip scaling and upcast dice.

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
- Saves reliably: edits are paced to match how the Roll20 sheet saves changes

## Install (from source)

Requirements: Chrome (or another Chromium browser) and [Node.js](https://nodejs.org) 18+.

```bash
git clone https://github.com/pandaleo723/roll20_extensions.git
```

```bash
cd roll20_extensions
```

The SRD spell data is included in the repo. To (re)build the data files:

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

Settings (toolbar icon): language, show other-language names, auto-detect class, manual class
filter.

## Development

```
manifest.json                Extension config (permissions, scripts)
src/background/background.js Loads the data files, answers content-script queries
src/content/                 Runs inside the Roll20 sheet: field filling, picker, 📖 buttons
src/shared/settings.js       Settings and UI text shared by popup and content scripts
src/popup/                   Toolbar popup (settings)
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
  console by `Roll20 Sheet Filler`, and switch the console context (top-left, `top`) to that
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

- **Only SRD 5.2 content is committed** (`data/srd/`, entries flagged `srd52` by 5etools).
  See [data/README.md](data/README.md) for the full attribution text and file formats.
- The build scripts can also write fuller data to `data/local/`. That folder is git-ignored and
  is **not distributed** by this project. If you generate it, it is for your own use and
  you are responsible for respecting the rights of the content owners.
- *Dungeons & Dragons*, *D&D* and related names are trademarks of Wizards of the Coast LLC.
  *Roll20* is a trademark of Roll20, Inc. They are used here only to describe compatibility.
- Rights holders: if you believe something here should not be included, please
  [open an issue](https://github.com/pandaleo723/roll20_extensions/issues) and it will be removed.

## Licence

- **Code:** [MIT](LICENSE).
- **Data** in `data/`: under the licences of its sources (above). Because the Chinese text is
  CC BY-NC-SA 4.0, **the bundled data, and builds of the extension that include it, may only be
  used and shared non-commercially**, with attribution and under the same licence.

## Roadmap

- [x] Spell picker for all spell levels (zh/en, class filter, details, duplicate markers)
- [ ] Weapons and armour (inventory → attacks), using `data/*/items.json`
- [ ] Feats, backgrounds, species traits and class features (Features & Traits)
- [ ] Optional in-extension data import
