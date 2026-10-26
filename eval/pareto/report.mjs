// Per-model means, critical rates, cost/1k, hierarchical bootstrap CIs, Pareto chart.
import fs from "node:fs";
import path from "node:path";
import { rootDir, writeJson } from "../api.mjs";
import { languageName, TARGET_CODES } from "./languages.mjs";
import { invokedDirectly, loadParetoLedger, mean, mulberry32, parseArgs, seedMix } from "./lib.mjs";
import {
  BENCH_PER_LANG,
  CAP_USD,
  CHAT_PER_LANG,
  JUDGEMENTS_FILE,
  panelModels,
  SUMMARY_FILE,
  ALL15,
  REPORT_MD,
  REPORT_SVG,
  RESULTS_DIR,
  SOFT_CAP_USD,
  TRANSLATIONS_FILE,
} from "./meta.mjs";
import { loadCases } from "./run-translate.mjs";

function catalog() {
  return JSON.parse(fs.readFileSync(new URL("./models.json", import.meta.url), "utf8"));
}

function loadJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function langOf(item) {
  if (item.kind === "chat") return item.lang || (item.source === "en" ? item.target : item.source);
  return item.target;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] * (high - index) + sorted[high] * (index - low);
}

function hierarchicalGroups(cases, scores, slug, kind) {
  const groups = new Map();
  for (const item of cases) {
    const cell = scores[item.id]?.[slug];
    if (!cell) continue;
    if (kind && item.kind !== kind) continue;
    const lang = langOf(item);
    if (!groups.has(lang)) groups.set(lang, []);
    groups.get(lang).push(cell);
  }
  return [...groups.entries()].map(([lang, cells]) => ({ lang, cells }));
}

function bootstrapStat(groups, rng, fn) {
  if (!groups.length) return [];
  const means = [];
  const iters = 2000;
  for (let i = 0; i < iters; i += 1) {
    const langDraws = [];
    for (let j = 0; j < groups.length; j += 1) {
      const group = groups[Math.floor(rng() * groups.length)];
      const cells = [];
      for (let k = 0; k < group.cells.length; k += 1) {
        cells.push(group.cells[Math.floor(rng() * group.cells.length)]);
      }
      langDraws.push(cells);
    }
    means.push(fn(langDraws));
  }
  means.sort((a, b) => a - b);
  return means;
}

function ciFrom(samples) {
  if (!samples.length) return { low: null, high: null };
  return {
    low: percentile(samples, 0.025),
    high: percentile(samples, 0.975),
  };
}

function overallMean(langDraws) {
  const langMeans = langDraws.map((cells) => mean(cells.map((cell) => cell.score)));
  return mean(langMeans);
}

function overallCrit(langDraws) {
  const langMeans = langDraws.map((cells) => mean(cells.map((cell) => (cell.critical_error ? 1 : 0))));
  return mean(langMeans);
}

function pairedDiff(groupsA, groupsB, rng) {
  const byLang = new Map(groupsB.map((group) => [group.lang, group]));
  const paired = [];
  for (const a of groupsA) {
    const b = byLang.get(a.lang);
    if (!b) continue;
    paired.push({ lang: a.lang, a: a.cells, b: b.cells });
  }
  const samples = [];
  const iters = 2000;
  for (let i = 0; i < iters; i += 1) {
    const diffs = [];
    for (let j = 0; j < paired.length; j += 1) {
      const group = paired[Math.floor(rng() * paired.length)];
      const drawA = [];
      const drawB = [];
      for (let k = 0; k < group.a.length; k += 1) drawA.push(group.a[Math.floor(rng() * group.a.length)]);
      for (let k = 0; k < group.b.length; k += 1) drawB.push(group.b[Math.floor(rng() * group.b.length)]);
      diffs.push(mean(drawA.map((cell) => cell.score)) - mean(drawB.map((cell) => cell.score)));
    }
    samples.push(mean(diffs));
  }
  samples.sort((a, b) => a - b);
  return { mean: mean(samples), ...ciFrom(samples) };
}

