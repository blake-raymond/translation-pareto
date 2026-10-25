import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CAP_USD } from "./meta.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const API_URL = "https://openrouter.ai/api/v1/chat/completions";
export const CACHE_DIR = path.join(ROOT, "eval", "results", "cache");
export const LEDGER_FILE = path.join(ROOT, "eval", "results", "ledger.json");

export function rootDir() {
  return ROOT;
}

export function ensureUtf8Console() {
  if (process.platform !== "win32") return;
  try {
    execFileSync("chcp.com", ["65001"], { stdio: "ignore", windowsHide: true });
  } catch {
    // The report files are still written as UTF-8 when the console cannot switch.
  }
}

export function loadKey() {
  const file = path.join(ROOT, ".openrouter.env");
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    throw new Error("Could not read .openrouter.env");
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    if (trimmed.slice(0, idx).trim() !== "OPENROUTER_API_KEY") continue;
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!value) throw new Error("OPENROUTER_API_KEY is empty");
    return value;
  }
  throw new Error("OPENROUTER_API_KEY is missing from .openrouter.env");
}

export function publicError(error) {
  return String(error?.message || error)
    .replace(/sk-or-[A-Za-z0-9_-]+/g, "[redacted-key]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/https?:\/\/\S+/g, "[redacted-url]")
    .slice(0, 300);
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tmp, file);
}

export function cacheFile(...parts) {
  const safe = parts.map((part) => String(part).replace(/[^a-zA-Z0-9._=-]+/g, "_"));
  return path.join(CACHE_DIR, ...safe);
}

export function readCache(file, hash) {
  try {
    const value = readJson(file);
    if (hash && value.hash !== hash) return null;
    return value;
  } catch {
    return null;
  }
}

export function loadLedger() {
  try {
    const value = readJson(LEDGER_FILE);
    const spent = Number(value.spent_usd);
    return {
      spent: Number.isFinite(spent) ? spent : 0,
      reserved: 0,
      aborted: false,
      reason: "",
      events: Array.isArray(value.events) ? value.events : [],
    };
  } catch {
    return { spent: 0, reserved: 0, aborted: false, reason: "", events: [] };
  }
}

export function saveLedger(ledger) {
  writeJson(LEDGER_FILE, {
    spent_usd: round6(ledger.spent),
    events: ledger.events,
  });
}

function round6(value) {
  return Math.round(value * 1e6) / 1e6;
}

export function estimateUsd(model, inputChars, maxTokens) {
  const inputTokens = Math.ceil(inputChars / 3) + 120;
  const pin = model.prompt_per_million / 1e6;
  const pout = model.completion_per_million / 1e6;
  return inputTokens * pin + maxTokens * pout;
}

export function tryReserve(ledger, estimate) {
  if (ledger.aborted) return false;
  if (ledger.spent + ledger.reserved + estimate > CAP_USD) {
    ledger.aborted = true;
    const projected = ledger.spent + ledger.reserved + estimate;
    ledger.reason = `estimated spend ${projected.toFixed(4)} USD would exceed the ${CAP_USD} USD cap`;
    return false;
  }
  ledger.reserved += estimate;
  return true;
}

export function settle(ledger, estimate, actual, event) {
  ledger.reserved = Math.max(0, ledger.reserved - estimate);
  const cost = Number.isFinite(actual) ? actual : 0;
  ledger.spent += cost;
  if (cost > 0) {
    ledger.events.push({ at: new Date().toISOString(), cost_usd: round6(cost), ...event });
    saveLedger(ledger);
  }
  if (ledger.spent > CAP_USD) {
    ledger.aborted = true;
    ledger.reason = `actual spend ${ledger.spent.toFixed(4)} USD exceeded the ${CAP_USD} USD cap`;
  }
}

