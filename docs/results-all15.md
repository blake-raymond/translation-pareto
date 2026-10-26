# Pareto translation eval

Full run: 72 non-English languages, up to 40 benchmark and 20 chat cases each (fewer when the source set is shorter), 15 models judged together in one listwise pass (15 candidates per case, batches of 30), one judge (`anthropic/claude-opus-5.5`).

## Method

Cases: 4245 (2805 benchmark, 1440 chat) across 72 languages.
Scored cases: 4242. Judge parse failures: 3.
Benchmark items are English→xx samples from WMT24++ where available (social and speech preferred, then shorter segments), else NTREX-128, else Tatoeba. FLORES+ is gated on Hugging Face and was not downloaded. Languages with fewer than 40 clean segments use every available segment; counts are in `data/coverage.json`.
Chat items are synthetic multi-turn conversations drafted by Claude Opus 5.5. The pilot's chat cases are kept and extended, not replaced.
Each candidate used the interpreter system prompt in `eval/prompts/v1.txt` with conversation history on chat items.
One judge, `anthropic/claude-opus-5.5`, scored shuffled anonymous candidates in compact `m,n,h,c` strings. The reference was shown for benchmark items only.
Bootstrap 95% intervals resample languages, then cases within language (2,000 draws, seed 20261025). Language means are equally weighted.
A model is on the Pareto frontier unless another model is **clearly better** (paired bootstrap CI of the difference is entirely positive) **and** the worse model is not cheaper.
USD / 1k is billed OpenRouter `usage.cost` on successful translation calls, including reasoning tokens, times 1,000. It does not include the judge or the chat drafter.
A cheap model costs at most $0.10 per 1,000 messages. A language is flagged when any cheap model has mean below 3.5 or a critical rate above 25% on that language.

## Quality against cost

| Model | Mean | 95% CI | Critical | USD / 1k | n |
| --- | ---: | --- | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 4.69 | 4.66–4.72 | 2.1% | $0.032 | 4242 |
| `google/gemini-3.1-flash-lite` | 4.66 | 4.62–4.69 | 1.5% | $0.080 | 4242 |
| `meta/muse-spark-1.3` | 4.64 | 4.61–4.67 | 0.8% | $0.973 | 4242 |
| `google/gemini-2.5-flash` | 4.48 | 4.43–4.52 | 2.8% | $0.117 | 4242 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.47 | 4.41–4.52 | 3.6% | $0.050 | 4242 |
| `google/gemini-3.5-flash-lite` | 4.40 | 4.35–4.44 | 3.7% | $0.120 | 4242 |
| `google/gemini-2.5-flash-lite` | 4.27 | 4.22–4.33 | 5.9% | $0.025 | 4242 |
| `x-ai/grok-4.20` | 4.27 | 4.21–4.32 | 4.5% | $0.265 | 4242 |
| `anthropic/claude-haiku-5.5` | 4.26 | 4.18–4.32 | 5.1% | $0.051 | 4242 |
| `z-ai/glm-5.3-flash` | 4.23 | 4.15–4.31 | 6.5% | $0.025 | 4242 |
| `meta-llama/llama-4-maverick` | 4.08 | 4.01–4.15 | 7.6% | $0.046 | 4242 |
| `openai/gpt-5-mini` | 3.93 | 3.81–4.06 | 11.4% | $0.135 | 4242 |
| `qwen/qwen3-235b-a22b-2507` | 3.77 | 3.61–3.93 | 16.2% | $0.051 | 4242 |
| `minimax/minimax-m3.1-flash` | 3.55 | 3.38–3.73 | 22.1% | $0.101 | 4242 |
| `openai/gpt-5-nano` | 3.09 | 2.93–3.24 | 30.2% | $0.030 | 4242 |

![Pareto scatter](pareto.svg)

## Pareto frontier

- `z-ai/glm-5.3-flash` — mean 4.23 (4.15–4.31), critical 6.5%, $0.025 / 1k
- `google/gemini-2.5-flash-lite` — mean 4.27 (4.22–4.33), critical 5.9%, $0.025 / 1k
- `openai/gpt-6-luna` — mean 4.69 (4.66–4.72), critical 2.1%, $0.032 / 1k

## Paired differences vs the best model

Best mean: `openai/gpt-6-luna`.

| Model | Mean − best | 95% CI |
| --- | ---: | --- |
| `google/gemini-3.1-flash-lite` | 0.033 | 0.000–0.065 |
| `meta/muse-spark-1.3` | 0.051 | 0.008–0.090 |
| `google/gemini-2.5-flash` | 0.213 | 0.174–0.252 |
| `deepseek/deepseek-v4.1-flash-1017` | 0.225 | 0.176–0.287 |
| `google/gemini-3.5-flash-lite` | 0.295 | 0.249–0.343 |
| `google/gemini-2.5-flash-lite` | 0.417 | 0.373–0.464 |
| `x-ai/grok-4.20` | 0.426 | 0.377–0.475 |
| `anthropic/claude-haiku-5.5` | 0.434 | 0.374–0.501 |
| `z-ai/glm-5.3-flash` | 0.458 | 0.384–0.532 |
| `meta-llama/llama-4-maverick` | 0.612 | 0.553–0.674 |
| `openai/gpt-5-mini` | 0.758 | 0.641–0.884 |
| `qwen/qwen3-235b-a22b-2507` | 0.917 | 0.776–1.067 |
| `minimax/minimax-m3.1-flash` | 1.143 | 0.988–1.315 |
| `openai/gpt-5-nano` | 1.608 | 1.455–1.759 |

