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
const batchDir = path.join(SRC, "judge-all15");
const batches = {};
for (const name of fs.readdirSync(batchDir).filter((n) => /^batch-.*\.json$/.test(n)).sort()) {
  batches[name] = JSON.parse(fs.readFileSync(path.join(batchDir, name), "utf8"));
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
  description: "Raw results of the single 15-model pass reported in docs/results.md.",
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
    "judgements.json.gz": "{ judge, rubric, slugs, scores: { case_id: { slug: { meaning, naturalness, handling, critical_error, score } } }, batches, parse_failures }",
    "judge-batches.json.gz": "{ file name: { order: { case_id: [slug for label A, B, ...] }, raw: judge reply text, scores, cost_usd, usage } } - every judge call, including retried batches",
  },
};
fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
for (const f of files) console.log(`${f.file} ${(f.bytes / 1e6).toFixed(2)} MB`);