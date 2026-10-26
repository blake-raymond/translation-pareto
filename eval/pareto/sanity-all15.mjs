// Free sanity checks on a combined judge pass. Usage:
// node eval/pareto/sanity-all15.mjs <judgements.json> <translations.json> [old judgements.json]
import fs from "node:fs";
const [jf, tf, oldf = "eval/pareto/results/judgements.json"] = process.argv.slice(2);
const J = JSON.parse(fs.readFileSync(jf, "utf8"));
const T = JSON.parse(fs.readFileSync(tf, "utf8"));
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
const G = "google/gemini-3.1-flash-lite", D = "deepseek/deepseek-v4.1-flash-1017";
const mean = (S, s) => { const v = ids.filter((i) => S[i]?.[s]).map((i) => S[i][s].score); return v.reduce((p, c) => p + c, 0) / v.length; };
let old = null; try { old = JSON.parse(fs.readFileSync(oldf, "utf8")).scores; } catch {}
console.log(`cases=${ids.length} empty_or_error_candidates=${empty} identical_pairs=${pairs} violations=${viol.length} (${(100 * viol.length / Math.max(1, pairs)).toFixed(2)}%)`);
console.log(`all-1 cells by model: ${JSON.stringify(ones)}`);
console.log(`gemini-deepseek gap (case mean, these cases): new ${(mean(J.scores, G) - mean(J.scores, D)).toFixed(3)}` + (old ? ` old-main ${(mean(old, G) - mean(old, D)).toFixed(3)}` : ""));
if (J.batches) console.log(`batches=${J.batches.length} errors=${J.batches.filter((b) => b.error).map((b) => b.error).join(",") || "none"} parse_failures=${J.parse_failures}`);
for (const v of viol.slice(0, 30)) console.log("VIOLATION " + v);
