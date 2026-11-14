# Roll20 Sheet Filler

A Chrome extension (Manifest V3) that fills a D&D character sheet on [Roll20](https://app.roll20.net) from JSON.

## Project layout

```
manifest.json            Extension config (permissions, scripts)
src/content/content.js   Runs inside Roll20 pages/iframes, fills sheet fields
src/popup/popup.html     UI shown when clicking the toolbar icon
src/popup/popup.js       Parses JSON and sends it to the content script
src/popup/popup.css
```

## Load it in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin the extension (puzzle icon in the toolbar → pin)

After editing code: click the reload icon on the extension card, then refresh the Roll20 tab.

## Try it

1. Open a Roll20 game and open a character's sheet
2. Press F12 → Console: you should see `[Roll20 Sheet Filler] loaded in frame: ...`
3. Click the extension icon → **Load sample** → **Fill sheet**

Note: the sheet itself is rendered in a cross-origin iframe served from
`https://storage.googleapis.com/roll20-cdn/production/legacy-sheets/index.html`, which is why the
manifest matches that origin too. In DevTools, switch the console's context dropdown (top-left,
"top") to that frame to inspect sheet fields or see the content script's logs.

JSON keys are Roll20 attribute names without the `attr_` prefix. To find a field's name,
right-click it on the sheet → **Inspect** and look at `name="attr_..."`.

## Roadmap

- [x] Phase 0–3: content script, single-field fill, popup with JSON input
- [ ] Phase 4: mapping layer (friendly keys → sheet-specific attribute names)
- [ ] Phase 5: repeating sections (attacks, spells, inventory)
- [ ] Phase 6: saved characters, import from file / other sources