export function hashString(value) {
  let hash = 2166136261;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function textFromMessage(message) {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

export function usageCounts(usage) {
  const prompt = Number(usage?.prompt_tokens ?? usage?.input_tokens ?? 0);
  const completion = Number(usage?.completion_tokens ?? usage?.output_tokens ?? 0);
  const reasoning = Number(
    usage?.completion_tokens_details?.reasoning_tokens
    ?? usage?.output_tokens_details?.reasoning_tokens
    ?? 0,
  );
  const cached = Number(
    usage?.prompt_tokens_details?.cached_tokens
    ?? usage?.input_tokens_details?.cached_tokens
    ?? 0,
  );
  return {
    prompt_tokens: Number.isFinite(prompt) ? prompt : 0,
    completion_tokens: Number.isFinite(completion) ? completion : 0,
    reasoning_tokens: Number.isFinite(reasoning) ? reasoning : 0,
    cached_tokens: Number.isFinite(cached) ? cached : 0,
  };
}

export function costFromUsage(usage, model, counts) {
  const raw = usage?.cost ?? usage?.total_cost;
  const parsed = raw == null ? NaN : Number(raw);
  if (Number.isFinite(parsed)) return parsed;
  const pin = model.prompt_per_million / 1e6;
  const pout = model.completion_per_million / 1e6;
  return counts.prompt_tokens * pin + counts.completion_tokens * pout;
}

async function postChat(apiKey, body) {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  });
  const raw = await response.text();
  let payload = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || raw.slice(0, 300) || response.statusText;
    const error = new Error(`HTTP ${response.status}: ${message}`);
    error.status = response.status;
    const retryAfter = Number(response.headers.get("retry-after"));
    if (Number.isFinite(retryAfter)) error.retryAfter = retryAfter;
    throw error;
  }
  return payload;
}

function retryableStatus(error) {
  const status = error?.status;
  if (status === 429 || status === 408 || status === 502 || status === 503 || status === 504) return true;
  if (status === 402 && /in-flight/i.test(String(error.message || ""))) return true;
  return error?.name === "TimeoutError";
}

export function creditBlocked(error) {
  return error?.status === 402 && !/in-flight/i.test(String(error?.message || ""));
}

async function withRetry(fn) {
  let last = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      last = error;
      if (!retryableStatus(error) || attempt === 5) throw error;
      const floor = error.status === 429 || error.status === 402 ? 8000 : 1000;
      const wait = Math.min(Math.max((error.retryAfter || (2 ** attempt)) * 1000, floor), 30000);
      await sleep(wait);
    }
  }
  throw last;
}

function reasoningVariants(model) {
  if (!model.reasoning) return [undefined];
  const variants = [model.reasoning];
  if (model.reasoning.enabled === false) variants.push({ effort: "none" });
  if (model.reasoning.effort === "none") variants.push({ enabled: false });
  return variants;
}

function mandatoryReasoning(error) {
  return error?.status === 400 && /mandatory/i.test(String(error?.message || ""));
}

function requestBody(model, messages, maxTokens, temperature, reasoning) {
  const body = { model: model.slug, max_tokens: maxTokens, messages };
  if (temperature != null) body.temperature = temperature;
  if (reasoning) body.reasoning = reasoning;
  return body;
}

export async function complete(apiKey, model, messages, maxTokens) {
  const temperature = model.temperature == null ? null : model.temperature;
  const reasonings = reasoningVariants(model);
  const attempts = [];
  for (const reasoning of reasonings) attempts.push([temperature, reasoning || null]);
  if (temperature != null) {
    for (const reasoning of reasonings) attempts.push([null, reasoning || null]);
  }
  if (reasonings.some(Boolean)) attempts.push([temperature, null]);
  attempts.push([null, null]);
  const seen = new Set();
  let lastError = null;
  let mandatory = false;
  async function once(temp, reasoning) {
    const key = JSON.stringify([temp, reasoning]);
    if (seen.has(key)) return null;
    seen.add(key);
    try {
      const payload = await withRetry(() => postChat(apiKey, requestBody(model, messages, maxTokens, temp, reasoning)));
      return {
        payload,
        temperature: temp,
        reasoning,
        dropped_controls: temp == null && temperature != null || JSON.stringify(reasoning ?? null) !== JSON.stringify(model.reasoning ?? null),
      };
    } catch (error) {
      lastError = error;
      if (mandatoryReasoning(error)) mandatory = true;
      if (error.status !== 400) throw error;
      return null;
    }
  }
  for (const [temp, reasoning] of attempts) {
    if (!reasoning && mandatory) continue;
    const result = await once(temp, reasoning);
    if (result) return result;
  }
  const fallbacks = mandatory
    ? [[temperature, { effort: "minimal" }], [temperature, { effort: "low" }]]
    : [];
  for (const [temp, reasoning] of fallbacks) {
    const result = await once(temp, reasoning);
    if (result) return result;
  }
  throw lastError;
}

