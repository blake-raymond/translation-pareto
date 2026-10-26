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
- **Prompt.** Every model got the same system prompt, [`eval/prompts/interpreter.txt`](eval/prompts/interpreter.txt):

  > You are a professional interpreter for a live face-to-face conversation. Use the full history for pronouns, tone, slang, and references. Be forgiving of typos, missing accents, and bad autocorrect, and infer the intended meaning. Output only the translation with no commentary.

  The user message names the source and target language, includes the conversation history for chat cases, and then the line to translate (`eval/pareto/prompts.mjs`).
- **Model settings.** All calls go through OpenRouter. Reasoning is off where a model allows it and at the lowest accepted effort (`minimal`) otherwise; temperature 0.2 where supported. Exact slugs and settings are in `eval/pareto/models.json` and in the table below.
- **Judging.** One judge, `anthropic/claude-opus-5.5`, sees all 15 candidates for a case at once, shuffled and labelled anonymously, in batches of 30 cases. It returns meaning, naturalness and handling (1-5 each) and a critical-error flag (wrong or reversed meaning, wrong target language, flipped negation, wrong number, dose or price, offensive mistranslation). Benchmark cases show the reference translation as a hint; chat cases have none. Judge verdicts are cached by the exact candidate outputs. All 15 models were judged together in a single pass; the judge prompt and rubric are in `eval/pareto/judge.mjs`.
- **Statistics.** 95% intervals from a hierarchical bootstrap (2,000 draws, seed 20261025) that resamples languages, then cases within language.
- **Frontier rule.** A model is off the frontier only if another model costs no more and is clearly better: the paired bootstrap CI of the per-case difference is entirely above zero.
- **Cost.** OpenRouter `usage.cost` for each successful translation call, including reasoning tokens, per 1,000 messages. Judging and chat drafting are excluded.

### Model settings

| Model slug | Reasoning | Temperature | max_tokens |
| --- | --- | --- | ---: |
| `openai/gpt-6-luna` | effort `none` | omitted | 1200 |
| `google/gemini-3.1-flash-lite` | effort `minimal` | 0.2 | 1200 |
| `meta/muse-spark-1.3` | effort `minimal` | 0.2 | 1200 |
| `google/gemini-2.5-flash` | disabled | 0.2 | 400 |
| `deepseek/deepseek-v4.1-flash-1017` | effort `none` | 0.2 | 800 |
| `google/gemini-3.5-flash-lite` | effort `minimal` | 0.2 | 1200 |
| `google/gemini-2.5-flash-lite` | disabled | 0.2 | 400 |
| `x-ai/grok-4.20` | disabled | 0.2 | 400 |
| `anthropic/claude-haiku-5.5` | effort `none` | omitted | 500 |
| `z-ai/glm-5.3-flash` | effort `minimal` | 0.2 | 1200 |
| `meta-llama/llama-4-maverick` | not sent | 0.2 | 400 |
| `openai/gpt-5-mini` | effort `minimal` | omitted | 1200 |
| `qwen/qwen3-235b-a22b-2507` | not sent | 0.2 | 400 |
| `minimax/minimax-m3.1-flash` | effort `minimal` | 0.2 | 1200 |
| `openai/gpt-5-nano` | effort `minimal` | omitted | 1200 |

## Check the results without spending money

The raw results are committed in `data/results/` (3.4 MB gzip): every translation from every model with its billed cost and token counts, every judge score per case and model, and every judge call with its candidate-to-label order and raw reply. `data/results/manifest.json` lists the system prompt, the panel, file checksums and the SHA-256 of the inputs (prompt, judge code, model settings, case files).

```bash
npm run verify
```

`verify` unpacks the raw results, recomputes every table above "Spend" in `docs/results.md` and the chart `docs/pareto.svg` with `eval/pareto/report.mjs`, and fails if anything differs. It makes no API calls and needs no key. `npm run pareto:sanity` reruns the identical-output check on the same data; its output should match `docs/sanity-all15.txt` except the last line, which compares with an earlier pass whose judgements are not published. `npm test` runs the unit tests. All three are offline.

## Reproduce with money

Requirements: Node.js 20 or newer. There are no npm dependencies (`npm ci` installs nothing). An OpenRouter API key, in the environment (`OPENROUTER_API_KEY`) or in a git-ignored `.openrouter.env` file (`OPENROUTER_API_KEY=...`).

1. **Smoke test** (about $0.02): `npm run smoke` translates 3 Spanish cases with two cheap models, judges them with the real judge and writes a report under `eval/pareto/results/smoke/`.
2. **Cases** are committed: `data/benchmark-cases.json` (2,805) and `data/chat-cases.json` (1,440). To rebuild them:
   - `node eval/pareto/data.mjs --full` downloads WMT24++, NTREX-128 and Tatoeba into `data/raw/` (git-ignored) and samples up to 40 cases per language with seed 20261025. Existing sampled cases are kept, so a rerun on the committed file changes nothing. FLORES+ is used only if `HF_TOKEN` is set and your Hugging Face account has access.
   - `node eval/pareto/chat.mjs --full` drafts 20 chat conversations per language with Claude Opus 5.5 (about $10). Drafting is not deterministic, so new chat cases will differ from the committed ones.
