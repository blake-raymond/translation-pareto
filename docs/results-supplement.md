# Supplement: four newer models

> **NOTE (2026-10-25): superseded.** The GPT-6 Luna, Muse Spark 1.3 and MiniMax M3.1 Flash numbers below are affected by a stale-cache bug. One supplement judge batch (`eval/pareto/results/judge-supp/batch-h-5beacf18.json`, 144 cases: the first benchmark and first chat case of every language) was scored while those candidates' translations were still empty, and the cached scores were later re-imported against the real outputs. That left 140 spurious 1/1/1 + critical scores (Muse Spark 83, Luna 53, MiniMax 4), which understate these models' means and overstate their critical-error rates. The bug is fixed in `eval/pareto/judge.mjs`, and all 15 models were re-judged together in one pass; see `docs/results-all15.md`. This file is kept unchanged below for comparison.


Judged on a stratified subsample: the first 10 benchmark and first 5 chat cases per language (fixed file order), 1080 cases (720 benchmark, 360 chat) across 72 languages. Same judge (anthropic/claude-opus-5.5), same rubric and batch format as the main run, but a 6-candidate panel: the 4 new models plus two anchors from the main run (gemini-3.1-flash-lite, deepseek-v4.1-flash-1017). Parse failures: 0.

Scores are 1–5 (mean of meaning, naturalness, handling), macro-averaged over languages; 95% CIs are hierarchical bootstrap (languages, then cases). Paired differences are per case on the same subsample. Cost is measured OpenRouter `usage.cost` per successful translation.

| Model | Mean (95% CI) | Critical | vs gemini-3.1-flash-lite | vs deepseek-v4.1-flash | USD / 1k msgs (n) |
|---|---|---|---|---|---|
| Google: Gemini 3.1 Flash Lite (anchor) | 4.67 (4.61–4.71) | 1.7% | — | +0.14 (0.06 to 0.22) | $0.080 (4245) |
| DeepSeek: DeepSeek V4.1 Flash 1017 (anchor) | 4.53 (4.44–4.61) | 4.4% | -0.14 (-0.22 to -0.06) | — | $0.050 (4245) |
| **OpenAI: GPT-6 Luna** (new) | 4.49 (4.41–4.58) | 7.9% | -0.17 (-0.26 to -0.09) | -0.03 (-0.14 to 0.07) | $0.021 (1080) |
| **Meta: Muse Spark 1.3** (new) | 4.42 (4.34–4.49) | 9.0% | -0.25 (-0.34 to -0.15) | -0.11 (-0.21 to -0.00) | $0.843 (1080) |
| **Z.ai: GLM 5.3 Flash** (new) | 4.31 (4.21–4.41) | 6.5% | -0.36 (-0.46 to -0.26) | -0.22 (-0.32 to -0.10) | $0.025 (4245) |
| **MiniMax: MiniMax M3.1 Flash** (new) | 3.80 (3.59–4.00) | 18.5% | -0.87 (-1.07 to -0.67) | -0.73 (-0.93 to -0.54) | $0.101 (4235) |

## Is the subsample representative?

| Anchor | Main run, all 4,245 cases | Main run, same subsample | Supplement judge pass |
|---|---|---|---|
| gemini-3.1-flash-lite | 4.73 (4.70–4.76) | 4.69 (4.64–4.74) | 4.67 (4.61–4.71) |
| deepseek-v4.1-flash-1017 | 4.56 (4.51–4.61) | 4.57 (4.50–4.64) | 4.53 (4.44–4.61) |

Anchor gap (gemini − deepseek): main judge on subsample +0.12 (0.04 to 0.20), supplement pass +0.14 (0.06 to 0.22).

## Combined Pareto frontier

New models are placed on the main-run scale as gemini-3.1-flash-lite's full-run mean plus their paired gap to it on the subsample. A model is dominated only if another model that is no more expensive is clearly better (paired CI excludes 0; for new vs non-anchor main models, a conservative combined interval).

| Model | Score (main scale) | USD / 1k | Frontier? | Dominated by |
|---|---|---|---|---|
| **gpt-6-luna** (new) | 4.56 ±0.09 | $0.021 | yes | — |
| **glm-5.3-flash** (new) | 4.38 ±0.11 | $0.025 | no | gpt-6-luna |
| gemini-2.5-flash-lite | 4.38 ±0.06 | $0.025 | no | gpt-6-luna |
| gpt-5-nano | 3.17 ±0.16 | $0.030 | no | gemini-2.5-flash-lite, gpt-6-luna, glm-5.3-flash |
| llama-4-maverick | 4.18 ±0.07 | $0.046 | no | gemini-2.5-flash-lite, gpt-6-luna, glm-5.3-flash |
| deepseek-v4.1-flash-1017 | 4.56 ±0.05 | $0.050 | yes | — |
| qwen3-235b-a22b-2507 | 3.86 ±0.16 | $0.051 | no | deepseek-v4.1-flash-1017, gemini-2.5-flash-lite, llama-4-maverick, gpt-6-luna, glm-5.3-flash |
| claude-haiku-5.5 | 4.35 ±0.07 | $0.051 | no | deepseek-v4.1-flash-1017, gpt-6-luna |
| gemini-3.1-flash-lite | 4.73 ±0.03 | $0.080 | yes | — |
| **minimax-m3.1-flash** (new) | 3.86 ±0.20 | $0.101 | no | gemini-3.1-flash-lite, deepseek-v4.1-flash-1017, claude-haiku-5.5, gemini-2.5-flash-lite, llama-4-maverick, gpt-6-luna, glm-5.3-flash |
| gemini-2.5-flash | 4.59 ±0.04 | $0.117 | no | gemini-3.1-flash-lite |
| gemini-3.5-flash-lite | 4.49 ±0.05 | $0.120 | no | gemini-3.1-flash-lite, gemini-2.5-flash, deepseek-v4.1-flash-1017 |
| gpt-5-mini | 4.03 ±0.12 | $0.135 | no | gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-2.5-flash, deepseek-v4.1-flash-1017, claude-haiku-5.5, gemini-2.5-flash-lite, llama-4-maverick, gpt-6-luna, glm-5.3-flash |
| grok-4.20 | 4.36 ±0.05 | $0.265 | no | gemini-3.1-flash-lite, gemini-3.5-flash-lite, gemini-2.5-flash, deepseek-v4.1-flash-1017, gpt-6-luna |
| **muse-spark-1.3** (new) | 4.48 ±0.10 | $0.843 | no | gemini-3.1-flash-lite, gemini-2.5-flash, deepseek-v4.1-flash-1017 |

