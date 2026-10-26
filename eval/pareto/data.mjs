// Download WMT24++ (Apache 2.0) and fill remaining languages from FLORES+
// (gated), NTREX-128, or Tatoeba. Sample a fixed-seed set per language.
// A larger target keeps every previously sampled segment and appends more.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { mapPool, writeJson } from "../api.mjs";
import {
  FLORES_PLUS,
  NTREX_CODES,
  TATOEBA_CODES,
  TATOEBA_ISO3,
  WMT24_FILES,
  languageName,
} from "./languages.mjs";
import { hfToken, invokedDirectly, loadParetoLedger, mulberry32, parseArgs, progress, seedMix, shuffle, targetLangs } from "./lib.mjs";
import { BENCHMARK_FILE, BENCH_PER_LANG, COVERAGE_FILE, RAW_DIR, SEED } from "./meta.mjs";

const WMT_BASE = "https://huggingface.co/datasets/google/wmt24pp/resolve/main";
const FLORES_FILE = "https://huggingface.co/datasets/openlanguagedata/flores_plus/resolve/main/devtest";
const NTREX_SRC = "https://raw.githubusercontent.com/MicrosoftTranslator/NTREX/main/NTREX-128/newstest2019-src.eng.txt";
const NTREX_REF = "https://raw.githubusercontent.com/MicrosoftTranslator/NTREX/main/NTREX-128/newstest2019-ref";
const OPUS_TATOEBA = "https://object.pouta.csc.fi/OPUS-Tatoeba/v2023-04-12/moses";

function rawPath(...parts) {
  return path.join(RAW_DIR, ...parts);
}

async function download(url, dest, headers = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size > 40) return { dest, status: 200, cached: true };
  const res = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(180000) });
  if (!res.ok) {
    return { dest, status: res.status, cached: false, error: `HTTP ${res.status}` };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return { dest, status: res.status, cached: false };
}

function parseJsonl(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip
    }
  }
  return rows;
}

function cleanPair(source, target) {
  const src = String(source || "").replace(/\s+/g, " ").trim();
  const tgt = String(target || "").replace(/\s+/g, " ").trim();
  if (!src || !tgt) return null;
  if (src.length < 8 || tgt.length < 4) return null;
  if (src.length > 400) return null;
  return { source: src, target: tgt };
}

