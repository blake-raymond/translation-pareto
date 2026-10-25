// One judge, batched: all candidates for ~150 cases in a single prompt.
import fs from "node:fs";
import path from "node:path";
import { hashString, loadKey, paidChat, parseJsonObject, writeJson } from "../api.mjs";
import { invokedDirectly, letter, loadParetoLedger, parseArgs, seedMix, shuffle } from "./lib.mjs";
import {
  JUDGE_BATCH_SIZE,
  JUDGEMENTS_FILE,
  RESULTS_DIR,
  RUBRIC_VERSION,
  TRANSLATIONS_FILE,
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
    return { s: slug, out: (run?.output || "").trim() || "(empty)" };
  });
  return shuffle(cands, rng);
}

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

export async function runJudge(opts = parseArgs()) {
  const cases = loadCases(opts);
  const runs = loadRuns();
  const spec = catalog().judge;
  const slugs = catalog().models.map((model) => model.slug);
  const apiKey = loadKey();
  const ledger = loadParetoLedger(opts.pilot);
  const batches = chunk(cases, JUDGE_BATCH_SIZE);
  const allScores = {};
  const meta = [];
  fs.mkdirSync(path.join(RESULTS_DIR, "judge"), { recursive: true });
  console.log(`judge batches=${batches.length} cases=${cases.length} cands=${slugs.length} spent=$${ledger.spent.toFixed(4)} cap=$${ledger.cap}`);

  for (let b = 0; b < batches.length; b += 1) {
    if (ledger.aborted) break;
    const batchCases = batches[b];
    const order = {};
    const packed = batchCases.map((item) => {
      const rng = seedMix("judge", item.id);
      const cands = panel(item, slugs, runs, rng);
      order[item.id] = cands.map((row) => row.s);
      return { item, cands, block: caseBlock(item, cands) };
    });
    const hash = hashString({ v: RUBRIC_VERSION, judge: spec.slug, ids: packed.map((row) => row.item.id), order });
    const file = path.join(RESULTS_DIR, "judge", `batch-${String(b).padStart(3, "0")}.json`);
    let scores = null;
    let cost = 0;
    let usage = null;
    if (fs.existsSync(file)) {
      try {
        const cached = JSON.parse(fs.readFileSync(file, "utf8"));
        if (cached.hash === hash && cached.scores) {
          scores = cached.scores;
          cost = cached.cost_usd || 0;
          usage = cached.usage || null;
          console.log(`judge batch ${b} cache hit cases=${Object.keys(scores).length}`);
        }
      } catch {
        scores = null;
      }
    }
    if (!scores) {
      const estimateOut = Math.max(4000, packed.length * slugs.length * 8);
      const result = await paidChat(
        apiKey,
        ledger,
        spec,
        judgeMessages(packed, slugs),
        spec.max_tokens,
        { kind: "judge-batch", batch: b },
        { timeoutMs: 1500000, estimateOutputTokens: estimateOut },
      );
      cost = result.cost_usd || 0;
      usage = {
        prompt_tokens: result.prompt_tokens,
        completion_tokens: result.completion_tokens,
        reasoning_tokens: result.reasoning_tokens,
        cached_tokens: result.cached_tokens,
        cost_source: result.cost_source,
      };
      console.log(`judge batch ${b} $${cost.toFixed(4)} spent=$${ledger.spent.toFixed(4)}${result.error ? ` error=${result.error}` : ""}`);
      if (!result.ok) {
        meta.push({ batch: b, error: result.error, cost_usd: cost });
        continue;
      }
      scores = parseBatch(result.text, order);
      if (!scores || Object.keys(scores).length < packed.length * 0.8) {
        console.log(`judge batch ${b} parse incomplete, retrying once`);
        const retry = await paidChat(
          apiKey,
          ledger,
          spec,
          judgeMessages(packed, slugs),
          spec.max_tokens,
          { kind: "judge-batch-retry", batch: b },
          { timeoutMs: 1500000, estimateOutputTokens: estimateOut },
        );
        cost += retry.cost_usd || 0;
        if (retry.ok) scores = parseBatch(retry.text, order) || scores;
      }
      writeJson(file, { hash, order, slugs, scores, cost_usd: cost, usage, raw: result.text });
    }
    Object.assign(allScores, scores || {});
    meta.push({ batch: b, cases: packed.length, scored: Object.keys(scores || {}).length, cost_usd: cost, usage });
  }

  writeJson(JUDGEMENTS_FILE, {
    judge: spec.slug,
    rubric: RUBRIC_VERSION,
    slugs,
    scores: allScores,
    batches: meta,
    spent_usd: ledger.spent,
    aborted: ledger.aborted,
    abort_reason: ledger.reason,
  });
  console.log(`judge scored ${Object.keys(allScores).length}/${cases.length} spent=$${ledger.spent.toFixed(4)}`);
  return { scores: allScores, ledger, cases };
}

if (invokedDirectly(import.meta.url)) {
  runJudge().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
