// Download WMT24++ (Apache 2.0) and fill remaining languages from FLORES+
// (gated), NTREX-128, or Tatoeba. Sample a fixed-seed 20 segments per language.
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
import { hfToken, invokedDirectly, mulberry32, parseArgs, seedMix, shuffle, targetLangs } from "./lib.mjs";
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

function toCases(lang, dataset, license, rows) {
  return rows.map((row, index) => ({
    id: `bench-${lang}-${String(index + 1).padStart(2, "0")}`,
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

function findPairFiles(dir) {
  const files = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  }
  walk(dir);
  const src = files.find((file) => /\.en$/i.test(file) || /[./]en[./]/i.test(path.basename(file)))
    || files.find((file) => file.endsWith(".en") || /\.eng$/i.test(file));
  const tgt = files.find((file) => file !== src && !/\.en$/i.test(file) && !file.endsWith(".xml"));
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
    const { src, tgt } = findPairFiles(outDir);
    if (!src || !tgt) continue;
    const srcLines = fs.readFileSync(src, "utf8").split(/\r?\n/);
    const tgtLines = fs.readFileSync(tgt, "utf8").split(/\r?\n/);
    const n = Math.min(srcLines.length, tgtLines.length);
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

  const results = await mapPool(langs, 4, fillLang);
  for (const result of results) {
    const { lang, pack } = result;
    if (!pack?.rows?.length) {
      missing.push(lang);
      coverage.push({
        lang,
        name: languageName(lang),
        dataset: null,
        n_available: 0,
        n_sampled: 0,
        error: result.attempts.map((pair) => `${pair[0]}:${pair[1]?.error || pair[1]?.status || "empty"}`).join("; "),
      });
      console.log(`MISSING ${lang} ${languageName(lang)}`);
      continue;
    }
    const sampled = sampleRows(pack.rows, BENCH_PER_LANG, lang);
    const langCases = toCases(lang, pack.dataset, pack.license, sampled);
    cases.push(...langCases);
    const domains = {};
    for (const row of sampled) domains[row.domain] = (domains[row.domain] || 0) + 1;
    coverage.push({
      lang,
      name: languageName(lang),
      dataset: pack.dataset,
      license: pack.license,
      n_available: pack.rows.length,
      n_sampled: sampled.length,
      domains,
    });
    console.log(`${lang.padEnd(8)} ${pack.dataset.padEnd(14)} available=${pack.rows.length} sampled=${sampled.length} domains=${JSON.stringify(domains)}`);
  }

  cases.sort((a, b) => a.id.localeCompare(b.id) || a.target.localeCompare(b.target));
  writeJson(BENCHMARK_FILE, cases);
  writeJson(COVERAGE_FILE, {
    seed: SEED,
    flores_gated: floresGated,
    flores_status: probe.status,
    hf_token: Boolean(token),
    languages: coverage,
    missing,
    n_cases: cases.length,
  });
  console.log(`wrote ${cases.length} benchmark cases for ${coverage.filter((row) => row.n_sampled).length} languages to ${BENCHMARK_FILE}`);
  if (missing.length) console.log(`missing languages: ${missing.join(", ")}`);
  return { cases, coverage, missing, floresGated };
}

if (invokedDirectly(import.meta.url)) {
  collectData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