## Benchmark cases

| Model | Mean | 95% CI | Critical | USD / 1k | n |
| --- | ---: | --- | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 4.67 | 4.62–4.71 | 1.7% | $0.034 | 2803 |
| `google/gemini-3.1-flash-lite` | 4.62 | 4.58–4.66 | 1.3% | $0.085 | 2803 |
| `meta/muse-spark-1.3` | 4.59 | 4.55–4.63 | 0.7% | $0.946 | 2803 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.43 | 4.35–4.49 | 3.2% | $0.053 | 2803 |
| `google/gemini-2.5-flash` | 4.42 | 4.35–4.47 | 3.0% | $0.127 | 2803 |
| `google/gemini-3.5-flash-lite` | 4.31 | 4.25–4.38 | 4.2% | $0.130 | 2803 |
| `google/gemini-2.5-flash-lite` | 4.22 | 4.15–4.29 | 5.4% | $0.026 | 2803 |
| `x-ai/grok-4.20` | 4.21 | 4.15–4.27 | 4.1% | $0.252 | 2803 |
| `anthropic/claude-haiku-5.5` | 4.20 | 4.12–4.28 | 4.5% | $0.055 | 2803 |
| `z-ai/glm-5.3-flash` | 4.17 | 4.07–4.25 | 6.2% | $0.026 | 2803 |
| `meta-llama/llama-4-maverick` | 4.00 | 3.93–4.07 | 6.7% | $0.047 | 2803 |
| `openai/gpt-5-mini` | 3.85 | 3.71–3.98 | 11.0% | $0.144 | 2803 |
| `qwen/qwen3-235b-a22b-2507` | 3.65 | 3.47–3.80 | 16.5% | $0.057 | 2803 |
| `minimax/minimax-m3.1-flash` | 3.47 | 3.29–3.63 | 20.4% | $0.106 | 2803 |
| `openai/gpt-5-nano` | 3.04 | 2.87–3.20 | 28.9% | $0.032 | 2803 |

Best benchmark mean: `openai/gpt-6-luna`.

| Model | Mean − best | 95% CI |
| --- | ---: | --- |
| `google/gemini-3.1-flash-lite` | 0.046 | 0.005–0.086 |
| `meta/muse-spark-1.3` | 0.077 | 0.028–0.123 |
| `deepseek/deepseek-v4.1-flash-1017` | 0.243 | 0.180–0.315 |
| `google/gemini-2.5-flash` | 0.249 | 0.199–0.298 |
| `google/gemini-3.5-flash-lite` | 0.353 | 0.289–0.420 |
| `google/gemini-2.5-flash-lite` | 0.445 | 0.388–0.498 |
| `x-ai/grok-4.20` | 0.458 | 0.395–0.517 |
| `anthropic/claude-haiku-5.5` | 0.465 | 0.392–0.538 |
| `z-ai/glm-5.3-flash` | 0.500 | 0.419–0.582 |
| `meta-llama/llama-4-maverick` | 0.663 | 0.596–0.733 |
| `openai/gpt-5-mini` | 0.814 | 0.683–0.952 |
| `qwen/qwen3-235b-a22b-2507` | 1.022 | 0.868–1.190 |
| `minimax/minimax-m3.1-flash` | 1.200 | 1.040–1.365 |
| `openai/gpt-5-nano` | 1.623 | 1.455–1.785 |

## Chat cases

| Model | Mean | 95% CI | Critical | USD / 1k | n |
| --- | ---: | --- | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 4.74 | 4.70–4.79 | 2.9% | $0.029 | 1439 |
| `meta/muse-spark-1.3` | 4.74 | 4.70–4.78 | 1.0% | $1.026 | 1439 |
| `google/gemini-3.1-flash-lite` | 4.74 | 4.69–4.78 | 1.7% | $0.070 | 1439 |
| `google/gemini-2.5-flash` | 4.61 | 4.56–4.66 | 2.4% | $0.098 | 1439 |
| `google/gemini-3.5-flash-lite` | 4.57 | 4.51–4.62 | 2.8% | $0.099 | 1439 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.56 | 4.50–4.61 | 4.3% | $0.044 | 1439 |
| `x-ai/grok-4.20` | 4.39 | 4.32–4.45 | 5.3% | $0.289 | 1439 |
| `google/gemini-2.5-flash-lite` | 4.39 | 4.31–4.46 | 6.7% | $0.023 | 1439 |
| `anthropic/claude-haiku-5.5` | 4.38 | 4.29–4.46 | 6.3% | $0.042 | 1439 |
| `z-ai/glm-5.3-flash` | 4.37 | 4.27–4.45 | 6.9% | $0.023 | 1439 |
| `meta-llama/llama-4-maverick` | 4.24 | 4.14–4.32 | 9.3% | $0.044 | 1439 |
| `openai/gpt-5-mini` | 4.09 | 3.96–4.22 | 12.2% | $0.118 | 1439 |
| `qwen/qwen3-235b-a22b-2507` | 4.02 | 3.85–4.18 | 15.7% | $0.039 | 1439 |
| `minimax/minimax-m3.1-flash` | 3.72 | 3.53–3.91 | 25.3% | $0.093 | 1439 |
| `openai/gpt-5-nano` | 3.19 | 3.03–3.35 | 32.7% | $0.026 | 1439 |

