// One-shot judge: ALL cases x ALL candidates in a single prompt, compact scores only.
import fs from "node:fs";
import { loadKey, parseJsonObject } from "./api.mjs";
const JUDGE = process.argv[2] || "anthropic/claude-opus-5.5";
const tag = JUDGE.split("/")[1];
const r = JSON.parse(fs.readFileSync("eval/results/latest.json", "utf8"));
const cases = JSON.parse(fs.readFileSync("eval/cases.json", "utf8"));
const slugs = [...new Set(r.runs.filter((x) => x.kind === "direct").map((x) => x.slug))];
let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const L = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const order = {};
const blocks = cases.map((c) => {
  const cands = slugs.map((s) => ({ s, out: r.runs.find((x) => x.case_id === c.id && x.slug === s && x.kind === "direct")?.output || "(empty)" })).sort(() => rnd() - 0.5);
  order[c.id] = cands.map((x) => x.s);
  return [`### CASE ${c.id}`, `Languages: ${c.source} -> ${c.target}; problem: ${c.problem}`, "History:", ...c.history.map((h) => `${h.speaker} (${h.lang}): ${h.text}`), `Source line: ${c.text}`, `Expected meaning (authoritative): ${c.meaning}`, `Reference (one acceptable rendering): ${c.reference}`, ...cands.map((x, i) => `${L[i]}: ${x.out}`)].join("\n");
});
const system = [
  "You score anonymous translations of lines in live travel conversations. For each case there are " + slugs.length + " candidates labelled A to " + L[slugs.length - 1] + ".",
  "The expected-meaning note is authoritative for facts, referents, numbers and speech acts. The reference is one acceptable rendering, not the only one.",
  "For each candidate give integers 1-5 for meaning, naturalness, handling (repair of typos, slang, autocorrect, diacritics, code-switching, honorifics), and critical (1 only for a wrong or reversed meaning, wrong target language, flipped negation, wrong number/dose/price, or offensive mistranslation; awkward wording or a register miss alone is 0).",
  "Judge each case independently. Do not let earlier cases affect later ones.",
  'Return ONLY compact JSON: {"CASE_ID":["m,n,h,c","m,n,h,c", ... one string per candidate in label order A..],...} covering every case.',
].join(" ");
const user = blocks.join("\n\n");
const key = loadKey();
console.log("prompt chars", system.length + user.length, "cases", cases.length, "cands", slugs.length);
const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({ model: JUDGE, messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: 60000, reasoning: { effort: "low" } }),
  signal: AbortSignal.timeout(1500000),
});
const payload = await res.json();
fs.writeFileSync(`eval/results/mega-${tag}-raw.json`, JSON.stringify({ order, slugs, payload }, null, 1));
console.log("status", res.status, "usage", JSON.stringify(payload.usage));
const text = payload.choices?.[0]?.message?.content || "";
const parsed = parseJsonObject(text);
console.log("parsed cases", parsed ? Object.keys(parsed).length : 0);