export async function mapPool(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      out[index] = await fn(items[index], index);
    }
  }
  const workers = Math.min(limit, items.length) || 0;
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

export function parseJsonObject(text) {
  const trimmed = String(text || "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
}

export function scriptOk(lang, text, relaxed) {
  const value = String(text || "");
  if (!value.trim()) return false;
  if (value.includes("\uFFFD")) return false;
  const has = (re) => re.test(value);
  if (lang === "th") return has(/[\u0E00-\u0E7F]/);
  if (lang === "my") return has(/[\u1000-\u109F]/);
  if (lang === "km") return has(/[\u1780-\u17FF]/);
  if (lang === "zh-CN") return has(/[\u4E00-\u9FFF]/);
  if (lang === "ja") return has(/[\u3040-\u30FF\u4E00-\u9FFF]/);
  if (lang === "ko") return has(/[\uAC00-\uD7AF]/);
  if (lang === "hi") return has(/[\u0900-\u097F]/);
  if (lang === "bn") return has(/[\u0980-\u09FF]/);
  if (lang === "ar") return has(/[\u0600-\u06FF]/);
  if (lang === "vi") {
    const otherScript = /[\u0E00-\u0E7F\u1000-\u109F\u1780-\u17FF\u3040-\u30FF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0900-\u097F\u0980-\u09FF]/.test(value);
    if (otherScript || !/[A-Za-z]/.test(value)) return false;
    if (relaxed) return true;
    return has(/[ăâêôơưáàảãạéèẻẽẹíìỉĩịóòỏõọúùủũụýỳỷỹỵđĂÂÊÔƠƯÁÀẢÃẠÉÈẺẼẸÍÌỈĨỊÓÒỎÕỌÚÙỦŨỤÝỲỶỸỴĐ]/);
  }
  if (lang === "es") {
    if (relaxed) return has(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]/);
    return has(/[A-Za-zÁÉÍÓÚÜÑáéíóúüñ¿¡]/);
  }
  if (lang === "id" || lang === "en") return has(/[A-Za-z]/);
  return value.trim().length > 0;
}

export async function paidChat(apiKey, ledger, model, messages, maxTokens, event) {
  const inputChars = messages.map((message) => message.content.length).join("").length;
  const estimate = estimateUsd(model, inputChars, maxTokens);
  if (!tryReserve(ledger, estimate)) {
    return { ok: false, error: "spend_cap", cost_usd: 0, estimate };
  }
  try {
    const result = await complete(apiKey, model, messages, maxTokens);
    const counts = usageCounts(result.payload?.usage);
    const cost = costFromUsage(result.payload?.usage, model, counts);
    settle(ledger, estimate, cost, { ...event, slug: model.slug });
    return {
      ok: true,
      text: textFromMessage(result.payload?.choices?.[0]?.message),
      cost_usd: cost,
      temperature: result.temperature,
      reasoning: result.reasoning,
      dropped_controls: Boolean(result.dropped_controls),
      ...counts,
      cost_source: result.payload?.usage?.cost == null ? "list_price" : "usage.cost",
    };
  } catch (error) {
    settle(ledger, estimate, 0, { ...event, slug: model.slug, error: true });
    return {
      ok: false,
      error: creditBlocked(error) ? "credits" : publicError(error),
      status: error?.status || 0,
      cost_usd: 0,
    };
  }
}
