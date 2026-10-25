// Spot check: re-judge selected cases with a third judge (x-ai/grok-4.7), same prompt and blind shuffle as run.mjs.
import fs from "node:fs";
import { complete, loadKey, textFromMessage, parseJsonObject, costFromUsage, usageCounts, mapPool } from "./api.mjs";
const src = fs.readFileSync(new URL("./run.mjs", import.meta.url), "utf8");
const grab = (name) => { const i = src.indexOf("function " + name); let d = 0, j = src.indexOf("{", i); const s = j; for (; j < src.length; j++) { if (src[j] === "{") d++; if (src[j] === "}") { d--; if (!d) break; } } return src.slice(i, j + 1); };
const { judgeMessages } = new Function(grab("transcript") + "\n" + grab("judgeMessages") + "\nreturn {judgeMessages};")();
const r = JSON.parse(fs.readFileSync("eval/results/latest.json", "utf8"));
const cases = JSON.parse(fs.readFileSync("eval/cases.json", "utf8"));
const crit = JSON.parse(fs.readFileSync("eval/results/s31-critical.json", "utf8"));
const S = ["google/gemini-3.1-flash-lite", "google/gemini-2.5-flash", "google/gemini-3.5-flash-lite", "x-ai/grok-4.20"];
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const others = cases.filter((c) => !crit.ids.includes(c.id)).sort(() => rnd() - 0.5).slice(0, 16);
const sel = [...cases.filter((c) => crit.ids.includes(c.id)), ...others];
const JUDGE = { slug: "x-ai/grok-4.7", reasoning: { effort: "low" }, temperature: 0.2 };
const key = loadKey();
let cost = 0;
const results = await mapPool(sel, 3, async (item) => {
  const cands = S.map((k) => ({ key: k, output: r.runs.find((x) => x.case_id === item.id && x.slug === k && x.kind === "direct")?.output })).sort(() => rnd() - 0.5).map((c, i) => ({ ...c, label: "ABCD"[i] }));
  const res = await complete(key, JUDGE, judgeMessages(item, cands), 4000);
  const msg = res.payload.choices[0].message;
  cost += Number(res.payload.usage?.cost || 0);
  const parsed = parseJsonObject(textFromMessage(msg));
  const scores = {};
  for (const row of parsed?.scores || []) { const c = cands.find((x) => x.label === row.id); if (c) scores[c.key] = row; }
  return { id: item.id, flagged: crit.ids.includes(item.id), scores };
});
fs.writeFileSync("eval/results/spot-grok47.json", JSON.stringify({ judge: JUDGE.slug, cost, results }, null, 1));
console.log("done cost", cost.toFixed(4), "cases", results.length);
