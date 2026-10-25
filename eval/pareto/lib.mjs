import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadLedger, rootDir } from "../api.mjs";
import { PILOT_LANGS, TARGET_CODES } from "./languages.mjs";
import { CAP_USD, LEDGER_FILE, PILOT_CAP_USD, RESULTS_DIR, SEED } from "./meta.mjs";

export function invokedDirectly(metaUrl) {
  const self = fileURLToPath(metaUrl);
  const arg = process.argv[1] && path.resolve(process.argv[1]);
  return Boolean(arg) && path.normalize(self).toLowerCase() === path.normalize(arg).toLowerCase();
}

export function parseArgs(argv = process.argv) {
  const opts = {
    pilot: false,
    langs: null,
    limit: null,
    only: null,
    skipChat: false,
    skipTranslate: false,
    skipJudge: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--pilot") opts.pilot = true;
    else if (arg === "--langs") opts.langs = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--limit") opts.limit = Number(argv[++i]);
    else if (arg === "--only") opts.only = String(argv[++i] || "");
    else if (arg === "--skip-chat") opts.skipChat = true;
    else if (arg === "--skip-translate") opts.skipTranslate = true;
    else if (arg === "--skip-judge") opts.skipJudge = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (opts.limit != null && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  return opts;
}

export function targetLangs(opts) {
  if (opts.langs?.length) return opts.langs;
  if (opts.pilot) return [...PILOT_LANGS];
  return [...TARGET_CODES];
}

export function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedMix(...parts) {
  let hash = SEED >>> 0;
  const text = parts.join(":");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function shuffle(items, rand) {
  const copy = [...items];
  const rng = typeof rand === "function" ? rand : mulberry32(rand >>> 0);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function letter(index) {
  if (index < 26) return String.fromCharCode(65 + index);
  return "A" + String.fromCharCode(65 + index - 26);
}

export function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function loadParetoLedger(pilot) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const ledger = loadLedger(LEDGER_FILE);
  ledger.file = LEDGER_FILE;
  ledger.cap = pilot ? PILOT_CAP_USD : CAP_USD;
  return ledger;
}

export function hfToken() {
  const env = process.env.HF_TOKEN || process.env.HUGGINGFACE_HUB_TOKEN || process.env.HUGGING_FACE_HUB_TOKEN;
  if (env) return env.trim();
  const file = path.join(rootDir(), ".huggingface.env");
  try {
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      if (key !== "HF_TOKEN" && key !== "HUGGINGFACE_HUB_TOKEN") continue;
      let value = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
      if (value) return value;
    }
  } catch {
    // optional
  }
  return "";
}

export function usd(value) {
  return `$${(Number(value) || 0).toFixed(4)}`;
}
