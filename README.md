# translation-pareto

A reproducible benchmark of the cost-versus-quality frontier of LLMs for **conversational translation**: short, informal chat messages with conversation history, typos, missing diacritics, slang and pronoun references, plus standard benchmark sentences, across 72 languages. Costs are what OpenRouter billed, including reasoning tokens.

15 models, 4,245 cases, one listwise LLM judge (Claude Opus 5.5) scoring all 15 candidates for a case together, with hierarchical bootstrap confidence intervals. Full results: [`docs/results.md`](docs/results.md). Write-up: [`docs/blog.md`](docs/blog.md).

## Results

![Translation quality vs cost](docs/pareto.svg)

| Model | Mean (95% CI) | Critical errors | USD / 1k messages |
| --- | --- | ---: | ---: |
| GPT-6 Luna | **4.69** (4.66-4.72) | 2.1% | $0.032 |
| Gemini 3.1 Flash-Lite | 4.66 (4.62-4.69) | 1.5% | $0.080 |
| Muse Spark 1.3 | 4.64 (4.61-4.67) | 0.8% | $0.973 |
| Gemini 2.5 Flash | 4.48 (4.43-4.52) | 2.8% | $0.117 |
| DeepSeek V4.1 Flash | 4.47 (4.41-4.52) | 3.6% | $0.050 |
| Gemini 3.5 Flash-Lite | 4.40 (4.35-4.44) | 3.7% | $0.120 |
| Gemini 2.5 Flash-Lite | 4.27 (4.22-4.33) | 5.9% | $0.025 |
| Grok 4.20 | 4.27 (4.21-4.32) | 4.5% | $0.265 |
| Claude Haiku 5.5 | 4.26 (4.18-4.32) | 5.1% | $0.051 |
| GLM 5.3 Flash | 4.23 (4.15-4.31) | 6.5% | $0.025 |
| Llama 4 Maverick | 4.08 (4.01-4.15) | 7.6% | $0.046 |
| GPT-5 mini | 3.93 (3.81-4.06) | 11.4% | $0.135 |
| Qwen3 235B A22B | 3.77 (3.61-3.93) | 16.2% | $0.051 |
| MiniMax M3.1 Flash | 3.55 (3.38-3.73) | 22.1% | $0.101 |
| GPT-5 nano | 3.09 (2.93-3.24) | 30.2% | $0.030 |

Mean is the average of meaning, naturalness and handling (1-5), with each language weighted equally. n = 4,242 scored cases for every model.

**Pareto frontier:** GLM 5.3 Flash and Gemini 2.5 Flash-Lite (both $0.025) and GPT-6 Luna ($0.032). Gemini 3.1 Flash-Lite is just off it: Luna is cheaper and leads by 0.033 (95% CI 0.000 to 0.065), a borderline call. Gemini 3.1 Flash-Lite and Muse Spark 1.3 have lower critical-error rates than Luna. Per-language tables, benchmark-only and chat-only splits, and language flags are in [`docs/results.md`](docs/results.md).

## Method

- **Cases.** 72 non-English languages, up to 40 benchmark and 20 chat cases each: 2,805 benchmark and 1,440 chat cases. Benchmark cases translate from English and come from WMT24++ (social and speech domains and shorter segments preferred), else NTREX-128, else Tatoeba. FLORES+ is gated and was not used. Chat cases are synthetic multi-turn conversations drafted by Claude Opus 5.5 with history, typos, slang and references; 723 translate from English and 717 into English. Cases are committed in `data/`, with per-language counts in `data/coverage.json` and source licenses in `data/LICENSES.md`.
- **Prompt.** Every model got the same system prompt, [`eval/prompts/v1.txt`](eval/prompts/v1.txt):

  > You are a professional interpreter for a live face-to-face conversation. Use the full history for pronouns, tone, slang, and references. Be forgiving of typos, missing accents, and bad autocorrect, and infer the intended meaning. Output only the translation with no commentary.

  The user message names the source and target language, includes the conversation history for chat cases, and then the line to translate (`eval/pareto/prompts.mjs`).
- **Model settings.** All calls go through OpenRouter. Reasoning is off where a model allows it and at the lowest accepted effort (`minimal`) otherwise; temperature 0.2 where supported. Per-model settings are in `eval/pareto/models.json`.
- **Judging.** One judge, `anthropic/claude-opus-5.5`, sees all 15 candidates for a case at once, shuffled and labelled anonymously, in batches of 30 cases. It returns meaning, naturalness and handling (1-5 each) and a critical-error flag (wrong or reversed meaning, wrong target language, flipped negation, wrong number, dose or price, offensive mistranslation). Benchmark cases show the reference translation as a hint; chat cases have none. Judge verdicts are cached by the exact candidate outputs. All 15 models were judged together in a single pass.
- **Statistics.** 95% intervals from a hierarchical bootstrap (2,000 draws, seed 20261025) that resamples languages, then cases within language.
- **Frontier rule.** A model is off the frontier only if another model costs no more and is clearly better: the paired bootstrap CI of the per-case difference is entirely above zero.
- **Cost.** OpenRouter `usage.cost` for each successful translation call, including reasoning tokens, per 1,000 messages. Judging and chat drafting are excluded.