Best chat mean: `openai/gpt-6-luna`.

| Model | Mean − best | 95% CI |
| --- | ---: | --- |
| `meta/muse-spark-1.3` | 0.002 | -0.051–0.055 |
| `google/gemini-3.1-flash-lite` | 0.008 | -0.046–0.060 |
| `google/gemini-2.5-flash` | 0.138 | 0.079–0.196 |
| `google/gemini-3.5-flash-lite` | 0.178 | 0.117–0.242 |
| `deepseek/deepseek-v4.1-flash-1017` | 0.184 | 0.122–0.246 |
| `x-ai/grok-4.20` | 0.358 | 0.288–0.429 |
| `google/gemini-2.5-flash-lite` | 0.358 | 0.286–0.432 |
| `anthropic/claude-haiku-5.5` | 0.364 | 0.285–0.446 |
| `z-ai/glm-5.3-flash` | 0.379 | 0.289–0.478 |
| `meta-llama/llama-4-maverick` | 0.509 | 0.424–0.600 |
| `openai/gpt-5-mini` | 0.653 | 0.527–0.781 |
| `qwen/qwen3-235b-a22b-2507` | 0.723 | 0.586–0.873 |
| `minimax/minimax-m3.1-flash` | 1.030 | 0.853–1.224 |
| `openai/gpt-5-nano` | 1.549 | 1.388–1.706 |

## Per language