function sampleRows(rows, n, lang) {
  const rng = mulberry32(seedMix(SEED, lang));
  const seen = new Set();
  const picked = [];
  const take = (pool, need) => {
    if (need <= 0 || !pool.length) return;
    const start = picked.length;
    const ranked = [...pool].sort((a, b) => a.source.length - b.source.length || a.target.length - b.target.length);
    const window = ranked.slice(0, Math.min(ranked.length, Math.max(need * 5, need)));
    for (const row of shuffle(window, rng)) {
      const key = `${row.source}\n${row.target}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picked.push(row);
      if (picked.length - start >= need || picked.length >= n) return;
    }
  };
  const social = rows.filter((row) => row.domain === "social");
  const speech = rows.filter((row) => row.domain === "speech");
  const other = rows.filter((row) => row.domain !== "social" && row.domain !== "speech");
  take(social, Math.min(10, n));
  take(speech, n - picked.length);
  take([...social, ...speech], n - picked.length);
  take(other, n - picked.length);
  take(rows, n - picked.length);
  return picked.slice(0, n);
}

function toCases(lang, dataset, license, rows, startIndex) {
  return rows.map((row, index) => ({
    id: `bench-${lang}-${String(startIndex + index).padStart(2, "0")}`,
    kind: "benchmark",
    source: "en",
    target: lang,
    text: row.source,
    reference: row.target,
    domain: row.domain || "unknown",
    dataset,
    license,
  }));
}

function pairKey(source, target) {
  return `${source}\n${target}`;
}

function dedupeRows(rows) {
  const seen = new Set();
  const unique = [];
  for (const row of rows) {
    const key = pairKey(row.source, row.target);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(row);
  }
  return unique;
}

export function loadExistingBench() {
  try {
    const rows = JSON.parse(fs.readFileSync(BENCHMARK_FILE, "utf8"));
    const map = new Map();
    for (const row of rows) {
      if (row?.kind && row.kind !== "benchmark") continue;
      if (!row?.target || !row?.text || !row?.reference) continue;
      if (!map.has(row.target)) map.set(row.target, []);
      map.get(row.target).push(row);
    }
    for (const list of map.values()) {
      list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }
    return map;
  } catch {
    return new Map();
  }
}

export function expandSample(existing, rows, n, lang) {
  const unique = dedupeRows(rows);
  if (!existing?.length) {
    const more = sampleRows(rows, Math.min(n, unique.length), lang);
    return { kept: [], more, target: more.length, available: unique.length };
  }
  const target = Math.min(n, unique.length);
  const kept = [];
  const keptKeys = new Set();
  for (const item of existing || []) {
    if (kept.length >= target) break;
    const key = pairKey(item.text, item.reference);
    if (keptKeys.has(key)) continue;
    keptKeys.add(key);
    kept.push(item);
  }
  const rest = unique.filter((row) => !keptKeys.has(pairKey(row.source, row.target)));
  const need = Math.max(0, target - kept.length);
  const more = need > 0 ? sampleRows(rest, need, `${lang}:expand:${kept.length}`) : [];
  return { kept, more, target, available: unique.length };
}

function nextBenchIndex(items) {
  let next = 1;
  for (const item of items) {
    const match = String(item.id || "").match(/-(\d+)$/);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return next;
}

async function loadWmt(lang) {
  const file = WMT24_FILES[lang];
  if (!file) return null;
  const dest = rawPath("wmt24pp", file);
  const got = await download(`${WMT_BASE}/${file}`, dest);
  if (got.status !== 200) return { error: got.error || `wmt ${got.status}` };
  const rows = parseJsonl(fs.readFileSync(dest, "utf8"))
    .filter((row) => !row.is_bad_source && row.domain !== "canary")
    .map((row) => {
      const pair = cleanPair(row.source, row.target);
      if (!pair) return null;
      return { ...pair, domain: row.domain || "unknown" };
    })
    .filter(Boolean);
  return { dataset: "wmt24++", license: "Apache-2.0", rows };
}

async function loadFlores(lang, token, englishById) {
  const code = FLORES_PLUS[lang];
  if (!code || !token) return null;
  const headers = { Authorization: `Bearer ${token}` };
  const dest = rawPath("flores_plus", `${code}.jsonl`);
  const got = await download(`${FLORES_FILE}/${code}.jsonl`, dest, headers);
  if (got.status === 401 || got.status === 403) return { gated: true, status: got.status };
  if (got.status !== 200) return { error: got.error || `flores ${got.status}` };
  const rows = parseJsonl(fs.readFileSync(dest, "utf8"));
  const aligned = [];
  for (const row of rows) {
    const id = row.id ?? row.sentence_id ?? row.URL;
    const en = englishById.get(String(id));
    const tgt = row.text || row.sentence;
    if (!en || !tgt) continue;
    const pair = cleanPair(en, tgt);
    if (!pair) continue;
    aligned.push({ ...pair, domain: "wiki" });
  }
  return { dataset: "flores+", license: "CC-BY-SA-4.0", rows: aligned };
}

async function loadFloresEnglish(token) {
  const headers = { Authorization: `Bearer ${token}` };
  const dest = rawPath("flores_plus", "eng_Latn.jsonl");
  const got = await download(`${FLORES_FILE}/eng_Latn.jsonl`, dest, headers);
  if (got.status !== 200) return { map: new Map(), gated: got.status === 401 || got.status === 403, status: got.status };
  const map = new Map();
  for (const row of parseJsonl(fs.readFileSync(dest, "utf8"))) {
    const id = row.id ?? row.sentence_id ?? row.URL;
    const text = row.text || row.sentence;
    if (id != null && text) map.set(String(id), text);
  }
  return { map, gated: false, status: 200 };
}

async function loadNtrex(lang) {
  const code = NTREX_CODES[lang];
  if (!code) return null;
  const srcDest = rawPath("ntrex", "newstest2019-src.eng.txt");
  const refDest = rawPath("ntrex", `newstest2019-ref.${code}.txt`);
  const srcGot = await download(NTREX_SRC, srcDest);
  const refGot = await download(`${NTREX_REF}.${code}.txt`, refDest);
  if (srcGot.status !== 200 || refGot.status !== 200) {
    return { error: `ntrex ${lang} src=${srcGot.status} ref=${refGot.status}` };
  }
  const src = fs.readFileSync(srcDest, "utf8").split(/\r?\n/);
  const ref = fs.readFileSync(refDest, "utf8").split(/\r?\n/);
  const n = Math.min(src.length, ref.length);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const pair = cleanPair(src[i], ref[i]);
    if (pair) rows.push({ ...pair, domain: "news" });
  }
  return { dataset: "ntrex-128", license: "CC-BY-SA-4.0", rows };
}

function unzipTo(zipFile, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  execFileSync("tar", ["-xf", zipFile, "-C", outDir], { windowsHide: true, stdio: "ignore" });
}

// OPUS moses zips hold Tatoeba.en-<code>.en, Tatoeba.en-<code>.<code>, an XML alignment, LICENSE and README.
// Only the two bitext files are read; their lines are parallel.
function findPairFiles(dir, code) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(dir);
  const base = (file) => path.basename(file);
  const src = files.find((file) => base(file) === `Tatoeba.en-${code}.en`);
  const tgt = files.find((file) => base(file) === `Tatoeba.en-${code}.${code}`);
  return { src, tgt, files };
}

async function loadOpusTatoeba(lang) {
  const codes = TATOEBA_CODES[lang];
  if (!codes) return null;
  for (const code of codes) {
    const zip = rawPath("tatoeba", `en-${code}.txt.zip`);
    const got = await download(`${OPUS_TATOEBA}/en-${code}.txt.zip`, zip);
    if (got.status !== 200) continue;
    const outDir = rawPath("tatoeba", `en-${code}`);
    try {
      unzipTo(zip, outDir);
    } catch (error) {
      return { error: `unzip tatoeba ${code}: ${error.message}` };
    }
    const { src, tgt } = findPairFiles(outDir, code);
    if (!src || !tgt) continue;
    const srcLines = fs.readFileSync(src, "utf8").split(/\r?\n/);
    const tgtLines = fs.readFileSync(tgt, "utf8").split(/\r?\n/);
    if (srcLines.length !== tgtLines.length) return { error: `tatoeba ${code}: ${srcLines.length} English lines vs ${tgtLines.length} target lines` };
    const n = srcLines.length;
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      const pair = cleanPair(srcLines[i], tgtLines[i]);
      if (pair) rows.push({ ...pair, domain: "tatoeba" });
    }
    if (rows.length) return { dataset: "tatoeba-opus", license: "CC-BY-2.0", rows };
  }
  return { error: `opus tatoeba missing for ${lang}` };
}

function tatoebaHits(payload, iso) {
  const results = payload.results || payload.data || [];
  const rows = [];
  for (const item of results) {
    const en = item.text;
    const translations = item.translations?.flat?.() || item.translations || [];
    const hit = translations.find((row) => (row.lang || row.language) === iso) || translations[0];
    const pair = cleanPair(en, hit?.text);
    if (pair) rows.push({ ...pair, domain: "tatoeba" });
  }
  return rows;
}

async function loadTatoebaApi(lang) {
  const iso = TATOEBA_ISO3[lang];
  if (!iso) return null;
  const dest = rawPath("tatoeba", `api-${iso}.json`);
  const rows = [];
  const pages = [];
  for (let page = 1; page <= 4 && rows.length < 40; page += 1) {
    const pageFile = rawPath("tatoeba", `api-${iso}-p${page}.json`);
    const url = `https://tatoeba.org/en/api_v0/search?from=eng&to=${iso}&trans_filter=limit&trans_link=direct&orphans=no&unapproved=no&sort=created&limit=100&page=${page}`;
    const got = await download(url, pageFile);
    if (got.status !== 200) break;
    let payload;
    try {
      payload = JSON.parse(fs.readFileSync(pageFile, "utf8"));
    } catch {
      break;
    }
    pages.push(payload);
    rows.push(...tatoebaHits(payload, iso));
    const paging = payload.paging?.Sentences;
    if (paging && paging.nextPage === false) break;
  }
  if (pages.length) writeJson(dest, { pages: pages.length, n: rows.length });
  if (!rows.length) return { error: `tatoeba api empty for ${lang}` };
  return { dataset: "tatoeba-api", license: "CC-BY-2.0", rows };
}

function readJsonIfExists(file) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
}

