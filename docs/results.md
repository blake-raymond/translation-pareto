# Pareto translation eval — PILOT

This is a **5-language pilot** (vi, km, ja, ko, es), 10 benchmark + 5 chat cases each, 12 models, one judge (`anthropic/claude-opus-5.5`). It is not the full 73-language run.

## Method

Cases: 75 (50 benchmark, 25 chat) across 5 languages: Español (Spanish), 日本語 (Japanese), ភាសាខ្មែរ (Khmer), 한국어 (Korean), Tiếng Việt (Vietnamese).
Benchmark items are English→xx samples from WMT24++ where available (social and speech preferred, then shorter segments), else NTREX-128, else Tatoeba. FLORES+ is gated on Hugging Face and was not downloaded.
Chat items are synthetic multi-turn conversations drafted by Claude Opus 5.5.
Each candidate used the interpreter system prompt in `eval/prompts/v1.txt` with conversation history on chat items.
One judge, `anthropic/claude-opus-5.5`, scored shuffled anonymous candidates in compact `m,n,h,c` strings. The reference was shown for benchmark items only.
Bootstrap 95% intervals resample languages, then cases within language (2,000 draws, seed 20261025). Language means are equally weighted.
A model is on the Pareto frontier unless another model is **clearly better** (paired bootstrap CI of the difference is entirely positive) **and** the worse model is not cheaper.

## Quality against cost

| Model | Mean | 95% CI | Critical | USD / 1k | n |
| --- | ---: | --- | ---: | ---: | ---: |
| `google/gemini-3.1-flash-lite` | 4.66 | 4.47–4.81 | 1.3% | $0.049 | 75 |
| `google/gemini-2.5-pro` | 4.64 | 4.46–4.77 | 1.3% | $0.995 | 75 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.62 | 4.38–4.82 | 4.0% | $0.035 | 75 |
| `google/gemini-3.5-flash-lite` | 4.50 | 4.26–4.72 | 4.0% | $0.067 | 75 |
| `google/gemini-2.5-flash` | 4.49 | 4.22–4.72 | 4.0% | $0.067 | 75 |
| `x-ai/grok-4.20` | 4.25 | 3.99–4.50 | 8.0% | $0.228 | 75 |
| `anthropic/claude-haiku-5.5` | 4.25 | 3.85–4.57 | 10.7% | $0.031 | 75 |
| `qwen/qwen3-235b-a22b-2507` | 4.24 | 3.75–4.61 | 12.0% | $0.026 | 75 |
| `google/gemini-2.5-flash-lite` | 4.22 | 3.95–4.47 | 9.3% | $0.016 | 75 |
| `meta-llama/llama-4-maverick` | 4.12 | 3.67–4.48 | 14.7% | $0.027 | 75 |
| `openai/gpt-5-mini` | 4.01 | 3.08–4.62 | 17.3% | $0.096 | 75 |
| `openai/gpt-5-nano` | 3.53 | 2.61–4.16 | 22.7% | $0.020 | 75 |

![Pareto scatter](pareto.svg)

## Pareto frontier

- `google/gemini-2.5-flash-lite` — mean 4.22, $0.016 / 1k
- `qwen/qwen3-235b-a22b-2507` — mean 4.24, $0.026 / 1k
- `meta-llama/llama-4-maverick` — mean 4.12, $0.027 / 1k
- `anthropic/claude-haiku-5.5` — mean 4.25, $0.031 / 1k
- `deepseek/deepseek-v4.1-flash-1017` — mean 4.62, $0.035 / 1k
- `google/gemini-3.1-flash-lite` — mean 4.66, $0.049 / 1k
- `google/gemini-2.5-flash` — mean 4.49, $0.067 / 1k
- `google/gemini-3.5-flash-lite` — mean 4.50, $0.067 / 1k
- `google/gemini-2.5-pro` — mean 4.64, $0.995 / 1k

## Paired differences vs the best model

Best mean: `google/gemini-3.1-flash-lite`.

| Model | Mean − best | 95% CI |
| --- | ---: | --- |
| `google/gemini-2.5-pro` | 0.027 | -0.227–0.298 |
| `deepseek/deepseek-v4.1-flash-1017` | 0.037 | -0.213–0.311 |
| `google/gemini-3.5-flash-lite` | 0.155 | -0.129–0.449 |
| `google/gemini-2.5-flash` | 0.170 | -0.062–0.427 |
| `x-ai/grok-4.20` | 0.408 | 0.115–0.720 |
| `anthropic/claude-haiku-5.5` | 0.410 | 0.044–0.818 |
| `qwen/qwen3-235b-a22b-2507` | 0.416 | -0.036–0.929 |
| `google/gemini-2.5-flash-lite` | 0.435 | 0.129–0.733 |
| `meta-llama/llama-4-maverick` | 0.532 | 0.129–0.978 |
| `openai/gpt-5-mini` | 0.645 | 0.009–1.529 |
| `openai/gpt-5-nano` | 1.127 | 0.480–1.965 |

## Per language

| Model | es | ja | km | ko | vi |
| --- | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.1-flash-lite` | 4.87 | 4.58 | 4.64 | 4.76 | 4.44 |
| `google/gemini-2.5-pro` | 4.44 | 4.56 | 4.78 | 4.76 | 4.64 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.60 | 4.89 | 4.49 | 4.76 | 4.38 |
| `google/gemini-3.5-flash-lite` | 4.49 | 4.40 | 4.24 | 4.76 | 4.62 |
| `google/gemini-2.5-flash` | 4.69 | 4.22 | 4.56 | 4.69 | 4.31 |
| `x-ai/grok-4.20` | 4.51 | 4.44 | 4.16 | 4.00 | 4.16 |
| `anthropic/claude-haiku-5.5` | 4.71 | 4.36 | 3.78 | 4.00 | 4.40 |
| `qwen/qwen3-235b-a22b-2507` | 4.42 | 4.62 | 3.31 | 4.38 | 4.49 |
| `google/gemini-2.5-flash-lite` | 4.38 | 4.13 | 3.98 | 4.29 | 4.33 |
| `meta-llama/llama-4-maverick` | 4.51 | 4.13 | 3.36 | 4.22 | 4.38 |
| `openai/gpt-5-mini` | 4.64 | 4.51 | 2.24 | 4.24 | 4.42 |
| `openai/gpt-5-nano` | 4.22 | 4.16 | 1.91 | 3.67 | 3.71 |

## Spend

Pilot spend (OpenRouter `usage.cost`, cap $1.50): **$0.6185**.

| Step | USD |
| --- | ---: |
| Chat drafting | $0.1996 |
| Translations | $0.1243 |
| Judge | $0.2946 |
| Total | $0.6185 |

Measured cost per case (all models + share of drafting and judging): **$0.0082**.
Measured translation cost per model×case: **$0.00014**.

Projected full run for 72 non-English languages × 20 benchmark + 10 chat (linear scale from this pilot): **$17.81**.
Same projection at 73 × 30 cases: **$18.06**.

The full run was not started.

## Limits

LLM-judged, not human-verified. A single Opus judge can favor its own family. Per-language cells are noisy at this sample size. WMT24++ locales (for example Mexican Spanish, Egyptian Arabic) stand in for the language, not every variety.
