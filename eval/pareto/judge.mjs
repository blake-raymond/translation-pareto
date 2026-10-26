// One judge, batched: all candidates for ~150 cases in a single prompt.
import fs from "node:fs";
import path from "node:path";
import { hashString, loadKey, paidChat, parseJsonObject, publicError, writeJson } from "../api.mjs";
import { invokedDirectly, letter, loadParetoLedger, parseArgs, progress, seedMix, shuffle } from "./lib.mjs";
import {
  JUDGE_BATCH_SIZE,
  JUDGEMENTS_FILE,
  RESULTS_DIR,
  RUBRIC_VERSION,
  TRANSLATIONS_FILE,
  JUDGE_DIR,
  MAX_BATCHES,
  panelModels,
} from "./meta.mjs";
import { loadCases } from "./run-translate.mjs";

function catalog() {
  return JSON.parse(fs.readFileSync(new URL("./models.json", import.meta.url), "utf8"));
}

function loadRuns() {
  const payload = JSON.parse(fs.readFileSync(TRANSLATIONS_FILE, "utf8"));
  return payload.runs || [];
}

function panel(item, slugs, runs, rng) {
  const cands = slugs.map((slug) => {
    const run = runs.find((row) => row.case_id === item.id && row.slug === slug);
    const out = (run?.output || "").trim();
    if (!out || run?.error) {
      throw new Error(`judge refuses empty or errored candidate: case=${item.id} slug=${slug} error=${run?.error || "empty"}`);
    }
    return { s: slug, out };
  });
  return shuffle(cands, rng);
}

export { panel as _panelForTest, bindingHash as _bindingHashForTest };

function caseBlock(item, cands) {
  const lines = [
    `### CASE ${item.id}`,
    `Kind: ${item.kind}; languages: ${item.source} -> ${item.target}${item.domain ? `; domain: ${item.domain}` : ""}${item.problem ? `; problem: ${item.problem}` : ""}`,
  ];
  if (item.history?.length) {
    lines.push("History:");
    for (const turn of item.history) lines.push(`${turn.speaker} (${turn.lang}): ${turn.text}`);
  }
  lines.push(`Source line: ${item.text}`);
  if (item.kind === "benchmark" && item.reference) {
    lines.push(`Reference (hint, one acceptable rendering): ${item.reference}`);
  } else {
    lines.push("No reference. Score from the source line and the history.");
  }
  cands.forEach((cand, index) => {
    lines.push(`${letter(index)}: ${cand.out.slice(0, 800)}`);
  });
  return lines.join("\n");
}

