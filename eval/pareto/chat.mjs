// Draft a synthetic chat layer with Opus 5.5: short multi-turn history, then
// one messy line to translate (typos, missing diacritics, slang, pronouns).
import fs from "node:fs";
import path from "node:path";
import { loadKey, paidChat, parseJsonObject, publicError, writeJson } from "../api.mjs";
import { languageName } from "./languages.mjs";
import { invokedDirectly, loadParetoLedger, parseArgs, progress, targetLangs } from "./lib.mjs";
import { CHAT_FILE, CHAT_PER_LANG, COVERAGE_FILE, PILOT_CHAT_PER_LANG, RESULTS_DIR } from "./meta.mjs";

function catalog() {
  return JSON.parse(fs.readFileSync(new URL("./models.json", import.meta.url), "utf8"));
}

function existingByLang(file) {
  try {
    const rows = JSON.parse(fs.readFileSync(file, "utf8"));
    const map = new Map();
    for (const row of rows) {
      const key = row.lang || (row.source === "en" ? row.target : row.source);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
    return { rows, map };
  } catch {
    return { rows: [], map: new Map() };
  }
}

function parseCases(text) {
  const parsed = parseJsonObject(text);
  const list = Array.isArray(parsed) ? parsed : parsed?.cases;
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const row of list) {
    if (!row || !row.text || !Array.isArray(row.history)) continue;
    const history = row.history
      .filter((turn) => turn && turn.text && turn.lang)
      .map((turn) => ({
        speaker: String(turn.speaker || "A").slice(0, 4),
        lang: String(turn.lang),
        text: String(turn.text).trim(),
      }));
    if (history.length < 3 || history.length > 6) continue;
    out.push({
      source: String(row.source || ""),
      target: String(row.target || ""),
      problem: String(row.problem || "slang"),
      history,
      text: String(row.text).trim(),
      meaning: String(row.meaning || "").trim(),
    });
  }
  return out;
}

