/**
 * Shared helpers for the data builders (scripts/build-*.js): fetching 5etools-cn files,
 * converting 5etools markup to plain text, joining English and Chinese entries, writing output.
 *
 * Source: https://github.com/tjliqy/5etools-cn (branch cn2.0). English data lives under
 * data-bak/, Chinese under data/, same schema; Chinese entries carry ENG_name to join on.
 */

const fs = require("fs");
const path = require("path");

const REPO_RAW = "https://raw.githubusercontent.com/tjliqy/5etools-cn/cn2.0";
const ROOT = path.join(__dirname, "..", "..");

// ---------- 5etools markup -> plain text ----------

const DISPLAY_IN_THIRD_PART = new Set([
  "spell", "creature", "item", "condition", "hazard", "action", "sense", "skill",
  "status", "variantrule", "race", "class", "feat", "background", "table",
]);

// {@itemProperty H|XPHB} without display text -> property name ("Heavy" / "重型").
const ITEM_PROPERTY_NAMES = {
  A: ["Ammunition", "弹药"], F: ["Finesse", "灵巧"], H: ["Heavy", "重型"], L: ["Light", "轻型"],
  LD: ["Loading", "装填"], R: ["Reach", "触及"], T: ["Thrown", "投掷"], "2H": ["Two-Handed", "双手"],
  V: ["Versatile", "多用"],
};

const CJK = /[一-鿿]/;

function stripTags(text) {
  const zh = CJK.test(text);
  let prev;
  do {
    prev = text;
    text = text.replace(/\{@(\w+) ([^{}]*)\}/g, (_, tag, body) => {
      const parts = body.split("|");
      switch (tag) {
        case "dc": return `DC ${parts[0]}`;
        case "hit": return `+${parts[0]}`.replace("+-", "-");
        case "chance": return `${parts[0]}%`;
        case "scaledamage":
        case "scaledice": return parts[parts.length - 1];
        // {@book display text|source|chapter|section}
        case "book": return parts[0];
        case "itemProperty":
          return parts[2] || ITEM_PROPERTY_NAMES[parts[0].toUpperCase()]?.[zh ? 1 : 0] || parts[0];
        default:
          return DISPLAY_IN_THIRD_PART.has(tag) ? parts[2] || parts[0] : parts[0];
      }
    });
  } while (text !== prev);
  return text;
}

/** First "|"-separated part of a reference like "Arcane Ward|Wizard|XPHB|Abjurer|XPHB|3". */
const refName = (ref) => stripTags(String(ref).split("|")[0]);

/** Render a 5etools "entries" array to plain text with line breaks. */
function renderEntries(entries) {
  const out = [];
  const walk = (e) => {
    if (e == null) return;
    if (typeof e === "string") return out.push(stripTags(e));
    if (Array.isArray(e)) return e.forEach(walk);
    switch (e.type) {
      case "list":
        (e.items || []).forEach((it) => {
          if (typeof it === "string") out.push(`• ${stripTags(it)}`);
          else out.push(`• ${it.name ? stripTags(it.name) + " " : ""}${renderEntries(it.entries || [it.entry])}`);
        });
        return;
      case "item":
        return out.push(`• ${e.name ? stripTags(e.name) + " " : ""}${renderEntries(e.entries || [e.entry])}`);
      case "table":
        if (e.caption) out.push(stripTags(e.caption));
        if (e.colLabels) out.push(e.colLabels.map(stripTags).join(" | "));
        (e.rows || []).forEach((row) =>
          out.push(row.map((c) => (typeof c === "string" ? stripTags(c) : renderEntries([c]))).join(" | "))
        );
        return;
      // References to features / feats that are separate records: list their names only.
      case "refClassFeature": return out.push(`• ${refName(e.classFeature)}`);
      case "refSubclassFeature": return out.push(`• ${refName(e.subclassFeature)}`);
      case "refOptionalfeature": return out.push(`• ${refName(e.optionalfeature)}`);
      case "refFeat": return out.push(`• ${refName(e.feat)}`);
      case "statblock": return out.push(`[${stripTags(e.displayName || e.name || "")}]`);
      default: // "entries", "inset", "options", ...
        if (e.name) out.push(`${stripTags(e.name)}.`);
        walk(e.entries);
    }
  };
  walk(entries);
  return out.join("\n");
}

// ---------- shared vocabulary ----------

const DAMAGE_TYPES_ZH = {
  acid: "强酸", bludgeoning: "钝击", cold: "寒冷", fire: "火焰", force: "力场",
  lightning: "闪电", necrotic: "黯蚀", piercing: "穿刺", poison: "毒素",
  psychic: "心灵", radiant: "光耀", slashing: "挥砍", thunder: "雷鸣",
};

const ABILITIES = {
  str: { en: "Strength", zh: "力量", roll20: "@{strength_mod}" },
  dex: { en: "Dexterity", zh: "敏捷", roll20: "@{dexterity_mod}" },
  con: { en: "Constitution", zh: "体质", roll20: "@{constitution_mod}" },
  int: { en: "Intelligence", zh: "智力", roll20: "@{intelligence_mod}" },
  wis: { en: "Wisdom", zh: "感知", roll20: "@{wisdom_mod}" },
  cha: { en: "Charisma", zh: "魅力", roll20: "@{charisma_mod}" },
};

const plural = (n, word) => (n === 1 ? word : `${word}s`);

/** "{ en, zh }" pair; zh falls back to en when missing. */
const loc = (en, zh) => ({ en: en ?? "", zh: zh ?? en ?? "" });

// ---------- I/O ----------

async function fetchJson(relPath) {
  const res = await fetch(`${REPO_RAW}/${relPath}`);
  if (!res.ok) throw new Error(`${res.status} fetching ${relPath}`);
  return res.json();
}

/** Fetch the English (data-bak/) and Chinese (data/) copies of one file. */
async function fetchPair(relPath) {
  const [en, zh] = await Promise.all([fetchJson(`data-bak/${relPath}`), fetchJson(`data/${relPath}`)]);
  return { en, zh };
}

/** Map of Chinese entries keyed by `ENG_name|source` (lower-case). */
function zhIndex(zhList) {
  const map = new Map();
  for (const z of zhList || []) map.set(`${z.ENG_name}|${z.source}`.toLowerCase(), z);
  return map;
}
const zhLookup = (map, en) => map.get(`${en.name}|${en.source}`.toLowerCase());

function write(relPath, data, noun = "entries") {
  const file = path.join(ROOT, relPath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 1) + "\n");
  console.log(`wrote ${relPath} (${data.length} ${noun})`);
}

/**
 * Write the SRD subset to data/srd/<name> and everything to data/local/<name>.
 * `srdTransform` strips parts of an SRD record that come from non-SRD text.
 */
function writeSplit(name, records, noun, srdTransform = (r) => r) {
  write(`data/srd/${name}`, records.filter((r) => r.srd52).map(srdTransform), noun);
  write(`data/local/${name}`, records, noun);
}

/** Run a builder's main() when the script is executed directly. */
function runMain(mod, main) {
  if (require.main === mod) {
    main().catch((err) => {
      console.error(err);
      process.exit(1);
    });
  }
}

module.exports = {
  REPO_RAW, ROOT, DISPLAY_IN_THIRD_PART, DAMAGE_TYPES_ZH, ABILITIES,
  stripTags, renderEntries, refName, plural, loc,
  fetchJson, fetchPair, zhIndex, zhLookup, write, writeSplit, runMain,
};
