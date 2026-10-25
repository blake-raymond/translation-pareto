import path from "node:path";
import { CROSS_PAIRS, DIACRITIC_LANGS, EN_LANGS, PROBLEMS, directionKey, slugCode } from "./meta.mjs";
import { applyTranslations, buildSpecs, contractView, translationJobs } from "./specs.mjs";
import {
  cacheFile,
  hashString,
  mapPool,
  paidChat,
  parseJsonObject,
  publicError,
  readCache,
  rootDir,
  scriptOk,
  writeJson,
} from "./api.mjs";

const LOCALIZER_SYSTEM = [
  "You write native-script lines for a travel translation test.",
  "Translate each english field into the language in lang.",
  "Preserve every number, name, negation, and referent.",
  "Do not add facts.",
  "History lines are fully spelled and natural.",
  "If a job has an error instruction, apply it only to that job.",
  "A clean reference is natural speech and keeps every fact. It is not an explanation.",
  "Keep a Latin token only when the error instruction tells you to.",
  "Return only JSON: {\"items\":[{\"id\":\"...\",\"translations\":[{\"key\":\"history.0\",\"text\":\"...\"}]}]}.",
  "Include every id and every key exactly once.",
].join(" ");

const REVIEWER_SYSTEM = [
  "You audit items for a translation evaluation. You do not score candidate models.",
  "Check that the source, the reference, and the expected-meaning note agree, and that a careful reader could not honestly defend a different number, negation, referent, or speech act.",
  "The meaning note is the contract. The reference must match it. After repairing only the tagged problem, the source must match it. History must force that reading and must not also support a conflicting one.",
  "Drop the item when the repair is not forced. A known bad item said the suitcase was left at 'lobby mall' and the reference changed it to the hotel lobby. Both rooms were coherent, so that item was invalid. Drop anything like it.",
  "Fix the item when the facts are forced but a line has a grammar error, the wrong language, a wrong word, or an unnatural phrase that changes the force of the line.",
  "When you fix, return the full source line, the full reference, and the full history. Do not invent facts. Do not change a line that already matches the English contract unless it is the non-English line you are correcting.",
  "Ok means you would accept the item as written.",
  "Be strict with Burmese, Khmer, Bengali, Arabic, Hindi, Thai, and Vietnamese. If you are not sure a sentence is real language, drop it.",
  "Return only JSON: {\"results\":[{\"id\":\"...\",\"verdict\":\"ok|fix|drop\",\"reasons\":[\"short\"],\"text\":\"...\",\"reference\":\"...\",\"history\":[{\"speaker\":\"A\",\"lang\":\"en\",\"text\":\"...\"}]}]}.",
  "Include every id once. For ok or drop, omit text, reference, and history. For fix, include all three.",
].join(" ");

function chunk(items, size) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function jobsPayload(spec) {
  return { id: spec.id, translations: translationJobs(spec) };
}

function localizedCaseOk(spec, item) {
  const relaxedText = spec.problem === "missing-diacritics" || spec.problem === "typo";
  if (!scriptOk(item.source, item.text, relaxedText && item.source !== "en")) return `${item.id} source script`;
  if (!scriptOk(item.target, item.reference, false)) return `${item.id} reference script`;
  for (const line of item.history) {
    const relaxed = false;
    if (!scriptOk(line.lang, line.text, relaxed)) return `${item.id} history ${line.lang} script`;
  }
  if (item.source !== "en" && item.problem === "code-switching") {
    const needsWifi = /Wi-Fi/.test(spec.textEnglish || "");
    const needsDrug = /paracetamol/i.test(spec.textEnglish || "");
    if (needsWifi && !item.text.includes("Wi-Fi")) return `${item.id} dropped Wi-Fi`;
    if (needsDrug && !/paracetamol/i.test(item.text)) return `${item.id} dropped paracetamol`;
  }
  if (/\b(lobby mall|mall lobby)\b/i.test(item.reference) && /hotel lobby/i.test(item.meaning)) {
    return `${item.id} debatable lobby`;
  }
  return "";
}

async function localizeBatch(apiKey, ledger, model, specs) {
  const body = specs.map(jobsPayload);
  const hash = hashString({ rubric: "localize-v1", model: model.slug, body });
  const file = cacheFile("localize", `${hash}.json`);
  const cached = readCache(file, hash);
  if (cached?.cases) return { cases: cached.cases, cost_usd: 0, cached: true };
  const messages = [
    { role: "system", content: LOCALIZER_SYSTEM },
    { role: "user", content: JSON.stringify({ items: body }) },
  ];
  let lastError = "localize_json";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await paidChat(apiKey, ledger, model, messages, model.max_tokens, {
      kind: "localize",
      batch: specs.map((spec) => spec.id).join(","),
    });
    if (!result.ok) return { cases: null, error: result.error, cost_usd: result.cost_usd || 0 };
    const parsed = parseJsonObject(result.text);
    const items = parsed?.items;
    if (!Array.isArray(items)) {
      lastError = "localize_json";
      continue;
    }
    try {
      const cases = specs.map((spec) => {
        const found = items.find((item) => item.id === spec.id);
        if (!found) throw new Error(`${spec.id} missing from localizer`);
        const built = applyTranslations(spec, found.translations || []);
        const problem = localizedCaseOk(spec, built);
        if (problem) throw new Error(problem);
        return built;
      });
      writeJson(file, { hash, cases });
      return { cases, cost_usd: result.cost_usd || 0, cached: false };
    } catch (error) {
      lastError = publicError(error);
    }
  }
  return { cases: null, error: lastError, cost_usd: 0 };
}