| Language | gpt-6-luna | gemini-3.1-flash-lite | muse-spark-1.3 | gemini-2.5-flash | deepseek-v4.1-flash-1017 | gemini-3.5-flash-lite | gemini-2.5-flash-lite | grok-4.20 | claude-haiku-5.5 | glm-5.3-flash | llama-4-maverick | gpt-5-mini | qwen3-235b-a22b-2507 | minimax-m3.1-flash | gpt-5-nano |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| af | 4.74 | 4.88 | 4.83 | 4.70 | 4.79 | 4.59 | 4.67 | 4.69 | 4.67 | 4.63 | 4.61 | 4.43 | 4.29 | 4.21 | 3.86 |
| am | 4.62 | 4.57 | 4.47 | 4.37 | 4.24 | 4.26 | 4.07 | 3.79 | 4.32 | 3.66 | 3.89 | 2.59 | 2.11 | 2.17 | 1.53 |
| ar | 4.52 | 4.64 | 4.54 | 4.34 | 4.51 | 4.33 | 4.17 | 4.20 | 4.18 | 4.41 | 3.97 | 4.16 | 3.92 | 3.73 | 3.42 |
| as | 4.71 | 4.66 | 4.63 | 4.38 | 4.34 | 4.18 | 4.08 | 4.12 | 3.70 | 3.97 | 4.11 | 3.34 | 3.79 | 2.73 | 2.49 |
| az | 4.87 | 4.83 | 4.73 | 4.73 | 4.63 | 4.63 | 4.44 | 4.66 | 4.24 | 4.22 | 4.37 | 4.22 | 4.14 | 4.03 | 3.31 |
| bg | 4.68 | 4.71 | 4.58 | 4.36 | 4.55 | 4.46 | 4.16 | 4.41 | 4.21 | 4.12 | 4.12 | 4.30 | 4.06 | 3.92 | 3.34 |
| bho | 4.70 | 4.57 | 4.86 | 4.51 | 4.33 | 4.23 | 4.12 | 4.11 | 4.22 | 3.97 | 3.93 | 4.07 | 2.84 | 2.76 | 3.27 |
| bn | 4.81 | 4.78 | 4.78 | 4.57 | 4.73 | 4.50 | 4.47 | 4.54 | 4.56 | 4.49 | 4.29 | 3.79 | 4.31 | 4.11 | 2.81 |
| ca | 4.75 | 4.76 | 4.62 | 4.29 | 4.57 | 4.50 | 4.42 | 4.46 | 4.33 | 4.53 | 4.18 | 4.24 | 4.24 | 3.88 | 3.46 |
| ceb | 4.48 | 4.40 | 4.55 | 4.43 | 4.27 | 4.02 | 4.02 | 3.76 | 3.78 | 3.89 | 3.66 | 3.85 | 3.43 | 2.23 | 2.96 |
| cs | 4.49 | 4.59 | 4.54 | 4.38 | 4.39 | 4.38 | 4.24 | 4.19 | 4.18 | 4.19 | 3.84 | 4.10 | 3.90 | 3.98 | 3.23 |
| da | 4.78 | 4.70 | 4.74 | 4.52 | 4.55 | 4.29 | 4.44 | 4.43 | 4.23 | 4.47 | 4.28 | 4.37 | 4.28 | 4.47 | 3.84 |
| de | 4.81 | 4.64 | 4.54 | 4.50 | 4.59 | 4.60 | 4.37 | 4.44 | 4.55 | 4.50 | 4.33 | 4.48 | 4.54 | 4.58 | 3.98 |
| el | 4.80 | 4.69 | 4.68 | 4.51 | 4.53 | 4.27 | 4.43 | 4.52 | 4.42 | 4.38 | 4.27 | 4.41 | 3.92 | 3.96 | 3.51 |
| es | 4.81 | 4.76 | 4.58 | 4.57 | 4.57 | 4.60 | 4.43 | 4.46 | 4.48 | 4.58 | 4.33 | 4.53 | 4.43 | 4.16 | 4.05 |
| fa | 4.79 | 4.75 | 4.71 | 4.59 | 4.45 | 4.44 | 4.39 | 4.41 | 4.28 | 4.31 | 4.08 | 4.19 | 3.87 | 4.27 | 3.13 |
| fi | 4.67 | 4.67 | 4.53 | 4.42 | 4.59 | 4.23 | 4.27 | 3.99 | 4.08 | 4.24 | 3.86 | 4.13 | 3.74 | 3.68 | 3.27 |
| fr | 4.72 | 4.60 | 4.39 | 4.24 | 4.37 | 4.45 | 4.23 | 4.43 | 4.55 | 4.52 | 4.18 | 4.39 | 4.21 | 4.28 | 3.84 |
| gu | 4.71 | 4.60 | 4.64 | 4.57 | 4.53 | 4.36 | 4.38 | 4.11 | 4.47 | 4.24 | 4.24 | 3.23 | 4.00 | 3.46 | 1.94 |
| ha | 4.64 | 4.66 | 4.72 | 4.47 | 4.45 | 4.26 | 4.15 | 3.94 | 4.22 | 4.06 | 3.55 | 4.15 | 1.94 | 2.58 | 3.07 |
| he | 4.82 | 4.76 | 4.68 | 4.39 | 4.48 | 4.44 | 4.47 | 4.43 | 4.35 | 4.41 | 4.21 | 3.96 | 3.62 | 3.62 | 3.17 |
| hi | 4.65 | 4.71 | 4.69 | 4.36 | 4.46 | 4.51 | 4.30 | 4.17 | 4.48 | 4.57 | 4.21 | 3.99 | 4.15 | 4.13 | 3.13 |
| hr | 4.71 | 4.60 | 4.56 | 4.44 | 4.46 | 4.36 | 4.39 | 4.36 | 4.33 | 4.21 | 4.23 | 4.28 | 3.86 | 4.16 | 3.46 |
| hu | 4.71 | 4.61 | 4.57 | 4.39 | 4.44 | 4.02 | 4.04 | 4.36 | 4.16 | 4.14 | 4.18 | 3.99 | 3.90 | 3.82 | 3.03 |
| hy | 4.72 | 4.78 | 4.76 | 4.72 | 4.67 | 4.72 | 4.31 | 4.33 | 4.52 | 4.54 | 4.30 | 3.70 | 3.98 | 3.22 | 2.67 |
| id | 4.75 | 4.74 | 4.62 | 4.61 | 4.64 | 4.64 | 4.58 | 4.55 | 4.70 | 4.71 | 4.48 | 4.43 | 4.67 | 4.18 | 3.80 |
| ig | 4.41 | 4.39 | 4.58 | 4.32 | 4.43 | 4.14 | 3.73 | 4.02 | 3.13 | 4.01 | 3.49 | 3.57 | 2.18 | 2.08 | 2.90 |
| it | 4.72 | 4.68 | 4.59 | 4.31 | 4.58 | 4.50 | 4.37 | 4.35 | 4.33 | 4.56 | 4.17 | 4.43 | 4.16 | 4.34 | 3.67 |
| ja | 4.72 | 4.62 | 4.62 | 4.40 | 4.58 | 4.60 | 4.27 | 4.26 | 4.30 | 4.49 | 4.07 | 4.41 | 4.27 | 3.44 | 3.64 |
| jv | 4.68 | 4.56 | 4.68 | 4.46 | 4.39 | 4.14 | 4.14 | 4.12 | 4.34 | 3.96 | 4.08 | 4.04 | 3.84 | 2.79 | 2.94 |
| kk | 4.51 | 4.61 | 4.60 | 4.51 | 4.38 | 4.37 | 4.29 | 4.01 | 4.14 | 4.27 | 4.01 | 4.08 | 3.58 | 3.47 | 2.94 |
| km | 4.80 | 4.72 | 4.66 | 4.63 | 4.53 | 4.30 | 4.26 | 4.36 | 4.07 | 3.96 | 3.93 | 2.97 | 3.68 | 2.62 | 1.96 |
| kn | 4.79 | 4.64 | 4.79 | 4.55 | 4.59 | 4.38 | 4.12 | 4.20 | 4.36 | 4.21 | 4.13 | 2.94 | 4.04 | 3.11 | 2.16 |
| ko | 4.61 | 4.63 | 4.67 | 4.49 | 4.51 | 4.59 | 4.21 | 4.27 | 4.11 | 4.34 | 4.09 | 4.23 | 4.30 | 3.83 | 3.41 |
| ku | 4.06 | 4.20 | 4.65 | 3.64 | 3.94 | 4.12 | 3.38 | 3.91 | 3.88 | 3.47 | 3.70 | 2.72 | 2.62 | 2.32 | 1.63 |
| lo | 4.39 | 4.75 | 4.66 | 4.45 | 4.23 | 4.37 | 4.16 | 4.20 | 4.28 | 3.98 | 3.97 | 2.66 | 3.97 | 2.28 | 1.72 |
| ml | 4.79 | 4.61 | 4.71 | 4.59 | 4.43 | 4.43 | 4.37 | 4.18 | 4.46 | 4.26 | 4.11 | 2.68 | 3.78 | 2.77 | 2.09 |
| mr | 4.79 | 4.65 | 4.73 | 4.51 | 4.54 | 4.51 | 4.39 | 4.29 | 4.36 | 4.23 | 4.02 | 3.69 | 3.96 | 3.61 | 2.81 |
| ms | 4.76 | 4.77 | 4.67 | 4.59 | 4.53 | 4.60 | 4.59 | 4.42 | 4.59 | 4.48 | 4.36 | 4.36 | 4.51 | 4.13 | 4.10 |
| my | 4.74 | 4.64 | 4.80 | 4.57 | 4.47 | 4.23 | 4.24 | 4.18 | 3.96 | 3.70 | 4.17 | 2.81 | 3.81 | 2.54 | 1.87 |
| ne | 4.61 | 4.63 | 4.61 | 4.48 | 4.45 | 4.34 | 4.37 | 4.19 | 4.11 | 4.29 | 4.06 | 4.03 | 3.89 | 3.54 | 3.14 |
| nl | 4.70 | 4.62 | 4.52 | 4.42 | 4.44 | 4.37 | 4.29 | 4.27 | 4.25 | 4.41 | 4.28 | 4.29 | 4.16 | 4.31 | 3.57 |
| no | 4.73 | 4.69 | 4.62 | 4.57 | 4.66 | 4.44 | 4.32 | 4.39 | 4.46 | 4.54 | 4.30 | 4.48 | 4.16 | 4.22 | 3.94 |
| or | 4.88 | 4.72 | 4.84 | 4.68 | 4.69 | 4.66 | 4.51 | 4.45 | 4.71 | 4.44 | 4.26 | 3.62 | 4.08 | 3.04 | 2.44 |
| pa | 4.86 | 4.86 | 4.73 | 4.70 | 4.75 | 4.60 | 4.55 | 4.27 | 4.42 | 4.27 | 3.97 | 3.81 | 3.74 | 3.33 | 2.58 |
| pl | 4.77 | 4.75 | 4.57 | 4.46 | 4.31 | 4.52 | 4.32 | 4.19 | 4.16 | 4.37 | 4.16 | 4.41 | 3.94 | 4.14 | 3.56 |
| ps | 4.69 | 4.58 | 4.48 | 4.61 | 4.21 | 4.19 | 4.21 | 3.88 | 3.83 | 4.07 | 4.08 | 4.03 | 2.63 | 3.09 | 2.97 |
| pt | 4.82 | 4.71 | 4.68 | 4.56 | 4.66 | 4.66 | 4.58 | 4.61 | 4.56 | 4.61 | 4.27 | 4.62 | 4.52 | 4.52 | 3.92 |
| ro | 4.65 | 4.73 | 4.74 | 4.57 | 4.54 | 4.49 | 4.26 | 4.54 | 4.42 | 4.33 | 4.33 | 4.19 | 4.10 | 4.30 | 3.61 |
| ru | 4.77 | 4.57 | 4.59 | 4.51 | 4.44 | 4.44 | 4.44 | 4.32 | 4.47 | 4.51 | 4.28 | 4.21 | 4.33 | 4.41 | 3.44 |
| sd | 4.74 | 4.62 | 4.58 | 4.61 | 4.37 | 4.03 | 4.17 | 3.96 | 3.74 | 3.83 | 3.80 | 3.68 | 3.37 | 1.89 | 2.46 |
| si | 4.82 | 4.72 | 4.66 | 4.58 | 4.48 | 4.31 | 4.37 | 3.89 | 4.06 | 4.09 | 4.09 | 2.94 | 3.32 | 2.93 | 2.01 |
| sk | 4.77 | 4.77 | 4.72 | 4.44 | 3.35 | 4.59 | 4.26 | 4.41 | 4.14 | 4.46 | 3.94 | 4.11 | 3.82 | 3.86 | 3.44 |
| so | 4.62 | 4.47 | 4.52 | 4.44 | 4.36 | 4.19 | 4.10 | 4.23 | 3.57 | 3.41 | 3.43 | 3.78 | 2.05 | 2.44 | 3.00 |
| sq | 4.77 | 4.87 | 4.68 | 4.74 | 4.59 | 4.50 | 4.40 | 4.46 | 4.30 | 4.20 | 4.38 | 4.39 | 4.01 | 3.84 | 3.59 |
| sr | 4.66 | 4.66 | 4.59 | 4.41 | 4.47 | 4.46 | 4.11 | 4.37 | 4.12 | 4.36 | 4.16 | 4.12 | 3.73 | 3.83 | 3.14 |
| su | 4.86 | 4.76 | 4.71 | 4.75 | 4.60 | 4.55 | 4.47 | 4.44 | 4.30 | 4.12 | 4.23 | 4.39 | 3.54 | 3.15 | 3.75 |
| sv | 4.66 | 4.64 | 4.64 | 4.68 | 4.58 | 4.44 | 4.47 | 4.42 | 4.37 | 4.42 | 4.22 | 4.44 | 4.13 | 4.19 | 3.83 |
| sw | 4.67 | 4.63 | 4.52 | 4.50 | 4.29 | 4.27 | 4.22 | 4.08 | 4.34 | 3.61 | 3.71 | 3.77 | 2.80 | 3.06 | 2.64 |
| ta | 4.72 | 4.75 | 4.75 | 4.62 | 4.58 | 4.58 | 4.42 | 4.23 | 4.58 | 4.40 | 4.31 | 3.03 | 4.05 | 3.54 | 1.94 |
| te | 4.66 | 4.59 | 4.61 | 4.42 | 4.43 | 4.42 | 4.34 | 4.24 | 4.36 | 4.23 | 3.99 | 3.16 | 3.65 | 3.32 | 2.26 |
| th | 4.56 | 4.66 | 4.63 | 4.41 | 4.38 | 4.39 | 4.25 | 4.22 | 4.14 | 4.36 | 4.12 | 4.04 | 4.11 | 3.78 | 3.31 |
| tl | 4.61 | 4.69 | 4.53 | 4.37 | 4.39 | 4.33 | 4.32 | 4.21 | 4.48 | 4.28 | 3.94 | 4.03 | 3.62 | 3.33 | 3.22 |
| tr | 4.70 | 4.68 | 4.63 | 4.41 | 4.54 | 4.32 | 4.22 | 4.35 | 4.29 | 4.35 | 4.11 | 4.21 | 4.09 | 4.18 | 3.36 |
| uk | 4.79 | 4.82 | 4.87 | 4.59 | 4.73 | 4.52 | 4.44 | 4.46 | 4.46 | 4.59 | 4.23 | 4.46 | 4.09 | 4.33 | 3.78 |
| ur | 4.59 | 4.54 | 4.59 | 4.38 | 4.27 | 4.39 | 4.18 | 4.22 | 4.37 | 4.04 | 3.87 | 3.98 | 3.93 | 3.61 | 2.95 |
| uz | 4.76 | 4.78 | 4.67 | 4.67 | 4.55 | 4.48 | 4.38 | 4.36 | 4.24 | 4.16 | 4.28 | 4.28 | 3.92 | 4.11 | 3.32 |
| vi | 4.66 | 4.61 | 4.56 | 4.32 | 4.49 | 4.63 | 4.19 | 4.19 | 4.28 | 4.31 | 4.06 | 4.24 | 4.36 | 4.07 | 3.52 |
| yo | 4.59 | 4.53 | 4.38 | 4.17 | 4.07 | 3.92 | 3.67 | 3.98 | 4.32 | 3.26 | 3.22 | 3.21 | 1.94 | 2.03 | 2.42 |
| zh-CN | 4.76 | 4.71 | 4.81 | 4.47 | 4.72 | 4.57 | 4.44 | 4.54 | 4.37 | 4.71 | 4.19 | 4.39 | 4.70 | 4.63 | 3.74 |
| zh-HK | 4.64 | 4.69 | 4.65 | 4.39 | 4.62 | 4.52 | 4.35 | 4.20 | 4.20 | 4.56 | 4.23 | 4.08 | 3.99 | 4.40 | 3.54 |
| zu | 4.48 | 4.22 | 4.43 | 4.10 | 4.24 | 3.84 | 3.55 | 3.97 | 3.59 | 3.33 | 3.26 | 3.73 | 2.08 | 2.35 | 2.38 |

