#!/usr/bin/env bash
# Combined 15-model run (bash). Windows version: run-all15.ps1. One process at a time on the ledger.
set -u
cd "$(dirname "$0")/../.."
log=eval/pareto/results/all15-run.log
mkdir -p eval/pareto/results
L() { echo "$(date +%Y-%m-%dT%H:%M:%S) $*" | tee -a "$log"; }
export PARETO_ALL15=1
export PARETO_PANEL='google/gemini-3.1-flash-lite,google/gemini-3.5-flash-lite,google/gemini-2.5-flash,deepseek/deepseek-v4.1-flash-1017,anthropic/claude-haiku-5.5,qwen/qwen3-235b-a22b-2507,x-ai/grok-4.20,google/gemini-2.5-flash-lite,meta-llama/llama-4-maverick,openai/gpt-5-mini,openai/gpt-5-nano,openai/gpt-6-luna,z-ai/glm-5.3-flash,minimax/minimax-m3.1-flash,meta/muse-spark-1.3'
export PARETO_RPM='openai/gpt-6-luna=18,meta/muse-spark-1.3=18'
export PARETO_TRANSLATIONS=eval/pareto/results/translations-all15.json
export PARETO_JUDGE_DIR=eval/pareto/results/judge-all15
export PARETO_JUDGE_OUT=eval/pareto/results/judgements-all15.json
unset PARETO_SUB_BENCH PARETO_SUB_CHAT PARETO_MAX_BATCHES
L "START translate"
bad=1
for i in 1 2 3; do
  node eval/pareto/run-translate.mjs --full >>"$log" 2>&1
  bad=$(node -e "const t=require('./eval/pareto/results/translations-all15.json');console.log(t.runs.filter(r=>!r.output||!r.output.trim()||r.error).length)")
  L "translate pass $i bad=$bad"
  [ "$bad" -eq 0 ] && break
done
if [ "$bad" -ne 0 ]; then L "STOP: $bad empty/errored translations remain"; exit 2; fi
L "START judge batch 30"
PARETO_JUDGE_BATCH=30 node eval/pareto/judge.mjs --full >>"$log" 2>&1
L "judge retry pass batch 10 (refused/failed batches only)"
PARETO_JUDGE_BATCH=10 node eval/pareto/judge.mjs --full >>"$log" 2>&1
node eval/pareto/sanity-all15.mjs eval/pareto/results/judgements-all15.json eval/pareto/results/translations-all15.json >>"$log" 2>&1
L "DONE"