function reviewPayload(spec, item) {
  return {
    contract: contractView(spec),
    item: {
      history: item.history,
      text: item.text,
      reference: item.reference,
    },
  };
}

async function reviewBatch(apiKey, ledger, model, pairs) {
  const body = pairs.map(({ spec, item }) => reviewPayload(spec, item));
  const hash = hashString({ rubric: "review-v1", model: model.slug, body });
  const file = cacheFile("review", `${hash}.json`);
  const cached = readCache(file, hash);
  if (cached?.results) return { results: cached.results, cached: true };
  const messages = [
    { role: "system", content: REVIEWER_SYSTEM },
    { role: "user", content: JSON.stringify({ items: body }) },
  ];
  let lastError = "review_json";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await paidChat(apiKey, ledger, model, messages, model.max_tokens, {
      kind: "review",
      batch: pairs.map(({ spec }) => spec.id).join(","),
    });
    if (!result.ok) return { results: null, error: result.error };
    const parsed = parseJsonObject(result.text);
    if (!parsed || !Array.isArray(parsed.results)) {
      lastError = "review_json";
      continue;
    }
    writeJson(file, { hash, results: parsed.results });
    return { results: parsed.results, cached: false };
  }
  return { results: null, error: lastError };
}

function applyFix(spec, item, fix) {
  if (!fix || fix.verdict !== "fix") return { item, applied: false, reason: "" };
  const next = {
    ...item,
    text: typeof fix.text === "string" && fix.text.trim() ? fix.text.trim() : item.text,
    reference: typeof fix.reference === "string" && fix.reference.trim() ? fix.reference.trim() : item.reference,
  };
  if (Array.isArray(fix.history) && fix.history.length === item.history.length) {
    next.history = item.history.map((line, index) => {
      const replacement = fix.history[index];
      const text = replacement && typeof replacement.text === "string" ? replacement.text.trim() : "";
      if (!text) return line;
      if (line.lang === "en") return line;
      return { speaker: line.speaker, lang: line.lang, text };
    });
  }
  if (spec.text && spec.source === "en") next.text = spec.text;
  if (spec.reference && spec.target === "en") next.reference = spec.reference;
  const problem = localizedCaseOk(spec, next);
  if (problem) return { item, applied: false, reason: problem };
  return { item: next, applied: true, reason: "" };
}

export function assertCoverage(cases) {
  const errors = [];
  if (cases.length < 100) errors.push(`only ${cases.length} cases`);
  const seen = new Set();
  const problems = new Set();
  const byLang = new Map();
  const byDir = new Map();
  for (const item of cases) {
    if (seen.has(item.id)) errors.push(`duplicate ${item.id}`);
    seen.add(item.id);
    const turns = item.history.length + 1;
    if (turns < 3 || turns > 6) errors.push(`${item.id} turns ${turns}`);
    if (!PROBLEMS.includes(item.problem)) errors.push(`${item.id} problem`);
    if (!item.text || !item.reference || !item.meaning) errors.push(`${item.id} empty`);
    problems.add(item.problem);
    const key = directionKey(item.source, item.target);
    byDir.set(key, (byDir.get(key) || 0) + 1);
    if (item.source === "en") byLang.set(item.target, (byLang.get(item.target) || 0) + 1);
    if (item.target === "en") byLang.set(item.source, (byLang.get(item.source) || 0) + 1);
  }
  for (const problem of PROBLEMS) {
    if (!problems.has(problem)) errors.push(`missing problem ${problem}`);
  }
  for (const code of EN_LANGS) {
    const total = byLang.get(code) || 0;
    if (total < 8) errors.push(`${code} has ${total}, need at least 8 across both directions`);
    const toEn = byDir.get(directionKey(code, "en")) || 0;
    const fromEn = byDir.get(directionKey("en", code)) || 0;
    if (toEn < 3 || fromEn < 3) errors.push(`${code} directions ${fromEn}/${toEn}`);
  }
  for (const [source, target] of CROSS_PAIRS) {
    const count = byDir.get(directionKey(source, target)) || 0;
    if (count < 2) errors.push(`${source}→${target} has ${count}`);
  }
  if (![...DIACRITIC_LANGS].some((code) => cases.some((item) => item.problem === "missing-diacritics" && item.source === code))) {
    errors.push("missing-diacritics cases were all dropped");
  }
  if (errors.length) throw new Error(errors.join("; "));
}

