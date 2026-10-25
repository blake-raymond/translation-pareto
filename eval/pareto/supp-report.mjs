// Supplementary report: 4 new models judged with 2 anchors on a stratified subsample.
// Usage: node eval/pareto/supp-report.mjs  (reads only; writes docs/results-supplement.md, docs/pareto-combined.svg, results/supp-summary.json)
import fs from "node:fs";
import path from "node:path";
process.env.PARETO_SUB_BENCH ||= "10";
process.env.PARETO_SUB_CHAT ||= "5";
const { mulberry32, seedMix, mean } = await import("./lib.mjs");
const { loadCases } = await import("./run-translate.mjs");
const { RESULTS_DIR } = await import("./meta.mjs");
const { languageName } = await import("./languages.mjs");
const root = path.resolve(RESULTS_DIR, "..", "..", "..");
const J = (f) => JSON.parse(fs.readFileSync(f, "utf8"));
const cat = J(path.join(RESULTS_DIR, "..", "models.json"));
const NEW = cat.supplement_models.map((m) => m.slug);
const ANCH = ["google/gemini-3.1-flash-lite", "deepseek/deepseek-v4.1-flash-1017"];
const MAIN = cat.models.map((m) => m.slug);
const nameOf = (s) => [...cat.models, ...cat.supplement_models].find((m) => m.slug === s)?.name || s;
const short = (s) => s.split("/").pop();
const sub = loadCases({});
const subIds = new Set(sub.map((c) => c.id));
const allCases = (() => { const save = [process.env.PARETO_SUB_BENCH, process.env.PARETO_SUB_CHAT]; return null; })();
const supp = J(path.join(RESULTS_DIR, "judgements-supp.json"));
const main = J(path.join(RESULTS_DIR, "judgements.json"));
const tMain = J(path.join(RESULTS_DIR, "translations.json"));
const tSupp = J(path.join(RESULTS_DIR, "translations-supp.json"));
let tGM = { runs: [] }; try { tGM = J(path.join(RESULTS_DIR, "translations-supp-glm-minimax.json")); } catch {}
const langOf = (it) => it.kind === "chat" ? (it.lang || (it.source === "en" ? it.target : it.source)) : it.target;
const caseById = new Map(sub.map((c) => [c.id, c]));
const mainCases = J(path.join(root, "data", "benchmark-cases.json")).concat(J(path.join(root, "data", "chat-cases.json")).map((c) => ({ ...c, kind: c.kind || "chat" })));
const mainById = new Map(mainCases.map((c) => [c.id, c]));