function fmt(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

function usd(value) {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${Number(value).toFixed(3)}`;
}

function shortName(slug) {
  return slug.split("/").pop();
}

const CHEAP_USD_PER_1K = 0.1;

function buildRows(models, cases, scores, translations, kind) {
  const rows = [];
  for (const model of models) {
    const groups = hierarchicalGroups(cases, scores, model.slug, kind);
    const cells = groups.flatMap((group) => group.cells);
    const caseIds = new Set(cases.filter((item) => !kind || item.kind === kind).map((item) => item.id));
    const runs = (translations.runs || []).filter((run) => run.slug === model.slug && caseIds.has(run.case_id) && run.output && !run.error);
    const cost = runs.reduce((sum, run) => sum + (run.cost_usd || 0), 0);
    const costPer1k = runs.length ? (cost / runs.length) * 1000 : null;
    const meanSeed = kind ? seedMix("ci", kind, model.slug) : seedMix("ci", model.slug);
    const critSeed = kind ? seedMix("crit", kind, model.slug) : seedMix("crit", model.slug);
    const meanSamples = bootstrapStat(groups, mulberry32(meanSeed), overallMean);
    const critSamples = bootstrapStat(groups, mulberry32(critSeed), overallCrit);
    const langMeans = {};
    const langCrit = {};
    for (const group of groups) {
      langMeans[group.lang] = mean(group.cells.map((cell) => cell.score));
      langCrit[group.lang] = mean(group.cells.map((cell) => (cell.critical_error ? 1 : 0)));
    }
    rows.push({
      slug: model.slug,
      name: model.name,
      n: cells.length,
      mean: mean(groups.map((group) => mean(group.cells.map((cell) => cell.score)))),
      meaning: mean(cells.map((cell) => cell.meaning)),
      naturalness: mean(cells.map((cell) => cell.naturalness)),
      handling: mean(cells.map((cell) => cell.handling)),
      crit: mean(cells.map((cell) => (cell.critical_error ? 1 : 0))),
      ci: ciFrom(meanSamples),
      critCi: ciFrom(critSamples),
      costPer1k,
      translateCost: cost,
      nCost: runs.length,
      langMeans,
      langCrit,
      groups,
    });
  }
  rows.sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
  return rows;
}

function pairAgainstBest(rows) {
  const best = rows[0];
  const paired = [];
  if (!best) return paired;
  for (const row of rows.slice(1)) {
    const diff = pairedDiff(best.groups, row.groups, mulberry32(seedMix("pair", best.slug, row.slug)));
    paired.push({ slug: row.slug, vs: best.slug, ...diff });
    row.vsBest = diff;
  }
  return paired;
}

// Standard Pareto frontier on point estimates (unrounded mean score and unrounded USD / 1k).
// A model is dominated if another model has mean >= its mean and cost <= its cost, with at
// least one of the two strictly better. Two models with exactly equal mean and cost do not
// dominate each other. Equal rounded costs are compared on the unrounded values.
export function dominates(other, row) {
  return other.mean >= row.mean && other.costPer1k <= row.costPer1k && (other.mean > row.mean || other.costPer1k < row.costPer1k);
}

export function paretoFrontier(rows) {
  const valid = rows.filter((row) => row.mean != null && row.costPer1k != null);
  return valid.filter((row) => !valid.some((other) => other.slug !== row.slug && dominates(other, row)))
    .sort((a, b) => a.costPer1k - b.costPer1k);
}

function frontierOf(rows) {
  return paretoFrontier(rows);
}

// Dominated models whose dominators are all within noise: for every model that dominates it,
// the paired bootstrap CI of the score difference includes zero. Reported as near-ties only.
function nearTiesOf(rows, frontier) {
  const valid = rows.filter((row) => row.mean != null && row.costPer1k != null);
  const out = [];
  for (const row of valid) {
    if (frontier.includes(row)) continue;
    const doms = valid.filter((other) => other.slug !== row.slug && dominates(other, row));
    const diffs = doms.map((other) => ({ other, ...pairedDiff(other.groups, row.groups, mulberry32(seedMix("pair", other.slug, row.slug))) }));
    if (diffs.length && diffs.every((d) => d.low <= 0)) out.push({ row, diffs });
  }
  return out;
}

function languageFlags(rows) {
  const cheap = rows.filter((row) => row.costPer1k != null && row.costPer1k <= CHEAP_USD_PER_1K);
  const flags = [];
  for (const row of cheap) {
    for (const group of row.groups) {
      const langMean = row.langMeans[group.lang];
      const crit = row.langCrit[group.lang];
      const reasons = [];
      if (langMean != null && langMean < 3.5) reasons.push("mean<3.5");
      if (crit != null && crit > 0.25) reasons.push("critical>25%");
      if (!reasons.length) continue;
      flags.push({
        lang: group.lang,
        slug: row.slug,
        mean: langMean,
        crit,
        n: group.cells.length,
        reasons,
      });
    }
  }
  flags.sort((a, b) => a.lang.localeCompare(b.lang) || a.mean - b.mean);
  return { flags, cheap: cheap.map((row) => row.slug), cutoff: CHEAP_USD_PER_1K };
}

function svgChart(rows, frontier, info = {}) {
  const width = 1000;
  const height = 620;
  const pad = { l: 70, r: 40, t: 64, b: 64 };
  const font = 'font-family="Segoe UI, Helvetica, Arial, sans-serif"';
  const costs = rows.map((row) => row.costPer1k).filter((value) => value > 0);
  const minC = Math.min(...costs) / 1.25;
  const maxC = Math.max(...costs) * 1.6;
  const means = rows.map((row) => row.mean);
  const minS = Math.floor((Math.min(...means) - 0.15) * 4) / 4;
  const maxS = Math.min(5, Math.ceil((Math.max(...means) + 0.1) * 4) / 4);
  const xOf = (cost) => pad.l + ((Math.log(cost) - Math.log(minC)) / (Math.log(maxC) - Math.log(minC))) * (width - pad.l - pad.r);
  const yOf = (score) => pad.t + (1 - (score - minS) / (maxS - minS)) * (height - pad.t - pad.b);
  const ticks = [];
  for (let p = Math.floor(Math.log10(minC)); p <= Math.ceil(Math.log10(maxC)); p += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** p;
      if (v >= minC && v <= maxC) ticks.push(v);
    }
  }
  const onFront = (row) => frontier.some((item) => item.slug === row.slug);
  const front = [...frontier].sort((a, b) => a.costPer1k - b.costPer1k || a.mean - b.mean);
  const line = front.map((row, i) => (i ? "L" : "M") + xOf(row.costPer1k).toFixed(1) + "," + yOf(row.mean).toFixed(1)).join(" ");
  // Labels: place right of the point, then nudge vertically to avoid overlaps (greedy, 13px rows).
  const pts = rows.map((row) => ({ row, x: xOf(row.costPer1k), y: yOf(row.mean), label: shortName(row.slug) + " " + fmt(row.mean) }));
  const placed = [];
  const charW = 6.1;
  const sorted = [...pts].sort((a, b) => a.y - b.y);
  for (const p of sorted) {
    const w = p.label.length * charW;
    const right = p.x + 9 + w < width - pad.r;
    let lx = right ? p.x + 9 : p.x - 9 - w;
    let ly = p.y + 4;
    const hit = (y) => placed.some((q) => Math.abs(q.y - y) < 13 && lx < q.x + q.w && q.x < lx + w);
    const base = ly;
    const offs = [0];
    for (let k = 1; k < 20; k += 1) offs.push(13 * k, -13 * k);
    for (const o of offs) { ly = base + o; if (!hit(ly)) break; }
    placed.push({ x: lx, y: ly, w });
    p.lx = lx; p.ly = ly; p.anchor = "start";
  }
  const dots = pts.map((p) => {
    const on = onFront(p.row);
    const lead = Math.abs(p.ly - 4 - p.y) > 2 ? '<line x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) + '" x2="' + (p.lx < p.x ? p.lx + p.label.length * charW : p.lx).toFixed(1) + '" y2="' + (p.ly - 4).toFixed(1) + '" stroke="#cbd5e1" stroke-width="1"/>' : "";
    return lead +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + (on ? 6.5 : 4.5) + '" fill="' + (on ? "#0f766e" : "#94a3b8") + '" stroke="#fff" stroke-width="1"/>' +
      '<text x="' + p.lx.toFixed(1) + '" y="' + p.ly.toFixed(1) + '" font-size="11" ' + font + ' fill="' + (on ? "#0f766e" : "#334155") + '"' + (on ? ' font-weight="700"' : "") + ">" + p.label + "</text>";
  }).join("\n");
  const xticks = ticks.map((v) => {
    const x = xOf(v);
    return '<line x1="' + x + '" y1="' + pad.t + '" x2="' + x + '" y2="' + (height - pad.b) + '" stroke="#f1f5f9"/><line x1="' + x + '" y1="' + (height - pad.b) + '" x2="' + x + '" y2="' + (height - pad.b + 6) + '" stroke="#111"/><text x="' + x + '" y="' + (height - pad.b + 20) + '" text-anchor="middle" font-size="11" ' + font + ">$" + (v < 0.1 ? v.toFixed(2) : v < 1 ? v.toFixed(1) : v.toFixed(0)) + "</text>";
  }).join("");
  const ys = [];
  for (let v = minS; v <= maxS + 1e-9; v += 0.25) ys.push(Number(v.toFixed(2)));
  const yticks = ys.map((v) => {
    const y = yOf(v);
    return '<line x1="' + (pad.l - 6) + '" y1="' + y + '" x2="' + pad.l + '" y2="' + y + '" stroke="#111"/><text x="' + (pad.l - 10) + '" y="' + (y + 4) + '" text-anchor="end" font-size="11" ' + font + ">" + v.toFixed(2) + '</text><line x1="' + pad.l + '" y1="' + y + '" x2="' + (width - pad.r) + '" y2="' + y + '" stroke="#e5e7eb"/>';
  }).join("");
  const sub = info.subtitle || "";
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + " " + height + '">\n' +
    '<rect width="100%" height="100%" fill="#fff"/>\n' +
    '<text x="' + width / 2 + '" y="26" text-anchor="middle" font-size="17" ' + font + ' font-weight="600">' + (info.title || "Translation quality vs cost") + "</text>\n" +
    '<text x="' + width / 2 + '" y="46" text-anchor="middle" font-size="12" ' + font + ' fill="#475569">' + sub + "</text>\n" +
    yticks + xticks +
    '<line x1="' + pad.l + '" y1="' + pad.t + '" x2="' + pad.l + '" y2="' + (height - pad.b) + '" stroke="#111"/>' +
    '<line x1="' + pad.l + '" y1="' + (height - pad.b) + '" x2="' + (width - pad.r) + '" y2="' + (height - pad.b) + '" stroke="#111"/>\n' +
    '<path d="' + line + '" fill="none" stroke="#0f766e" stroke-width="2" stroke-dasharray="6 4"/>\n' + dots + "\n" +
    '<g transform="translate(' + (width - pad.r - 210) + "," + (height - pad.b - 46) + ')"><rect width="200" height="38" fill="#fff" stroke="#e2e8f0"/><circle cx="14" cy="13" r="6" fill="#0f766e"/><text x="26" y="17" font-size="11" ' + font + '>Pareto frontier (dashed line)</text><circle cx="14" cy="28" r="4.5" fill="#94a3b8"/><text x="26" y="32" font-size="11" ' + font + ">Dominated model</text></g>\n" +
    '<text x="' + (pad.l + width - pad.r) / 2 + '" y="' + (height - 16) + '" text-anchor="middle" font-size="12" ' + font + ">Cost: USD per 1,000 messages (log scale, billed OpenRouter usage)</text>\n" +
    '<text x="18" y="' + height / 2 + '" text-anchor="middle" font-size="12" ' + font + ' transform="rotate(-90 18 ' + height / 2 + ')">Mean judge score (1-5)</text>\n</svg>\n';
}

export function analyze(opts = parseArgs()) {
  const cases = loadCases(opts);
  const judgements = loadJson(JUDGEMENTS_FILE);
  const translations = loadJson(TRANSLATIONS_FILE);
  const models = panelModels(catalog());
  const scores = judgements.scores || {};
  const rows = buildRows(models, cases, scores, translations, null);
  const paired = pairAgainstBest(rows);
  const frontier = frontierOf(rows);
  const nearTies = nearTiesOf(rows, frontier);
  const benchmark = buildRows(models, cases, scores, translations, "benchmark");
  const chat = buildRows(models, cases, scores, translations, "chat");
  const flags = languageFlags(rows);
  return { cases, rows, paired, frontier, nearTies, judgements, translations, models, benchmark, chat, flags };
}

function qualityTable(rows) {
  return [
    "| Model | Mean | 95% CI | Critical | USD / 1k | n |",
    "| --- | ---: | --- | ---: | ---: | ---: |",
    ...rows.map((row) => `| \`${row.slug}\` | ${fmt(row.mean)} | ${fmt(row.ci.low)}–${fmt(row.ci.high)} | ${fmt((row.crit || 0) * 100, 1)}% | ${usd(row.costPer1k)} | ${row.n} |`),
  ];
}

