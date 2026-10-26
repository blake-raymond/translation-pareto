// Recompute docs/results.md and docs/pareto.svg from the committed raw results. No API calls.
// Usage: node eval/pareto/verify.mjs [results-dir]   (default data/results)
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { rootDir } from "../api.mjs";

const ROOT = rootDir();
const dir = path.resolve(process.argv[2] || path.join(ROOT, "data", "results"));
const manifest = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pareto-verify-"));
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
let problems = 0;

for (const input of manifest.inputs) {
  const now = sha(fs.readFileSync(path.join(ROOT, input.file)));
  if (now !== input.sha256) console.log(`note: ${input.file} differs from the version used for the run`);
}
for (const name of ["translations.json.gz", "judgements.json.gz"]) {
  const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, name)));
  const want = manifest.files.find((f) => f.file.endsWith(name))?.sha256_uncompressed;
  if (want && sha(text) !== want) { console.log(`FAIL: ${name} checksum mismatch`); problems += 1; }
  fs.writeFileSync(path.join(tmp, name.replace(/\.gz$/, "")), text);
}

const env = {
  ...process.env,
  PARETO_ALL15: "1",
  PARETO_PANEL: manifest.panel.join(","),
  PARETO_TRANSLATIONS: path.join(tmp, "translations.json"),
  PARETO_JUDGE_OUT: path.join(tmp, "judgements.json"),
  PARETO_REPORT_MD: path.join(tmp, "results.md"),
  PARETO_REPORT_SVG: path.join(tmp, "pareto.svg"),
  PARETO_SUMMARY: path.join(tmp, "summary.json"),
};
const run = spawnSync(process.execPath, [path.join(ROOT, "eval", "pareto", "report.mjs"), "--full"], { env, encoding: "utf8" });
if (run.status !== 0) { console.log(run.stdout, run.stderr); throw new Error("report.mjs failed"); }

// Compare everything before the spend section (spend comes from the local ledger, which a clone does not have).
const norm = (text) => text.replace(/\r\n/g, "\n").replace(/\]\(pareto\.svg\)/g, "](CHART)");
const head = (text) => norm(text).split("\n## Spend")[0];
const got = head(fs.readFileSync(env.PARETO_REPORT_MD, "utf8"));
const doc = head(fs.readFileSync(path.join(ROOT, "docs", "results.md"), "utf8"));
const gotLines = got.split("\n");
const docLines = doc.split("\n");
let diff = 0;
for (let i = 0; i < Math.max(gotLines.length, docLines.length); i += 1) {
  if (gotLines[i] !== docLines[i]) {
    diff += 1;
    if (diff <= 5) console.log(`line ${i + 1}\n  recomputed: ${gotLines[i]}\n  docs:       ${docLines[i]}`);
  }
}
if (diff) { console.log(`FAIL: docs/results.md differs in ${diff} lines`); problems += 1; }
const svgSame = norm(fs.readFileSync(env.PARETO_REPORT_SVG, "utf8")) === norm(fs.readFileSync(path.join(ROOT, "docs", "pareto.svg"), "utf8"));
if (!svgSame) { console.log("FAIL: docs/pareto.svg differs"); problems += 1; }

const table = got.split("## Quality against cost")[1].split("![")[0].trim();
console.log(table);
console.log(`\ncases ${manifest.n_cases}, scored ${manifest.n_scored}, models ${manifest.panel.length}`);
console.log(problems ? `verify: FAILED (${problems})` : `verify: OK - ${docLines.length} lines of docs/results.md and docs/pareto.svg match the raw data`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(problems ? 1 : 0);