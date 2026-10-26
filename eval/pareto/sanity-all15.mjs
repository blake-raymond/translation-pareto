// Offline sanity checks on the 15-model judge run. Usage:
// node eval/pareto/sanity-all15.mjs [judgements.json[.gz]] [translations.json[.gz]]
// Defaults to the committed raw results in data/results/.
import fs from "node:fs";
import zlib from "node:zlib";
const [jf = "data/results/judgements.json.gz", tf = "data/results/translations.json.gz"] = process.argv.slice(2);
const load = (file) => JSON.parse(file.endsWith(".gz") ? zlib.gunzipSync(fs.readFileSync(file)).toString("utf8") : fs.readFileSync(file, "utf8"));
const J = load(jf);
const T = load(tf);
const out = {};
for (const r of T.runs) out[r.case_id + "|" + r.slug] = { o: (r.output || "").trim(), e: r.error };
const ids = Object.keys(J.scores);
let empty = 0, ones = {}, pairs = 0, viol = [];
for (const id of ids) {
  const sc = J.scores[id];
  const slugs = Object.keys(sc);
  for (const s of slugs) {
    const t = out[id + "|" + s];
    if (!t || !t.o || t.e) empty++;
    if (sc[s].score === 1) ones[s] = (ones[s] || 0) + 1;
  }
  for (let a = 0; a < slugs.length; a++) for (let b = a + 1; b < slugs.length; b++) {
    const A = out[id + "|" + slugs[a]], B = out[id + "|" + slugs[b]];
    if (!A || !B || A.o !== B.o) continue;
    pairs++;
    const x = sc[slugs[a]], y = sc[slugs[b]];
    if (x.critical_error !== y.critical_error || Math.abs(x.score - y.score) >= 2) viol.push(`${id} ${slugs[a]}=${x.score.toFixed(2)}/${+x.critical_error} ${slugs[b]}=${y.score.toFixed(2)}/${+y.critical_error}`);
  }
}
console.log(`cases=${ids.length} empty_or_error_candidates=${empty} identical_pairs=${pairs} violations=${viol.length} (${(100 * viol.length / Math.max(1, pairs)).toFixed(2)}%)`);
console.log(`all-1 cells by model: ${JSON.stringify(ones)}`);
if (J.batches) console.log(`batches=${J.batches.length} errors=${J.batches.filter((b) => b.error).map((b) => b.error).join(",") || "none"} parse_failures=${J.parse_failures}`);
for (const v of viol.slice(0, 30)) console.log("VIOLATION " + v);
