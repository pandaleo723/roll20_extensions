#!/usr/bin/env node
/**
 * Build every data file in data/srd/ and data/local/:
 *
 *   node scripts/build-all.js
 *
 * spells (build-data.js), items (build-items.js), feats / backgrounds / species / class features
 * (build-traits.js). Each builder can also be run on its own.
 */

const builders = [
  ["spells", require("./build-data")],
  ["items", require("./build-items")],
  ["traits", require("./build-traits")],
];

(async () => {
  for (const [name, mod] of builders) {
    console.log(`--- ${name}`);
    await mod.main();
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
