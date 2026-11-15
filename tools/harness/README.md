# Sheet harness

Test the extension against a saved copy of your Roll20 sheet, without touching a real character.
It runs the real content scripts (in manifest order), emulates Roll20's 500 ms save debounce and
"+Add", and shows on the right exactly which attributes Roll20 *would save*.

## 1. Save your sheet (once, or whenever the sheet changes)

1. Open the character on Roll20, make sure each section you want to test has **at least one row**
   (e.g. one cantrip), then press F12 → **Console**.
2. Switch the console's context dropdown (top-left, says `top`) to the
   `legacy-sheets/index.html` frame.
3. Run:

   ```js
   (() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([document.documentElement.outerHTML], { type: "text/html" })); a.download = "roll20-sheet.html"; a.click(); })()
   ```

4. Move the downloaded `roll20-sheet.html` into `test/fixtures/` (git-ignored: it contains
   Roll20's sheet markup and your character's data).

## 2. Run

```bash
node tools/harness/serve.js
```

Open http://localhost:5179/ and pick a fixture. Use the 📖 buttons as on Roll20. The "Save log"
button (top right) shows or hides the list of saved values; it is hidden by default.
In the desktop app's browser pane you can also start it as the `sheet-harness` preview.

In the page console, `__saved` holds what Roll20 would store, keyed
`repeating_spell-cantrip_<rowid>_<attr>` for row fields.