// Merge freshly collected languages into the existing benchmark and coverage files.
// Only the languages in `langs` are replaced; cases and coverage rows for every other
// language are kept unchanged, so `--langs a,b` can never shrink the files to a subset.
// Pure function (no I/O) so it can be tested.
export function mergeLanguageSubset({ existingCases = [], existingCoverage = null, langs, cases, coverage, missing = [], short = [], meta = {} }) {
  const replaced = new Set(langs);
  const byTarget = (row) => row.target || row.lang;
  const mergedCases = [...existingCases.filter((row) => !replaced.has(byTarget(row))), ...cases];
  mergedCases.sort((a, b) => a.id.localeCompare(b.id) || a.target.localeCompare(b.target));
  const oldCov = existingCoverage || {};
  // Keep the existing language order; replace rows in place and append new languages.
  const fresh = new Map(coverage.map((row) => [row.lang, row]));
  const languages = (oldCov.languages || []).map((row) => fresh.get(row.lang) || row).filter((row) => !replaced.has(row.lang) || fresh.has(row.lang));
  for (const row of coverage) if (!languages.includes(row)) languages.push(row);
  const mergedMissing = [...(oldCov.missing || []).filter((lang) => !replaced.has(lang)), ...missing].sort();
  const mergedShort = [...(oldCov.short || []).filter((row) => !replaced.has(row.lang)), ...short].sort((a, b) => a.lang.localeCompare(b.lang));
  return {
    cases: mergedCases,
    coverage: {
      ...oldCov,
      ...meta,
      bench_per_lang: BENCH_PER_LANG,
      chat_per_lang: null,
      languages,
      missing: mergedMissing,
      short: mergedShort,
      n_cases: mergedCases.length,
      n_benchmark: mergedCases.length,
    },
  };
}

