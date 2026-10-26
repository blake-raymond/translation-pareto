// End-to-end smoke test on 3 Spanish cases with 2 cheap models and the real judge. Costs about $0.02.
// Usage: node eval/pareto/smoke.mjs   (needs OPENROUTER_API_KEY; writes only under eval/pareto/results/smoke/)
import { spawnSync } from "node:child_process";
import path from "node:path";
import { rootDir } from "../api.mjs";

const ROOT = rootDir();
const out = path.join(ROOT, "eval", "pareto", "results", "smoke");
const env = {
  ...process.env,
  PARETO_PANEL: "google/gemini-2.5-flash-lite,openai/gpt-5-nano",
  PARETO_SUB_BENCH: "2",
  PARETO_SUB_CHAT: "1",
  PARETO_TRANSLATIONS: path.join(out, "translations.json"),
  PARETO_JUDGE_OUT: path.join(out, "judgements.json"),
  PARETO_JUDGE_DIR: path.join(out, "judge"),
  PARETO_JUDGE_BATCH: "3",
  PARETO_REPORT_MD: path.join(out, "results.md"),
  PARETO_REPORT_SVG: path.join(out, "pareto.svg"),
  PARETO_SUMMARY: path.join(out, "summary.json"),
};
for (const script of ["run-translate.mjs", "judge.mjs", "report.mjs"]) {
  console.log(`== ${script}`);
  const run = spawnSync(process.execPath, [path.join(ROOT, "eval", "pareto", script), "--langs", "es"], { env, stdio: "inherit" });
  if (run.status !== 0) process.exit(run.status || 1);
}
console.log(`smoke: OK - report in ${path.relative(ROOT, env.PARETO_REPORT_MD)}`);