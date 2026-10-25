import path from "node:path";
import { rootDir } from "../api.mjs";

export const CAP_USD = 48;
export const PILOT_CAP_USD = 1.5;
export const SEED = 20261025;
export const RUBRIC_VERSION = "2026-10-25-pareto-v1";
export const JUDGE_SLUG = "anthropic/claude-opus-5.5";
export const BENCH_PER_LANG = 20;
export const CHAT_PER_LANG = 10;
export const PILOT_BENCH_PER_LANG = 10;
export const PILOT_CHAT_PER_LANG = 5;
export const JUDGE_BATCH_SIZE = 150;
export const TRANSLATE_CONCURRENCY = 4;

export const PARETO_DIR = path.join(rootDir(), "eval", "pareto");
export const DATA_DIR = path.join(rootDir(), "data");
export const RAW_DIR = path.join(DATA_DIR, "raw");
export const RESULTS_DIR = path.join(PARETO_DIR, "results");
export const LEDGER_FILE = path.join(RESULTS_DIR, "ledger.json");
export const BENCHMARK_FILE = path.join(DATA_DIR, "benchmark-cases.json");
export const CHAT_FILE = path.join(DATA_DIR, "chat-cases.json");
export const COVERAGE_FILE = path.join(DATA_DIR, "coverage.json");
export const TRANSLATIONS_FILE = path.join(RESULTS_DIR, "translations.json");
export const JUDGEMENTS_FILE = path.join(RESULTS_DIR, "judgements.json");
export const REPORT_MD = path.join(rootDir(), "docs", "results.md");
export const REPORT_SVG = path.join(rootDir(), "docs", "pareto.svg");