export async function collectData(opts = parseArgs()) {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const langs = targetLangs(opts).filter((code) => code !== "en");
  const token = hfToken();
  let floresEnglish = { map: new Map(), gated: false, status: null };
  const floresProbe = rawPath("flores_plus", "probe-eng_Latn.jsonl");
  const probeHeaders = token ? { Authorization: `Bearer ${token}` } : {};
  const probe = await download(`${FLORES_FILE}/eng_Latn.jsonl`, floresProbe, probeHeaders);
  const floresGated = probe.status === 401 || probe.status === 403;
  if (floresGated) {
    console.log(`FLORES+ gated (HTTP ${probe.status}). No Hugging Face token in the environment. Using WMT24++ plus NTREX-128 / Tatoeba.`);
  } else if (probe.status === 200 && token) {
    floresEnglish = await loadFloresEnglish(token);
  } else if (probe.status === 200) {
    floresEnglish = await loadFloresEnglish("");
  } else {
    console.log(`FLORES+ unavailable (HTTP ${probe.status}). Using WMT24++ plus NTREX-128 / Tatoeba.`);
  }

  const coverage = [];
  const cases = [];
  const missing = [];
  const short = [];
  const existingBench = loadExistingBench();
  const spent = () => loadParetoLedger(false).spent;

  async function fillLang(lang) {
    const attempts = [];
    if (WMT24_FILES[lang]) {
      const wmt = await loadWmt(lang);
      attempts.push(["wmt24++", wmt]);
      if (wmt?.rows?.length) return { lang, pack: wmt, attempts };
    }
    if (!floresGated && FLORES_PLUS[lang]) {
      const flores = await loadFlores(lang, token, floresEnglish.map);
      attempts.push(["flores+", flores]);
      if (flores?.rows?.length) return { lang, pack: flores, attempts };
    }
    if (NTREX_CODES[lang]) {
      const ntrex = await loadNtrex(lang);
      attempts.push(["ntrex-128", ntrex]);
      if (ntrex?.rows?.length) return { lang, pack: ntrex, attempts };
    }
    if (TATOEBA_CODES[lang]) {
      const opus = await loadOpusTatoeba(lang);
      attempts.push(["tatoeba-opus", opus]);
      if (opus?.rows?.length) return { lang, pack: opus, attempts };
      const api = await loadTatoebaApi(lang);
      attempts.push(["tatoeba-api", api]);
      if (api?.rows?.length) return { lang, pack: api, attempts };
    }
    return { lang, pack: null, attempts };
  }

  let loaded = 0;
  const results = await mapPool(langs, 4, async (lang) => {
    const result = await fillLang(lang);
    loaded += 1;
    progress("data", loaded, langs.length, spent());
    return result;
  });
  for (const result of results) {
    const { lang, pack } = result;
    const previous = existingBench.get(lang) || [];
    if (!pack?.rows?.length) {
      if (previous.length) {
        cases.push(...previous);
        coverage.push({
          lang,
          name: languageName(lang),
          dataset: previous[0].dataset || null,
          license: previous[0].license || null,
          n_available: previous.length,
          n_target: BENCH_PER_LANG,
          n_sampled: previous.length,
          n_benchmark: previous.length,
          kept_previous: true,
          error: result.attempts.map((pair) => `${pair[0]}:${pair[1]?.error || pair[1]?.status || "empty"}`).join("; "),
        });
        console.log(`KEPT ${lang} previous=${previous.length} (refresh empty)`);
        continue;
      }
      missing.push(lang);
      coverage.push({
        lang,
        name: languageName(lang),
        dataset: null,
        n_available: 0,
        n_target: BENCH_PER_LANG,
        n_sampled: 0,
        n_benchmark: 0,
        error: result.attempts.map((pair) => `${pair[0]}:${pair[1]?.error || pair[1]?.status || "empty"}`).join("; "),
      });
      console.log(`MISSING ${lang} ${languageName(lang)}`);
      continue;
    }
    const expanded = expandSample(previous, pack.rows, BENCH_PER_LANG, lang);
    const added = toCases(lang, pack.dataset, pack.license, expanded.more, nextBenchIndex(expanded.kept));
    const langCases = [...expanded.kept, ...added];
    cases.push(...langCases);
    const domains = {};
    for (const row of langCases) domains[row.domain || "unknown"] = (domains[row.domain || "unknown"] || 0) + 1;
    if (langCases.length < BENCH_PER_LANG) short.push({ lang, n_sampled: langCases.length, n_available: expanded.available });
    coverage.push({
      lang,
      name: languageName(lang),
      dataset: pack.dataset,
      license: pack.license,
      n_available: expanded.available,
      n_target: BENCH_PER_LANG,
      n_sampled: langCases.length,
      n_benchmark: langCases.length,
      domains,
    });
    console.log(`${lang.padEnd(8)} ${pack.dataset.padEnd(14)} available=${expanded.available} sampled=${langCases.length} kept=${expanded.kept.length} added=${added.length} domains=${JSON.stringify(domains)}`);
  }

  const meta = { seed: SEED, flores_gated: floresGated, flores_status: probe.status, hf_token: Boolean(token) };
  const merged = mergeLanguageSubset({
    existingCases: readJsonIfExists(BENCHMARK_FILE) || [],
    existingCoverage: readJsonIfExists(COVERAGE_FILE),
    langs,
    cases,
    coverage,
    missing,
    short,
    meta,
  });
  writeJson(BENCHMARK_FILE, merged.cases);
  writeJson(COVERAGE_FILE, merged.coverage);
  if (opts.langs?.length) console.log(`--langs ${langs.join(",")}: replaced only those languages; other languages kept from the existing files`);
  console.log(`wrote ${merged.cases.length} benchmark cases for ${coverage.filter((row) => row.n_sampled).length} languages to ${BENCHMARK_FILE}`);
  if (missing.length) console.log(`missing languages: ${missing.join(", ")}`);
  if (short.length) console.log(`short languages: ${short.map((row) => `${row.lang}=${row.n_sampled}/${row.n_available}`).join(", ")}`);
  return { cases, coverage, missing, short, floresGated };
}

if (invokedDirectly(import.meta.url)) {
  collectData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
