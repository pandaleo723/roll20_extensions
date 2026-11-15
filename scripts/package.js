#!/usr/bin/env node
// Builds the Chrome Web Store upload: dist/roll20-utils-extension-<version>.zip
//
// Only runtime files are packaged: manifest.json, src/, data/srd/, data/README.md (attribution),
// LICENSE and the icon PNGs. Everything else (data/local/, test/, docs/, tools/, ...) is left out,
// and the script fails if any of it ends up in the staging folder anyway.
//
// Usage: node scripts/package.js        (Node 18+, no dependencies; writes the zip itself)

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// [source path relative to ROOT, filter for files inside a directory (optional)]
const INCLUDE = [
  ["manifest.json"],
  ["LICENSE"],
  ["src"],
  ["data/srd"],
  ["data/README.md"],
  ["icons", (rel) => /^icon\d+\.png$/.test(path.basename(rel))], // not the SVG sources / promo tile
  ["_locales"], // localized extension name/description (manifest __MSG_*__ placeholders)
];

/**
 * With "default_locale", Chrome requires _locales/<default>/messages.json, and every __MSG_key__
 * in the manifest must resolve. Check each locale so a missing translation fails here, not in review.
 */
function checkLocales(manifest, stageDir) {
  const keys = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((m) => m[1]);
  if (!manifest.default_locale) {
    if (keys.length) fail(`manifest uses __MSG_${keys[0]}__ but has no "default_locale"`);
    return [];
  }
  const dir = path.join(stageDir, "_locales");
  if (!fs.existsSync(path.join(dir, manifest.default_locale, "messages.json"))) {
    fail(`default_locale "${manifest.default_locale}" has no _locales/${manifest.default_locale}/messages.json`);
  }
  const locales = fs.readdirSync(dir);
  for (const loc of locales) {
    let messages;
    try {
      messages = JSON.parse(fs.readFileSync(path.join(dir, loc, "messages.json"), "utf8"));
    } catch (err) {
      fail(`_locales/${loc}/messages.json is not valid JSON: ${err.message}`);
    }
    const missing = keys.filter((k) => !messages[k]?.message);
    if (missing.length) fail(`_locales/${loc}/messages.json is missing: ${missing.join(", ")}`);
  }
  return locales;
}

// Anything matching these (relative, forward slashes) must never be in the package.
const FORBIDDEN = [
  /^data\/local(\/|$)/,
  /^test(\/|$)/,
  /^docs(\/|$)/,
  /^notes(\/|$)/,
  /^tools(\/|$)/,
  /^scripts(\/|$)/,
  /^dist(\/|$)/,
  /^node_modules(\/|$)/,
  /(^|\/)\.(git|claude|vscode|idea)(\/|$)/,
  /(^|\/)\.env/,
  /\.(pem|crx|zip|log)$/,
  /(^|\/)(Thumbs\.db|\.DS_Store)$/,
];

function fail(msg) {
  console.error(`\npackage: ERROR: ${msg}`);
  process.exit(1);
}

function copy(srcAbs, destAbs, rel, filter) {
  const stat = fs.statSync(srcAbs);
  if (stat.isDirectory()) {
    for (const name of fs.readdirSync(srcAbs)) {
      copy(path.join(srcAbs, name), path.join(destAbs, name), `${rel}/${name}`, filter);
    }
  } else if (!filter || filter(rel)) {
    fs.mkdirSync(path.dirname(destAbs), { recursive: true });
    fs.copyFileSync(srcAbs, destAbs);
  }
}

function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(abs, base));
    else out.push(path.relative(base, abs).split(path.sep).join("/"));
  }
  return out.sort();
}

/** Every file path manifest.json points at. */
function manifestRefs(m) {
  const refs = new Set();
  const add = (p) => p && refs.add(String(p).replace(/^\//, ""));
  add(m.background?.service_worker);
  for (const p of m.background?.scripts || []) add(p);
  add(m.action?.default_popup);
  add(m.options_page);
  add(m.options_ui?.page);
  add(m.side_panel?.default_path);
  const icons = (v) => (typeof v === "string" ? add(v) : Object.values(v || {}).forEach(add));
  icons(m.icons);
  icons(m.action?.default_icon);
  for (const cs of m.content_scripts || []) {
    for (const p of cs.js || []) add(p);
    for (const p of cs.css || []) add(p);
  }
  for (const war of m.web_accessible_resources || []) {
    for (const p of war.resources || []) if (!/[*]/.test(p)) add(p);
  }
  return [...refs];
}

// Minimal ZIP writer (deflate, forward-slash paths, files only). Used instead of PowerShell's
// Compress-Archive, which on Windows PowerShell 5.1 writes "src\content\x.js" style entry names
// that break unpacking outside Windows (e.g. on the Chrome Web Store).
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}
function zip(stageDir, files, zipPath) {
  const zlib = require("zlib");
  const { time, date } = dosTime(new Date());
  const parts = [];
  const central = [];
  let offset = 0;
  for (const name of files) {
    const data = fs.readFileSync(path.join(stageDir, name));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const store = deflated.length >= data.length;
    const body = store ? data : deflated;
    const nameBuf = Buffer.from(name, "utf8");
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(store ? 0 : 8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, body);

    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4); // version made by
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(store ? 0 : 8, 10);
    cen.writeUInt16LE(time, 12);
    cen.writeUInt16LE(date, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(body.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(zipPath, Buffer.concat([...parts, ...central, end]));
}

function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  const version = manifest.version;
  if (!/^\d+(\.\d+){0,3}$/.test(version || "")) fail(`bad manifest version "${version}"`);

  const stage = fs.mkdtempSync(path.join(os.tmpdir(), "r20utils-pkg-"));
  try {
    for (const [rel, filter] of INCLUDE) {
      const src = path.join(ROOT, rel);
      if (!fs.existsSync(src)) fail(`missing required path: ${rel}`);
      copy(src, path.join(stage, rel), rel, filter);
    }

    const files = listFiles(stage);

    const bad = files.filter((f) => FORBIDDEN.some((re) => re.test(f)));
    if (bad.length) fail(`forbidden files in package:\n  ${bad.join("\n  ")}`);

    const missing = manifestRefs(manifest).filter((f) => !files.includes(f));
    if (missing.length) fail(`files referenced by manifest.json are missing from the package:\n  ${missing.join("\n  ")}`);

    if (!manifest.icons) console.warn("package: WARNING: manifest.json has no \"icons\" (required by the Chrome Web Store)");

    const locales = checkLocales(manifest, stage);
    if (locales.length) console.log(`Locales: ${locales.join(", ")} (default: ${manifest.default_locale})`);

    fs.mkdirSync(DIST, { recursive: true });
    const zipPath = path.join(DIST, `roll20-utils-extension-${version}.zip`);
    zip(stage, files, zipPath);

    const total = files.reduce((n, f) => n + fs.statSync(path.join(stage, f)).size, 0);
    console.log(`Packaged ${files.length} files (${(total / 1024).toFixed(0)} KiB uncompressed):`);
    for (const f of files) console.log(`  ${f}`);
    console.log(`\n-> ${path.relative(ROOT, zipPath)} (${(fs.statSync(zipPath).size / 1024).toFixed(0)} KiB)`);
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
  }
}

main();