function judgeMessages(batch, slugs) {
  const last = letter(slugs.length - 1);
  const system = [
    `You score anonymous translations of lines in live conversations. For each case there are ${slugs.length} candidates labelled A to ${last}.`,
    "For benchmark cases a reference is a hint: one acceptable rendering, not the only wording. Do not prefer a candidate just because it copies the reference.",
    "Chat cases have no reference. Use the conversation history for pronouns, tone, and referents.",
    "For each candidate give integers 1-5 for meaning, naturalness, handling (repair of typos, slang, autocorrect, diacritics, code-switching, honorifics), and critical (1 only for a wrong or reversed meaning, wrong target language, flipped negation, wrong number/dose/price, or offensive mistranslation; awkward wording or a register miss alone is 0).",
    "Judge each case independently. Do not let earlier cases affect later ones.",
    `Return ONLY compact JSON: {"CASE_ID":["m,n,h,c","m,n,h,c", ... one string per candidate in label order A..${last}],...} covering every case in this batch.`,
  ].join(" ");
  const user = batch.map((row) => row.block).join("\n\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function parseBatch(text, order) {
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const scores = {};
  for (const [id, arr] of Object.entries(parsed)) {
    const slugs = order[id];
    if (!slugs || !Array.isArray(arr)) continue;
    arr.forEach((cell, index) => {
      const slug = slugs[index];
      if (!slug) return;
      const [m, n, h, c] = String(cell).split(",").map(Number);
      if ([m, n, h].some((value) => !Number.isInteger(value) || value < 1 || value > 5)) return;
      if (c !== 0 && c !== 1) return;
      (scores[id] ||= {})[slug] = {
        meaning: m,
        naturalness: n,
        handling: h,
        critical_error: c === 1,
        score: (m + n + h) / 3,
      };
    });
  }
  return scores;
}

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function judgeDir() {
  return JUDGE_DIR;
}

function caseFile(id) {
  const safe = String(id).replace(/[^a-zA-Z0-9._=-]+/g, "_");
  return path.join(judgeDir(), "cases", `${safe}.json`);
}

function sameOrder(a, b) {
  return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((slug, index) => slug === b[index]);
}

function scoreComplete(cell, slugs) {
  if (!cell) return false;
  return slugs.every((slug) => cell[slug] && Number.isFinite(cell[slug].score));
}

function bindingHash(item, orderSlugs, runs, judgeSlug) {
  const outs = orderSlugs.map((slug) => {
    const run = runs.find((row) => row.case_id === item.id && row.slug === slug);
    return [slug, (run?.output || "").trim()];
  });
  // The case content the judge sees (source line, reference hint, history) is part of the key too.
  const shown = { text: item.text ?? null, ref: item.reference ?? null, history: item.history ?? null };
  return hashString({ v: RUBRIC_VERSION, judge: judgeSlug, id: item.id, outs, shown });
}

function packCase(item, slugs, runs) {
  const cands = panel(item, slugs, runs, seedMix("judge", item.id));
  const order = cands.map((row) => row.s);
  return { item, cands, order, block: caseBlock(item, cands) };
}

function readCaseScore(item, order, runs, judgeSlug) {
  try {
    const cached = JSON.parse(fs.readFileSync(caseFile(item.id), "utf8"));
    const hash = bindingHash(item, order, runs, judgeSlug);
    if (cached.hash === hash && sameOrder(cached.order, order) && cached.scores) return cached.scores;
  } catch {
    return null;
  }
  return null;
}

function writeCaseScore(item, order, runs, judgeSlug, scores) {
  writeJson(caseFile(item.id), {
    hash: bindingHash(item, order, runs, judgeSlug),
    order,
    scores,
    case_id: item.id,
  });
}

function ingestLegacyBatches(cases, slugs, runs, judgeSlug) {
  const dir = judgeDir();
  if (!fs.existsSync(dir)) return 0;
  let imported = 0;
  for (const name of fs.readdirSync(dir)) {
    if (!/^batch-.*\.json$/i.test(name)) continue;
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    if (!payload?.scores || !payload?.order) continue;
    // Batches written before 2026-10-25 fix have no per-case output hashes. Their scores
    // could belong to different (e.g. empty) outputs, so they are never imported.
    if (!payload.case_hashes) continue;
    for (const item of cases) {
      const cell = payload.scores[item.id];
      const order = payload.order[item.id];
      if (payload.case_hashes[item.id] !== bindingHash(item, order || [], runs, judgeSlug)) continue;
      if (!scoreComplete(cell, slugs) || !Array.isArray(order)) continue;
      const packed = packCase(item, slugs, runs);
      if (!sameOrder(order, packed.order)) continue;
      if (readCaseScore(item, packed.order, runs, judgeSlug)) continue;
      writeCaseScore(item, packed.order, runs, judgeSlug, cell);
      imported += 1;
    }
  }
  return imported;
}

export function judgeWork(opts = parseArgs()) {
  const cases = loadCases(opts);
  let runs = [];
  try {
    runs = loadRuns();
  } catch {
    runs = [];
  }
  const spec = catalog().judge;
  const slugs = panelModels(catalog()).map((model) => model.slug);
  const imported = ingestLegacyBatches(cases, slugs, runs, spec.slug);
  let cached = 0;
  for (const item of cases) {
    const packed = packCase(item, slugs, runs);
    if (readCaseScore(item, packed.order, runs, spec.slug)) cached += 1;
  }
  return { cases: cases.length, cached, pending: cases.length - cached, imported };
}

async function judgePacked(apiKey, ledger, spec, packed, slugs, tag) {
  const order = {};
  for (const row of packed) order[row.item.id] = row.order;
  const estimateOut = Math.max(4000, packed.length * slugs.length * 8);
  const result = await paidChat(
    apiKey,
    ledger,
    spec,
    judgeMessages(packed, slugs),
    spec.max_tokens,
    { kind: tag, batch: packed.length },
    { timeoutMs: 1500000, estimateOutputTokens: estimateOut },
  );
  const scores = result.ok ? parseBatch(result.text, order) : null;
  return { result, scores, order };
}

export async function runJudge(opts = parseArgs()) {
  const cases = loadCases(opts);
  const runs = loadRuns();
  const spec = catalog().judge;
  const slugs = panelModels(catalog()).map((model) => model.slug);
  const apiKey = loadKey();
  const ledger = loadParetoLedger(opts.pilot);
  fs.mkdirSync(path.join(judgeDir(), "cases"), { recursive: true });
  const imported = ingestLegacyBatches(cases, slugs, runs, spec.slug);
  if (imported) console.log(`judge imported ${imported} cached cases from existing batches`);

  const allScores = {};
  const todo = [];
  for (const item of cases) {
    const packed = packCase(item, slugs, runs);
    const cached = readCaseScore(item, packed.order, runs, spec.slug);
    if (cached) allScores[item.id] = cached;
    else todo.push(packed);
  }
  const batches = chunk(todo, JUDGE_BATCH_SIZE);
  if (MAX_BATCHES) batches.splice(MAX_BATCHES);
  const meta = [];
  let parseFailures = 0;
  console.log(`judge batches=${batches.length} uncached=${todo.length} cached=${cases.length - todo.length} cands=${slugs.length} spent=$${ledger.spent.toFixed(4)} cap=$${ledger.cap}`);
  progress("judge", cases.length - todo.length, cases.length, ledger.spent);

  const bq = batches.map((_, idx) => idx);
  const jworker = async () => {
  while (bq.length) {
    const b = bq.shift();
    if (ledger.aborted) break;
    const packed = batches[b];
    const order = {};
    for (const row of packed) order[row.item.id] = row.order;
    let { result, scores } = await judgePacked(apiKey, ledger, spec, packed, slugs, "judge-batch");
    let cost = result.cost_usd || 0;
    console.log(`judge batch ${b} $${cost.toFixed(4)} spent=$${ledger.spent.toFixed(4)}${result.error ? ` error=${result.error}` : ""}`);
    if (!result.ok) {
      meta.push({ batch: b, error: result.error, cost_usd: cost, cases: packed.length });
      if (result.error === "credits" || result.error === "spend_cap") {
        ledger.aborted = true;
        if (!ledger.reason) ledger.reason = result.error === "credits"
          ? "OpenRouter rejected the call for credits."
          : "spend cap";
      }
      progress("judge", Object.keys(allScores).length, cases.length, ledger.spent);
      continue;
    }
    const missing = () => packed.filter((row) => !scoreComplete(scores?.[row.item.id], slugs));
    let missed = missing();
    if (missed.length) {
      console.log(`judge batch ${b} parse incomplete ${packed.length - missed.length}/${packed.length}, retrying missing once`);
      const retry = await judgePacked(apiKey, ledger, spec, missed, slugs, "judge-batch-retry");
      cost += retry.result.cost_usd || 0;
      if (retry.scores) scores = { ...(scores || {}), ...retry.scores };
      missed = missing();
    }
    const hash = hashString({ v: RUBRIC_VERSION, judge: spec.slug, ids: packed.map((row) => row.item.id), order });
    const case_hashes = {};
    for (const row of packed) case_hashes[row.item.id] = bindingHash(row.item, row.order, runs, spec.slug);
    writeJson(path.join(judgeDir(), `batch-h-${hash}.json`), {
      hash,
      order,
      case_hashes,
      slugs,
      scores,
      raw: result.text || null,
      cost_usd: cost,
      usage: {
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        reasoning_tokens: result.reasoning_tokens,
        cached_tokens: result.cached_tokens,
        cost_source: result.cost_source,
      },
    });
    for (const row of packed) {
      const cell = scores?.[row.item.id];
      if (!scoreComplete(cell, slugs)) {
        parseFailures += 1;
        continue;
      }
      writeCaseScore(row.item, row.order, runs, spec.slug, cell);
      allScores[row.item.id] = cell;
    }
    meta.push({ batch: b, cases: packed.length, scored: packed.length - missed.length, cost_usd: cost });
    progress("judge", Object.keys(allScores).length, cases.length, ledger.spent);
  }
  };
  await Promise.all(Array.from({ length: 3 }, () => jworker()));

  writeJson(JUDGEMENTS_FILE, {
    judge: spec.slug,
    rubric: RUBRIC_VERSION,
    slugs,
    scores: allScores,
    batches: meta,
    parse_failures: parseFailures,
    n_cases: cases.length,
    n_scored: Object.keys(allScores).length,
    spent_usd: ledger.spent,
    aborted: ledger.aborted,
    abort_reason: ledger.reason,
  });
  console.log(`judge scored ${Object.keys(allScores).length}/${cases.length} parse_failures=${parseFailures} spent=$${ledger.spent.toFixed(4)}`);
  return { scores: allScores, ledger, cases, parseFailures };
}

if (invokedDirectly(import.meta.url)) {
  runJudge().catch((error) => {
    console.error(publicError(error));
    process.exitCode = 1;
  });
}
