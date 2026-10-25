// Draft a synthetic chat layer with Opus 5.5: short multi-turn history, then
// one messy line to translate (typos, missing diacritics, slang, pronouns).
import fs from "node:fs";
import path from "node:path";
import { loadKey, paidChat, parseJsonObject, writeJson } from "../api.mjs";
import { languageName } from "./languages.mjs";
import { invokedDirectly, loadParetoLedger, parseArgs, targetLangs } from "./lib.mjs";
import { CHAT_FILE, CHAT_PER_LANG, PILOT_CHAT_PER_LANG, RESULTS_DIR } from "./meta.mjs";

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

function authorMessages(lang, n) {
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
  ].join("\n");
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

export async function draftChat(opts = parseArgs()) {
  const langs = targetLangs(opts);
  const n = opts.pilot ? PILOT_CHAT_PER_LANG : CHAT_PER_LANG;
  const apiKey = loadKey();
  const ledger = loadParetoLedger(opts.pilot);
  const spec = catalog().authoring;
  const { rows, map } = existingByLang(CHAT_FILE);
  const kept = rows.filter((row) => {
    const key = row.lang || (row.source === "en" ? row.target : row.source);
    if (!langs.includes(key)) return true;
    return (map.get(key) || []).length >= n;
  });
  console.log(`chat ledger ${ledger.spent.toFixed(4)} / ${ledger.cap} ; need ${n} cases for ${langs.length} languages`);

  for (const lang of langs) {
    if (ledger.aborted) break;
    const have = (map.get(lang) || []).filter((row) => row.kind === "chat");
    if (have.length >= n) {
      console.log(`${lang} cached ${have.length}`);
      continue;
    }
    const cacheFile = path.join(RESULTS_DIR, "cache", "chat", `${lang}.json`);
    fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
    let parsed = [];
    if (fs.existsSync(cacheFile)) {
      try {
        parsed = parseCases(JSON.stringify(JSON.parse(fs.readFileSync(cacheFile, "utf8")).cases || []));
      } catch {
        parsed = [];
      }
    }
    if (parsed.length < n) {
      const result = await paidChat(
        apiKey,
        ledger,
        spec,
        authorMessages(lang, n),
        spec.max_tokens,
        { kind: "chat-draft", lang },
        { timeoutMs: 180000, estimateOutputTokens: 3500 },
      );
      console.log(`${lang} draft $${(result.cost_usd || 0).toFixed(4)} spent=$${ledger.spent.toFixed(4)}${result.error ? ` error=${result.error}` : ""}`);
      if (!result.ok) continue;
      parsed = parseCases(result.text);
      writeJson(cacheFile, { lang, raw: result.text, cases: parsed, cost_usd: result.cost_usd });
    } else {
      console.log(`${lang} draft cache hit ${parsed.length}`);
    }
    const sliced = parsed.slice(0, n).map((row, index) => ({
      id: `chat-${lang}-${String(index + 1).padStart(2, "0")}`,
      kind: "chat",
      lang,
      source: row.source || (index % 2 === 0 ? "en" : lang),
      target: row.target || (index % 2 === 0 ? lang : "en"),
      problem: row.problem,
      history: row.history,
      text: row.text,
      meaning: row.meaning,
      license: "synthetic",
    }));
    const others = kept.filter((row) => (row.lang || (row.source === "en" ? row.target : row.source)) !== lang);
    kept.length = 0;
    kept.push(...others, ...sliced);
    map.set(lang, sliced);
    writeJson(CHAT_FILE, kept.sort((a, b) => a.id.localeCompare(b.id)));
  }

  writeJson(CHAT_FILE, kept.sort((a, b) => String(a.id).localeCompare(String(b.id))));
  const finalRows = kept;
  console.log(`chat cases ${finalRows.length} spent $${ledger.spent.toFixed(4)} aborted=${ledger.aborted} ${ledger.reason || ""}`);
  return { cases: finalRows, ledger, langs, n };
}

if (invokedDirectly(import.meta.url)) {
  draftChat().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
