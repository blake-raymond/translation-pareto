// OpenRouter comparison for Grok Translate.
// Production prompt: SYSTEM_PROMPT and buildUserPrompt from src/worker.js.
//
//   node eval/run.mjs
//   node eval/run.mjs --prepare-only
//   node eval/run.mjs --skip-prepare
//   node eval/run.mjs --limit 1 --only google/gemini-2.5-flash-lite
//
// Translations and judgements are cached under eval/results/cache by model and
// case. A failed run resumes without paying for calls that already succeeded.
// The spend ledger is append-only. The cap is 10 USD of new OpenRouter spend.

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/worker.js";
import { CAP_USD, EN_LANGS, PROBLEMS, RUBRIC_VERSION, SEED, directionKey } from "./meta.mjs";
import { assertCoverage, prepareCases } from "./prepare.mjs";
import { writeReports } from "./report.mjs";
import {
  cacheFile,
  ensureUtf8Console,
  hashString,
  loadKey,
  loadLedger,
  mapPool,
  paidChat,
  parseJsonObject,
  publicError,
  readCache,
  readJson,
  rootDir,
  scriptOk,
  writeJson,
} from "./api.mjs";

const TRANSLATE_CONCURRENCY = 4;
const JUDGE_CONCURRENCY = 2;

function parseArgs(argv) {
  const opts = {
    limit: null,
    only: null,
    prepareOnly: false,
    skipPrepare: false,
    noPivot: false,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--limit") opts.limit = Number(argv[++i]);
    else if (arg === "--only") opts.only = String(argv[++i] || "");
    else if (arg === "--prepare-only") opts.prepareOnly = true;
    else if (arg === "--skip-prepare") opts.skipPrepare = true;
    else if (arg === "--no-pivot") opts.noPivot = true;
    else throw new Error(`Unknown argument ${arg}`);
  }
  if (opts.limit != null && (!Number.isInteger(opts.limit) || opts.limit < 1)) {
    throw new Error("--limit must be a positive integer");
  }
  return opts;
}

function cleanHistory(history) {
  return history.map(({ speaker, lang, text }) => ({ speaker, lang, text }));
}

function userPrompt(item, text = item.text, source = item.source, target = item.target) {
  return buildUserPrompt(text, source, target, cleanHistory(item.history));
}