function pairTable(paired) {
  return [
    "| Model | Mean − best | 95% CI |",
    "| --- | ---: | --- |",
    ...paired.map((row) => `| \`${row.slug}\` | ${fmt(row.mean, 3)} | ${fmt(row.low, 3)}–${fmt(row.high, 3)} |`),
  ];
}

function markdown(opts, analysis, spend) {
  const { rows, paired, frontier, nearTies, cases, benchmark, chat, flags, judgements } = analysis;
  const langs = [...new Set(cases.map(langOf))];
  const nBench = cases.filter((item) => item.kind === "benchmark").length;
  const nChat = cases.filter((item) => item.kind === "chat").length;
  const scored = Object.keys(judgements?.scores || {}).length;
  const parseFailures = Number(judgements?.parse_failures || 0);
  const banner = opts.pilot
    ? [
      "# Pareto translation eval — PILOT",
      "",
      "This is a **5-language pilot** (vi, km, ja, ko, es), 10 benchmark + 5 chat cases each, one judge (`anthropic/claude-opus-5.5`). It is not the full 72-language run.",
      "",
    ]
    : [
      "# Pareto translation eval",
      "",
      `Full run: 72 non-English languages, up to 40 benchmark and 20 chat cases each (fewer when the source set is shorter), ${analysis.models.length} models${ALL15 ? " judged together in one listwise pass (15 candidates per case, batches of 30)" : ""}, one judge (\`anthropic/claude-opus-5.5\`).`,
      "",
    ];
  const langTable = langs.length > 8
    ? [
      `| Language | ${rows.map((row) => shortName(row.slug)).join(" | ")} |`,
      `| --- | ${rows.map(() => "---:").join(" | ")} |`,
      ...langs.map((lang) => `| ${lang} | ${rows.map((row) => fmt(row.langMeans[lang])).join(" | ")} |`),
    ]
    : [
      `| Model | ${langs.join(" | ")} |`,
      `| --- | ${langs.map(() => "---:").join(" | ")} |`,
      ...rows.map((row) => `| \`${row.slug}\` | ${langs.map((lang) => fmt(row.langMeans[lang])).join(" | ")} |`),
    ];
  const flagRows = flags.flags.length
    ? [
      "| Language | Model | Mean | Critical | n | Reason |",
      "| --- | --- | ---: | ---: | ---: | --- |",
      ...flags.flags.map((row) => `| ${row.lang} | \`${row.slug}\` | ${fmt(row.mean)} | ${fmt(row.crit * 100, 1)}% | ${row.n} | ${row.reasons.join(", ")} |`),
    ]
    : ["No cheap model fell below 3.5 mean or above 25% critical on any language."];
  const flaggedLangs = new Set(flags.flags.map((row) => row.lang));
  return [
    ...banner,
    "## Method",
    "",
    `Cases: ${cases.length} (${nBench} benchmark, ${nChat} chat) across ${langs.length} languages${opts.pilot ? `: ${langs.map(languageName).join(", ")}` : ""}.`,
    `Scored cases: ${scored}. Judge parse failures: ${parseFailures}.`,
    "Benchmark items are English→xx samples from WMT24++ where available (social and speech preferred, then shorter segments), else NTREX-128, else Tatoeba. Languages with fewer than 40 clean segments use every available segment; counts are in `data/coverage.json`.",
    `Chat items are synthetic multi-turn conversations drafted by Claude Opus 5.5, in both directions: ${cases.filter((c) => c.kind === "chat" && c.source === "en").length} translate from English and ${cases.filter((c) => c.kind === "chat" && c.source !== "en").length} into English.`,
    "Each candidate used the interpreter system prompt in `eval/prompts/interpreter.txt` with conversation history on chat items.",
    "One judge, `anthropic/claude-opus-5.5`, scored shuffled anonymous candidates in compact `m,n,h,c` strings. The reference was shown for benchmark items only.",
    "Bootstrap 95% intervals resample languages, then cases within language (2,000 draws, seed 20261025). Language means are equally weighted.",
    "A model is on the Pareto frontier unless another model has a mean score at least as high **and** a cost per 1,000 messages no higher, with at least one of the two strictly better (point estimates, unrounded). Models with exactly equal mean and cost would both stay on.",
    `USD / 1k is billed OpenRouter \`usage.cost\` on successful translation calls, including reasoning tokens, times 1,000. It does not include the judge or the chat drafter.`,
    `A cheap model costs at most $${CHEAP_USD_PER_1K.toFixed(2)} per 1,000 messages. A language is flagged when any cheap model has mean below 3.5 or a critical rate above 25% on that language.`,
    "",
    "## Quality against cost",
    "",
    ...qualityTable(rows),
    "",
    `![Translation quality vs cost](${path.basename(REPORT_SVG)})`,
    "",
    "## Pareto frontier",
    "",
    frontier.length
      ? frontier.map((row) => `- \`${row.slug}\` — mean ${fmt(row.mean)} (${fmt(row.ci.low)}–${fmt(row.ci.high)}), critical ${fmt((row.crit || 0) * 100, 1)}%, ${usd(row.costPer1k)} / 1k`).join("\n")
      : "No frontier (missing scores or costs).",
    "",
    ...(nearTies.length
      ? ["Dominated on point estimates but within noise of every model that dominates it (paired 95% CI of the difference includes zero):", "", ...nearTies.map(({ row, diffs }) => `- \`${row.slug}\` (${fmt(row.mean)}, ${usd(row.costPer1k)} / 1k): ${diffs.map((d) => `\`${d.other.slug}\` +${fmt(d.mean, 3)} (${fmt(d.low, 3)} to ${fmt(d.high, 3)})`).join("; ")}`), ""]
      : []),
    "## Paired differences vs the best model",
    "",
    rows[0] ? `Best mean: \`${rows[0].slug}\`.` : "",
    "",
    ...pairTable(paired),
    "",
    "## Benchmark cases",
    "",
    ...qualityTable(benchmark),
    "",
    benchmark[0] ? `Best benchmark mean: \`${benchmark[0].slug}\`.` : "",
    "",
    ...pairTable(pairAgainstBest(benchmark)),
    "",
    "## Chat cases",
    "",
    ...qualityTable(chat),
    "",
    chat[0] ? `Best chat mean: \`${chat[0].slug}\`.` : "",
    "",
    ...pairTable(pairAgainstBest(chat)),
    "",
    "## Per language",
    "",
    ...langTable,
    "",
    "## Language flags",
    "",
    `${flaggedLangs.size} languages where a cheap model scores badly.`,
    "",
    ...flagRows,
    "",
    "## Spend",
    "",
    spend ? spend : "_Spend summary is filled by `eval/pareto/run.mjs`._",
    "",
    "## Limits",
    "",
    "Scores come from one LLM judge (Claude Opus 5.5), which can favor its own model family. Per-language cells are noisy at this sample size. WMT24++ locales (for example Mexican Spanish, Egyptian Arabic) stand in for each language as a whole.",
    "",
  ].join("\n");
}

function spendFromLedger(opts, cases) {
  const ledger = loadParetoLedger(opts.pilot);
  const kind = (prefix) => (ledger.events || [])
    .filter((event) => String(event.kind || "").startsWith(prefix))
    .reduce((sum, event) => sum + (Number(event.cost_usd) || 0), 0);
  const chatUsd = kind("chat");
  const translateUsd = kind("translate");
  const judgeUsd = kind("judge");
  const nCases = cases.length;
  const nChat = cases.filter((item) => item.kind === "chat").length;
  const nFullLangs = TARGET_CODES.length;
  const nFullCases = nFullLangs * (BENCH_PER_LANG + CHAT_PER_LANG);
  const scaleChat = nChat ? (nFullLangs * CHAT_PER_LANG) / nChat : 0;
  const scaleCases = nCases ? nFullCases / nCases : 0;
  const projected = chatUsd * scaleChat + translateUsd * scaleCases + judgeUsd * scaleCases;
  const perCase = nCases ? ledger.spent / nCases : 0;
  const perTranslate = nCases ? translateUsd / (nCases * panelModels(catalog()).length) : 0;
  const lines = [
    `${opts.pilot ? "Pilot spend" : "Spend"} (OpenRouter \`usage.cost\`, hard cap $${opts.pilot ? Number(ledger.cap).toFixed(2) : CAP_USD.toFixed(2)}, soft stop $${SOFT_CAP_USD.toFixed(2)}): **$${ledger.spent.toFixed(4)}**.`,
    "",
    `| Step | USD |`,
    `| --- | ---: |`,
    `| Chat drafting | $${chatUsd.toFixed(4)} |`,
    `| Translations | $${translateUsd.toFixed(4)} |`,
    `| Judge | $${judgeUsd.toFixed(4)} |`,
    `| Total | $${ledger.spent.toFixed(4)} |`,
    "",
    `Measured cost per case (all models + share of drafting and judging): **$${perCase.toFixed(4)}**.`,
    `Measured translation cost per model×case: **$${perTranslate.toFixed(5)}**.`,
  ];
  if (ALL15) {
    // Cost of the published results, from the committed export (data/results/manifest.json).
    const manifestFile = path.join(rootDir(), "data", "results", "manifest.json");
    const cost = fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, "utf8")).cost_usd : null;
    lines.splice(0, lines.length, ...(cost
      ? [
        "Cost of the published results (OpenRouter `usage.cost`, summed over the calls in `data/results/`):",
        "",
        "| Step | USD |", "| --- | ---: |",
        `| Translations (${cost.translation_calls.toLocaleString("en-US")} calls) | $${cost.translations.toFixed(2)} |`,
        `| Judging (${cost.judge_calls} calls) | $${cost.judging.toFixed(2)} |`,
        `| Total | $${(cost.translations + cost.judging).toFixed(2)} |`,
        "",
        "Drafting the chat cases, which are committed in `data/chat-cases.json`, is not included.",
      ]
      : ["Cost: see `data/results/manifest.json`."]));
  }
  if (opts.pilot) {
    lines.push(
      "",
      `Projected full run for ${nFullLangs} non-English languages × ${BENCH_PER_LANG} benchmark + ${CHAT_PER_LANG} chat (linear scale from this pilot): **$${projected.toFixed(2)}**.`,
      "",
      "The full run was not started.",
    );
  }
  if (ledger.aborted && ledger.reason) lines.push("", `Stopped: ${ledger.reason}`);
  return lines.join("\n");
}

