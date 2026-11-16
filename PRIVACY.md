# Privacy Policy: Roll20 Utils Extension (Unofficial)

_Last updated: 17 November 2026_

Roll20 Utils Extension (Unofficial) ("the extension") is an unofficial, open-source browser
extension that adds helper tools, such as a spell picker, to D&D 5e character sheets on Roll20.
This policy explains what data it handles.

## Summary

**The extension does not collect, transmit, sell or share any personal data.** It has no
servers, no accounts, no analytics and no advertising.

## What the extension stores

- **Settings** (interface language, whether to show names in the other language, which modules
  are switched on, class-filter options) are saved with `chrome.storage.sync`. This is Chrome's
  built-in storage. The data stays in your browser. If you have Chrome sync turned on, Google
  syncs it to your own signed-in browsers. The developer cannot see it.
- **Developer builds only:** the optional character-JSON debug box in the settings page remembers the
  text you paste into it in `chrome.storage.local`, on your device only. This box is not shown in
  the version installed from the Chrome Web Store.

You can remove all of this at any time by uninstalling the extension.

## What the extension reads on web pages

The extension runs only on `https://app.roll20.net/*` and on Roll20's character-sheet frame at
`https://storage.googleapis.com/roll20-cdn/*`. There it reads character sheet fields (for example
the character's classes and existing spells) and writes the entry you pick into the sheet,
exactly as if you had typed it. This happens entirely in your browser; nothing is copied or sent
elsewhere. Roll20 itself saves the sheet, under Roll20's own privacy policy.

## Network requests

The extension makes no network requests of its own. Its game data is bundled inside the
extension and is loaded from the extension package (`chrome-extension://…`). No remote code is
downloaded or executed. The links in the settings popup and options page (issue tracker, source code) open GitHub in a new
tab only when you click them.

## Third parties

No data is shared with third parties. The extension is not affiliated with Roll20, Inc. or
Wizards of the Coast LLC.

## Children

The extension does not knowingly collect any information from anyone, including children.

## Changes

If this policy changes, the updated version will be published at the same address with a new
"Last updated" date.

## Contact

Questions or concerns: open an issue at
https://github.com/pandaleo723/roll20_extensions/issues
