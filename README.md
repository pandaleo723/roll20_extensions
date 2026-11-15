# Roll20 Sheet Filler

A Chrome extension (Manifest V3) that helps fill a D&D 5e character sheet on
[Roll20](https://app.roll20.net) ("D&D 5E by Roll20" sheet): pick spells from a searchable
list (Chinese or English) and the extension fills the sheet row for you.

## Project layout

```
manifest.json               Extension config (permissions, scripts)
src/background/background.js  Loads spell data, answers content-script queries
src/content/fields.js       Read/write Roll20 attr_ fields (fires change so Roll20 saves)
src/content/spells.js       Spell data -> Roll20 spell row fields (edit field names here)
src/content/picker.js       In-sheet searchable picker overlay (shadow DOM)
src/content/sections.js     Adds 📖 buttons to supported repeating sections
src/content/content.js      Entry point; popup "Fill sheet" handler
src/popup/                  Toolbar popup: language setting + JSON fill
scripts/build-all.js        Builds everything in data/ from 5etools-cn
scripts/build-data.js       … spells           (data/*/spells.json)
scripts/build-items.js      … equipment        (data/*/items.json)
scripts/build-traits.js     … feats, backgrounds, species, class features
scripts/lib/5etools.js      Shared helpers: fetch, 5etools markup -> plain text, output split
data/srd/                   SRD 5.2 data (committed, shipped)
data/local/                 Full PHB 2024 data (git-ignored, personal use)
```

## Setup

```bash
node scripts/build-all.js     # all data; or run one builder, e.g. node scripts/build-items.js
```

See [data/README.md](data/README.md) for the files and their record formats.

Then in Chrome: `chrome://extensions` → **Developer mode** → **Load unpacked** → pick this folder.
After editing code: reload the extension card, then refresh the Roll20 tab.

## Use

1. Open a character sheet on Roll20 and go to the spells tab.
2. In the **Cantrips** section:
   - open a row's gear ⚙ → **📖 从列表选择法术** → pick a spell to overwrite that row
   - **📖 +** next to +Add → add a new row filled with the picked spell
   - filling takes ~0.6 s per changed field (Roll20 only saves one edit at a time)
3. Switch 中 / EN in the picker (or in the toolbar popup).

## Testing without Roll20

`node tools/harness/serve.js` runs the content scripts against a saved copy of the sheet,
emulating Roll20's save debounce and showing what Roll20 would save. See
[tools/harness/README.md](tools/harness/README.md) for how to save your sheet as a fixture.

## Debugging

The sheet is rendered in a cross-origin iframe served from
`https://storage.googleapis.com/roll20-cdn/production/legacy-sheets/index.html`.
In DevTools, filter the console by `Roll20 Sheet Filler`: the sheet frame logs a summary
of its repeating sections, and each fill logs which fields were filled / not found.
To inspect sheet fields, switch the console's context dropdown (top-left, "top") to that frame.

## Data & licensing

See [data/README.md](data/README.md). Only SRD 5.2 content is committed; full PHB 2024 data
stays in the git-ignored `data/local/`.

## Roadmap

- [x] Stage 1: content script in the sheet iframe, whole-sheet JSON fill from the popup
- [x] Stage 2a: spell picker for cantrips (zh/en, SRD + local data)
- [ ] Stage 2b: leveled spells (repeating_spell-1 … -9, upcast damage fields)
- [ ] Weapons (attacks / inventory), feats & features
- [ ] Import custom / homebrew data packs