function pct(a, p) { const i = (a.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return a[lo] * (hi - i) + a[hi] * (i - lo) || a[lo]; }
// groups: lang -> array of values (per case); hierarchical bootstrap: langs then cases
function groupsFor(scores, ids, fn, byId) {
  const g = new Map();
  for (const id of ids) { const it = byId.get(id); if (!it) continue; const v = fn(scores[id], it); if (v == null) continue; const l = langOf(it); if (!g.has(l)) g.set(l, []); g.get(l).push(v); }
  return [...g.values()];
}
function boot(groups, seed) {
  const rng = mulberry32(seed); const out = [];
  for (let i = 0; i < 2000; i++) { const lm = []; for (let j = 0; j < groups.length; j++) { const g = groups[Math.floor(rng() * groups.length)]; let s = 0; for (let k = 0; k < g.length; k++) s += g[Math.floor(rng() * g.length)]; lm.push(s / g.length); } out.push(mean(lm)); }
  out.sort((a, b) => a - b);
  return { mean: mean(groups.map((g) => mean(g))), low: pct(out, 0.025), high: pct(out, 0.975) };
}
const scoreOf = (slug) => (cell) => cell?.[slug] ? cell[slug].score : null;
const critOf = (slug) => (cell) => cell?.[slug] ? (cell[slug].critical_error ? 1 : 0) : null;
const diffOf = (a, b) => (cell) => cell?.[a] && cell?.[b] ? cell[a].score - cell[b].score : null;
const ids = [...subIds].filter((id) => supp.scores[id]);
function costPer1k(slug) {
  const runs = [...tMain.runs, ...tSupp.runs, ...tGM.runs].filter((r) => r.slug === slug && r.output && !r.error && !r.cached || (r.slug === slug && r.output && !r.error));
  const seen = new Map(); for (const r of runs) seen.set(r.case_id, r);
  const arr = [...seen.values()]; const c = arr.reduce((s, r) => s + (r.cost_usd || 0), 0);
  return { per1k: arr.length ? c / arr.length * 1000 : null, n: arr.length };
}
const rows = [];
for (const s of [...NEW, ...ANCH]) {
  const sc = boot(groupsFor(supp.scores, ids, scoreOf(s), caseById), seedMix("supp", s));
  const cr = boot(groupsFor(supp.scores, ids, critOf(s), caseById), seedMix("suppc", s));
  const vs = ANCH.map((a) => s === a ? null : boot(groupsFor(supp.scores, ids, diffOf(s, a), caseById), seedMix("suppd", s, a)));
  const lang = {};
  for (const id of ids) { const it = caseById.get(id); const c = supp.scores[id][s]; if (!c) continue; const l = langOf(it); (lang[l] ||= { s: [], c: [] }); lang[l].s.push(c.score); lang[l].c.push(c.critical_error ? 1 : 0); }
  const flags = Object.entries(lang).map(([l, v]) => ({ l, m: mean(v.s), c: mean(v.c), n: v.s.length })).filter((x) => x.m < 3.5 || x.c > 0.25).sort((a, b) => a.m - b.m);
  rows.push({ slug: s, isNew: NEW.includes(s), n: ids.filter((id) => supp.scores[id][s]).length, ...sc, crit: cr.mean, critLow: cr.low, critHigh: cr.high, vsGem: vs[0], vsDs: vs[1], cost: costPer1k(s), flags });
}
// anchors under main judge: full run and same subsample
const mainIdsAll = Object.keys(main.scores);
const anchorMain = ANCH.map((a) => ({ slug: a,
  full: boot(groupsFor(main.scores, mainIdsAll, scoreOf(a), mainById), seedMix("mainf", a)),
  sub: boot(groupsFor(main.scores, ids, scoreOf(a), mainById), seedMix("mains", a)),
  gap: boot(groupsFor(main.scores, ids, diffOf(ANCH[0], ANCH[1]), mainById), seedMix("maing")) }));
const suppGap = boot(groupsFor(supp.scores, ids, diffOf(ANCH[0], ANCH[1]), caseById), seedMix("suppg"));
// main 11 models, full run
const mainRows = MAIN.map((s) => ({ slug: s, ...boot(groupsFor(main.scores, mainIdsAll, scoreOf(s), mainById), seedMix("mainf", s)), cost: costPer1k(s) }));
const gemMain = mainRows.find((r) => r.slug === ANCH[0]);
// calibrated score on main scale: gemini full-run mean + (new - gemini) on subsample
const hw = (x) => (x.high - x.low) / 2;
const combined = [
  ...mainRows.map((r) => ({ slug: r.slug, isNew: false, mean: r.mean, hw: hw(r), cost: r.cost.per1k })),
  ...rows.filter((r) => r.isNew).map((r) => ({ slug: r.slug, isNew: true, mean: gemMain.mean + r.vsGem.mean, hw: Math.hypot(hw(r.vsGem), hw(gemMain)), cost: r.cost.per1k, raw: r })),
];
// pairwise "clearly better" test
function clearlyBetter(a, b) {
  // returns true if a beats b with CI lower bound > 0
  if (a.isNew && b.isNew) { const ra = rows.find((r) => r.slug === a.slug), rb = rows.find((r) => r.slug === b.slug); const d = boot(groupsFor(supp.scores, ids, diffOf(a.slug, b.slug), caseById), seedMix("nn", a.slug, b.slug)); return d.low > 0; }
  if (!a.isNew && !b.isNew) { const d = boot(groupsFor(main.scores, mainIdsAll, diffOf(a.slug, b.slug), mainById), seedMix("mm", a.slug, b.slug)); return d.low > 0; }
  if (ANCH.includes(a.slug) && b.isNew) { const r = rows.find((x) => x.slug === b.slug); const d = a.slug === ANCH[0] ? r.vsGem : r.vsDs; return d.high < 0; }
  if (ANCH.includes(b.slug) && a.isNew) { const r = rows.find((x) => x.slug === a.slug); const d = b.slug === ANCH[0] ? r.vsGem : r.vsDs; return d.low > 0; }
  const diff = a.mean - b.mean; return diff - Math.hypot(a.hw, b.hw) > 0;
}
for (const m of combined) {
  m.dominatedBy = combined.filter((o) => o !== m && o.cost != null && m.cost != null && o.cost <= m.cost && clearlyBetter(o, m)).map((o) => o.slug);
  m.frontier = m.dominatedBy.length === 0;
}
fs.writeFileSync(path.join(RESULTS_DIR, "supp-summary.json"), JSON.stringify({ subsample: { cases: ids.length, bench: ids.filter((i) => caseById.get(i).kind === "benchmark").length, chat: ids.filter((i) => caseById.get(i).kind === "chat").length }, rows: rows.map(({ flags, ...r }) => ({ ...r, flags })), anchorMain, suppGap, combined }, null, 2));
// markdown
const f2 = (x) => x == null ? "-" : x.toFixed(2), f3 = (x) => x == null ? "-" : "$" + x.toFixed(3), pc = (x) => (x * 100).toFixed(1) + "%";
const ci = (x) => `${f2(x.mean)} (${f2(x.low)}–${f2(x.high)})`;
const dci = (x) => x ? `${x.mean >= 0 ? "+" : ""}${f2(x.mean)} (${f2(x.low)} to ${f2(x.high)})` : "—";
const nb = ids.filter((i) => caseById.get(i).kind === "benchmark").length, nc = ids.length - nb;
const L = [];
L.push("# Supplement: four newer models", "");
L.push(`Judged on a stratified subsample: the first ${process.env.PARETO_SUB_BENCH} benchmark and first ${process.env.PARETO_SUB_CHAT} chat cases per language (fixed file order), ${ids.length} cases (${nb} benchmark, ${nc} chat) across ${new Set(ids.map((i) => langOf(caseById.get(i)))).size} languages. Same judge (${supp.judge}), same rubric and batch format as the main run, but a 6-candidate panel: the 4 new models plus two anchors from the main run (${ANCH.map(short).join(", ")}). Parse failures: ${supp.parse_failures}.`, "");
L.push("Scores are 1–5 (mean of meaning, naturalness, handling), macro-averaged over languages; 95% CIs are hierarchical bootstrap (languages, then cases). Paired differences are per case on the same subsample. Cost is measured OpenRouter `usage.cost` per successful translation.", "");
L.push("| Model | Mean (95% CI) | Critical | vs gemini-3.1-flash-lite | vs deepseek-v4.1-flash | USD / 1k msgs (n) |", "|---|---|---|---|---|---|");
for (const r of [...rows].sort((a, b) => b.mean - a.mean)) L.push(`| ${r.isNew ? "**" + nameOf(r.slug) + "** (new)" : nameOf(r.slug) + " (anchor)"} | ${ci(r)} | ${pc(r.crit)} | ${dci(r.vsGem)} | ${dci(r.vsDs)} | ${f3(r.cost.per1k)} (${r.cost.n}) |`);
L.push("", "## Is the subsample representative?", "", "| Anchor | Main run, all 4,245 cases | Main run, same subsample | Supplement judge pass |", "|---|---|---|---|");
for (const a of anchorMain) { const r = rows.find((x) => x.slug === a.slug); L.push(`| ${short(a.slug)} | ${ci(a.full)} | ${ci(a.sub)} | ${ci(r)} |`); }
L.push("", `Anchor gap (gemini − deepseek): main judge on subsample ${dci(anchorMain[0].gap)}, supplement pass ${dci(suppGap)}.`, "");
L.push("## Combined Pareto frontier", "", "New models are placed on the main-run scale as gemini-3.1-flash-lite's full-run mean plus their paired gap to it on the subsample. A model is dominated only if another model that is no more expensive is clearly better (paired CI excludes 0; for new vs non-anchor main models, a conservative combined interval).", "");
L.push("| Model | Score (main scale) | USD / 1k | Frontier? | Dominated by |", "|---|---|---|---|---|");
for (const m of [...combined].sort((a, b) => a.cost - b.cost)) L.push(`| ${m.isNew ? "**" + short(m.slug) + "** (new)" : short(m.slug)} | ${f2(m.mean)} ±${f2(m.hw)} | ${f3(m.cost)} | ${m.frontier ? "yes" : "no"} | ${m.dominatedBy.map(short).join(", ") || "—"} |`);
L.push("", "## Per-language flags for the new models (mean < 3.5 or critical > 25%)", "", `Each language has ${+process.env.PARETO_SUB_BENCH + +process.env.PARETO_SUB_CHAT} cases on the subsample, so these cells are noisy.`, "");
for (const r of rows.filter((x) => x.isNew)) L.push(`- **${short(r.slug)}**: ${r.flags.length ? r.flags.map((x) => `${languageName(x.l)} ${f2(x.m)}/${pc(x.c)}`).join(", ") : "none"}`);
L.push("", "## Settings", "");
for (const m of cat.supplement_models) L.push(`- \`${m.slug}\`: reasoning ${JSON.stringify(m.reasoning)}, temperature ${m.temperature ?? "omitted"}, max_tokens ${m.max_tokens}. ${m.note || ""}`);
L.push("", "Rate limits: gpt-6-luna and muse-spark-1.3 are capped at 20 requests/min for new OpenRouter accounts, so they were translated on the subsample only (throttled to 18 rpm). glm-5.3-flash and minimax-m3.1-flash were translated on all 4,245 cases; their cost/1k uses all of them.");
fs.writeFileSync(path.join(root, "docs", "results-supplement.md"), L.join("\n") + "\n");
// SVG
const W = 860, H = 560, ml = 70, mr = 200, mt = 40, mb = 60;
const pts = combined.filter((m) => m.cost);
const xs = pts.map((p) => Math.log10(p.cost)), ys = pts.map((p) => p.mean);
const x0 = Math.floor(Math.min(...xs) * 4) / 4 - 0.1, x1 = Math.ceil(Math.max(...xs) * 4) / 4 + 0.1;
const y0 = Math.floor(Math.min(...ys) * 2) / 2 - 0.1, y1 = 5;
const X = (c) => ml + (Math.log10(c) - x0) / (x1 - x0) * (W - ml - mr), Y = (v) => mt + (y1 - v) / (y1 - y0) * (H - mt - mb);
const S = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="sans-serif" font-size="12"><rect width="100%" height="100%" fill="white"/>`];
S.push(`<text x="${ml}" y="22" font-size="15" font-weight="bold">Translation quality vs cost (combined: 11 main-run + 4 supplementary models)</text>`);
for (let v = Math.ceil(y0 * 2) / 2; v <= y1; v += 0.5) S.push(`<line x1="${ml}" x2="${W - mr}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/><text x="${ml - 8}" y="${Y(v) + 4}" text-anchor="end">${v.toFixed(1)}</text>`);
for (const c of [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2]) { if (Math.log10(c) < x0 || Math.log10(c) > x1) continue; S.push(`<line x1="${X(c)}" x2="${X(c)}" y1="${mt}" y2="${H - mb}" stroke="#eee"/><text x="${X(c)}" y="${H - mb + 16}" text-anchor="middle">$${c}</text>`); }
S.push(`<text x="${(ml + W - mr) / 2}" y="${H - 18}" text-anchor="middle">USD per 1,000 messages (log scale, measured)</text><text transform="translate(18,${(mt + H - mb) / 2}) rotate(-90)" text-anchor="middle">Judge score (1–5)</text>`);
const fr = pts.filter((p) => p.frontier).sort((a, b) => a.cost - b.cost);
S.push(`<polyline fill="none" stroke="#2a7" stroke-width="2" stroke-dasharray="5,4" points="${fr.map((p) => `${X(p.cost)},${Y(p.mean)}`).join(" ")}"/>`);
for (const p of pts) {
  const cx = X(p.cost), cy = Y(p.mean), col = p.isNew ? "#d33" : "#36c";
  S.push(`<line x1="${cx}" x2="${cx}" y1="${Y(Math.min(5, p.mean + p.hw))}" y2="${Y(p.mean - p.hw)}" stroke="${col}" opacity="0.5"/>`);
  S.push(p.isNew ? `<rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" fill="${col}" ${p.frontier ? 'stroke="#000" stroke-width="1.5"' : ""}/>` : `<circle cx="${cx}" cy="${cy}" r="5" fill="${col}" ${p.frontier ? 'stroke="#000" stroke-width="1.5"' : ""}/>`);
  S.push(`<text x="${cx + 8}" y="${cy + 4}" fill="${col}">${short(p.slug)}${p.isNew ? " *" : ""}</text>`);
}
const lx = W - mr + 15;
S.push(`<circle cx="${lx}" cy="${mt + 10}" r="5" fill="#36c"/><text x="${lx + 10}" y="${mt + 14}">main run (4,245 cases)</text>`);
S.push(`<rect x="${lx - 5}" y="${mt + 25}" width="10" height="10" fill="#d33"/><text x="${lx + 10}" y="${mt + 34}">new * (supplement,</text><text x="${lx + 10}" y="${mt + 48}">${ids.length}-case subsample,</text><text x="${lx + 10}" y="${mt + 62}">anchored to gemini-3.1-</text><text x="${lx + 10}" y="${mt + 76}">flash-lite)</text>`);
S.push(`<line x1="${lx - 6}" x2="${lx + 6}" y1="${mt + 95}" y2="${mt + 95}" stroke="#2a7" stroke-width="2" stroke-dasharray="5,4"/><text x="${lx + 10}" y="${mt + 99}">Pareto frontier</text><text x="${lx}" y="${mt + 118}">bars: ~95% CI</text>`);
S.push("</svg>");
fs.writeFileSync(path.join(root, "docs", "pareto-combined.svg"), S.join("\n"));
console.log(L.join("\n"));