3. **Full run** (about $42: about $10 for translations, about $32 for judging): `bash eval/pareto/run-all15.sh` (Windows: `powershell -File eval/pareto/run-all15.ps1`). It translates every case with all 15 models (retrying empty or failed calls up to three times), judges in batches of 30, retries failed batches in batches of 10, and runs the identical-output check (`eval/pareto/sanity-all15.mjs`). Progress goes to `eval/pareto/results/all15-run.log`; results go to `eval/pareto/results/` (git-ignored).
4. **Report**, with the same environment as the runner:

   ```bash
   export PARETO_ALL15=1 PARETO_PANEL="<same list as in run-all15.sh>" \
     PARETO_TRANSLATIONS=eval/pareto/results/translations-all15.json \
     PARETO_JUDGE_OUT=eval/pareto/results/judgements-all15.json \
     PARETO_JUDGE_DIR=eval/pareto/results/judge-all15
   node eval/pareto/report.mjs --full    # writes docs/results.md and docs/pareto.svg
   node eval/pareto/export-results.mjs   # writes data/results/
   ```

   The "Notes on this pass", "Earlier passes" and "Frontier call" sections of `docs/results.md` were written by hand after the generated report.

**Spend control.** Every paid call is recorded in `eval/pareto/results/ledger.json`. Runs stop at the hard cap in `eval/pareto/meta.mjs` (cumulative, $83.70 with `PARETO_ALL15=1`). Translation and judge results are cached on disk, so an interrupted run resumes without paying twice. Run one process at a time per ledger.

**Rate limits.** New OpenRouter accounts get 20 requests per minute on some models (seen for `openai/gpt-6-luna`). `PARETO_RPM=slug=18,slug=18` throttles named models; the runner sets it for GPT-6 Luna and Muse Spark 1.3. The judge runs three batches at a time.

**Expect some variation.** Model outputs and judge scores are not fully deterministic, so a rerun will not reproduce every score exactly.

## Repository layout

- `docs/results.md`, `docs/pareto.svg`, `docs/pareto.png` - full results and chart.
- `docs/blog.md` - write-up.
- `docs/sanity-all15.txt` - identical-output judge consistency check.
- `data/benchmark-cases.json`, `data/chat-cases.json`, `data/coverage.json` - the cases and per-language counts.
- `data/results/` - raw translations, judge scores and judge calls (gzip) with `manifest.json`.
- `data/LICENSES.md` - sources, licenses and attribution.
- `eval/prompts/interpreter.txt` - the system prompt.
- `eval/api.mjs` - OpenRouter client, spend ledger and caching.
- `eval/pareto/` - the pipeline: `data.mjs` (sampling), `chat.mjs` (chat drafting), `run-translate.mjs`, `judge.mjs`, `report.mjs`, `verify.mjs`, `export-results.mjs`, `smoke.mjs`, `models.json`, `languages.mjs`, `meta.mjs` (caps, seed, paths), `run.mjs` (staged runs), `run-all15.sh`/`.ps1`.

## Limitations

- **LLM judge, no human review.** Scores are what Claude Opus 5.5 thinks. Its judgment is probably weakest in the low-resource languages where models differ most.
- **One judge family.** The judge may favor outputs like its own; the chat cases were also drafted by Claude Opus 5.5. Claude Haiku 5.5 scored mid-table (4.26).
- **Listwise scores are relative** to the 15 candidates in the prompt. Compare models within this table, not with scores from other runs.
- **Wrong references for three languages.** The 75 benchmark cases for Javanese, Odia and Sundanese come from the OPUS Tatoeba download, and their reference translations are misaligned: they contain unrelated text, mostly lines of the Creative Commons license file shipped with the corpus. The judge saw these as reference hints. Every model was judged against the same references, but scores for those three languages are less reliable.
- **Three unscored cases.** The judge returned an empty or cut-off reply on every attempt for `bench-ha-22`, `bench-ha-26` and `chat-lo-09`. They are excluded for all models.
- **Judge label slips.** Of 37,274 pairs of identical outputs, 38 (0.10%) got inconsistent scores (`docs/sanity-all15.txt`).
- **English on one side.** Benchmark cases translate out of English; chat cases translate from or into English. Pairs without English are untested.
- **Noisy per-language cells** (up to 60 cases each), and WMT24++ locales (for example Mexican Spanish) stand in for the whole language.

## License

Code: MIT ([`LICENSE`](LICENSE)). Benchmark sources keep their licenses (WMT24++ Apache 2.0, NTREX-128 CC BY-SA 4.0, Tatoeba CC BY 2.0 FR); model translations of NTREX-128 items in `data/results/` are shared under CC BY-SA 4.0. See [`data/LICENSES.md`](data/LICENSES.md).