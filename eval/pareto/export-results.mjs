// Export the raw results of the 15-model run into data/results/ (committed, gzip).
// Usage: node eval/pareto/export-results.mjs
// Reads eval/pareto/results/{translations-all15.json,judgements-all15.json,judge-all15/batch-*.json}.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { rootDir } from "../api.mjs";

const ROOT = rootDir();
const SRC = path.join(ROOT, "eval", "pareto", "results");
const OUT = path.join(ROOT, "data", "results");
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const gz = (name, text) => {
  const buf = zlib.gzipSync(Buffer.from(text, "utf8"), { level: 9 });
  fs.writeFileSync(path.join(OUT, name), buf);
  return { file: `data/results/${name}`, bytes: buf.length, sha256_uncompressed: sha(Buffer.from(text, "utf8")) };
};
const scrub = (text) => {
  if (/sk-or-|Bearer\s/i.test(text)) throw new Error("credential-like text in export");
  return text;
};

fs.mkdirSync(OUT, { recursive: true });
const translations = JSON.parse(fs.readFileSync(path.join(SRC, "translations-all15.json"), "utf8"));
for (const run of translations.runs) delete run.cached; // local cache flag, not a result
const judgements = JSON.parse(fs.readFileSync(path.join(SRC, "judgements-all15.json"), "utf8"));
for (const key of ["spent_usd", "aborted", "abort_reason", "batches"]) delete judgements[key]; // local run state; every judge call is in judge-batches
const batchDir = path.join(SRC, "judge-all15");
const batches = {};
// Keep every judge call whose scores are used, plus failed or partial calls that were retried.
// A call is left out only if it scored all of its cases and a later call scored every one of them again.
const all = fs.readdirSync(batchDir).filter((n) => /^batch-.*\.json$/.test(n)).sort()
  .map((name) => ({ name, t: fs.statSync(path.join(batchDir, name)).mtimeMs, b: JSON.parse(fs.readFileSync(path.join(batchDir, name), "utf8")) }));
const scored = (x, id) => x.b.scores?.[id] && Object.keys(x.b.scores[id]).length > 0;
for (const x of all) {
  const ids = Object.keys(x.b.order || {});
  const replaced = ids.every((id) => scored(x, id)) && ids.every((id) => all.some((y) => y.t > x.t && scored(y, id)));
  if (!replaced) batches[x.name] = x.b;
}
const files = [
  gz("translations.json.gz", scrub(JSON.stringify(translations))),
  gz("judgements.json.gz", scrub(JSON.stringify(judgements))),
  gz("judge-batches.json.gz", scrub(JSON.stringify(batches))),
];
// Line endings are normalized so checkouts with CRLF hash the same.
const hashOf = (rel) => sha(fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/\r\n/g, "\n"));
const inputs = [
  "eval/prompts/interpreter.txt", "eval/pareto/prompts.mjs", "eval/pareto/judge.mjs", "eval/pareto/models.json",
  "data/benchmark-cases.json", "data/chat-cases.json",
].map((rel) => ({ file: rel, sha256: hashOf(rel) }));
const manifest = {
  description: "Raw results reported in docs/results.md.",
  cost_usd: {
    translations: translations.runs.reduce((s, r) => s + (Number(r.cost_usd) || 0), 0),
    translation_calls: translations.runs.length,
    judging: Object.values(batches).reduce((s, b) => s + (Number(b.cost_usd) || 0), 0),
    judge_calls: Object.keys(batches).length,
  },
  judge: judgements.judge,
  rubric_version: judgements.rubric,
  panel: translations.models,
  n_cases: judgements.n_cases,
  n_scored: judgements.n_scored,
  system_prompt: fs.readFileSync(path.join(ROOT, "eval", "prompts", "interpreter.txt"), "utf8").trim(),
  inputs,
  files,
  formats: {
    "translations.json.gz": "{ cases: [case id], models: [slug], runs: [{ case_id, slug, output, error, cost_usd, prompt_tokens, completion_tokens, reasoning_tokens, latency_ms, temperature, reasoning }] }",
    "judgements.json.gz": "{ judge, rubric, slugs, scores: { case_id: { slug: { meaning, naturalness, handling, critical_error, score } } }, parse_failures }",
    "judge-batches.json.gz": "{ file name: { order: { case_id: [slug for label A, B, ...] }, raw: judge reply text, scores, cost_usd, usage } } - every judge call behind the published scores, including failed calls that were retried",
  },
};
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
for (const f of files) console.log(`${f.file} ${(f.bytes / 1e6).toFixed(2)} MB`);