## Per-language flags for the new models (mean < 3.5 or critical > 25%)

Each language has 15 cases on the subsample, so these cells are noisy.

- **gpt-6-luna**: Svenska (Swedish) 3.91/26.7%, Igbo 4.04/26.7%
- **glm-5.3-flash**: Yorùbá (Yoruba) 3.13/33.3%, Soomaali (Somali) 3.44/26.7%, မြန်မာ (Burmese) 3.49/13.3%, Igbo 3.78/26.7%
- **minimax-m3.1-flash**: Yorùbá (Yoruba) 1.84/80.0%, ລາວ (Lao) 1.89/66.7%, ភាសាខ្មែរ (Khmer) 1.98/73.3%, አማርኛ (Amharic) 2.13/66.7%, Cebuano 2.18/40.0%, Igbo 2.20/80.0%, سنڌي (Sindhi) 2.22/53.3%, Hausa 2.31/60.0%, Kurdî (Kurdish) 2.31/60.0%, မြန်မာ (Burmese) 2.38/46.7%, Soomaali (Somali) 2.64/40.0%, भोजपुरी (Bhojpuri) 2.73/13.3%, සිංහල (Sinhala) 2.96/53.3%, پښتو (Pashto) 3.04/26.7%, Basa Sunda (Sundanese) 3.04/20.0%, Basa Jawa (Javanese) 3.09/26.7%, অসমীয়া (Assamese) 3.16/26.7%, नेपाली (Nepali) 3.22/13.3%, Қазақша (Kazakh) 3.24/33.3%, ଓଡ଼ିଆ (Odia) 3.24/33.3%, isiZulu (Zulu) 3.27/20.0%, اردو (Urdu) 3.80/26.7%
- **muse-spark-1.3**: none

## Settings

- `openai/gpt-6-luna`: reasoning {"effort":"none"}, temperature omitted, max_tokens 1200. Reasoning effort none accepted (0 reasoning tokens). Temperature not in supported_parameters, omitted.
- `z-ai/glm-5.3-flash`: reasoning {"effort":"minimal"}, temperature 0.2, max_tokens 1200. Reasoning is mandatory on OpenRouter (effort none and enabled:false return 400); minimal is the lowest accepted. Temperature 0.2 supported.
- `minimax/minimax-m3.1-flash`: reasoning {"effort":"minimal"}, temperature 0.2, max_tokens 1200. Reasoning is mandatory on OpenRouter (effort none and enabled:false return 400); minimal is the lowest accepted. Temperature 0.2 supported.
- `meta/muse-spark-1.3`: reasoning {"effort":"minimal"}, temperature 0.2, max_tokens 1200. Reasoning is mandatory on OpenRouter (effort none and enabled:false return 400); minimal is the lowest accepted. Temperature 0.2 supported.

Rate limits: gpt-6-luna and muse-spark-1.3 are capped at 20 requests/min for new OpenRouter accounts, so they were translated on the subsample only (throttled to 18 rpm). glm-5.3-flash and minimax-m3.1-flash were translated on all 4,245 cases; their cost/1k uses all of them.

## Caveats on comparability

- **Subsample, not the full set.** New models were judged on 1,080 of the 4,245 cases (10 benchmark + 5 chat per language). The anchors score 4.69/4.57 on this subsample in the main run versus 4.73/4.56 overall, so the subsample is slightly harder for gemini-3.1-flash-lite. Placing new models on the main scale through their paired gap to gemini corrects for that, but adds the anchor's own uncertainty.
- **Different panel, same judge.** Listwise judging scores each candidate relative to the others in the prompt. The supplement panel has 6 candidates instead of 11, so absolute scores can shift. The anchor gap (gemini − deepseek) reproduced closely (+0.12 in the main run on this subsample, +0.14 here), which suggests the drift is small, though it is not zero.
- **Batch size.** One 150-case judge batch was refused by the judge provider (`finish_reason: content_filter`, a false-positive "reverse engineering" refusal). Those 150 cases were re-judged in batches of 30 with the same prompt format. Every other batch used 150, as in the main run.
- **Transient errors.** 11 translations (5 muse-spark, 6 gpt-6-luna; ru/sq/sr benchmark cases) failed on a local ledger-file lock (EPERM) and were re-translated. Stale judge scores for those cases were discarded and the cases re-judged.
- **Cost basis.** gpt-6-luna and muse-spark-1.3 cost/1k comes from 1,080 calls, not 4,245. Muse Spark's reasoning is mandatory (minimal effort), and that drives its roughly 10x higher cost.
- **Frontier call for gpt-6-luna versus gemini-2.5-flash-lite** relies on the conservative combined interval, because they were never judged in the same prompt. Its 7.9% critical-error rate is also the highest of any frontier model (gemini-3.1-flash-lite 1.7%, deepseek 4.4%).
