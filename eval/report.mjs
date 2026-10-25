import fs from "node:fs";
import path from "node:path";
import { LANGUAGES } from "../src/languages.js";
import { EN_LANGS, PROBLEMS, SEED, directionKey, slugCode } from "./meta.mjs";
import { hashString, rootDir, writeJson } from "./api.mjs";

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  return sorted[low] * (high - index) + sorted[high] * (index - low);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function bootstrapCI(values, seed, iters = 2000) {
  if (!values.length) return { low: null, high: null };
  if (values.length === 1) return { low: values[0], high: values[0] };
  const rand = mulberry32(seed >>> 0);
  const means = [];
  for (let i = 0; i < iters; i += 1) {
    let sum = 0;
    for (let j = 0; j < values.length; j += 1) sum += values[Math.floor(rand() * values.length)];
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return {
    low: means[Math.floor(0.025 * (iters - 1))],
    high: means[Math.min(iters - 1, Math.ceil(0.975 * (iters - 1)))],
  };
}

function pearson(xs, ys) {
  if (xs.length !== ys.length || xs.length < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function quadraticKappa(pairs) {
  const k = 5;
  if (!pairs.length) return null;
  const obs = Array.from({ length: k }, () => Array(k).fill(0));
  const histA = Array(k).fill(0);
  const histB = Array(k).fill(0);
  for (const [a, b] of pairs) {
    if (a < 1 || a > 5 || b < 1 || b > 5) continue;
    obs[a - 1][b - 1] += 1;
    histA[a - 1] += 1;
    histB[b - 1] += 1;
  }
  const n = pairs.length;
  let observed = 0;
  let expected = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const weight = ((i - j) ** 2) / ((k - 1) ** 2);
      observed += weight * (obs[i][j] / n);
      expected += weight * (histA[i] / n) * (histB[j] / n);
    }
  }
  if (expected === 0) return 1;
  return 1 - observed / expected;
}

function binaryKappa(pairs) {
  if (!pairs.length) return null;
  let both = 0;
  let onlyA = 0;
  let onlyB = 0;
  let neither = 0;
  for (const [a, b] of pairs) {
    if (a && b) both += 1;
    else if (a) onlyA += 1;
    else if (b) onlyB += 1;
    else neither += 1;
  }
  const n = both + onlyA + onlyB + neither;
  const po = (both + neither) / n;
  const pe = ((both + onlyA) / n) * ((both + onlyB) / n) + ((onlyB + neither) / n) * ((onlyA + neither) / n);
  if (pe === 1) return 1;
  return (po - pe) / (1 - pe);
}

function fmt(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return "—";
  return Number(value).toFixed(digits);
}

function money(value) {
  if (value == null || Number.isNaN(value)) return "—";
  if (value >= 1) return `$${value.toFixed(2)}`;
  if (value >= 0.01) return `$${value.toFixed(3)}`;
  return `$${value.toFixed(4)}`;
}

function overall(score) {
  return (score.meaning + score.naturalness + score.handling) / 3;
}

function languageOfEnglishPair(item) {
  if (item.source === "en") return item.target;
  if (item.target === "en") return item.source;
  return null;
}

function mode(values) {
  const counts = new Map();
  for (const value of values) {
    const key = value == null ? "omitted" : JSON.stringify(value);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = "omitted";
  let n = -1;
  for (const [key, count] of counts) {
    if (count > n) {
      best = key;
      n = count;
    }
  }
  return best;
}

export function analyze(meta) {
  const { catalog, cases, runs, judgements, pivotRuns, pivotJudgements, systemPrompt } = meta;
  const caseById = new Map(cases.map((item) => [item.id, item]));
  const judges = catalog.judges.map((judge) => judge.slug);
  const bySlug = new Map();
  for (const run of runs) {
    if (!bySlug.has(run.slug)) bySlug.set(run.slug, []);
    bySlug.get(run.slug).push(run);
  }
  const judgementByCase = new Map();
  for (const judgement of judgements) {
    if (!judgementByCase.has(judgement.case_id)) judgementByCase.set(judgement.case_id, []);
    judgementByCase.get(judgement.case_id).push(judgement);
  }

  const paired = [];
  for (const [caseId, rows] of judgementByCase) {
    const left = rows.find((row) => row.judge === judges[0] && !row.error);
    const right = rows.find((row) => row.judge === judges[1] && !row.error);
    if (!left || !right) continue;
    const slugs = new Set([...Object.keys(left.scores || {}), ...Object.keys(right.scores || {})]);
    for (const slug of slugs) {
      const a = left.scores?.[slug];
      const b = right.scores?.[slug];
      if (!a || !b) continue;
      if ([a.meaning, a.naturalness, a.handling, b.meaning, b.naturalness, b.handling].some((value) => value == null)) continue;
      paired.push({
        case_id: caseId,
        slug,
        a,
        b,
        score: (overall(a) + overall(b)) / 2,
        critical: ((a.critical_error ? 1 : 0) + (b.critical_error ? 1 : 0)) / 2,
        either: Boolean(a.critical_error || b.critical_error),
      });
    }
  }

  const judgePairs = paired.map((row) => [overall(row.a), overall(row.b)]);
  const agreement = {
    n: paired.length,
    pearson: pearson(judgePairs.map((row) => row[0]), judgePairs.map((row) => row[1])),
    withinHalf: mean(judgePairs.map(([a, b]) => (Math.abs(a - b) <= 0.5 ? 1 : 0))),
    withinOne: mean(judgePairs.map(([a, b]) => (Math.abs(a - b) <= 1 ? 1 : 0))),
    kappa: {
      meaning: quadraticKappa(paired.map((row) => [row.a.meaning, row.b.meaning])),
      naturalness: quadraticKappa(paired.map((row) => [row.a.naturalness, row.b.naturalness])),
      handling: quadraticKappa(paired.map((row) => [row.a.handling, row.b.handling])),
      critical: binaryKappa(paired.map((row) => [row.a.critical_error ? 1 : 0, row.b.critical_error ? 1 : 0])),
    },
    judgeMeans: judges.map((slug, index) => {
      const key = index === 0 ? "a" : "b";
      const rows = paired.map((row) => row[key]);
      return {
        slug,
        mean: mean(rows.map(overall)),
        meaning: mean(rows.map((row) => row.meaning)),
        naturalness: mean(rows.map((row) => row.naturalness)),
        handling: mean(rows.map((row) => row.handling)),
        critical: mean(rows.map((row) => (row.critical_error ? 1 : 0))),
      };
    }),
  };

  const systemTokens = Math.max(1, Math.round(systemPrompt.length / 4));
  const rows = catalog.models.map((model) => {
    const modelRuns = bySlug.get(model.slug) || [];
    const ok = modelRuns.filter((run) => !run.skipped && !run.error && run.output);
    const failed = modelRuns.filter((run) => !run.skipped && (run.error || !run.output));
    const scores = paired.filter((row) => row.slug === model.slug);
    const values = scores.map((row) => row.score);
    const ci = bootstrapCI(values, Number.parseInt(hashString(`${SEED}:${model.slug}`), 16));
    const perLanguage = {};
    const perLanguageCritical = {};
    const perLanguageN = {};
    for (const code of EN_LANGS) {
      const subset = scores.filter((row) => languageOfEnglishPair(caseById.get(row.case_id)) === code);
      perLanguage[code] = mean(subset.map((row) => row.score));
      perLanguageCritical[code] = mean(subset.map((row) => row.critical));
      perLanguageN[code] = subset.length;
    }
    const perProblem = {};
    for (const problem of PROBLEMS) {
      const subset = scores.filter((row) => caseById.get(row.case_id)?.problem === problem);
      perProblem[problem] = mean(subset.map((row) => row.score));
    }
    const cost = ok.reduce((sum, run) => sum + (run.cost_usd || 0), 0);
    const avgPrompt = mean(ok.map((run) => run.prompt_tokens || 0));
    const avgCompletion = mean(ok.map((run) => run.completion_tokens || 0));
    const pin = model.prompt_per_million / 1e6;
    const pout = model.completion_per_million / 1e6;
    const cachedTokens = Math.min(systemTokens, avgPrompt || 0);
    const uncachedTokens = Math.max(0, (avgPrompt || 0) - cachedTokens);
    const assumed = avgPrompt == null
      ? null
      : (uncachedTokens * pin + cachedTokens * pin * 0.1 + (avgCompletion || 0) * pout) * 1000;
    return {
      model,
      n: ok.length,
      failures: failed.length,
      skipped: modelRuns.filter((run) => run.skipped).length,
      scored: scores.length,
      mean: mean(values),
      ci,
      meaning: mean(scores.map((row) => (row.a.meaning + row.b.meaning) / 2)),
      naturalness: mean(scores.map((row) => (row.a.naturalness + row.b.naturalness) / 2)),
      handling: mean(scores.map((row) => (row.a.handling + row.b.handling) / 2)),
      critical: mean(scores.map((row) => row.critical)),
      either: mean(scores.map((row) => (row.either ? 1 : 0))),
      perLanguage,
      perLanguageCritical,
      perLanguageN,
      perProblem,
      p50: percentile(ok.map((run) => run.latency_ms).filter((value) => value != null), 0.5),
      p95: percentile(ok.map((run) => run.latency_ms).filter((value) => value != null), 0.95),
      avgPrompt,
      avgCompletion,
      avgReasoning: mean(ok.map((run) => run.reasoning_tokens || 0)),
      avgCached: mean(ok.map((run) => run.cached_tokens || 0)),
      costPer1k: ok.length ? (cost / ok.length) * 1000 : null,
      assumedCachePer1k: assumed,
      translationCost: cost,
      temperature: mode(ok.map((run) => run.temperature)),
      reasoning: mode(ok.map((run) => run.reasoning)),
      scores,
    };
  });

  const routing = chooseRouting(rows, cases);
  const examples = worstExamples(rows, caseById, bySlug);
  const pivot = analyzePivot(meta, caseById, rows);
  return {
    rows,
    agreement,
    routing,
    examples,
    pivot,
    systemTokens,
    judges,
    pairedN: paired.length,
    caseCount: cases.length,
  };
}

function chooseRouting(rows, cases) {
  const englishCases = cases.filter((item) => item.source === "en" || item.target === "en").length;
  const eligible = rows.filter((row) => (
    row.model.role !== "ceiling"
    && row.scored >= Math.ceil(englishCases * 0.8)
    && row.mean != null
    && row.mean >= 4
    && row.critical != null
    && row.critical <= 0.05
  ));
  const pool = eligible.length ? eligible : rows.filter((row) => row.model.role !== "ceiling" && row.mean != null);
  if (!pool.length) {
    const languages = Object.fromEntries(EN_LANGS.map((code) => [code, {
      tier: "default",
      default_mean: null,
      best_mean: null,
      default_critical: null,
      n: 0,
    }]));
    return {
      defaultModel: null,
      escalationModel: rows.find((row) => row.model.role === "ceiling")?.model.slug || null,
      eligible: [],
      languages,
      rule: "No model had enough paired judge scores to choose a default.",
    };
  }
  const bestMean = Math.max(...pool.map((row) => row.mean ?? 0));
  const best = pool.find((row) => row.mean === bestMean) || pool[0];
  const near = pool.filter((row) => (
    best
    && row.mean >= best.mean - 0.15
    && row.critical <= (best.critical ?? 0) + 0.02
  ));
  const defaultRow = [...(near.length ? near : pool)].sort((a, b) => (
    (a.costPer1k ?? 99) - (b.costPer1k ?? 99)
    || (b.mean ?? 0) - (a.mean ?? 0)
  ))[0];
  const languages = {};
  const escalated = [];
  for (const code of EN_LANGS) {
    const baseline = defaultRow?.perLanguage[code];
    const bestOnLang = Math.max(...rows.map((row) => row.perLanguage[code] ?? 0));
    const critical = defaultRow?.perLanguageCritical[code];
    const escalate = baseline == null
      || baseline < 4
      || (critical != null && critical > 0.08)
      || (bestOnLang - baseline) > 0.35;
    if (escalate) escalated.push(code);
    languages[code] = {
      tier: escalate ? "escalation" : "default",
      default_mean: baseline == null ? null : Number(baseline.toFixed(3)),
      best_mean: Number.isFinite(bestOnLang) ? Number(bestOnLang.toFixed(3)) : null,
      default_critical: critical == null ? null : Number(critical.toFixed(3)),
      n: defaultRow?.perLanguageN[code] || 0,
    };
  }
  let escalationRow = rows.find((row) => row.model.role === "ceiling");
  if (escalated.length) {
    const ceilingMean = mean(escalated.map((code) => escalationRow?.perLanguage[code]).filter((value) => value != null));
    const defaultMean = mean(escalated.map((code) => defaultRow?.perLanguage[code]).filter((value) => value != null));
    const ranked = [...rows].sort((a, b) => {
      const am = mean(escalated.map((code) => a.perLanguage[code]).filter((value) => value != null)) ?? 0;
      const bm = mean(escalated.map((code) => b.perLanguage[code]).filter((value) => value != null)) ?? 0;
      return bm - am || (a.costPer1k ?? 99) - (b.costPer1k ?? 99);
    });
    const winner = ranked[0];
    const winnerMean = mean(escalated.map((code) => winner?.perLanguage[code]).filter((value) => value != null));
    if (ceilingMean != null && defaultMean != null && ceilingMean >= defaultMean + 0.15) {
      escalationRow = rows.find((row) => row.model.role === "ceiling") || winner;
    } else if (winner && winner.model.slug !== defaultRow?.model.slug && winnerMean != null && defaultMean != null && winnerMean >= defaultMean + 0.15) {
      escalationRow = winner;
    }
  }
  return {
    defaultModel: defaultRow?.model.slug || null,
    escalationModel: escalationRow?.model.slug || null,
    eligible: pool.map((row) => row.model.slug),
    languages,
    rule: "A non-ceiling model is eligible when its headline mean is at least 4.0, its critical-error rate is at most 5%, and both judges scored at least 80% of the English-pair cases. The default is the cheapest eligible model within 0.15 points of the best eligible mean and within 0.02 critical-error rate of that best model. A language escalates when the default mean on that language is below 4.0, its critical-error rate is above 8%, or it trails the best model on that language by more than 0.35. The escalation model is Gemini 2.5 Pro when it leads the default by at least 0.15 on the escalated languages; otherwise it is the model that actually leads by that margin.",
  };
}

function worstExamples(rows, caseById, bySlug) {
  const flat = [];
  for (const row of rows) {
    for (const score of row.scores) {
      const item = caseById.get(score.case_id);
      const run = (bySlug.get(row.model.slug) || []).find((entry) => entry.case_id === score.case_id);
      if (!item || !run?.output) continue;
      flat.push({ row, score, item, run });
    }
  }
  flat.sort((a, b) => a.score.score - b.score.score || Number(b.score.either) - Number(a.score.either));
  const picked = [];
  const seenCases = new Set();
  for (const entry of flat) {
    if (seenCases.has(entry.item.id)) continue;
    seenCases.add(entry.item.id);
    picked.push(entry);
    if (picked.length === 10) break;
  }
  return picked;
}

function analyzePivot(meta, caseById, rows) {
  const { pivotRuns, pivotJudgements, pivotModel } = meta;
  if (!pivotModel) return null;
  const direct = rows.find((row) => row.model.slug === pivotModel);
  const crossIds = new Set([...caseById.values()].filter((item) => item.source !== "en" && item.target !== "en").map((item) => item.id));
  const byCase = new Map();
  for (const run of pivotRuns || []) {
    if (!byCase.has(run.case_id)) byCase.set(run.case_id, []);
    byCase.get(run.case_id).push(run);
  }
  const judges = meta.catalog.judges.map((judge) => judge.slug);
  const paired = [];
  for (const judgement of pivotJudgements || []) {
    if (judgement.arm !== "pivot-pair") continue;
    const rowsForCase = (pivotJudgements || []).filter((item) => item.case_id === judgement.case_id && item.arm === "pivot-pair");
    const left = rowsForCase.find((item) => item.judge === judges[0] && !item.error);
    const right = rowsForCase.find((item) => item.judge === judges[1] && !item.error);
    if (!left || !right) continue;
    if (paired.some((item) => item.case_id === judgement.case_id)) continue;
    const directSlug = `${pivotModel}#direct`;
    const pivotSlug = `${pivotModel}#pivot`;
    const read = (slug) => {
      const a = left.scores?.[slug];
      const b = right.scores?.[slug];
      if (!a || !b) return null;
      return {
        score: (overall(a) + overall(b)) / 2,
        critical: ((a.critical_error ? 1 : 0) + (b.critical_error ? 1 : 0)) / 2,
      };
    };
    const directScore = read(directSlug);
    const pivotScore = read(pivotSlug);
    if (!directScore || !pivotScore) continue;
    paired.push({ case_id: judgement.case_id, direct: directScore, pivot: pivotScore });
  }
  const stepRuns = (pivotRuns || []).filter((run) => crossIds.has(run.case_id) && !run.error);
  const perCase = [];
  for (const id of crossIds) {
    const steps = (pivotRuns || []).filter((run) => run.case_id === id);
    if (steps.length < 2) continue;
    perCase.push({
      cost: steps.reduce((sum, run) => sum + (run.cost_usd || 0), 0),
      latency: steps.reduce((sum, run) => sum + (run.latency_ms || 0), 0),
      ok: steps.every((run) => run.output && !run.error),
    });
  }
  const okCases = perCase.filter((item) => item.ok);
  const directPanel = direct?.scores.filter((row) => crossIds.has(row.case_id)) || [];
  return {
    model: pivotModel,
    n: okCases.length,
    directMean: mean(paired.map((row) => row.direct.score)),
    pivotMean: mean(paired.map((row) => row.pivot.score)),
    directCritical: mean(paired.map((row) => row.direct.critical)),
    pivotCritical: mean(paired.map((row) => row.pivot.critical)),
    pairedN: paired.length,
    panelDirectMean: mean(directPanel.map((row) => row.score)),
    costPerCall: mean(okCases.map((item) => item.cost)),
    latencyP50: percentile(okCases.map((item) => item.latency), 0.5),
    latencyP95: percentile(okCases.map((item) => item.latency), 0.95),
    directCostPerCall: direct ? (direct.translationCost / Math.max(direct.n, 1)) : null,
    directLatencyP50: direct?.p50 ?? null,
    stepCount: stepRuns.length,
  };
}

function modelTable(catalog) {
  const lines = [
    "| Model | Role | Input / 1M | Output / 1M | Reasoning | Temperature |",
    "| --- | --- | ---: | ---: | --- | --- |",
  ];
  for (const model of catalog.models) {
    const reasoning = model.reasoning ? `\`${JSON.stringify(model.reasoning)}\`` : "not sent";
    const temperature = model.temperature == null ? "omitted" : String(model.temperature);
    lines.push(`| \`${model.slug}\` | ${model.role} | $${model.prompt_per_million} | $${model.completion_per_million} | ${reasoning} | ${temperature} |`);
  }
  return lines;
}

function headlineTable(rows) {
  const lines = [
    "| Model | Mean | 95% CI | Meaning | Natural | Handling | Critical | p50 ms | p95 ms | USD / 1k | n |",
    "| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];
  const sorted = [...rows].sort((a, b) => (b.mean ?? -1) - (a.mean ?? -1));
  for (const row of sorted) {
    const ci = row.ci.low == null ? "—" : `${fmt(row.ci.low)}–${fmt(row.ci.high)}`;
    const critical = row.critical == null ? "—" : `${fmt(row.critical * 100, 1)}%`;
    lines.push(`| \`${row.model.slug}\` | ${fmt(row.mean)} | ${ci} | ${fmt(row.meaning)} | ${fmt(row.naturalness)} | ${fmt(row.handling)} | ${critical} | ${fmt(row.p50, 0)} | ${fmt(row.p95, 0)} | ${money(row.costPer1k)} | ${row.scored} |`);
  }
  return lines;
}

function heatTable(rows) {
  const header = ["| Model |", ...EN_LANGS.map((code) => ` ${slugCode(code)} |`)].join("");
  const split = ["| --- |", ...EN_LANGS.map(() => " ---: |")].join("");
  const body = rows.map((row) => {
    const cells = EN_LANGS.map((code) => ` ${fmt(row.perLanguage[code], 2)} |`).join("");
    return `| \`${row.model.slug}\` |${cells}`;
  });
  return [header, split, ...body];
}

function problemTable(rows) {
  const header = ["| Model |", ...PROBLEMS.map((problem) => ` ${problem} |`)].join("");
  const split = ["| --- |", ...PROBLEMS.map(() => " ---: |")].join("");
  const body = rows.map((row) => {
    const cells = PROBLEMS.map((problem) => ` ${fmt(row.perProblem[problem], 2)} |`).join("");
    return `| \`${row.model.slug}\` |${cells}`;
  });
  return [header, split, ...body];
}

function costTable(rows) {
  const lines = [
    "| Model | Measured USD / 1k | Assumed cached system prompt / 1k | Avg prompt tokens | Avg cached tokens | Avg output tokens |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
  ];
  for (const row of rows) {
    lines.push(`| \`${row.model.slug}\` | ${money(row.costPer1k)} | ${money(row.assumedCachePer1k)} | ${fmt(row.avgPrompt, 0)} | ${fmt(row.avgCached, 0)} | ${fmt(row.avgCompletion, 0)} |`);
  }
  return lines;
}

function latencyTable(rows) {
  const lines = [
    "| Model | p50 ms | p95 ms | Avg reasoning tokens | Temperature used | Reasoning used | Failures |",
    "| --- | ---: | ---: | ---: | --- | --- | ---: |",
  ];
  for (const row of rows) {
    lines.push(`| \`${row.model.slug}\` | ${fmt(row.p50, 0)} | ${fmt(row.p95, 0)} | ${fmt(row.avgReasoning, 0)} | ${row.temperature} | ${row.reasoning} | ${row.failures} |`);
  }
  return lines;
}

function exampleBlocks(examples) {
  const lines = [];
  examples.forEach((entry, index) => {
    const { item, run, score, row } = entry;
    lines.push(`### ${index + 1}. ${item.id}`);
    lines.push("");
    lines.push(`\`${row.model.slug}\` on ${item.source}→${item.target}, ${item.problem}. Headline ${fmt(score.score)} (meaning ${fmt((score.a.meaning + score.b.meaning) / 2, 2)}, naturalness ${fmt((score.a.naturalness + score.b.naturalness) / 2, 2)}, handling ${fmt((score.a.handling + score.b.handling) / 2, 2)}). Critical flags: judge A ${score.a.critical_error ? "yes" : "no"}, judge B ${score.b.critical_error ? "yes" : "no"}.`);
    if (score.a.note) lines.push(`Judge A: ${score.a.note}`);
    if (score.b.note) lines.push(`Judge B: ${score.b.note}`);
    lines.push("");
    lines.push("Source:");
    lines.push("");
    lines.push("```");
    lines.push(item.text);
    lines.push("```");
    lines.push("");
    lines.push("Reference:");
    lines.push("");
    lines.push("```");
    lines.push(item.reference);
    lines.push("```");
    lines.push("");
    lines.push("Output:");
    lines.push("");
    lines.push("```");
    lines.push(run.output);
    lines.push("```");
    lines.push("");
  });
  return lines;
}

function pivotSection(pivot) {
  if (!pivot) {
    return ["The pivot arm did not run. The direct comparison was incomplete or the spend cap stopped the run before it.", ""];
  }
  return [
    `Pivot model: \`${pivot.model}\`. This is the cheapest non-ceiling model within 0.10 of the best headline mean, among models both judges scored on at least 80% of cases.`,
    `On the non-English pairs, direct translation scored ${fmt(pivot.directMean)} and the English pivot scored ${fmt(pivot.pivotMean)} (paired blind rescore, n=${pivot.pairedN}). Critical-error rates were ${fmt((pivot.directCritical || 0) * 100, 1)}% direct and ${fmt((pivot.pivotCritical || 0) * 100, 1)}% pivot.`,
    `The same direct outputs scored ${fmt(pivot.panelDirectMean)} in the full multi-model panel. The paired rescore is the comparison to use, because a two-candidate prompt is not the same task as a fifteen-candidate prompt.`,
    `Cost per pivoted message (both steps) ${money(pivot.costPerCall)}, against ${money(pivot.directCostPerCall)} for one direct call of the same model. Latency p50/p95 for the two steps combined: ${fmt(pivot.latencyP50, 0)} / ${fmt(pivot.latencyP95, 0)} ms. Direct p50 for that model on all cases: ${fmt(pivot.directLatencyP50, 0)} ms. Successful pivot conversations: ${pivot.n}.`,
    "",
  ];
}

export function renderReports(meta, analysis) {
  const { catalog, ledger, startedAt, finishedAt, review } = meta;
  const { rows, agreement, routing, examples, pivot, systemTokens } = analysis;
  const judgeCost = (meta.judgements || []).reduce((sum, item) => sum + (item.cost_usd || 0), 0)
    + (meta.pivotJudgements || []).reduce((sum, item) => sum + (item.cost_usd || 0), 0);
  const translationCost = rows.reduce((sum, row) => sum + row.translationCost, 0);
  const status = ledger.aborted
    ? `The run stopped early: ${ledger.reason}`
    : "The run finished inside the spend cap.";
  const bothJudges = agreement.judgeMeans.map((item) => `\`${item.slug}\` mean ${fmt(item.mean)} (critical ${fmt(item.critical * 100, 1)}%)`).join("; ");
  const settings = rows.map((row) => (
    `- \`${row.model.slug}\` — ${row.model.note} Observed temperature ${row.temperature}; observed reasoning ${row.reasoning}.`
  ));
  const skipped = (catalog.skipped || []).map((item) => `- ${item.requested}: ${item.reason}`);
  const substitutions = (catalog.substitutions || []).map((item) => `- Requested ${item.requested}. Used \`${item.used}\`. ${item.reason}`);
  const routingRows = [
    "| Language | Tier | Default mean | Best mean | Default critical | n |",
    "| --- | --- | ---: | ---: | ---: | ---: |",
    ...EN_LANGS.map((code) => {
      const item = routing.languages[code];
      return `| ${code} | ${item.tier} | ${fmt(item.default_mean)} | ${fmt(item.best_mean)} | ${item.default_critical == null ? "—" : `${fmt(item.default_critical * 100, 1)}%`} | ${item.n} |`;
    }),
  ];
  const cross = [
    "| Pair | Cases |",
    "| --- | ---: |",
  ];
  const crossCounts = new Map();
  for (const item of meta.cases) {
    if (item.source === "en" || item.target === "en") continue;
    const key = directionKey(item.source, item.target);
    crossCounts.set(key, (crossCounts.get(key) || 0) + 1);
  }
  for (const [key, count] of crossCounts) cross.push(`| ${key} | ${count} |`);

  const doc = [
    "# Which model should power a pass-the-phone translation chat?",
    "",
    "Question: for a live two-person conversation on one phone, which model should translate the latest turn, and which languages should escalate from a cheap default to a stronger model?",
    "",
    "This comparison uses the production interpreter prompt from Grok Translate (`SYSTEM_PROMPT` and `buildUserPrompt` in `src/worker.js`). Each item is a short face-to-face conversation. The model translates only the last turn. The set covers English paired with Indonesian, Thai, Vietnamese, Burmese, Khmer, Mandarin (Simplified), Japanese, Korean, Hindi, Bengali, Arabic, and Spanish, in both directions, plus Indonesian↔Thai, Japanese↔Korean, and Hindi↔Arabic.",
    "",
    "## Method",
    "",
    `Cases: ${meta.cases.length} conversations, 3 to 6 turns, last turn translated. Each case has one reference and an expected-meaning note. Problem tags are typo, missing diacritics, autocorrect, slang, pronoun reference, honorific or formality, and code-switching. Scenarios are market bargaining, directions, food and allergies, taxis, hotel check-in, pharmacy doses, small talk, and a social introduction.`,
    "",
    "An English contract fixed the facts: numbers, negation, and who is being referred to. Claude Sonnet 5 (`anthropic/claude-sonnet-5`) wrote the non-English lines from that contract. Gemini 3.1 Pro Preview (`google/gemini-3.1-pro-preview`) then reviewed every reference and note and dropped or rewrote items whose repair was not forced. The rejected pattern was a source line that could honestly mean either of two places, as in the earlier pilot item that said “mall lobby” while the reference silently said “hotel lobby.” Neither authoring model is a translation candidate, and neither is a judge.",
    "",
    review
      ? `The review log is \`eval/case-review.json\`: ${review.kept} kept of ${review.specs}, ${review.dropped} dropped.`
      : "The review log is `eval/case-review.json`.",
    "",
    "Candidates called the production prompt at temperature 0.2 when the OpenRouter catalog accepts temperature. Models that do not list temperature omit the field. Reasoning is off, `none`, or `minimal`, recorded per model below. Decoding is one sample per case.",
    "",
    "Two judges scored every candidate, blind, in the same shuffled order for a case. The shuffle seed is fixed (`20261024` mixed with the case id). Judges are Gemini 4 Argon and Claude Sonnet 5.5. Neither is a candidate, so neither is grading itself. Scores are integers from 1 to 5 for meaning, naturalness, and typo or context handling, plus a critical-error flag for a wrong meaning, the wrong language, a dropped negation, a wrong number or price, or an offensive mistranslation. The headline score is the mean of the two judges. The run does not switch judges if one of them fails. A short budget stops the run and says so.",
    "",
    `Ran ${startedAt} to ${finishedAt}. ${status}`,
    `Metered OpenRouter spend for this study, including case authoring and judging: ${money(ledger.spent)}. Cap $10. Translation calls in the tables cost ${money(translationCost)}. Judge calls cost ${money(judgeCost)}.`,
    "",
    "## Models and prices",
    "",
    `List prices were read from the OpenRouter catalog on ${catalog.fetched_at}. They are USD per million tokens.`,
    "",
    ...modelTable(catalog),
    "",
    "Skipped requests, not silently replaced:",
    "",
    ...skipped,
    "",
    "Substitutions:",
    "",
    ...substitutions,
    "",
    "## Quality against cost",
    "",
    "Mean is the average of the two judges, and each judge's score is the average of meaning, naturalness, and handling. The 95% interval is a 2,000-draw bootstrap over cases, seed 20261024. Critical is the average of the two judges' flags, so a split decision counts as one half. `n` is cases scored by both judges. Cost per 1,000 messages uses measured `usage.cost` on successful translation calls and does not include the judges.",
    "",
    ...headlineTable(rows),
    "",
    `Judge means on the paired items (n=${agreement.n}): ${bothJudges}.`,
    `Pearson correlation of the two judges' overall scores: ${fmt(agreement.pearson, 3)}. Share of items within 0.5 points: ${fmt((agreement.withinHalf || 0) * 100, 1)}%. Within 1 point: ${fmt((agreement.withinOne || 0) * 100, 1)}%.`,
    `Quadratic weighted kappa: meaning ${fmt(agreement.kappa.meaning, 3)}, naturalness ${fmt(agreement.kappa.naturalness, 3)}, handling ${fmt(agreement.kappa.handling, 3)}. Cohen's kappa on the critical-error flag: ${fmt(agreement.kappa.critical, 3)}.`,
    "",
    "## Per language",
    "",
    "Each cell pools both directions with English and leaves out the non-English pairs. A dash means neither judge completed that cell.",
    "",
    ...heatTable(rows),
    "",
    "Non-English pairs in the set:",
    "",
    ...cross,
    "",
    "## Per problem",
    "",
    ...problemTable(rows),
    "",
    "## Cost per 1,000 messages",
    "",
    `Measured cost is uncached: it is what OpenRouter billed on this run. The assumed column prices the system prompt (~${systemTokens} tokens) as a cache read at 10% of the input price and prices the rest of the prompt and the completion at list price. That 10% factor is an assumption, not a negotiated discount. Average cached tokens are whatever the API returned in \`prompt_tokens_details.cached_tokens\`. A zero there means this run did not observe a prompt cache.`,
    "",
    ...costTable(rows),
    "",
    "## Latency",
    "",
    "p50 and p95 are linear percentiles of successful call latencies, including provider queue time. They are not time-to-first-token.",
    "",
    ...latencyTable(rows),
    "",
    "## English pivot",
    "",
    "For Indonesian↔Thai, Japanese↔Korean, and Hindi↔Arabic only, the selected cheap model also translated source → English → target with the same production prompt and the same history. Direct and pivot outputs were then scored against each other by both judges, blind and shuffled.",
    "",
    ...pivotSection(pivot),
    "",
    "## Recommended tiers",
    "",
    routing.rule,
    "",
    `Default model: \`${routing.defaultModel || "—"}\`. Escalation model: \`${routing.escalationModel || "—"}\`.`,
    "",
    "Use the language's tier for a turn whose non-English side is that language, whether the phone is translating into it or out of it. A non-English pair escalates if either language is in the escalation tier.",
    "",
    ...routingRows,
    "",
    "The machine-readable map is `docs/routing-recommendation.json`. Every non-English language in `src/languages.js` is listed. A measured language uses the escalation model when its tier is escalation, and the default model otherwise. An unmeasured language was not in this 120-case set. It is pointed at the same two models and should use the default until it is measured.",
    "",
    "## Settings actually used",
    "",
    ...settings,
    "",
    "Judge settings:",
    "",
    ...catalog.judges.map((judge) => `- \`${judge.slug}\` — $${judge.prompt_per_million} / $${judge.completion_per_million} per million. Reasoning \`${JSON.stringify(judge.reasoning)}\`. Temperature ${judge.temperature == null ? "omitted" : judge.temperature}. ${judge.why}`),
    "",
    "## Worst outputs",
    "",
    "The lowest headline scores, one case each, with the source and the output in their original scripts.",
    "",
    ...exampleBlocks(examples),
    "",
    "## Limitations",
    "",
    `- Sample: ${meta.cases.length} written conversations and one decoding each. Several problem cells still have modest n, and the bootstrap interval treats cases as exchangeable. They were designed as a grid, not drawn from production logs.`,
    "- Judges are two LLMs. The correlation and kappa above are the agreement we measured. They are not a substitute for bilingual speakers, especially for Burmese, Khmer, and Bengali.",
    "- References were written by Claude Sonnet 5 from an English contract and audited by Gemini 3.1 Pro Preview. The judges did not write the references, but a fluent rendering that the meaning note did not anticipate can still be underscored. The meaning note, not the reference wording, is the authority for facts.",
    "- The reviewer is also an LLM. A drop removes an item; it does not prove the remaining Burmese, Khmer, or Bengali sentences would pass a native editor.",
    "- Temperature is 0.2 where the catalog allows it and omitted where the model rejects the field (Haiku 5.5, GPT-5 Mini, GPT-5 Nano). Those models use the provider default. Reasoning was pinned to off, none, or minimal. A vendor-default reasoning mode would cost more and take longer.",
    "- Production calls xAI `grok-4.20-0309-non-reasoning`. This study uses OpenRouter `x-ai/grok-4.20` with reasoning disabled. Latency here includes OpenRouter routing and is not the xAI direct latency.",
    `- Prices were copied from the OpenRouter catalog on ${catalog.fetched_at} and will change. DeepSeek V4.1 Flash 1017's weekday peak list price is double the headline rate used in the model table. Measured \`usage.cost\` is the better cost number for the day the run happened.`,
    "- The cached-prompt column assumes a 10% cache-read price for the system prompt. This run's observed cached-token counts are in the cost table. Do not treat the assumed column as a bill.",
    "- The ceiling model is Gemini 2.5 Pro because it was the cheapest Pro-class or Sonnet-class model. Newer Pro and Sonnet models were reserved as judges. The gap between the default and the ceiling is not the gap to the best model money can buy in 2026.",
    "- There is no Qwen-MT number in this study, because OpenRouter did not list one. There is no Grok fast or mini number, because those slugs were absent.",
    "- Critical errors are judge flags. A shared blind spot, for example a polite wrong dose that both models miss, would not show up.",
    "",
  ];

  const report = [
    "# Translation model comparison",
    "",
    "Generated by `eval/run.mjs`. The publishable write-up is `docs/translation-model-comparison.md`. This file repeats the tables and adds the run status.",
    "",
    ...doc.slice(2),
  ];
  return {
    doc: `${doc.join("\n")}\n`,
    report: `${report.join("\n")}\n`,
    routing: {
      generated_at: finishedAt,
      prices_fetched_at: catalog.fetched_at,
      default_model: routing.defaultModel,
      escalation_model: routing.escalationModel,
      rule: routing.rule,
      languages: Object.fromEntries(LANGUAGES.filter((language) => language.code !== "en").map((language) => {
        const detail = routing.languages[language.code];
        return [language.code, {
          default: routing.defaultModel,
          escalation: routing.escalationModel,
          tier: detail ? detail.tier : "unmeasured",
          measured: Boolean(detail),
        }];
      })),
      detail: routing.languages,
    },
  };
}

export function writeReports(meta) {
  const analysis = analyze(meta);
  const rendered = renderReports(meta, analysis);
  const partial = meta.partial;
  const docPath = partial
    ? path.join(rootDir(), "eval", "results", "partial-doc.md")
    : path.join(rootDir(), "docs", "translation-model-comparison.md");
  const reportPath = partial
    ? path.join(rootDir(), "eval", "results", "partial-report.md")
    : path.join(rootDir(), "eval", "report.md");
  const routingPath = partial
    ? path.join(rootDir(), "eval", "results", "partial-routing.json")
    : path.join(rootDir(), "docs", "routing-recommendation.json");
  writeJson(routingPath, rendered.routing);
  fs.writeFileSync(docPath, rendered.doc, "utf8");
  fs.writeFileSync(reportPath, rendered.report, "utf8");
  return { analysis, docPath, reportPath, routingPath };
}
