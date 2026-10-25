import fs from "node:fs";

const text = fs.readFileSync(new URL("../.openrouter.env", import.meta.url), "utf8");
let key = "";
for (const line of text.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const idx = trimmed.indexOf("=");
  if (idx === -1) continue;
  if (trimmed.slice(0, idx).trim() !== "OPENROUTER_API_KEY") continue;
  key = trimmed.slice(idx + 1).trim().replace(/^['"]|['"]$/g, "");
}
if (!key) {
  console.error("missing key");
  process.exit(1);
}
const response = await fetch("https://openrouter.ai/api/v1/models", {
  headers: { Authorization: `Bearer ${key}` },
});
console.log("status", response.status);
if (!response.ok) {
  const body = await response.text();
  console.error(body.slice(0, 400).replace(key, "[redacted]"));
  process.exit(1);
}
const data = await response.json();
const models = data.data || [];
const slim = models.map((model) => ({
  id: model.id,
  name: model.name,
  prompt: model.pricing?.prompt,
  completion: model.pricing?.completion,
  request: model.pricing?.request,
  supported_parameters: model.supported_parameters,
  context_length: model.context_length,
}));
fs.mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
fs.writeFileSync(new URL("./results/.catalog-raw.json", import.meta.url), JSON.stringify(slim, null, 2));
const needles = ["grok", "gemini", "claude", "gpt-5", "gpt-oss", "deepseek", "qwen", "llama-4", "gemma", "mistral"];
const hits = models.filter((model) => needles.some((needle) => model.id.toLowerCase().includes(needle)));
for (const model of hits) {
  const pin = Number(model.pricing?.prompt || 0) * 1e6;
  const pout = Number(model.pricing?.completion || 0) * 1e6;
  console.log(`${model.id}\t${pin.toFixed(3)}/${pout.toFixed(3)}\t${model.name || ""}`);
}
console.log("TOTAL", models.length, "HITS", hits.length);