function strip(rows) {
  return rows.map(({ groups, langCrit, ...rest }) => rest);
}

export function writeReport(opts = parseArgs(), spendText = "") {
  const analysis = analyze(opts);
  const base = spendFromLedger(opts, analysis.cases);
  const spend = spendText ? `${base}\n\n${spendText}` : base;
  fs.mkdirSync(path.dirname(REPORT_MD), { recursive: true });
  fs.writeFileSync(REPORT_MD, markdown(opts, analysis, spend), "utf8");
  fs.writeFileSync(REPORT_SVG, svgChart(analysis.rows.filter((row) => row.costPer1k > 0 && row.mean != null), analysis.frontier, { title: `Translation quality vs cost: ${analysis.models.length} models, 72 languages`, subtitle: `${Object.keys(analysis.judgements?.scores || {}).length.toLocaleString("en-US")} scored cases, one listwise judge pass (Claude Opus 5.5). Frontier: ${analysis.frontier.map((r) => shortName(r.slug)).join(", ")}` }), "utf8");
  writeJson(SUMMARY_FILE, {
    rows: strip(analysis.rows),
    benchmark: strip(analysis.benchmark),
    chat: strip(analysis.chat),
    frontier: analysis.frontier.map((row) => ({
      slug: row.slug,
      mean: row.mean,
      ci: row.ci,
      crit: row.crit,
      costPer1k: row.costPer1k,
    })),
    paired: analysis.paired,
    flags: analysis.flags.flags,
    n_cases: analysis.cases.length,
    n_scored: Object.keys(analysis.judgements?.scores || {}).length,
    parse_failures: analysis.judgements?.parse_failures || 0,
  });
  console.log(`report ${REPORT_MD}`);
  console.log(`chart ${REPORT_SVG}`);
  for (const row of analysis.rows) {
    console.log(`${row.slug.padEnd(40)} mean ${fmt(row.mean)} ci ${fmt(row.ci.low)}–${fmt(row.ci.high)} crit ${fmt((row.crit || 0) * 100, 1)}% usd/1k ${usd(row.costPer1k)} n ${row.n}`);
  }
  console.log("frontier", analysis.frontier.map((row) => row.slug).join(", "));
  return analysis;
}

if (invokedDirectly(import.meta.url)) {
  try {
    writeReport();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