function authorMessages(lang, n, avoid = []) {
  const name = languageName(lang);
  const system = [
    "You write evaluation items for a live two-person face-to-face translation chat.",
    "Each item is a short bilingual conversation, then one last line that must be translated.",
    "The last line is messy in a realistic way: typos, missing diacritics or tones, slang, autocorrect, or a pronoun that only history can resolve.",
    "History is 3 to 6 prior turns. Speakers A and B. One speaker uses English, the other uses the target language, as in handing a phone back and forth.",
    "Keep lines short (under 140 characters). Use native script. Do not romanize unless the language is Latin-script.",
    "Return ONLY JSON: {\"cases\":[{...}]}.",
  ].join(" ");
  const user = [
    `Language: ${name} (code ${lang}). Write exactly ${n} cases.`,
    "Half of the cases translate the last line from English into this language. Half go the other way.",
    "Fields per case: source, target, problem (typo|missing-diacritics|slang|pronoun-reference|autocorrect), history (array of {speaker,lang,text}), text (the last line in the source language), meaning (one English sentence stating who/what/how much, for our records; the judge will not see this on chat items).",
    "If missing-diacritics does not apply (for example Japanese or Khmer), use typo, slang, or pronoun-reference instead.",
    "Scenarios: market, taxi, food allergy, hotel, pharmacy dose, directions, small talk.",
    "Do not reuse the same numbers, names, or shops across cases.",
    avoid.length ? `Do not reuse these source lines:\n${avoid.map((text) => `- ${text}`).join("\n")}` : "",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

function cachePath(lang) {
  return path.join(RESULTS_DIR, "cache", "chat", `${lang}.json`);
}

function readCache(lang) {
  try {
    return JSON.parse(fs.readFileSync(cachePath(lang), "utf8"));
  } catch {
    return null;
  }
}

function cacheCases(payload) {
  if (!payload) return [];
  const fromCases = Array.isArray(payload.cases) ? payload.cases : [];
  return parseCases(JSON.stringify(fromCases));
}

function attemptCount(payload) {
  if (Array.isArray(payload?.parts) && payload.parts.length) return payload.parts.length;
  if (payload?.raw || (Array.isArray(payload?.cases) && payload.cases.length)) return 1;
  return 0;
}

const MAX_CHAT_ATTEMPTS = 2;

function langOfRow(row) {
  return row.lang || (row.source === "en" ? row.target : row.source);
}

function nextChatIndex(rows) {
  let next = 1;
  for (const row of rows) {
    const match = String(row.id || "").match(/-(\d+)$/);
    if (match) next = Math.max(next, Number(match[1]) + 1);
  }
  return next;
}

function materialize(lang, parsed, startIndex) {
  return parsed.map((row, index) => ({
    id: `chat-${lang}-${String(startIndex + index).padStart(2, "0")}`,
    kind: "chat",
    lang,
    source: row.source || ((startIndex + index) % 2 === 0 ? "en" : lang),
    target: row.target || ((startIndex + index) % 2 === 0 ? lang : "en"),
    problem: row.problem,
    history: row.history,
    text: row.text,
    meaning: row.meaning,
    license: "synthetic",
  }));
}

function mergeParsed(primary, extra) {
  const seen = new Set();
  const out = [];
  for (const row of [...primary, ...extra]) {
    const key = String(row.text || "").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function writeCoverageChat(counts) {
  try {
    const coverage = JSON.parse(fs.readFileSync(COVERAGE_FILE, "utf8"));
    let nChat = 0;
    for (const row of coverage.languages || []) {
      if (!counts.has(row.lang)) continue;
      row.n_chat = counts.get(row.lang);
      nChat += row.n_chat;
    }
    coverage.chat_per_lang = CHAT_PER_LANG;
    coverage.n_chat = nChat;
    writeJson(COVERAGE_FILE, coverage);
  } catch {
    // Coverage is written by the benchmark stage. Chat still saves its own file.
  }
}

export function chatWork(opts = parseArgs()) {
  const langs = targetLangs(opts);
  const n = opts.pilot ? PILOT_CHAT_PER_LANG : CHAT_PER_LANG;
  const { map } = existingByLang(CHAT_FILE);
  let needsPay = 0;
  let needsWrite = 0;
  let have = 0;
  for (const lang of langs) {
    const rows = (map.get(lang) || []).filter((row) => row.kind === "chat");
    have += Math.min(rows.length, n);
    if (rows.length >= n) continue;
    needsWrite += 1;
    const cached = readCache(lang);
    const parsed = mergeParsed(rows, cacheCases(cached));
    if (parsed.length >= n) continue;
    if (attemptCount(cached) >= MAX_CHAT_ATTEMPTS) continue;
    needsPay += 1;
  }
  return { langs, n, needsPay, needsWrite, pending: needsPay, have, target: langs.length * n };
}

export async function draftChat(opts = parseArgs()) {
  const langs = targetLangs(opts);
  const n = opts.pilot ? PILOT_CHAT_PER_LANG : CHAT_PER_LANG;
  const apiKey = loadKey();
  const ledger = loadParetoLedger(opts.pilot);
  const spec = catalog().authoring;
  const { rows } = existingByLang(CHAT_FILE);
  const byLang = new Map();
  for (const row of rows) {
    const key = langOfRow(row);
    if (!byLang.has(key)) byLang.set(key, []);
    byLang.get(key).push(row);
  }
  console.log(`chat ledger ${ledger.spent.toFixed(4)} / ${ledger.cap} ; need ${n} cases for ${langs.length} languages`);

  let doneCount = 0;
  const queue = langs.map((_, idx) => idx);
  const worker = async () => {
  while (queue.length) {
    const i = queue.shift();
    const lang = langs[i];
    if (ledger.aborted) break;
    const have = (byLang.get(lang) || []).filter((row) => row.kind === "chat")
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const cached = readCache(lang);
    let parsed = mergeParsed(
      have.map((row) => ({
        source: row.source,
        target: row.target,
        problem: row.problem,
        history: row.history,
        text: row.text,
        meaning: row.meaning,
      })),
      cacheCases(cached),
    );
    if (parsed.length < n && attemptCount(cached) < MAX_CHAT_ATTEMPTS) {
      const need = n - parsed.length;
      const maxTokens = Math.min(16000, Math.max(spec.max_tokens, need * 700));
      const result = await paidChat(
        apiKey,
        ledger,
        spec,
        authorMessages(lang, need, parsed.map((row) => row.text)),
        maxTokens,
        { kind: "chat-draft", lang },
        { timeoutMs: 300000, estimateOutputTokens: Math.min(maxTokens, Math.max(2500, need * 500)) },
      );
      let paidCost = result.cost_usd || 0;
      let fresh = result.ok ? parseCases(result.text) : [];
      if (result.ok && fresh.length === 0 && !ledger.aborted) {
        console.log(`${lang} draft parsed 0, retrying once`);
        const retry = await paidChat(
          apiKey,
          ledger,
          spec,
          authorMessages(lang, need, parsed.map((row) => row.text)),
          maxTokens,
          { kind: "chat-draft-retry", lang },
          { timeoutMs: 300000, estimateOutputTokens: Math.min(maxTokens, Math.max(2500, need * 500)) },
        );
        paidCost += retry.cost_usd || 0;
        console.log(`${lang} draft retry $${(retry.cost_usd || 0).toFixed(4)} spent=$${ledger.spent.toFixed(4)}${retry.error ? ` error=${retry.error}` : ""}`);
        if (retry.ok) fresh = parseCases(retry.text);
        if (retry.error === "credits") {
          ledger.aborted = true;
          ledger.reason = "OpenRouter rejected the call for credits.";
        }
      }
      console.log(`${lang} draft need=${need} parsed=${fresh.length} total=${parsed.length + fresh.length} $${paidCost.toFixed(4)} spent=$${ledger.spent.toFixed(4)}${result.error ? ` error=${result.error}` : ""}`);
      if (result.ok) {
        parsed = mergeParsed(parsed, fresh);
        const parts = Array.isArray(cached?.parts) ? [...cached.parts] : [];
        if (!parts.length && attemptCount(cached)) parts.push({ n: cacheCases(cached).length, cost_usd: cached?.cost_usd || 0 });
        parts.push({ n: fresh.length, cost_usd: paidCost });
        writeJson(cachePath(lang), {
          lang,
          raw: cached?.raw || result.text,
          cases: parsed,
          cost_usd: parts.reduce((sum, part) => sum + (Number(part.cost_usd) || 0), 0),
          parts,
        });
      } else if (result.error === "credits") {
        ledger.aborted = true;
        ledger.reason = "OpenRouter rejected the call for credits.";
      }
    } else {
      console.log(`${lang} cached ${Math.min(parsed.length, n)}`);
    }
    const use = parsed.slice(0, n);
    const keptIds = have.filter((row) => use.some((item) => item.text === row.text));
    const usedTexts = new Set(keptIds.map((row) => row.text));
    const appended = materialize(
      lang,
      use.filter((row) => !usedTexts.has(row.text)),
      nextChatIndex(keptIds),
    );
    const sliced = [...keptIds, ...appended].slice(0, n);
    byLang.set(lang, sliced);
    const flat = [];
    for (const list of byLang.values()) flat.push(...list);
    for (const row of rows) {
      if (!langs.includes(langOfRow(row)) && !flat.includes(row)) flat.push(row);
    }
    writeJson(CHAT_FILE, flat.sort((a, b) => String(a.id).localeCompare(String(b.id))));
    doneCount += 1;
    progress("chat", doneCount, langs.length, ledger.spent);
  }
  };
  await Promise.all(Array.from({ length: 6 }, () => worker()));

  const finalRows = [];
  const counts = new Map();
  for (const [lang, list] of byLang) {
    finalRows.push(...list);
    counts.set(lang, list.length);
  }
  for (const row of rows) {
    if (!langs.includes(langOfRow(row))) finalRows.push(row);
  }
  finalRows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  writeJson(CHAT_FILE, finalRows);
  if (!opts.pilot) writeCoverageChat(counts);
  console.log(`chat cases ${finalRows.length} spent $${ledger.spent.toFixed(4)} aborted=${ledger.aborted} ${ledger.reason || ""}`);
  return { cases: finalRows, ledger, langs, n, pending: chatWork(opts).needsPay };
}

if (invokedDirectly(import.meta.url)) {
  draftChat().catch((error) => {
    console.error(publicError(error));
    process.exitCode = 1;
  });
}
