// Translate every case with the candidate list in models.json.
import fs from "node:fs";
import {
  cacheFile,
  hashString,
  loadKey,
  mapPool,
  paidChat,
  publicError,
  readCache,
  writeJson,
} from "../api.mjs";
import { invokedDirectly, loadParetoLedger, parseArgs, progress, targetLangs } from "./lib.mjs";
import {
  BENCHMARK_FILE,
  CHAT_FILE,
  PILOT_BENCH_PER_LANG,
  PILOT_CHAT_PER_LANG,
  RUBRIC_VERSION,
  TRANSLATE_CONCURRENCY,
  TRANSLATIONS_FILE,
  SUB_BENCH,
  SUB_CHAT,
  panelModels,
} from "./meta.mjs";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.mjs";

function catalog() {
  return JSON.parse(fs.readFileSync(new URL("./models.json", import.meta.url), "utf8"));
}

export function loadCases(opts) {
  const langs = new Set(targetLangs(opts));
  const benchAll = JSON.parse(fs.readFileSync(BENCHMARK_FILE, "utf8"));
  let chatAll = [];
  try {
    chatAll = JSON.parse(fs.readFileSync(CHAT_FILE, "utf8"));
  } catch {
    chatAll = [];
  }
  const benchLimit = opts.pilot ? PILOT_BENCH_PER_LANG : (SUB_BENCH ?? 999);
  const chatLimit = opts.pilot ? PILOT_CHAT_PER_LANG : (SUB_CHAT ?? 999);
  const bench = [];
  const chat = [];
  const benchCount = new Map();
  const chatCount = new Map();
  for (const item of benchAll) {
    if (!langs.has(item.target)) continue;
    const n = benchCount.get(item.target) || 0;
    if (n >= benchLimit) continue;
    benchCount.set(item.target, n + 1);
    bench.push(item);
  }
  for (const item of chatAll) {
    const lang = item.lang || (item.source === "en" ? item.target : item.source);
    if (!langs.has(lang)) continue;
    const n = chatCount.get(lang) || 0;
    if (n >= chatLimit) continue;
    chatCount.set(lang, n + 1);
    chat.push(item);
  }
  return [...bench, ...chat];
}

function translationHash(model, item) {
  return hashString({
    v: RUBRIC_VERSION,
    slug: model.slug,
    case: item.id,
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(item.text, item.source, item.target, item.history || []),
    temperature: model.temperature ?? null,
    reasoning: model.reasoning ?? null,
    max: model.max_tokens,
  });
}

// Optional per-model start-rate throttle for new-account 20 rpm limits. PARETO_RPM=slug=18,slug=18
const RPM = Object.fromEntries(String(process.env.PARETO_RPM || "").split(",").filter(Boolean).map((pair) => {
  const [slug, n] = pair.split("=");
  return [slug, Number(n)];
}));
const nextAt = new Map();
async function throttle(slug) {
  const rpm = RPM[slug];
  if (!rpm) return;
  const gap = 60000 / rpm;
  const now = Date.now();
  const at = Math.max(now, nextAt.get(slug) || 0);
  nextAt.set(slug, at + gap);
  if (at > now) await new Promise((resolve) => setTimeout(resolve, at - now));
}

async function translateOne(apiKey, ledger, model, item) {
  const hash = translationHash(model, item);
  const file = cacheFile("pareto", "translations", model.slug, `${item.id}.json`);
  const cached = readCache(file, hash);
  if (cached?.result) return { ...cached.result, cached: true };
  await throttle(model.slug);
  if (ledger.aborted) {
    return {
      case_id: item.id,
      slug: model.slug,
      skipped: true,
      error: "spend_cap",
      output: "",
      latency_ms: null,
      cost_usd: 0,
      cached: false,
    };
  }
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildUserPrompt(item.text, item.source, item.target, item.history || []) },
  ];
  const started = Date.now();
  const result = await paidChat(apiKey, ledger, model, messages, model.max_tokens, {
    kind: "translate",
    case_id: item.id,
  }, { timeoutMs: 120000, estimateOutputTokens: Math.min(model.max_tokens, 400) });
  const record = {
    case_id: item.id,
    slug: model.slug,
    skipped: result.error === "spend_cap",
    error: result.ok ? (result.text ? null : "empty") : result.error,
    output: result.text || "",
    latency_ms: Date.now() - started,
    cost_usd: result.cost_usd || 0,
    cost_source: result.cost_source || null,
    temperature: result.temperature ?? null,
    reasoning: result.reasoning ?? null,
    dropped_controls: Boolean(result.dropped_controls),
    prompt_tokens: result.prompt_tokens || 0,
    completion_tokens: result.completion_tokens || 0,
    reasoning_tokens: result.reasoning_tokens || 0,
    cached_tokens: result.cached_tokens || 0,
    cached: false,
  };
  if (result.ok && record.output) writeJson(file, { hash, result: record });
  if (result.error === "credits") {
    ledger.aborted = true;
    ledger.reason = "OpenRouter rejected the call for credits.";
  }
  return record;
}

