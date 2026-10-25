import fs from "node:fs";
import { parseJsonObject } from "./api.mjs";
const tag = process.argv[2] || "claude-opus-5.5";
const raw = JSON.parse(fs.readFileSync(`eval/results/mega-${tag}-raw.json`, "utf8"));
const r = JSON.parse(fs.readFileSync("eval/results/latest.json", "utf8"));
const parsed = parseJsonObject(raw.payload.choices[0].message.content) || {};
const mega = {}; // slug -> [{id,score,crit}]
for (const [id, arr] of Object.entries(parsed)) {
  const ord = raw.order[id]; if (!ord || !Array.isArray(arr)) continue;
  arr.forEach((s, i) => { const [m, n, h, c] = String(s).split(",").map(Number); if (!ord[i] || [m, n, h].some(Number.isNaN)) return; (mega[ord[i]] ||= []).push({ id, score: (m + n + h) / 3, crit: c === 1 }); });
}
const old = {};
for (const j of r.judgements.filter((j) => j.arm === "direct")) for (const [s, v] of Object.entries(j.scores || {})) (old[s] ||= []).push({ id: j.case_id, score: (v.meaning + v.naturalness + v.handling) / 3, crit: v.critical_error });
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const rows = Object.keys(mega).map((s) => ({ s, mega: mean(mega[s].map((x) => x.score)), mc: mega[s].filter((x) => x.crit).length / mega[s].length, old: mean(old[s].map((x) => x.score)), oc: old[s].filter((x) => x.crit).length / old[s].length, n: mega[s].length }));
const rank = (key) => Object.fromEntries([...rows].sort((a, b) => b[key] - a[key]).map((x, i) => [x.s, i + 1]));
const rm = rank("mega"), ro = rank("old");
const d = rows.map((x) => (rm[x.s] - ro[x.s]) ** 2).reduce((a, b) => a + b, 0), n = rows.length;
console.log("cases parsed", Object.keys(parsed).length, "models", n, "Spearman vs two-judge", (1 - (6 * d) / (n * (n * n - 1))).toFixed(3));
console.log("usage", JSON.stringify(raw.payload.usage));
for (const x of rows.sort((a, b) => b.mega - a.mega)) console.log(x.s.padEnd(36), "opus", x.mega.toFixed(2), "crit", (x.mc * 100).toFixed(1) + "%", "rank", rm[x.s], "| two-judge", x.old.toFixed(2), "crit", (x.oc * 100).toFixed(1) + "%", "rank", ro[x.s], "n", x.n);