export async function prepareCases(apiKey, ledger, catalog) {
  const specs = buildSpecs();
  console.log(`specs ${specs.length}`);
  const localizer = catalog.authoring.localizer;
  const reviewer = catalog.authoring.reviewer;
  const batches = chunk(specs, 4);
  const localized = [];
  for (const batch of batches) {
    if (ledger.aborted) break;
    let result = await localizeBatch(apiKey, ledger, localizer, batch);
    if (!result.cases && result.error !== "spend_cap" && result.error !== "credits") {
      const singles = [];
      let failed = false;
      for (const spec of batch) {
        const one = await localizeBatch(apiKey, ledger, localizer, [spec]);
        if (!one.cases) {
          console.log(`localize failed ${spec.id}: ${one.error}`);
          failed = true;
          break;
        }
        singles.push(...one.cases);
      }
      if (!failed) result = { cases: singles };
    }
    if (!result.cases) {
      ledger.aborted = true;
      ledger.reason = ledger.reason || `localization stopped: ${result.error}`;
      break;
    }
    localized.push(...result.cases);
    console.log(`localized ${localized.length}/${specs.length} spent=$${ledger.spent.toFixed(4)}`);
  }
  if (localized.length !== specs.length) {
    throw new Error(ledger.reason || `localized ${localized.length} of ${specs.length}`);
  }
  const specById = new Map(specs.map((spec) => [spec.id, spec]));
  const reviewBatches = chunk(localized.map((item) => ({ spec: specById.get(item.id), item })), 3);
  const reviews = [];
  for (const batch of reviewBatches) {
    if (ledger.aborted) break;
    let result = await reviewBatch(apiKey, ledger, reviewer, batch);
    if (!result.results && result.error !== "spend_cap" && result.error !== "credits") {
      const singles = [];
      let failed = null;
      for (const pair of batch) {
        const one = await reviewBatch(apiKey, ledger, reviewer, [pair]);
        if (!one.results) {
          failed = one.error;
          break;
        }
        singles.push(...one.results);
      }
      if (!failed) result = { results: singles };
    }
    if (!result.results) {
      ledger.aborted = true;
      ledger.reason = ledger.reason || `review stopped: ${result.error}`;
      break;
    }
    reviews.push(...result.results);
    console.log(`reviewed ${reviews.length}/${localized.length} spent=$${ledger.spent.toFixed(4)}`);
  }
  if (reviews.length !== localized.length) {
    throw new Error(ledger.reason || `reviewed ${reviews.length} of ${localized.length}`);
  }
  const reviewById = new Map(reviews.map((item) => [item.id, item]));
  const log = [];
  const accepted = [];
  for (const item of localized) {
    const spec = specById.get(item.id);
    const review = reviewById.get(item.id) || { verdict: "drop", reasons: ["missing review"] };
    const verdict = review.verdict || "drop";
    if (verdict === "drop") {
      log.push({ id: item.id, verdict: "drop", reasons: review.reasons || [] });
      continue;
    }
    if (verdict === "fix") {
      const fixed = applyFix(spec, item, review);
      if (!fixed.applied) {
        log.push({ id: item.id, verdict: "drop", reasons: [...(review.reasons || []), `fix rejected: ${fixed.reason}`] });
        continue;
      }
      const again = await reviewBatch(apiKey, ledger, reviewer, [{ spec, item: fixed.item }]);
      const second = again.results?.find((row) => row.id === item.id);
      if (!second || second.verdict === "drop" || again.error) {
        log.push({
          id: item.id,
          verdict: "drop",
          reasons: [...(review.reasons || []), "second review did not accept the fix", ...((second && second.reasons) || [])],
        });
        continue;
      }
      if (second.verdict === "fix") {
        const refixed = applyFix(spec, fixed.item, second);
        if (!refixed.applied) {
          log.push({ id: item.id, verdict: "drop", reasons: [...(second.reasons || []), `second fix rejected: ${refixed.reason}`] });
          continue;
        }
        log.push({ id: item.id, verdict: "fix", reasons: [...(review.reasons || []), ...(second.reasons || [])] });
        accepted.push(refixed.item);
        continue;
      }
      log.push({ id: item.id, verdict: "fix", reasons: review.reasons || [] });
      accepted.push(fixed.item);
      continue;
    }
    log.push({ id: item.id, verdict: "ok", reasons: review.reasons || [] });
    accepted.push(item);
  }
  const dropped = log.filter((item) => item.verdict === "drop");
  console.log(`review kept ${accepted.length}, dropped ${dropped.length}`);
  for (const item of dropped) console.log(`drop ${item.id}: ${(item.reasons || []).join(" | ")}`.slice(0, 400));
  const casesFile = path.join(rootDir(), "eval", "cases.json");
  const reviewFile = path.join(rootDir(), "eval", "case-review.json");
  writeJson(casesFile, accepted);
  writeJson(reviewFile, {
    reviewed_at: new Date().toISOString(),
    localizer: localizer.slug,
    reviewer: reviewer.slug,
    specs: specs.length,
    kept: accepted.length,
    dropped: dropped.length,
    results: log,
  });
  assertCoverage(accepted);
  return accepted;
}
