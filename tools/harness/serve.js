#!/usr/bin/env node
/**
 * Local test harness: runs the extension's content scripts against a saved copy of the
 * Roll20 sheet, with Roll20's save debounce emulated, so changes can be tested without
 * touching a real character.
 *
 *   node tools/harness/serve.js            then open http://localhost:5179/
 *
 * Fixtures live in test/fixtures/*.html (git-ignored). See tools/harness/README.md for how to
 * save your real sheet. Pick one with ?fixture=<file name>; default: roll20-sheet.html.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "../..");
const FIXTURES = path.join(ROOT, "test/fixtures");
const PORT = Number(process.env.PORT) || 5179;

const TYPES = {
  ".js": "text/javascript; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
};

/** Content scripts in manifest order, so the harness always matches the extension. */
function contentScripts() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));
  return manifest.content_scripts[0].js;
}

/** Same merge as the background worker: data/srd/<kind>.json, then data/local/<kind>.json. */
function loadKind(kind) {
  const byId = new Map();
  for (const f of [`data/srd/${kind}.json`, `data/local/${kind}.json`]) {
    const file = path.join(ROOT, f);
    if (!fs.existsSync(file)) continue;
    for (const s of JSON.parse(fs.readFileSync(file, "utf8"))) byId.set(s.id, s);
  }
  return [...byId.values()];
}

/** Turn a saved sheet into a harness page. */
function buildPage(fixtureName) {
  const html = fs.readFileSync(path.join(FIXTURES, fixtureName), "utf8");
  const head = (html.match(/<head[^>]*>([\s\S]*?)<\/head>/i) || [, ""])[1];
  let body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];

  body = body
    .replace(/<script[\s\S]*?<\/script>/gi, "") // Roll20's own scripts
    .replace(/<div id="r20[fu]-host"[^>]*>\s*<\/div>/g, "") // leftovers from the extension
    .replace(/<button[^>]*class="r20[fu]-btn[^"]*"[^>]*>[\s\S]*?<\/button>/g, "");

  const styles = (head.match(/<style[^>]*>[\s\S]*?<\/style>|<link[^>]*>/gi) || []).join("\n");
  const scripts = contentScripts().map((s) => `<script src="/${s}"></script>`).join("\n");

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Sheet harness · ${fixtureName}</title>
${styles}
<link rel="stylesheet" href="/tools/harness/harness.css">
</head><body>
<div id="harness-bar"></div>
${body}
<script src="/tools/harness/harness-client.js"></script>
${scripts}
</body></html>`;
}

function indexPage() {
  const files = fs.existsSync(FIXTURES) ? fs.readdirSync(FIXTURES).filter((f) => f.endsWith(".html")) : [];
  const list = files.length
    ? files.map((f) => `<li><a href="/harness?fixture=${encodeURIComponent(f)}">${f}</a></li>`).join("")
    : "<li>No fixtures yet. See tools/harness/README.md.</li>";
  return `<!doctype html><meta charset="utf-8"><title>Sheet harness</title>
<body style="font:14px system-ui;padding:16px"><h1>Sheet harness</h1><ul>${list}</ul></body>`;
}

http
  .createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    const send = (code, type, body) => res.writeHead(code, { "Content-Type": type }).end(body);
    try {
      if (url.pathname === "/") return send(200, TYPES[".html"], indexPage());
      if (url.pathname === "/harness") {
        const name = path.basename(url.searchParams.get("fixture") || "roll20-sheet.html");
        return send(200, TYPES[".html"], buildPage(name));
      }
      const dataMatch = url.pathname.match(/^\/harness\/data\/([a-z][a-z-]*)$/);
      if (dataMatch) return send(200, TYPES[".json"], JSON.stringify(loadKind(dataMatch[1])));

      const file = path.join(ROOT, decodeURIComponent(url.pathname));
      if (!file.startsWith(ROOT)) return send(403, "text/plain", "forbidden");
      fs.readFile(file, (err, buf) => {
        if (err) return send(404, "text/plain", "not found");
        send(200, TYPES[path.extname(file)] || "application/octet-stream", buf);
      });
    } catch (err) {
      send(500, "text/plain", String(err.stack || err));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Sheet harness on http://localhost:${PORT}/`));