## Language flags

50 languages where a cheap model scores badly.

| Language | Model | Mean | Critical | n | Reason |
| --- | --- | ---: | ---: | ---: | --- |
| am | `openai/gpt-5-nano` | 1.53 | 80.0% | 60 | mean<3.5, critical>25% |
| am | `qwen/qwen3-235b-a22b-2507` | 2.11 | 60.0% | 60 | mean<3.5, critical>25% |
| ar | `openai/gpt-5-nano` | 3.42 | 13.3% | 60 | mean<3.5 |
| as | `openai/gpt-5-nano` | 2.49 | 36.7% | 60 | mean<3.5, critical>25% |
| az | `openai/gpt-5-nano` | 3.31 | 28.3% | 60 | mean<3.5, critical>25% |
| bg | `openai/gpt-5-nano` | 3.34 | 16.7% | 60 | mean<3.5 |
| bho | `qwen/qwen3-235b-a22b-2507` | 2.84 | 20.0% | 30 | mean<3.5 |
| bho | `openai/gpt-5-nano` | 3.27 | 23.3% | 30 | mean<3.5 |
| bn | `openai/gpt-5-nano` | 2.81 | 41.7% | 60 | mean<3.5, critical>25% |
| ca | `openai/gpt-5-nano` | 3.46 | 13.3% | 60 | mean<3.5 |
| ceb | `openai/gpt-5-nano` | 2.96 | 30.0% | 60 | mean<3.5, critical>25% |
| ceb | `qwen/qwen3-235b-a22b-2507` | 3.43 | 18.3% | 60 | mean<3.5 |
| cs | `openai/gpt-5-nano` | 3.23 | 25.0% | 60 | mean<3.5 |
| fa | `openai/gpt-5-nano` | 3.13 | 21.7% | 60 | mean<3.5 |
| fi | `openai/gpt-5-nano` | 3.27 | 21.7% | 60 | mean<3.5 |
| gu | `openai/gpt-5-nano` | 1.94 | 71.7% | 60 | mean<3.5, critical>25% |
| ha | `qwen/qwen3-235b-a22b-2507` | 1.94 | 77.6% | 58 | mean<3.5, critical>25% |
| ha | `openai/gpt-5-nano` | 3.07 | 34.5% | 58 | mean<3.5, critical>25% |
| ha | `meta-llama/llama-4-maverick` | 3.55 | 27.6% | 58 | critical>25% |
| he | `openai/gpt-5-nano` | 3.17 | 31.7% | 60 | mean<3.5, critical>25% |
| hi | `openai/gpt-5-nano` | 3.13 | 35.0% | 60 | mean<3.5, critical>25% |
| hr | `openai/gpt-5-nano` | 3.46 | 16.7% | 60 | mean<3.5 |
| hu | `openai/gpt-5-nano` | 3.03 | 30.0% | 60 | mean<3.5, critical>25% |
| hy | `openai/gpt-5-nano` | 2.67 | 36.7% | 60 | mean<3.5, critical>25% |
| ig | `qwen/qwen3-235b-a22b-2507` | 2.18 | 68.3% | 60 | mean<3.5, critical>25% |
| ig | `openai/gpt-5-nano` | 2.90 | 46.7% | 60 | mean<3.5, critical>25% |
| ig | `anthropic/claude-haiku-5.5` | 3.13 | 28.3% | 60 | mean<3.5, critical>25% |
| ig | `meta-llama/llama-4-maverick` | 3.49 | 26.7% | 60 | mean<3.5, critical>25% |
| jv | `openai/gpt-5-nano` | 2.94 | 40.0% | 60 | mean<3.5, critical>25% |
| kk | `openai/gpt-5-nano` | 2.94 | 35.0% | 60 | mean<3.5, critical>25% |
| km | `openai/gpt-5-nano` | 1.96 | 58.3% | 60 | mean<3.5, critical>25% |
| kn | `openai/gpt-5-nano` | 2.16 | 55.0% | 60 | mean<3.5, critical>25% |
| ko | `openai/gpt-5-nano` | 3.41 | 16.7% | 60 | mean<3.5 |
| ku | `openai/gpt-5-nano` | 1.63 | 81.7% | 60 | mean<3.5, critical>25% |
| ku | `qwen/qwen3-235b-a22b-2507` | 2.62 | 41.7% | 60 | mean<3.5, critical>25% |
| ku | `google/gemini-2.5-flash-lite` | 3.38 | 31.7% | 60 | mean<3.5, critical>25% |
| ku | `z-ai/glm-5.3-flash` | 3.47 | 30.0% | 60 | mean<3.5, critical>25% |
| lo | `openai/gpt-5-nano` | 1.72 | 81.4% | 59 | mean<3.5, critical>25% |
| ml | `openai/gpt-5-nano` | 2.09 | 65.0% | 60 | mean<3.5, critical>25% |
| mr | `openai/gpt-5-nano` | 2.81 | 28.3% | 60 | mean<3.5, critical>25% |
| my | `openai/gpt-5-nano` | 1.87 | 65.0% | 60 | mean<3.5, critical>25% |
| ne | `openai/gpt-5-nano` | 3.14 | 18.3% | 60 | mean<3.5 |
| or | `openai/gpt-5-nano` | 2.44 | 46.3% | 41 | mean<3.5, critical>25% |
| pa | `openai/gpt-5-nano` | 2.58 | 38.3% | 60 | mean<3.5, critical>25% |
| ps | `qwen/qwen3-235b-a22b-2507` | 2.63 | 41.7% | 60 | mean<3.5, critical>25% |
| ps | `openai/gpt-5-nano` | 2.97 | 28.3% | 60 | mean<3.5, critical>25% |
| ru | `openai/gpt-5-nano` | 3.44 | 13.3% | 60 | mean<3.5 |
| sd | `openai/gpt-5-nano` | 2.46 | 41.7% | 60 | mean<3.5, critical>25% |
| sd | `qwen/qwen3-235b-a22b-2507` | 3.37 | 20.0% | 60 | mean<3.5 |
| si | `openai/gpt-5-nano` | 2.01 | 61.7% | 60 | mean<3.5, critical>25% |
| si | `qwen/qwen3-235b-a22b-2507` | 3.32 | 25.0% | 60 | mean<3.5 |
| sk | `deepseek/deepseek-v4.1-flash-1017` | 3.35 | 33.3% | 60 | mean<3.5, critical>25% |
| sk | `openai/gpt-5-nano` | 3.44 | 20.0% | 60 | mean<3.5 |
| so | `qwen/qwen3-235b-a22b-2507` | 2.05 | 70.0% | 60 | mean<3.5, critical>25% |
| so | `openai/gpt-5-nano` | 3.00 | 28.3% | 60 | mean<3.5, critical>25% |
| so | `z-ai/glm-5.3-flash` | 3.41 | 18.3% | 60 | mean<3.5 |
| so | `meta-llama/llama-4-maverick` | 3.43 | 16.7% | 60 | mean<3.5 |
| sr | `openai/gpt-5-nano` | 3.14 | 25.0% | 60 | mean<3.5 |
| sw | `openai/gpt-5-nano` | 2.64 | 40.0% | 60 | mean<3.5, critical>25% |
| sw | `qwen/qwen3-235b-a22b-2507` | 2.80 | 53.3% | 60 | mean<3.5, critical>25% |
| ta | `openai/gpt-5-nano` | 1.94 | 68.3% | 60 | mean<3.5, critical>25% |
| te | `openai/gpt-5-nano` | 2.26 | 58.3% | 60 | mean<3.5, critical>25% |
| te | `qwen/qwen3-235b-a22b-2507` | 3.65 | 31.7% | 60 | critical>25% |
| th | `openai/gpt-5-nano` | 3.31 | 16.7% | 60 | mean<3.5 |
| tl | `openai/gpt-5-nano` | 3.22 | 26.7% | 60 | mean<3.5, critical>25% |
| tr | `openai/gpt-5-nano` | 3.36 | 25.0% | 60 | mean<3.5 |
| ur | `openai/gpt-5-nano` | 2.95 | 33.3% | 60 | mean<3.5, critical>25% |
| uz | `openai/gpt-5-nano` | 3.32 | 20.0% | 60 | mean<3.5 |
| yo | `qwen/qwen3-235b-a22b-2507` | 1.94 | 75.0% | 60 | mean<3.5, critical>25% |
| yo | `openai/gpt-5-nano` | 2.42 | 53.3% | 60 | mean<3.5, critical>25% |
| yo | `meta-llama/llama-4-maverick` | 3.22 | 28.3% | 60 | mean<3.5, critical>25% |
| yo | `z-ai/glm-5.3-flash` | 3.26 | 35.0% | 60 | mean<3.5, critical>25% |
| zu | `qwen/qwen3-235b-a22b-2507` | 2.08 | 65.0% | 60 | mean<3.5, critical>25% |
| zu | `openai/gpt-5-nano` | 2.38 | 48.3% | 60 | mean<3.5, critical>25% |
| zu | `meta-llama/llama-4-maverick` | 3.26 | 28.3% | 60 | mean<3.5, critical>25% |
| zu | `z-ai/glm-5.3-flash` | 3.33 | 20.0% | 60 | mean<3.5 |

