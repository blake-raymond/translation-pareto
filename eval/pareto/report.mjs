// Per-model means, critical rates, cost/1k, hierarchical bootstrap CIs, Pareto chart.
import fs from "node:fs";
import path from "node:path";
import { writeJson } from "../api.mjs";
import { languageName, TARGET_CODES } from "./languages.mjs";
import { invokedDirectly, loadParetoLedger, mean, mulberry32, parseArgs, seedMix } from "./lib.mjs";
import {
  BENCH_PER_LANG,
  CAP_USD,
  CHAT_PER_LANG,
  JUDGEMENTS_FILE,
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

function frontierOf(rows) {
  const pairCache = new Map();
  function pairCI(a, b) {
    const key = `${a.slug}||${b.slug}`;
    if (!pairCache.has(key)) {
      pairCache.set(key, pairedDiff(a.groups, b.groups, mulberry32(seedMix("pair", a.slug, b.slug))));
    }
    return pairCache.get(key);
  }
  return rows.filter((row) => {
    if (row.mean == null || row.costPer1k == null) return false;
    return !rows.some((other) => {
      if (other.slug === row.slug || other.mean == null || other.costPer1k == null) return false;
      const diff = pairCI(other, row);
      const clearlyWorse = diff.low > 0;
      const notCheaper = row.costPer1k + 1e-12 >= other.costPer1k;
      return clearlyWorse && notCheaper;
    });
  }).sort((a, b) => a.costPer1k - b.costPer1k);
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

function svgChart(rows, frontier) {
  const width = 960;
  const height = 560;
  const pad = { l: 70, r: 180, t: 36, b: 56 };
  const costs = rows.map((row) => row.costPer1k).filter((value) => value > 0);
  const minC = Math.min(...costs) / 1.15;
  const maxC = Math.max(...costs) * 1.15;
  const minS = 1;
  const maxS = 5;
  const xOf = (cost) => {
    const t = (Math.log(cost) - Math.log(minC)) / (Math.log(maxC) - Math.log(minC));
    return pad.l + t * (width - pad.l - pad.r);
  };
  const yOf = (score) => pad.t + (1 - (score - minS) / (maxS - minS)) * (height - pad.t - pad.b);
  const ticks = [];
  const logMin = Math.log10(minC);
  const logMax = Math.log10(maxC);
  for (let p = Math.floor(logMin); p <= Math.ceil(logMax); p += 1) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** p;
      if (v >= minC && v <= maxC) ticks.push(v);
    }
  }
  const front = [...frontier].sort((a, b) => a.costPer1k - b.costPer1k);
  const line = front.map((row, i) => `${i ? "L" : "M"}${xOf(row.costPer1k).toFixed(1)},${yOf(row.mean).toFixed(1)}`).join(" ");
  const dots = rows.map((row) => {
    const x = xOf(row.costPer1k);
    const y = yOf(row.mean);
    const on = frontier.some((item) => item.slug === row.slug);
    return [
      `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 6 : 4.5}" fill="${on ? "#0f766e" : "#64748b"}" />`,
      `<text x="${(x + 8).toFixed(1)}" y="${(y + 4).toFixed(1)}" font-size="11" font-family="Segoe UI, sans-serif" fill="#111827">${shortName(row.slug)}</text>`,
    ].join("");
  }).join("\n");
  const xticks = ticks.map((v) => {
    const x = xOf(v);
    return `<line x1="${x}" y1="${height - pad.b}" x2="${x}" y2="${height - pad.b + 6}" stroke="#111"/><text x="${x}" y="${height - pad.b + 20}" text-anchor="middle" font-size="11" font-family="Segoe UI, sans-serif">$${v < 1 ? v.toFixed(2) : v.toFixed(v >= 10 ? 0 : 1)}</text>`;
  }).join("");
  const yticks = [1, 2, 3, 4, 5].map((v) => {
    const y = yOf(v);
    return `<line x1="${pad.l - 6}" y1="${y}" x2="${pad.l}" y2="${y}" stroke="#111"/><text x="${pad.l - 10}" y="${y + 4}" text-anchor="end" font-size="11" font-family="Segoe UI, sans-serif">${v}</text><line x1="${pad.l}" y1="${y}" x2="${width - pad.r}" y2="${y}" stroke="#e5e7eb"/>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#fff"/>
  <text x="${width / 2}" y="24" text-anchor="middle" font-size="16" font-family="Segoe UI, sans-serif" font-weight="600">Translation cost vs quality</text>
  ${yticks}
  <line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${height - pad.b}" stroke="#111"/>
  <line x1="${pad.l}" y1="${height - pad.b}" x2="${width - pad.r}" y2="${height - pad.b}" stroke="#111"/>
  ${xticks}
  <path d="${line}" fill="none" stroke="#0f766e" stroke-width="2"/>
  ${dots}
  <text x="${(pad.l + width - pad.r) / 2}" y="${height - 12}" text-anchor="middle" font-size="12" font-family="Segoe UI, sans-serif">USD per 1,000 messages (log)</text>
  <text x="18" y="${height / 2}" text-anchor="middle" font-size="12" font-family="Segoe UI, sans-serif" transform="rotate(-90 18 ${height / 2})">Mean judge score</text>
</svg>
`;
}

export function analyze(opts = parseArgs()) {
  const cases = loadCases(opts);
  const judgements = loadJson(JUDGEMENTS_FILE);
  const translations = loadJson(TRANSLATIONS_FILE);
  const models = catalog().models;
  const scores = judgements.scores || {};
  const rows = buildRows(models, cases, scores, translations, null);
  const paired = pairAgainstBest(rows);
  const frontier = frontierOf(rows);
  const benchmark = buildRows(models, cases, scores, translations, "benchmark");
  const chat = buildRows(models, cases, scores, translations, "chat");
  const flags = languageFlags(rows);
  return { cases, rows, paired, frontier, judgements, translations, models, benchmark, chat, flags };
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
  const { rows, paired, frontier, cases, benchmark, chat, flags, judgements } = analysis;
  const langs = [...new Set(cases.map(langOf))];
  const nBench = cases.filter((item) => item.kind === "benchmark").length;
  const nChat = cases.filter((item) => item.kind === "chat").length;
  const scored = Object.keys(judgements?.scores || {}).length;
  const parseFailures = Number(judgements?.parse_failures || 0);
  const banner = opts.pilot
    ? [
      "# Pareto translation eval — PILOT",
      "",
      "This is a **5-language pilot** (vi, km, ja, ko, es), 10 benchmark + 5 chat cases each, 12 models, one judge (`anthropic/claude-opus-5.5`). It is not the full 72-language run.",
      "",
    ]
    : [
      "# Pareto translation eval",
      "",
      "Full run: 72 non-English languages, up to 40 benchmark and 20 chat cases each (fewer when the source set is shorter), 12 models, one judge (`anthropic/claude-opus-5.5`).",
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
    "Benchmark items are English→xx samples from WMT24++ where available (social and speech preferred, then shorter segments), else NTREX-128, else Tatoeba. FLORES+ is gated on Hugging Face and was not downloaded. Languages with fewer than 40 clean segments use every available segment; counts are in `data/coverage.json`.",
    "Chat items are synthetic multi-turn conversations drafted by Claude Opus 5.5. The pilot's chat cases are kept and extended, not replaced.",
    "Each candidate used the interpreter system prompt in `eval/prompts/v1.txt` with conversation history on chat items.",
    "One judge, `anthropic/claude-opus-5.5`, scored shuffled anonymous candidates in compact `m,n,h,c` strings. The reference was shown for benchmark items only.",
    "Bootstrap 95% intervals resample languages, then cases within language (2,000 draws, seed 20261025). Language means are equally weighted.",
    "A model is on the Pareto frontier unless another model is **clearly better** (paired bootstrap CI of the difference is entirely positive) **and** the worse model is not cheaper.",
    `USD / 1k is billed OpenRouter \`usage.cost\` on successful translation calls, including reasoning tokens, times 1,000. It does not include the judge or the chat drafter.`,
    `A cheap model costs at most $${CHEAP_USD_PER_1K.toFixed(2)} per 1,000 messages. A language is flagged when any cheap model has mean below 3.5 or a critical rate above 25% on that language.`,
    "",
    "## Quality against cost",
    "",
    ...qualityTable(rows),
    "",
    "![Pareto scatter](pareto.svg)",
    "",
    "## Pareto frontier",
    "",
    frontier.length
      ? frontier.map((row) => `- \`${row.slug}\` — mean ${fmt(row.mean)} (${fmt(row.ci.low)}–${fmt(row.ci.high)}), critical ${fmt((row.crit || 0) * 100, 1)}%, ${usd(row.costPer1k)} / 1k`).join("\n")
      : "No frontier (missing scores or costs).",
    "",
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
    "LLM-judged, not human-verified. A single Opus judge can favor its own family. Per-language cells are noisy at this sample size. WMT24++ locales (for example Mexican Spanish, Egyptian Arabic) stand in for the language, not every variety.",
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
  const perTranslate = nCases ? translateUsd / (nCases * 12) : 0;
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
  fs.writeFileSync(REPORT_SVG, svgChart(analysis.rows.filter((row) => row.costPer1k > 0 && row.mean != null), analysis.frontier), "utf8");
  writeJson(path.join(RESULTS_DIR, "summary.json"), {
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