## Reproducing

Requirements: Node.js 20+, an OpenRouter API key. Optional: `HF_TOKEN` to include FLORES+ when resampling data.

```bash
echo "OPENROUTER_API_KEY=sk-or-..." > .openrouter.env   # git-ignored
npm test                                                # judge cache tests, no API calls
bash eval/pareto/run-all15.sh                           # Windows: powershell -File eval/pareto/run-all15.ps1
```

`run-all15.sh` sets the 15-model panel, translates every case with every model (retrying empty or failed calls), judges in batches of 30, retries failed batches in batches of 10, and runs the identical-output check (`eval/pareto/sanity-all15.mjs`). Progress goes to `eval/pareto/results/all15-run.log`. Then write the report and chart with the same environment:

```bash
export PARETO_ALL15=1 PARETO_PANEL="<same list as in run-all15.sh>" \
  PARETO_TRANSLATIONS=eval/pareto/results/translations-all15.json \
  PARETO_JUDGE_OUT=eval/pareto/results/judgements-all15.json \
  PARETO_JUDGE_DIR=eval/pareto/results/judge-all15
node eval/pareto/report.mjs --full    # writes docs/results.md and docs/pareto.svg
```

The "Notes on this pass", "Earlier passes" and "Frontier call" sections of `docs/results.md` were written by hand after the generated report.

**Cost.** From the committed cases, a full rerun costs about $42: about $10 for translations and about $32 for judging (about $0.0075 per case). The whole project, including drafting the chat cases, pilots and earlier passes, cost $78.67. Every paid call is recorded in `eval/pareto/results/ledger.json`; the run stops at the hard cap in `eval/pareto/meta.mjs`. Judge output varies somewhat between runs.

Resampling the cases (`node eval/pareto/data.mjs`, `node eval/pareto/chat.mjs`) uses a fixed seed but changes the chat cases, since they are drafted by an LLM.

Raw translations and judge outputs (`eval/pareto/results/`, about 50 MB) are not committed.

## Repository layout

- `docs/results.md`, `docs/pareto.svg`, `docs/pareto.png` - full results and chart.
- `docs/blog.md` - write-up.
- `docs/sanity-all15.txt` - identical-output judge consistency check.
- `docs/translation-model-comparison.md` - an earlier 120-case pilot (12 languages, two judges) with the same system prompt.
- `data/` - sampled benchmark and chat cases, coverage and licenses. Raw downloads go to `data/raw/` (git-ignored).
- `eval/prompts/v1.txt` - the system prompt.
- `eval/pareto/` - the benchmark harness: `data.mjs` (sampling), `chat.mjs` (chat drafting), `run-translate.mjs`, `judge.mjs`, `report.mjs`, `models.json`, `meta.mjs` (caps, seed, paths), `run.mjs` (pilot and staged runs), `run-all15.sh`/`.ps1`.
- `eval/*.mjs` - the harness for the 120-case pilot. It imports the prompt module (`src/worker.js`) of the translation app it was built for, which is not in this repo, so it is kept for reference and does not run on its own.

## Limitations

- **LLM judge, no human review.** Scores are what Claude Opus 5.5 thinks. Its judgment is probably weakest in the low-resource languages where models differ most.
- **One judge family.** The judge may favor outputs like its own; the chat cases were also drafted by Claude Opus 5.5. Claude Haiku 5.5 scored mid-table (4.26).
- **Listwise scores are relative** to the 15 candidates in the prompt. Compare models within this table, not with scores from other runs.
- **Three unscored cases.** The judge returned an empty or cut-off reply on every attempt for `bench-ha-22`, `bench-ha-26` and `chat-lo-09`. They are excluded for all models.
- **Judge label slips.** Of 37,274 pairs of identical outputs, 38 (0.10%) got inconsistent scores (`docs/sanity-all15.txt`).
- **English on one side.** Benchmark cases translate out of English; chat cases translate from or into English. Pairs without English are untested.
- **Noisy per-language cells** (up to 60 cases each), and WMT24++ locales (for example Mexican Spanish) stand in for the whole language.

## License

Code: MIT ([`LICENSE`](LICENSE)). Benchmark data keeps its source licenses; see [`data/LICENSES.md`](data/LICENSES.md).