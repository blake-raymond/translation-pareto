# Combined 15-model run (Windows PowerShell). Bash version: run-all15.sh. One process at a time on the ledger.
$ErrorActionPreference = 'Continue'
Set-Location (Join-Path $PSScriptRoot '..\..')
$log = 'eval\pareto\results\all15-run.log'
function L($m) { "$(Get-Date -Format s) $m" | Tee-Object -FilePath $log -Append }
$env:PARETO_ALL15 = '1'
$env:PARETO_PANEL = 'google/gemini-3.1-flash-lite,google/gemini-3.5-flash-lite,google/gemini-2.5-flash,deepseek/deepseek-v4.1-flash-1017,anthropic/claude-haiku-5.5,qwen/qwen3-235b-a22b-2507,x-ai/grok-4.20,google/gemini-2.5-flash-lite,meta-llama/llama-4-maverick,openai/gpt-5-mini,openai/gpt-5-nano,openai/gpt-6-luna,z-ai/glm-5.3-flash,minimax/minimax-m3.1-flash,meta/muse-spark-1.3'
$env:PARETO_RPM = 'openai/gpt-6-luna=18,meta/muse-spark-1.3=18'
$env:PARETO_TRANSLATIONS = 'eval/pareto/results/translations-all15.json'
$env:PARETO_JUDGE_DIR = 'eval/pareto/results/judge-all15'
$env:PARETO_JUDGE_OUT = 'eval/pareto/results/judgements-all15.json'
Remove-Item Env:PARETO_SUB_BENCH, Env:PARETO_SUB_CHAT, Env:PARETO_MAX_BATCHES -ErrorAction SilentlyContinue
L "START translate"
for ($i = 1; $i -le 3; $i++) {
  node eval/pareto/run-translate.mjs --full *>> $log
  $bad = node -e "const t=require('./eval/pareto/results/translations-all15.json');const b=t.runs.filter(r=>!r.output||!r.output.trim()||r.error);console.log(b.length)"
  L "translate pass $i bad=$bad"
  if ([int]$bad -eq 0) { break }
}
if ([int]$bad -ne 0) { L "STOP: $bad empty/errored translations remain"; exit 2 }
L "START judge batch 30"
$env:PARETO_JUDGE_BATCH = '30'
node eval/pareto/judge.mjs --full *>> $log
L "judge retry pass batch 10 (refused/failed batches only)"
$env:PARETO_JUDGE_BATCH = '10'
node eval/pareto/judge.mjs --full *>> $log
node eval/pareto/sanity-all15.mjs eval/pareto/results/judgements-all15.json eval/pareto/results/translations-all15.json *>> $log
L "DONE"