export function translateWork(opts = parseArgs()) {
  const cases = loadCases(opts);
  const models = panelModels(catalog()).filter((model) => !opts.only || model.slug === opts.only);
  let cached = 0;
  let pending = 0;
  for (const item of cases) {
    for (const model of models) {
      const hash = translationHash(model, item);
      const file = cacheFile("pareto", "translations", model.slug, `${item.id}.json`);
      if (readCache(file, hash)?.result) cached += 1;
      else pending += 1;
    }
  }
  return { cases: cases.length, models: models.length, cached, pending, total: cached + pending };
}

export async function runTranslate(opts = parseArgs()) {
  if (!SYSTEM_PROMPT.includes("professional interpreter")) {
    throw new Error("eval/prompts/interpreter.txt was not loaded");
  }
  const cases = loadCases(opts);
  if (opts.limit) cases.splice(opts.limit);
  const models = panelModels(catalog()).filter((model) => !opts.only || model.slug === opts.only);
  if (!models.length) throw new Error("no models");
  const apiKey = loadKey();
  const ledger = loadParetoLedger(opts.pilot);
  const runs = [];
  const jobs = [];
  for (const item of cases) {
    for (const model of models) {
      const hash = translationHash(model, item);
      const file = cacheFile("pareto", "translations", model.slug, `${item.id}.json`);
      const cached = readCache(file, hash);
      if (cached?.result) runs.push({ ...cached.result, cached: true });
      else jobs.push({ item, model });
    }
  }
  const total = runs.length + jobs.length;
  console.log(`translate cases=${cases.length} models=${models.length} uncached=${jobs.length} cached=${runs.length} cap=$${ledger.cap} spent=$${ledger.spent.toFixed(4)}`);
  progress("translate", runs.length, total, ledger.spent);
  let done = runs.length;
  const fresh = await mapPool(jobs, TRANSLATE_CONCURRENCY, async ({ item, model }) => {
    const result = await translateOne(apiKey, ledger, model, item);
    done += 1;
    const flag = result.error ? ` error=${result.error}` : "";
    console.log(`${model.slug} ${item.id} ${result.latency_ms ?? "-"}ms $${(result.cost_usd || 0).toFixed(5)} spent=$${ledger.spent.toFixed(4)}${flag}`);
    if (done % 25 === 0 || done === total || result.error) progress("translate", done, total, ledger.spent);
    return result;
  });
  runs.push(...fresh);
  writeJson(TRANSLATIONS_FILE, {
    cases: cases.map((item) => item.id),
    models: models.map((model) => model.slug),
    runs,
    spent_usd: ledger.spent,
    aborted: ledger.aborted,
    abort_reason: ledger.reason,
  });
  const ok = runs.filter((run) => run.output && !run.error).length;
  const cost = runs.reduce((sum, run) => sum + (run.cost_usd || 0), 0);
  console.log(`translations ok=${ok}/${runs.length} translate_cost=$${cost.toFixed(4)} spent=$${ledger.spent.toFixed(4)}`);
  if (ledger.aborted) console.log(ledger.reason);
  return { cases, models, runs, ledger };
}

if (invokedDirectly(import.meta.url)) {
  runTranslate().catch((error) => {
    console.error(publicError(error));
    process.exitCode = 1;
  });
}