## Spend

Spend (OpenRouter `usage.cost`, cumulative ledger for the whole project including the first run and the supplement): **$78.6727**.

| Step | USD |
| --- | ---: |
| Chat drafting (all runs) | $10.6700 |
| Translations (all runs) | $10.0639 |
| Judge (all runs, including superseded passes) | $57.9416 |
| Total | $78.6727 |

New spend for this combined rerun (missing translations + 15-candidate judge pass + pilot): **$34.9892**.

## Limits

LLM-judged, not human-verified. A single Opus judge can favor its own family. Per-language cells are noisy at this sample size. WMT24++ locales (for example Mexican Spanish, Egyptian Arabic) stand in for the language, not every variety.

## Notes on this pass

**Unscored cases.** 4,242 of 4,245 cases are scored. Three cases returned an empty or truncated reply from the judge on every attempt (batches of 30, 10, 5 and 1): `bench-ha-22` ("Bats are not actually blind."), `bench-ha-26` ("Hats off to Thomas.") and `chat-lo-09` (slang about Luang Prabang). The source lines are harmless, so the trigger is probably one of the 15 candidate outputs. All models are averaged over the same 4,242 cases.

**Truncated replies.** 40 cases first failed to parse because the provider cut the judge's JSON reply short (raw replies are saved in `eval/pareto/results/judge-all15/`). They were re-judged in batches of 5 and then 1; 37 succeeded.