function translationHash(model, item, text, source, target) {
  return hashString({
    v: RUBRIC_VERSION,
    slug: model.slug,
    case: item.id,
    system: SYSTEM_PROMPT,
    user: userPrompt(item, text, source, target),
    temperature: model.temperature ?? null,
    reasoning: model.reasoning ?? null,
    max: model.max_tokens,
  });
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const copy = [...items];
  const rand = mulberry32(seed >>> 0);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function letter(index) {
  return String.fromCharCode(65 + index);
}

function transcript(history) {
  return history.map((entry) => `${entry.speaker} (${entry.lang}): ${entry.text}`).join("\n");
}

function judgeMessages(item, candidates) {
  const blocks = candidates.map((candidate) => (
    `Candidate ${candidate.label}\n${candidate.output || "(empty)"}`
  )).join("\n\n");
  const system = [
    "You score anonymous translations of one line in a live travel conversation.",
    "The expected-meaning note is authoritative for facts, referents, numbers, and speech acts.",
    "The reference is one acceptable rendering, not the only wording.",
    "Do not prefer a candidate just because it copies the reference.",
    "Score each candidate with integers from 1 to 5.",
    "meaning: 5 matches the intended meaning, including who and what is referred to; 1 misses or reverses it.",
    "naturalness: 5 sounds like a person in that situation; 1 is the wrong language, ungrammatical, or padded with commentary.",
    "handling: 5 repairs typos, slang, autocorrect, missing diacritics, code-switching, and honorific context; 1 keeps the error or ignores context.",
    "critical_error is true only for a wrong or reversed meaning, the wrong target language, a missing or flipped negation, a wrong number, dose, or price, or an offensive mistranslation of a non-offensive line.",
    "Awkward but understandable wording is not a critical error. A register miss alone is not a critical error.",
    "The interpreter was told to output only the translation. Labels, quotes, or explanations lower naturalness.",
    "Return only a JSON object of the form",
    '{"scores":[{"id":"A","meaning":5,"naturalness":5,"handling":5,"critical_error":false,"note":"brief"}]}',
    "Include every candidate id exactly once.",
  ].join(" ");
  const user = [
    `Source language: ${item.source}`,
    `Target language: ${item.target}`,
    `Problem tag: ${item.problem}`,
    "",
    "Conversation so far:",
    transcript(item.history),
    "",
    "Source line to translate:",
    item.text,
    "",
    "Expected meaning:",
    item.meaning,
    "",
    "Reference translation:",
    item.reference,
    "",
    blocks,
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function clampScore(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

function parseScores(text, ordered) {
  const parsed = parseJsonObject(text);
  if (!parsed || !Array.isArray(parsed.scores)) return null;
  const scores = {};
  for (const row of parsed.scores) {
    const candidate = ordered.find((item) => item.label === row.id);
    if (!candidate) continue;
    const meaning = clampScore(row.meaning);
    const naturalness = clampScore(row.naturalness);
    const handling = clampScore(row.handling);
    if (meaning == null || naturalness == null || handling == null) continue;
    if (typeof row.critical_error !== "boolean") continue;
    scores[candidate.key] = {
      meaning,
      naturalness,
      handling,
      critical_error: row.critical_error,
      note: typeof row.note === "string" ? row.note.slice(0, 400) : "",
    };
  }
  return scores;
}

function interleave(cases) {
  const groups = new Map();
  for (const item of cases) {
    const key = item.source === "en" || item.target === "en"
      ? (item.source === "en" ? item.target : item.source)
      : `${item.source}-${item.target}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const queues = [...groups.values()];
  const out = [];
  let added = true;
  while (added) {
    added = false;
    for (const queue of queues) {
      if (!queue.length) continue;
      out.push(queue.shift());
      added = true;
    }
  }
  return out;
}

function validateLoaded(cases) {
  assertCoverage(cases);
  for (const item of cases) {
    const relaxed = item.problem === "missing-diacritics" || item.problem === "typo";
    if (!scriptOk(item.source, item.text, relaxed && item.source !== "en")) {
      throw new Error(`${item.id} source is not valid text in ${item.source}`);
    }
    if (!scriptOk(item.target, item.reference, false)) {
      throw new Error(`${item.id} reference is not valid text in ${item.target}`);
    }
  }
  const problems = new Set(cases.map((item) => item.problem));
  for (const problem of PROBLEMS) {
    if (!problems.has(problem)) throw new Error(`missing problem ${problem}`);
  }
  for (const code of EN_LANGS) {
    const count = cases.filter((item) => item.source === code || item.target === code).length;
    if (count < 8) throw new Error(`${code} has ${count} cases`);
  }
}

async function translateCall(apiKey, ledger, model, item, text, source, target, kind) {
  const hash = translationHash(model, item, text, source, target);
  const file = cacheFile("translations", `${kind}-${model.slug}`, `${item.id}.json`);
  const cached = readCache(file, hash);
  if (cached?.result) return { ...cached.result, cached: true };
  if (ledger.aborted) {
    return {
      case_id: item.id,
      slug: model.slug,
      kind,
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
    { role: "user", content: userPrompt(item, text, source, target) },
  ];
  const started = Date.now();
  const result = await paidChat(apiKey, ledger, model, messages, model.max_tokens, {
    kind,
    case_id: item.id,
  });
  const record = {
    case_id: item.id,
    slug: model.slug,
    kind,
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
    ledger.reason = "OpenRouter rejected the call for credits. Judges were not switched.";
  }
  return record;
}

async function judgeCall(apiKey, ledger, judge, item, ordered, arm) {
  const hash = hashString({
    v: RUBRIC_VERSION,
    judge: judge.slug,
    case: item.id,
    arm,
    ordered: ordered.map((candidate) => [candidate.key, candidate.output]),
  });
  const file = cacheFile("judgements", `${arm}-${judge.slug}`, `${item.id}.json`);
  const cached = readCache(file, hash);
  if (cached?.result) return { ...cached.result, cached: true };
  if (ledger.aborted) {
    return {
      case_id: item.id,
      judge: judge.slug,
      arm,
      scores: {},
      cost_usd: 0,
      error: "spend_cap",
      cached: false,
    };
  }
  const messages = judgeMessages(item, ordered);
  const model = {
    slug: judge.slug,
    prompt_per_million: judge.prompt_per_million,
    completion_per_million: judge.completion_per_million,
    reasoning: judge.reasoning,
    temperature: judge.temperature,
    max_tokens: judge.max_tokens,
  };
  let cost = 0;
  let scores = null;
  let lastError = "judge_json";
  let counts = {};
  for (let attempt = 0; attempt < 2 && !scores; attempt += 1) {
    const result = await paidChat(apiKey, ledger, model, messages, judge.max_tokens, {
      kind: `judge-${arm}`,
      case_id: item.id,
    });
    cost += result.cost_usd || 0;
    counts = result;
    if (!result.ok) {
      lastError = result.error;
      if (result.error === "credits" || result.error === "spend_cap") break;
      continue;
    }
    const parsed = parseScores(result.text, ordered);
    if (parsed && Object.keys(parsed).length === ordered.length) scores = parsed;
    else lastError = "judge_json";
  }
  const record = {
    case_id: item.id,
    judge: judge.slug,
    arm,
    scores: scores || {},
    cost_usd: cost,
    error: scores ? null : lastError,
    order: ordered.map((candidate) => candidate.key),
    prompt_tokens: counts.prompt_tokens || 0,
    completion_tokens: counts.completion_tokens || 0,
    cached: false,
  };
  if (scores) writeJson(file, { hash, result: record });
  if (lastError === "credits") {
    ledger.aborted = true;
    ledger.reason = `OpenRouter rejected ${judge.slug} for credits. The other judge was not substituted.`;
  }
  return record;
}

function panelOrder(item, runs) {
  const ready = runs.filter((run) => run.output && !run.error);
  const seed = Number.parseInt(hashString(`${SEED}:${item.id}`).slice(0, 8), 16);
  return shuffle(ready, seed).map((run, index) => ({
    key: run.slug,
    label: letter(index),
    output: run.output.slice(0, 800),
  }));
}

function selectPivotModel(catalog, cases, runs, judgements) {
  const cross = cases.filter((item) => item.source !== "en" && item.target !== "en");
  if (!cross.length) return null;
  const judges = catalog.judges.map((judge) => judge.slug);
  const scores = new Map();
  for (const item of cases) {
    const rows = judgements.filter((judgement) => judgement.case_id === item.id && judgement.arm === "direct" && !judgement.error);
    const left = rows.find((row) => row.judge === judges[0]);
    const right = rows.find((row) => row.judge === judges[1]);
    if (!left || !right) continue;
    for (const model of catalog.models) {
      if (model.role === "ceiling") continue;
      const a = left.scores?.[model.slug];
      const b = right.scores?.[model.slug];
      if (!a || !b) continue;
      const overall = ((a.meaning + a.naturalness + a.handling) / 3 + (b.meaning + b.naturalness + b.handling) / 3) / 2;
      if (!scores.has(model.slug)) scores.set(model.slug, []);
      scores.get(model.slug).push(overall);
    }
  }
  const ranked = [];
  for (const model of catalog.models) {
    if (model.role === "ceiling") continue;
    const values = scores.get(model.slug) || [];
    if (values.length < Math.ceil(cases.length * 0.8)) continue;
    const modelRuns = runs.filter((run) => run.slug === model.slug && run.output && !run.error);
    const cost = modelRuns.reduce((sum, run) => sum + (run.cost_usd || 0), 0);
    ranked.push({
      slug: model.slug,
      mean: values.reduce((sum, value) => sum + value, 0) / values.length,
      costPer1k: modelRuns.length ? (cost / modelRuns.length) * 1000 : 99,
    });
  }
  if (!ranked.length) return null;
  const best = Math.max(...ranked.map((row) => row.mean));
  const band = ranked.filter((row) => row.mean >= best - 0.1);
  band.sort((a, b) => a.costPer1k - b.costPer1k || b.mean - a.mean);
  return band[0].slug;
}

function loadReview() {
  try {
    return readJson(path.join(rootDir(), "eval", "case-review.json"));
  } catch {
    return null;
  }
}

function teeProgress() {
  const file = path.join(rootDir(), "eval", "results", "progress.log");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const write = (level, args) => {
    const line = args.map((part) => (typeof part === "string" ? part : JSON.stringify(part))).join(" ");
    fs.appendFileSync(file, `${new Date().toISOString()} ${level} ${line}\n`, "utf8");
  };
  const log = console.log.bind(console);
  const error = console.error.bind(console);
  console.log = (...args) => {
    write("INFO", args);
    log(...args);
  };
  console.error = (...args) => {
    write("ERROR", args);
    error(...args);
  };
}

async function main() {
  ensureUtf8Console();
  teeProgress();
  console.log(`progress pid=${process.pid}`);
  const opts = parseArgs(process.argv);
  const catalog = readJson(path.join(rootDir(), "eval", "models.json"));
  if (!Array.isArray(catalog.judges) || catalog.judges.length !== 2) {
    throw new Error("models.json must list exactly two judges");
  }
  if (catalog.judges[0].family === catalog.judges[1].family) {
    throw new Error("judges must come from different families");
  }
  const candidateSlugs = new Set(catalog.models.map((model) => model.slug));
  for (const judge of catalog.judges) {
    if (candidateSlugs.has(judge.slug)) throw new Error(`${judge.slug} cannot judge itself`);
  }
  if (!SYSTEM_PROMPT.includes("professional interpreter")) {
    throw new Error("production system prompt was not imported");
  }
  const apiKey = loadKey();
  const ledger = loadLedger();
  console.log(`ledger $${ledger.spent.toFixed(4)} / $${CAP_USD.toFixed(2)}`);
  const casesPath = path.join(rootDir(), "eval", "cases.json");
  let cases;
  if (!opts.skipPrepare && (opts.prepareOnly || !exists(casesPath))) {
    cases = await prepareCases(apiKey, ledger, catalog);
  } else {
    cases = readJson(casesPath);
  }
  if (opts.prepareOnly) {
    console.log(`prepared ${cases.length} cases, spent $${ledger.spent.toFixed(4)}`);
    return;
  }
  validateLoaded(cases);
  const sample = userPrompt(cases[0]);
  if (!sample.includes("Conversation so far")) throw new Error("production prompt builder was not imported");
  if (opts.limit) cases = interleave(cases).slice(0, opts.limit);
  let models = catalog.models;
  if (opts.only) {
    models = models.filter((model) => model.slug === opts.only);
    if (!models.length) throw new Error(`unknown model ${opts.only}`);
  }
  const partial = Boolean(opts.limit || opts.only);
  console.log(`cases ${cases.length}, models ${models.length}, partial ${partial}`);
  const startedAt = new Date().toISOString();
  const activeCatalog = { ...catalog, models };

  const runs = [];
  const jobs = [];
  for (const item of cases) {
    for (const model of models) {
      const hash = translationHash(model, item, item.text, item.source, item.target);
      const file = cacheFile("translations", `direct-${model.slug}`, `${item.id}.json`);
      const cached = readCache(file, hash);
      if (cached?.result) runs.push({ ...cached.result, cached: true });
      else jobs.push({ item, model });
    }
  }
  console.log(`translating ${jobs.length} uncached calls, ${runs.length} cached, concurrency ${TRANSLATE_CONCURRENCY}`);
  const fresh = await mapPool(jobs, TRANSLATE_CONCURRENCY, async ({ item, model }) => {
    const result = await translateCall(apiKey, ledger, model, item, item.text, item.source, item.target, "direct");
    const flag = result.error ? ` error=${result.error}` : "";
    console.log(`${model.slug} ${item.id} ${result.latency_ms ?? "-"}ms $${(result.cost_usd || 0).toFixed(5)} spent=$${ledger.spent.toFixed(4)}${flag}`);
    return result;
  });
  runs.push(...fresh);
  if (ledger.aborted) console.log(ledger.reason);

  const judgements = [];
  const judgeJobs = [];
  for (const item of interleave(cases)) {
    const related = runs.filter((run) => run.case_id === item.id && run.kind === "direct");
    const ordered = panelOrder(item, related);
    if (!ordered.length) continue;
    for (const judge of catalog.judges) {
      const hash = hashString({
        v: RUBRIC_VERSION,
        judge: judge.slug,
        case: item.id,
        arm: "direct",
        ordered: ordered.map((candidate) => [candidate.key, candidate.output]),
      });
      const file = cacheFile("judgements", `direct-${judge.slug}`, `${item.id}.json`);
      const cached = readCache(file, hash);
      if (cached?.result) judgements.push({ ...cached.result, cached: true });
      else judgeJobs.push({ item, judge, ordered });
    }
  }
  console.log(`judging ${judgeJobs.length} uncached calls, ${judgements.length} cached, concurrency ${JUDGE_CONCURRENCY}`);
  const judged = await mapPool(judgeJobs, JUDGE_CONCURRENCY, async (job) => {
    if (ledger.aborted) return null;
    const judgement = await judgeCall(apiKey, ledger, job.judge, job.item, job.ordered, "direct");
    console.log(`judge ${job.judge.slug} ${job.item.id} $${(judgement.cost_usd || 0).toFixed(5)} scored=${Object.keys(judgement.scores).length} spent=$${ledger.spent.toFixed(4)}${judgement.error ? ` error=${judgement.error}` : ""}`);
    return judgement;
  });
  judgements.push(...judged.filter(Boolean));
  if (ledger.aborted) console.log(ledger.reason);

  let pivotModel = null;
  let pivotRuns = [];
  let pivotJudgements = [];
  const judgedCases = cases.filter((item) => catalog.judges.every((judge) => judgements.some((row) => (
    row.case_id === item.id && row.judge === judge.slug && row.arm === "direct" && !row.error && Object.keys(row.scores).length
  )))).length;
  const judgesDone = !partial && !opts.noPivot && !ledger.aborted && judgedCases >= Math.ceil(cases.length * 0.9);
  console.log(`both judges scored ${judgedCases}/${cases.length}`);
  if (judgesDone) {
    pivotModel = selectPivotModel(activeCatalog, cases, runs, judgements);
    console.log(`pivot model ${pivotModel || "none"}`);
  } else if (!opts.noPivot) {
    console.log("pivot skipped until both judges have scored every case");
  }
  if (pivotModel) {
    const model = catalog.models.find((item) => item.slug === pivotModel);
    const cross = cases.filter((item) => item.source !== "en" && item.target !== "en");
    for (const item of cross) {
      if (ledger.aborted) break;
      const toEnglish = await translateCall(apiKey, ledger, model, item, item.text, item.source, "en", "pivot-en");
      console.log(`pivot en ${item.id} ${toEnglish.latency_ms ?? "-"}ms $${(toEnglish.cost_usd || 0).toFixed(5)}`);
      let toTarget = {
        case_id: item.id,
        slug: model.slug,
        kind: "pivot-target",
        skipped: true,
        error: "pivot_en_failed",
        output: "",
        latency_ms: 0,
        cost_usd: 0,
      };
      if (toEnglish.output && !toEnglish.error) {
        toTarget = await translateCall(apiKey, ledger, model, item, toEnglish.output, "en", item.target, "pivot-target");
        console.log(`pivot target ${item.id} ${toTarget.latency_ms ?? "-"}ms $${(toTarget.cost_usd || 0).toFixed(5)}`);
      }
      pivotRuns.push(toEnglish, toTarget);
      const direct = runs.find((run) => run.case_id === item.id && run.slug === model.slug && run.kind === "direct" && run.output);
      if (!direct || !toTarget.output || ledger.aborted) continue;
      const seed = Number.parseInt(hashString(`${SEED}:pivot:${item.id}`).slice(0, 8), 16);
      const ordered = shuffle([
        { key: `${model.slug}#direct`, output: direct.output.slice(0, 800) },
        { key: `${model.slug}#pivot`, output: toTarget.output.slice(0, 800) },
      ], seed).map((candidate, index) => ({ ...candidate, label: letter(index) }));
      for (const judge of catalog.judges) {
        if (ledger.aborted) break;
        const judgement = await judgeCall(apiKey, ledger, judge, item, ordered, "pivot-pair");
        pivotJudgements.push(judgement);
        console.log(`pivot judge ${judge.slug} ${item.id} $${(judgement.cost_usd || 0).toFixed(5)} spent=$${ledger.spent.toFixed(4)}${judgement.error ? ` error=${judgement.error}` : ""}`);
      }
    }
  }

  const finishedAt = new Date().toISOString();
  const review = loadReview();
  const written = writeReports({
    catalog: activeCatalog,
    cases,
    runs: runs.filter((run) => run.kind === "direct" || !run.kind),
    judgements: judgements.filter((item) => item.arm === "direct" || !item.arm),
    pivotRuns,
    pivotJudgements,
    pivotModel,
    ledger,
    startedAt,
    finishedAt,
    review,
    systemPrompt: SYSTEM_PROMPT,
    partial,
  });
  writeJson(path.join(rootDir(), "eval", "results", "latest.json"), {
    started_at: startedAt,
    finished_at: finishedAt,
    cap_usd: CAP_USD,
    spent_usd: ledger.spent,
    aborted: ledger.aborted,
    abort_reason: ledger.reason,
    pivot_model: pivotModel,
    runs,
    judgements,
    pivot_runs: pivotRuns,
    pivot_judgements: pivotJudgements,
  });
  const report = readJson ? null : null;
  console.log(`total spend $${ledger.spent.toFixed(4)}`);
  console.log(`report ${path.relative(rootDir(), written.reportPath)}`);
  console.log(`doc ${path.relative(rootDir(), written.docPath)}`);
  const headline = written.analysis.rows
    .slice()
    .sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1))
    .map((row) => `${row.model.slug} ${row.mean == null ? "—" : row.mean.toFixed(2)} n=${row.scored}`)
    .join("\n");
  console.log(headline);
  if (ledger.aborted) {
    console.log("STATUS ABORTED");
    process.exitCode = 2;
  } else {
    console.log("STATUS DONE");
  }
}

function exists(file) {
  return fs.existsSync(file);
}

main().catch((error) => {
  console.error(publicError(error));
  console.log("STATUS FAILED");
  process.exitCode = 1;
});
