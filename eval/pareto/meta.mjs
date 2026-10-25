import path from "node:path";
import { rootDir } from "../api.mjs";

export const SUPP = process.env.PARETO_SUPP === "1";
// Supplementary pass (4 new models): own hard cap 39.71 + 8.5.
export const CAP_USD = SUPP ? 48.2 : 41;
export const SOFT_CAP_USD = SUPP ? 47.5 : 40;
export const PILOT_CAP_USD = 1.5;
export const SEED = 20261025;
export const RUBRIC_VERSION = "2026-10-25-pareto-v1";
export const JUDGE_SLUG = "anthropic/claude-opus-5.5";
export const BENCH_PER_LANG = 40;
export const CHAT_PER_LANG = 20;
export const PILOT_BENCH_PER_LANG = 10;
export const PILOT_CHAT_PER_LANG = 5;
export const JUDGE_BATCH_SIZE = process.env.PARETO_JUDGE_BATCH ? Number(process.env.PARETO_JUDGE_BATCH) : 150;
export const TRANSLATE_CONCURRENCY = 64;

export const PARETO_DIR = path.join(rootDir(), "eval", "pareto");
export const DATA_DIR = path.join(rootDir(), "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const RESULTS_DIR = path.join(PARETO_DIR, "results");
export const LEDGER_FILE = path.join(RESULTS_DIR, "ledger.json");
export const BENCHMARK_FILE = path.join(DATA_DIR, "benchmark-cases.json");
export const CHAT_FILE = path.join(DATA_DIR, "chat-cases.json");
export const COVERAGE_FILE = path.join(DATA_DIR, "coverage.json");
export const TRANSLATIONS_FILE = process.env.PARETO_TRANSLATIONS ? path.resolve(process.env.PARETO_TRANSLATIONS) : path.join(RESULTS_DIR, "translations.json");
export const JUDGEMENTS_FILE = process.env.PARETO_JUDGE_OUT ? path.resolve(process.env.PARETO_JUDGE_OUT) : path.join(RESULTS_DIR, "judgements.json");
export const JUDGE_DIR = process.env.PARETO_JUDGE_DIR ? path.resolve(process.env.PARETO_JUDGE_DIR) : path.join(RESULTS_DIR, "judge");
// Comma list of slugs; picks from models + supplement_models in models.json.
export const PANEL = process.env.PARETO_PANEL ? process.env.PARETO_PANEL.split(",").map((s) => s.trim()).filter(Boolean) : null;
// Deterministic stratified subsample: first K per language per kind.
export const SUB_BENCH = process.env.PARETO_SUB_BENCH ? Number(process.env.PARETO_SUB_BENCH) : null;
export const SUB_CHAT = process.env.PARETO_SUB_CHAT ? Number(process.env.PARETO_SUB_CHAT) : null;
export const MAX_BATCHES = process.env.PARETO_MAX_BATCHES ? Number(process.env.PARETO_MAX_BATCHES) : null;
export const REPORT_MD = path.join(rootDir(), "docs", "results.md");
export const REPORT_SVG = path.join(rootDir(), "docs", "pareto.svg");

export function panelModels(cat) {
  const all = [...cat.models, ...(cat.supplement_models || [])];
  if (!PANEL) return cat.models;
  return PANEL.map((slug) => {
    const m = all.find((row) => row.slug === slug);
    if (!m) throw new Error("unknown panel slug " + slug);
    return m;
  });
}