**Identical-output check** (`eval/pareto/sanity-all15.mjs`, full output in `docs/sanity-all15.txt`). Of 37,274 pairs where two models produced exactly the same text for a case, 38 pairs (0.10%) got a different critical flag or scores at least 2 points apart. They come from 9 cases: bench-th-08 (12 pairs), bench-ro-30 (5), bench-su-09 (5), bench-cs-24 (3), bench-da-24, bench-my-17, chat-am-02, chat-ha-12, chat-he-19 (1 each). In each, one candidate was scored lower than an identical candidate elsewhere in the same prompt, most likely the judge mixing up candidate labels within a 15-candidate list. This is judge noise, kept in the results rather than corrected. At 0.10% of pairs it moves no model's mean by more than about 0.01. The supplement's bugged batch, by contrast, had 113 such pairs among 144 cases.

## Old vs new: models affected by the stale-cache bug

The supplement placed four models on the main scale through anchors, on a 1,080-case subsample, and one of its judge batches carried stale scores for empty outputs (see the note in `docs/results-supplement.md`). This pass judges all 15 models together on all cases.

| Model | Old score (supplement, main scale) | Old critical | Old $ / 1k | New score | New critical | New $ / 1k |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `openai/gpt-6-luna` | 4.56 | 7.9% | $0.021 (1,080 calls) | 4.69 (4.66-4.72) | 2.1% | $0.032 |
| `meta/muse-spark-1.3` | 4.48 | 9.0% | $0.843 (1,080 calls) | 4.64 (4.61-4.67) | 0.8% | $0.973 |
| `z-ai/glm-5.3-flash` | 4.38 | 6.5% | $0.025 | 4.23 (4.15-4.31) | 6.5% | $0.025 |
| `minimax/minimax-m3.1-flash` | 3.86 | 18.5% | $0.101 | 3.55 (3.38-3.73) | 22.1% | $0.101 |

The 11 main-run models also moved, because listwise scores are relative to the panel: with 15 candidates per case, Gemini 3.1 Flash-Lite went from 4.73 to 4.66 and DeepSeek V4.1 Flash from 4.56 to 4.47. The Gemini-DeepSeek gap widened from 0.17 to 0.19. Compare models within one pass, not across passes.

Luna's and Muse Spark's cost per 1,000 messages rose because the full case set has longer items than the first-10/first-5 subsample.

**Frontier call.** Gemini 3.1 Flash-Lite is off the frontier because GPT-6 Luna is cheaper and its paired lead over Gemini is 0.033 with a 95% interval of 0.000-0.065. The lower bound is at zero, so this is a borderline call under the frontier rule, and Gemini's critical-error rate (1.5%) is lower than Luna's (2.1%).
