# Which model should power a pass-the-phone translation chat?

Question: for a live two-person conversation on one phone, which model should translate the latest turn, and which languages should escalate from a cheap default to a stronger model?

This comparison uses the interpreter system prompt in `eval/prompts/v1.txt` and the app's user-prompt builder (`buildUserPrompt`). Each item is a short face-to-face conversation. The model translates only the last turn. The set covers English paired with Indonesian, Thai, Vietnamese, Burmese, Khmer, Mandarin (Simplified), Japanese, Korean, Hindi, Bengali, Arabic, and Spanish, in both directions, plus Indonesian↔Thai, Japanese↔Korean, and Hindi↔Arabic.

## Method

Cases: 120 conversations, 3 to 6 turns, last turn translated. Each case has one reference and an expected-meaning note. Problem tags are typo, missing diacritics, autocorrect, slang, pronoun reference, honorific or formality, and code-switching. Scenarios are market bargaining, directions, food and allergies, taxis, hotel check-in, pharmacy doses, small talk, and a social introduction.

An English contract fixed the facts: numbers, negation, and who is being referred to. Claude Sonnet 5 (`anthropic/claude-sonnet-5`) wrote the non-English lines from that contract. Gemini 3.1 Pro Preview (`google/gemini-3.1-pro-preview`) then reviewed every reference and note and dropped or rewrote items whose repair was not forced. The rejected pattern was a source line that could honestly mean either of two places, as in the earlier pilot item that said “mall lobby” while the reference silently said “hotel lobby.” Neither authoring model is a translation candidate, and neither is a judge.

The review log is `eval/case-review.json`: 120 kept of 120, 0 dropped.

Candidates were called with that prompt at temperature 0.2 when the OpenRouter catalog accepts temperature. Models that do not list temperature omit the field. Reasoning is off, `none`, or `minimal`, recorded per model below. Decoding is one sample per case.

Two judges scored every candidate, blind, in the same shuffled order for a case. The shuffle seed is fixed (`20261024` mixed with the case id). Judges are Gemini 4 Argon and Claude Sonnet 5.5. Neither is a candidate, so neither is grading itself. Scores are integers from 1 to 5 for meaning, naturalness, and typo or context handling, plus a critical-error flag for a wrong meaning, the wrong language, a dropped negation, a wrong number or price, or an offensive mistranslation. The headline score is the mean of the two judges. The run does not switch judges if one of them fails. A short budget stops the run and says so.

Ran 2026-10-25T04:45:07.764Z to 2026-10-25T05:05:03.856Z. The run finished inside the spend cap.
Metered OpenRouter spend for this study, including case authoring and judging: $4.77. Cap $10. Translation calls in the tables cost $0.387. Judge calls cost $2.56.

## Models and prices

List prices were read from the OpenRouter catalog on 2026-10-24. They are USD per million tokens.

| Model | Role | Input / 1M | Output / 1M | Reasoning | Temperature |
| --- | --- | ---: | ---: | --- | --- |
| `x-ai/grok-4.20` | baseline | $1.25 | $2.5 | `{"enabled":false}` | 0.2 |
| `google/gemini-2.5-flash-lite` | candidate | $0.1 | $0.4 | `{"enabled":false}` | 0.2 |
| `google/gemini-2.5-flash` | candidate | $0.3 | $2.5 | `{"enabled":false}` | 0.2 |
| `google/gemini-3.1-flash-lite` | candidate | $0.25 | $1.5 | `{"effort":"minimal"}` | 0.2 |
| `google/gemini-3.5-flash-lite` | candidate | $0.3 | $2.5 | `{"effort":"minimal"}` | 0.2 |
| `anthropic/claude-haiku-5.5` | candidate | $0.1 | $0.5 | `{"effort":"none"}` | omitted |
| `openai/gpt-5-mini` | candidate | $0.25 | $2 | `{"effort":"minimal"}` | omitted |
| `openai/gpt-5-nano` | candidate | $0.05 | $0.4 | `{"effort":"minimal"}` | omitted |
| `deepseek/deepseek-v4.1-flash-1017` | candidate | $0.15 | $0.6 | `{"effort":"none"}` | 0.2 |
| `qwen/qwen3-235b-a22b-2507` | candidate | $0.09 | $0.55 | not sent | 0.2 |
| `meta-llama/llama-4-maverick` | candidate | $0.1875 | $0.6525 | not sent | 0.2 |
| `openai/gpt-oss-120b` | candidate | $0.15 | $0.6 | `{"effort":"minimal"}` | 0.2 |
| `google/gemma-3-27b-it` | candidate | $0.08 | $0.35 | not sent | 0.2 |
| `mistralai/mistral-medium-3-5` | candidate | $1.5 | $7.5 | `{"effort":"none"}` | 0.2 |
| `google/gemini-2.5-pro` | ceiling | $1.25 | $10 | `{"effort":"minimal"}` | 0.2 |

Skipped requests, not silently replaced:

- newest xAI Grok fast or mini variant: The OpenRouter catalog on 2026-10-24 has no grok-fast or grok-mini slug. Grok ids present were grok-4.7, grok-4.6, grok-4.5, grok-4.3, grok-4.20, grok-4.20-multi-agent, and grok-build-0.1. None is named fast or mini, so none was substituted.
- a Qwen-MT model: No qwen-mt, qwen-mt-turbo, or Qwen machine-translation slug is on the catalog. Tencent Hy-MT2 models are listed and were not substituted.

Substitutions:

- Requested xAI grok-4.20 non-reasoning, production id grok-4.20-0309-non-reasoning. Used `x-ai/grok-4.20`. OpenRouter has no grok-4.20-0309-non-reasoning slug. x-ai/grok-4.20 is the 4.20 model. Reasoning is not mandatory and is off by default. The harness sends reasoning.enabled false.
- Requested best current Qwen3 instruct model. Used `qwen/qwen3-235b-a22b-2507`. This is the largest non-thinking model whose catalog name is Qwen3 Instruct (Qwen3 235B A22B Instruct 2507). Newer Qwen3.5–3.8 chat models exist, including qwen/qwen3.8-max-prime at $4 / $12 per million, but they are later generations and are not named Qwen3 Instruct. They were not substituted into this slot.
- Requested Mistral's best small/medium model. Used `mistralai/mistral-medium-3-5`. Mistral Medium 3.5 is the newest medium model on the catalog and the strongest model in the small-to-medium band. Mistral Small 4 (mistralai/mistral-small-2603, $0.15 / $0.60) is newer among small models and was not given a second slot.
- Requested cheapest strong ceiling, Gemini Pro-class or Claude Sonnet-class. Used `google/gemini-2.5-pro`. Cheapest Pro-class or Sonnet-class model on the catalog: Gemini 2.5 Pro at $1.25 / $10 per million. Reasoning is mandatory on this slug, so the harness pins effort to minimal instead of disabling it. Gemini 4 Argon and Claude Sonnet 5.5 are both $2 / $10 and are held out as the two judges so neither judge scores its own translations.

## Quality against cost

Mean is the average of the two judges, and each judge's score is the average of meaning, naturalness, and handling. The 95% interval is a 2,000-draw bootstrap over cases, seed 20261024. Critical is the average of the two judges' flags, so a split decision counts as one half. `n` is cases scored by both judges. Cost per 1,000 messages uses measured `usage.cost` on successful translation calls and does not include the judges.

| Model | Mean | 95% CI | Meaning | Natural | Handling | Critical | p50 ms | p95 ms | USD / 1k | n |
| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `google/gemini-3.1-flash-lite` | 4.56 | 4.42–4.68 | 4.48 | 4.70 | 4.49 | 9.7% | 846 | 1154 | $0.091 | 119 |
| `google/gemini-3.5-flash-lite` | 4.53 | 4.41–4.64 | 4.58 | 4.54 | 4.47 | 7.1% | 819 | 1197 | $0.129 | 119 |
| `google/gemini-2.5-flash` | 4.48 | 4.33–4.62 | 4.50 | 4.54 | 4.40 | 7.6% | 555 | 819 | $0.127 | 119 |
| `google/gemini-2.5-pro` | 4.43 | 4.28–4.56 | 4.47 | 4.47 | 4.33 | 7.1% | 2855 | 3909 | $1.22 | 119 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.39 | 4.24–4.53 | 4.49 | 4.35 | 4.31 | 7.6% | 523 | 1232 | $0.057 | 119 |
| `anthropic/claude-haiku-5.5` | 4.35 | 4.20–4.49 | 4.41 | 4.32 | 4.31 | 7.1% | 860 | 1170 | $0.062 | 119 |
| `google/gemini-2.5-flash-lite` | 4.16 | 3.98–4.33 | 4.13 | 4.28 | 4.07 | 16.0% | 426 | 617 | $0.031 | 119 |
| `x-ai/grok-4.20` | 4.12 | 3.94–4.30 | 4.22 | 4.11 | 4.04 | 8.4% | 799 | 1585 | $0.449 | 119 |
| `qwen/qwen3-235b-a22b-2507` | 4.11 | 3.92–4.27 | 4.23 | 4.03 | 4.05 | 10.5% | 4269 | 17583 | $0.059 | 119 |
| `openai/gpt-5-mini` | 4.00 | 3.80–4.19 | 4.08 | 3.94 | 3.96 | 16.4% | 1130 | 1498 | $0.148 | 119 |
| `meta-llama/llama-4-maverick` | 4.00 | 3.81–4.16 | 4.07 | 3.98 | 3.93 | 14.7% | 1416 | 2726 | $0.051 | 119 |
| `mistralai/mistral-medium-3-5` | 3.98 | 3.77–4.18 | 4.04 | 3.97 | 3.93 | 16.0% | 859 | 1697 | $0.699 | 119 |
| `google/gemma-3-27b-it` | 3.94 | 3.74–4.12 | 3.96 | 4.00 | 3.85 | 21.8% | 1092 | 2528 | $0.028 | 119 |
| `openai/gpt-oss-120b` | 3.82 | 3.62–4.01 | 3.86 | 3.84 | 3.76 | 22.3% | 1722 | 4223 | $0.042 | 119 |
| `openai/gpt-5-nano` | 3.16 | 2.92–3.41 | 3.32 | 3.10 | 3.05 | 34.0% | 918 | 1293 | $0.034 | 119 |

Judge means on the paired items (n=1785): `google/gemini-4-argon` mean 4.26 (critical 11.1%); `anthropic/claude-sonnet-5.5` mean 4.01 (critical 16.4%).
Pearson correlation of the two judges' overall scores: 0.881. Share of items within 0.5 points: 70.3%. Within 1 point: 91.1%.
Quadratic weighted kappa: meaning 0.824, naturalness 0.797, handling 0.831. Cohen's kappa on the critical-error flag: 0.758.

## Per language

Each cell pools both directions with English and leaves out the non-English pairs. A dash means neither judge completed that cell.

| Model | id | th | vi | my | km | zh | ja | ko | hi | bn | ar | es |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `x-ai/grok-4.20` | 4.21 | 4.35 | 4.00 | 4.27 | 4.08 | 4.48 | 3.69 | 4.44 | 4.29 | 4.25 | 4.04 | 3.98 |
| `google/gemini-2.5-flash-lite` | 4.46 | 4.52 | 3.85 | 3.65 | 4.10 | 4.40 | 3.58 | 3.90 | 4.42 | 4.06 | 4.25 | 4.23 |
| `google/gemini-2.5-flash` | 4.63 | 4.52 | 4.46 | 4.63 | 4.65 | 4.52 | 4.10 | 4.46 | 4.69 | 4.52 | 4.75 | 4.85 |
| `google/gemini-3.1-flash-lite` | 4.96 | 4.60 | 4.10 | 4.67 | 4.27 | 4.57 | 4.35 | 4.35 | 4.75 | 4.77 | 4.60 | 4.69 |
| `google/gemini-3.5-flash-lite` | 4.71 | 4.52 | 4.54 | 4.79 | 4.19 | 4.69 | 4.42 | 4.10 | 4.67 | 4.67 | 4.50 | 4.90 |
| `anthropic/claude-haiku-5.5` | 4.58 | 4.60 | 4.17 | 4.00 | 4.38 | 4.43 | 4.06 | 4.46 | 4.65 | 4.08 | 4.29 | 4.75 |
| `openai/gpt-5-mini` | 4.35 | 3.96 | 3.96 | 2.85 | 3.12 | 4.83 | 3.69 | 4.33 | 4.21 | 3.90 | 4.60 | 4.29 |
| `openai/gpt-5-nano` | 3.50 | 3.02 | 3.21 | 1.94 | 2.44 | 3.45 | 2.92 | 3.73 | 3.48 | 3.13 | 3.85 | 3.94 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.63 | 4.10 | 4.44 | 4.31 | 4.48 | 4.64 | 4.29 | 4.17 | 4.40 | 4.48 | 4.58 | 4.71 |
| `qwen/qwen3-235b-a22b-2507` | 4.44 | 4.48 | 4.00 | 3.96 | 3.79 | 4.38 | 3.96 | 3.90 | 3.85 | 4.10 | 4.46 | 4.25 |
| `meta-llama/llama-4-maverick` | 4.00 | 3.96 | 3.85 | 4.17 | 4.04 | 4.33 | 4.25 | 3.83 | 3.56 | 4.21 | 4.02 | 4.13 |
| `openai/gpt-oss-120b` | 3.90 | 3.92 | 3.21 | 3.06 | 3.85 | 4.02 | 3.15 | 4.02 | 3.81 | 3.96 | 4.15 | 4.38 |
| `google/gemma-3-27b-it` | 4.17 | 4.17 | 4.15 | 3.63 | 3.44 | 3.88 | 3.67 | 3.75 | 3.90 | 4.08 | 4.25 | 4.27 |
| `mistralai/mistral-medium-3-5` | 4.40 | 4.21 | 3.92 | 3.02 | 2.08 | 4.69 | 4.73 | 4.08 | 4.04 | 4.13 | 4.31 | 4.19 |
| `google/gemini-2.5-pro` | 4.69 | 4.42 | 4.35 | 4.50 | 4.29 | 4.60 | 4.13 | 4.25 | 4.52 | 4.48 | 4.67 | 4.50 |

Non-English pairs in the set:

| Pair | Cases |
| --- | ---: |
| id→th | 4 |
| th→id | 4 |
| ja→ko | 4 |
| ko→ja | 4 |
| hi→ar | 4 |
| ar→hi | 4 |

## Per problem

| Model | typo | missing-diacritics | autocorrect | slang | pronoun-reference | honorific/formality | code-switching |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| `x-ai/grok-4.20` | 4.62 | 3.67 | 4.25 | 3.87 | 3.83 | 4.08 | 4.79 |
| `google/gemini-2.5-flash-lite` | 4.68 | 4.42 | 3.03 | 4.64 | 3.57 | 4.48 | 4.70 |
| `google/gemini-2.5-flash` | 4.61 | 4.75 | 4.56 | 4.68 | 4.11 | 4.37 | 4.85 |
| `google/gemini-3.1-flash-lite` | 4.76 | 4.58 | 4.15 | 4.74 | 4.40 | 4.51 | 4.80 |
| `google/gemini-3.5-flash-lite` | 4.78 | 4.50 | 4.65 | 4.55 | 4.33 | 4.36 | 4.79 |
| `anthropic/claude-haiku-5.5` | 4.47 | 4.29 | 4.33 | 4.70 | 3.80 | 4.37 | 4.89 |
| `openai/gpt-5-mini` | 4.54 | 3.88 | 3.58 | 4.00 | 3.60 | 3.96 | 4.77 |
| `openai/gpt-5-nano` | 3.81 | 3.67 | 1.33 | 3.12 | 2.98 | 3.02 | 4.52 |
| `deepseek/deepseek-v4.1-flash-1017` | 4.70 | 4.13 | 4.78 | 4.22 | 4.02 | 4.50 | 4.81 |
| `qwen/qwen3-235b-a22b-2507` | 4.74 | 3.96 | 3.49 | 4.17 | 3.88 | 3.87 | 4.70 |
| `meta-llama/llama-4-maverick` | 4.73 | 4.33 | 3.32 | 4.10 | 3.70 | 3.51 | 4.80 |
| `openai/gpt-oss-120b` | 4.53 | 3.83 | 2.67 | 4.03 | 3.34 | 3.97 | 4.62 |
| `google/gemma-3-27b-it` | 4.52 | 4.00 | 2.94 | 4.35 | 3.38 | 4.03 | 4.62 |
| `mistralai/mistral-medium-3-5` | 4.49 | 3.83 | 3.75 | 3.84 | 3.68 | 4.05 | 4.55 |
| `google/gemini-2.5-pro` | 4.77 | 4.71 | 4.31 | 4.63 | 3.97 | 4.44 | 4.79 |

## Cost per 1,000 messages

Measured cost is uncached: it is what OpenRouter billed on this run. The assumed column prices the system prompt (~69 tokens) as a cache read at 10% of the input price and prices the rest of the prompt and the completion at list price. That 10% factor is an assumption, not a negotiated discount. Average cached tokens are whatever the API returned in `prompt_tokens_details.cached_tokens`. A zero there means this run did not observe a prompt cache.

| Model | Measured USD / 1k | Assumed cached system prompt / 1k | Avg prompt tokens | Avg cached tokens | Avg output tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| `x-ai/grok-4.20` | $0.449 | $0.519 | 411 | 141 | 34 |
| `google/gemini-2.5-flash-lite` | $0.031 | $0.025 | 198 | 0 | 28 |
| `google/gemini-2.5-flash` | $0.127 | $0.108 | 198 | 0 | 27 |
| `google/gemini-3.1-flash-lite` | $0.091 | $0.076 | 196 | 0 | 28 |
| `google/gemini-3.5-flash-lite` | $0.129 | $0.111 | 196 | 0 | 28 |
| `anthropic/claude-haiku-5.5` | $0.062 | $0.056 | 348 | 0 | 55 |
| `openai/gpt-5-mini` | $0.148 | $0.138 | 213 | 0 | 50 |
| `openai/gpt-5-nano` | $0.034 | $0.031 | 213 | 0 | 59 |
| `deepseek/deepseek-v4.1-flash-1017` | $0.057 | $0.048 | 234 | 0 | 37 |
| `qwen/qwen3-235b-a22b-2507` | $0.059 | $0.042 | 269 | 7 | 43 |
| `meta-llama/llama-4-maverick` | $0.051 | $0.048 | 216 | 63 | 29 |
| `openai/gpt-oss-120b` | $0.042 | $0.104 | 276 | 53 | 120 |
| `google/gemma-3-27b-it` | $0.028 | $0.022 | 209 | 42 | 29 |
| `mistralai/mistral-medium-3-5` | $0.699 | $0.606 | 264 | 0 | 41 |
| `google/gemini-2.5-pro` | $1.22 | $1.14 | 198 | 0 | 97 |

## Latency

p50 and p95 are linear percentiles of successful call latencies, including provider queue time. They are not time-to-first-token.

| Model | p50 ms | p95 ms | Avg reasoning tokens | Temperature used | Reasoning used | Failures |
| --- | ---: | ---: | ---: | --- | --- | ---: |
| `x-ai/grok-4.20` | 799 | 1585 | 0 | 0.2 | {"enabled":false} | 0 |
| `google/gemini-2.5-flash-lite` | 426 | 617 | 0 | 0.2 | {"enabled":false} | 0 |
| `google/gemini-2.5-flash` | 555 | 819 | 0 | 0.2 | {"enabled":false} | 0 |
| `google/gemini-3.1-flash-lite` | 846 | 1154 | 0 | 0.2 | {"effort":"minimal"} | 0 |
| `google/gemini-3.5-flash-lite` | 819 | 1197 | 0 | 0.2 | {"effort":"minimal"} | 0 |
| `anthropic/claude-haiku-5.5` | 860 | 1170 | 0 | omitted | {"effort":"none"} | 0 |
| `openai/gpt-5-mini` | 1130 | 1498 | 0 | omitted | {"effort":"minimal"} | 0 |
| `openai/gpt-5-nano` | 918 | 1293 | 0 | omitted | {"effort":"minimal"} | 0 |
| `deepseek/deepseek-v4.1-flash-1017` | 523 | 1232 | 0 | 0.2 | {"effort":"none"} | 0 |
| `qwen/qwen3-235b-a22b-2507` | 4269 | 17583 | 0 | 0.2 | omitted | 0 |
| `meta-llama/llama-4-maverick` | 1416 | 2726 | 0 | 0.2 | omitted | 0 |
| `openai/gpt-oss-120b` | 1722 | 4223 | 93 | 0.2 | {"effort":"minimal"} | 0 |
| `google/gemma-3-27b-it` | 1092 | 2528 | 0 | 0.2 | omitted | 0 |
| `mistralai/mistral-medium-3-5` | 859 | 1697 | 0 | 0.2 | {"effort":"none"} | 0 |
| `google/gemini-2.5-pro` | 2855 | 3909 | 72 | 0.2 | {"effort":"minimal"} | 0 |

## English pivot

For Indonesian↔Thai, Japanese↔Korean, and Hindi↔Arabic only, the selected cheap model also translated source → English → target with the same prompt and the same history. Direct and pivot outputs were then scored against each other by both judges, blind and shuffled.

Pivot model: `google/gemini-3.1-flash-lite`. This is the cheapest non-ceiling model within 0.10 of the best headline mean, among models both judges scored on at least 80% of cases.
On the non-English pairs, direct translation scored 4.53 and the English pivot scored 4.54 (paired blind rescore, n=24). Critical-error rates were 4.2% direct and 12.5% pivot.
The same direct outputs scored 4.56 in the full multi-model panel. The paired rescore is the comparison to use, because a two-candidate prompt is not the same task as a fifteen-candidate prompt.
Cost per pivoted message (both steps) $0.0002, against $0.0001 for one direct call of the same model. Latency p50/p95 for the two steps combined: 1633 / 1972 ms. Direct p50 for that model on all cases: 846 ms. Successful pivot conversations: 24.


## Recommended tiers

A non-ceiling model is eligible when its headline mean is at least 4.0, its critical-error rate is at most 5%, and both judges scored at least 80% of the English-pair cases. The default is the cheapest eligible model within 0.15 points of the best eligible mean and within 0.02 critical-error rate of that best model. A language escalates when the default mean on that language is below 4.0, its critical-error rate is above 8%, or it trails the best model on that language by more than 0.35. The escalation model is Gemini 2.5 Pro when it leads the default by at least 0.15 on the escalated languages; otherwise it is the model that actually leads by that margin.

Default model: `google/gemini-3.1-flash-lite`. Escalation model: `google/gemini-2.5-pro`.

Use the language's tier for a turn whose non-English side is that language, whether the phone is translating into it or out of it. A non-English pair escalates if either language is in the escalation tier.

| Language | Tier | Default mean | Best mean | Default critical | n |
| --- | --- | ---: | ---: | ---: | ---: |
| id | default | 4.96 | 4.96 | 0.0% | 8 |
| th | default | 4.60 | 4.60 | 6.3% | 8 |
| vi | escalation | 4.10 | 4.54 | 18.8% | 8 |
| my | escalation | 4.67 | 4.79 | 12.5% | 8 |
| km | escalation | 4.27 | 4.65 | 25.0% | 8 |
| zh-CN | escalation | 4.57 | 4.83 | 14.3% | 7 |
| ja | escalation | 4.35 | 4.73 | 6.3% | 8 |
| ko | escalation | 4.35 | 4.46 | 12.5% | 8 |
| hi | escalation | 4.75 | 4.75 | 12.5% | 8 |
| bn | escalation | 4.77 | 4.77 | 12.5% | 8 |
| ar | escalation | 4.60 | 4.75 | 12.5% | 8 |
| es | default | 4.69 | 4.90 | 0.0% | 8 |

The machine-readable map (`routing-recommendation.json`, generated next to this report in the translation app it was built for, not included in this repository) lists every non-English language in that app. A measured language uses the escalation model when its tier is escalation, and the default model otherwise. An unmeasured language was not in this 120-case set. It is pointed at the same two models and should use the default until it is measured.

## Settings actually used

- `x-ai/grok-4.20` — Closest available slug to production grok-4.20-0309-non-reasoning. Reasoning off. Temperature 0.2. Observed temperature 0.2; observed reasoning {"enabled":false}.
- `google/gemini-2.5-flash-lite` — Exact slug. Reasoning disabled. Observed temperature 0.2; observed reasoning {"enabled":false}.
- `google/gemini-2.5-flash` — Exact slug. Reasoning is optional and is disabled. Observed temperature 0.2; observed reasoning {"enabled":false}.
- `google/gemini-3.1-flash-lite` — Exact slug. Reasoning effort is pinned to minimal so a mandatory reasoning default cannot expand. Observed temperature 0.2; observed reasoning {"effort":"minimal"}.
- `google/gemini-3.5-flash-lite` — Exact slug. Newer than gemini-3.1-flash-lite. Reasoning is mandatory and the lowest effort is minimal. Observed temperature 0.2; observed reasoning {"effort":"minimal"}.
- `anthropic/claude-haiku-5.5` — Newest Haiku. Default effort is medium; the harness sets none. Temperature is omitted because the catalog does not list it. Observed temperature omitted; observed reasoning {"effort":"none"}.
- `openai/gpt-5-mini` — Exact slug. Reasoning is mandatory; lowest effort is minimal. Temperature is omitted because the catalog does not list it. Observed temperature omitted; observed reasoning {"effort":"minimal"}.
- `openai/gpt-5-nano` — Exact slug. Reasoning is mandatory; lowest effort is minimal. Temperature is omitted because the catalog does not list it. Observed temperature omitted; observed reasoning {"effort":"minimal"}.
- `deepseek/deepseek-v4.1-flash-1017` — Newest concrete DeepSeek V4.1 Flash snapshot (2026-10-17), with reasoning off. Headline price is the weekend/off-peak rate. Weekday peak hours on the catalog are 2x ($0.30 / $1.20 per million). Observed temperature 0.2; observed reasoning {"effort":"none"}.
- `qwen/qwen3-235b-a22b-2507` — Best current model named Qwen3 Instruct. The catalog does not list a reasoning parameter for this slug. No Qwen-MT model was available. Observed temperature 0.2; observed reasoning omitted.
- `meta-llama/llama-4-maverick` — Exact slug. List price is $0.1875 / $0.6525 per million. The catalog does not list a reasoning parameter. Observed temperature 0.2; observed reasoning omitted.
- `openai/gpt-oss-120b` — Exact slug. The endpoint rejects reasoning off and effort none. The harness pins effort to minimal, which is the lowest effort it accepts. Observed temperature 0.2; observed reasoning {"effort":"minimal"}.
- `google/gemma-3-27b-it` — Exact slug google/gemma-3-27b-it. The catalog does not list a reasoning parameter. Observed temperature 0.2; observed reasoning omitted.
- `mistralai/mistral-medium-3-5` — Best Mistral model in the small-to-medium band (Medium 3.5). Reasoning set to none. Observed temperature 0.2; observed reasoning {"effort":"none"}.
- `google/gemini-2.5-pro` — Escalation ceiling. Cheapest Gemini Pro-class or Claude Sonnet-class model. Reasoning is mandatory and cannot be disabled; effort is pinned to minimal so a hidden trace cannot consume the whole reply. Judges are newer models held out of the candidate list. Observed temperature 0.2; observed reasoning {"effort":"minimal"}.

Judge settings:

- `google/gemini-4-argon` — $2 / $10 per million. Reasoning `{"effort":"low"}`. Temperature 0.2. Current Gemini Pro-class model. The OpenRouter alias ~google/gemini-pro-latest points at this slug. It is not a translation candidate. Reasoning is mandatory, so the judge runs at effort low.
- `anthropic/claude-sonnet-5.5` — $2 / $10 per million. Reasoning `{"effort":"low"}`. Temperature omitted. Current Claude Sonnet-class model from a different family than the Gemini judge. Not a translation candidate. Reasoning effort is low so the judge stays careful without a long hidden trace. Temperature is omitted because the catalog does not list it.

## Worst outputs

The lowest headline scores, one case each, with the source and the output in their original scripts.

### 1. en-my-market-first

`openai/gpt-5-mini` on en→my, pronoun-reference. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Hallucinates 'nine kilos two kilos' and 'one kilo' for the second item; ungrammatical.
Judge B: Wrong number nine, garbled.

Source:

```
Then give us two kilos of the first one, and one of the other.
```

Reference:

```
ဒါဆို သရက်သီးနှစ်ကီလိုနဲ့ သင်္ဘောသီးတစ်လုံး ပေးပါဦး။
```

Output:

```
ထို့ကြောင့် အရင်ကထည့်ထားတဲ့အဲဒီကထဲက ကိုးကီလိုနှစ်ကီလိုနဲ့ နောက်တစ်မျိုးက တစ်ကီလို ပေးပါ။
```

### 2. en-km-market-first

`openai/gpt-5-nano` on en→km, pronoun-reference. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Garbled mixed-script output, wrong unit (kilo) for the second item, and reversed subject/object.
Judge B: Garbled, 'kilo' broken; referents unresolved.

Source:

```
Then give us two kilos of the first one, and one of the other.
```

Reference:

```
អញ្ចឹងសូមឱ្យស្វាយពីរគីឡូ និងសាវម៉ាវមួយផ្លែ។
```

Output:

```
ខ្ញុំអញ្ចឹងយើងផ្តល់ឱ្យពួកយើងពីរខiloនៃមួយចំនួនដំបូង ហើយមួយខiloនៃមួយផ្សេងទៀត។
```

### 3. en-my-food-slang

`openai/gpt-5-nano` on en→my, slang. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Incoherent gibberish mixed with English words.
Judge B: Garbled, mixes in Latin script, meaning lost.

Source:

```
Hook me up with the spicy one, extra fried garlic, but tell them no dried shrimp. My gut is wrecked.
```

Reference:

```
အစပ်လက်ဖက်သုပ် ပေးပါ၊ ကြက်သွန်ဖြူကြော်ထပ်ထည့်ပေးပါ၊ ပုဇွန်ခြောက်တော့ မထည့်ပါနဲ့လို့ စားဖိုမှူးကို ပြောပေးပါ။ ကျွန်မ ဗိုက်မကောင်းလို့ပါ။
```

Output:

```
ငရုတ်သီးအတိုးအကျယ်ထဲကို ထပ်မံထည့်ပြီး ကြက်သွန်ဖြူဖြင့် ပေါင်စေပြီး ဖ crisp လိုချင်ပါတယ်၊ ဒါပorkar dried shrimp မထည့်ဘူးလို့ ပြောပါ။ ကျွန်တော့်အူပိုင်းအေးသာမကျဘူး။
```

### 4. en-km-food-slang

`openai/gpt-5-nano` on en→km, slang. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Leaked chain-of-thought reasoning in English and Telugu; never provides a final translation.
Judge B: Commentary and garbage

Source:

```
Hook me up with the spicy one, extra rice, but tell them no peanuts. My gut is wrecked.
```

Reference:

```
សូមឱ្យខ្ញុំអាម៉ុកត្រីហឹរ បន្ថែមបាយ ហើយប្រាប់ចុងភៅកុំដាក់សណ្តែកដី។ ក្រពះខ្ញុំមិនស្រួល។
```

Output:

```
ដោយសូមផ្ដល់បំប៉នខ្លាំងជាមួយមDepending? Wait.

We must translate: "Hook me up with the spicy one, extra rice, but tell them no peanuts. My gut is wrecked."

Khmer translation: "ផ្តល់ឲ្យខ្ញុំពិសេសជាមួយម្ហូបចំណីខ្លាញ់? No. Let's craft:

"Hook me up with the spicy one" = "ផ្ដល់ឲ្យខ្ញុំនឹង వాట." Hmm.

In Khmer: "ខ្ញុំយកវាភាគចំហាយ" no.

Let's produce: "ខ្ញុំនឹងចាកចេញ" no.

Better: "យកចោះខ្ញុំតំណាង" Not good.

Let's translate cleanly:
- "the spicy one" = "ម្ហូបឆ្ងាញ់/ដូង?": earlier they used "ឬបែបហឹរ?" spicy dish was "ម្ទេស និងអាម៉ុកត្រី" spicy one is "ម្ហូបមានម្ទេស" or "ម្ហូបៗព្រិល"? We'll say "ម្ហូបចំណីខ្ល្រង់" meh.

Let's craft natural Khmer:

"Hook me up with the spicy one" -> "ខ្ញុំសុំផ្គុំឲ្យខ្ញុំជាមួយម្ហូបពុះខ្លាំង" Not.

Common phrase: "ចាក់ឲ្យខ្ញុំនៅ" Not.

Maybe: "បានផ្គូផ្គង់ម្ហូបឆ្ងាញ់ខ្លាំងដែលមានម្ទេសសម្រាប់ខ្ញុំ" but concise:

"យកម្ហូបចំណីដែលមានម្ទេសទៅខ្ញុំឲ្យ" hmm.

We can phrase as: "ផ្តល់ឱ្យខ្ញុំនូវម្ហូបដែលមានម្រេស" no.

Let's do:

"ខ្ញុំអីឲ្យយកយក" This is going poorly.

Let's attempt:

"ខ្ញុំចង់ម្ហូបឆ្ងាញ់ខ្លាំងដែលមានម្ទេស, បន្ថែមចានíssima" They want extra rice, but no peanuts, and gut wrecked.

Let's craft final Khmer:

"យកម្ហូបដែលមានម្ទេសឲ្យខ្ញុំ, ប្រាប់អ្នកបំភ្លឺម្ហូបបន្ថែមចានបាយ, សូមឲ្យពុំមានជីពោធិក? peanuts = peanuts in Khmer "អាំងពោត"? Peanut = "ពោធិត" No, peanut is "ពងមាន់"? Wait.

Khmer for peanut is "anuts" sorry.

Peanuts = "ល្ហុងពោធិស"? Actually peanut in Khmer is "ពោធិស"? Hmm.

Common: peanut = "ពោធិប៉ូ"? I'm uncertain.

I should respond with careful.

Let's do:

"ខ្ញុំចង់បានម្រូងព្រិច"? This is going nowhere.

I think better to decline? No.

Let's craft reasonable:

"អោយខ្ញុំជាមួយម្ហូបចំនុចដែលមានម្ទេស, បន្ថែមបាយច្រើន, ប៉ុន្តាប្រាប់ពួកគេថាមិនមានចង្កាយពងៀត ( peanuts )" Too long.

Peanuts Khmer: "ពង្រៃ" Wait peanut is " peanut = ប្រផើត?".

Actually Khmer word for peanut is "ពោត្ត័"? I'm stuck.

We must output translation only.

I'll make an educated guess: peanuts = " peanuts" in Khmer "ពង​ជូ"? No.

Let me quickly recall: peanut in Khmer is "ពោត" yes "ពោត" is peanut in Khmer? There is "ពោតពេញ"? The term "peanuts" plural maybe "ពោត" or "ពោតឆ្នោះ". Hmm.

Let's say "ពោត" is peanut. So "no peanuts" = "គ្មានពោត" or " without peanuts" = "មិនមានពោត". Ok.

Extra rice = "បាយបន្ថែម" or "បាយបន្ថែមច្រើន". We'll say "បាយបន្ថែម". spicy one = "ម្ហូបឆ្ងាញ់ដែលមានម្ទេស". Hook me up = "ផ្តល់ឲ្យខ្ញុំនូវ..." We'll do: "ផ្តល់ឲ្យខ្ញុំនូវម្ហូបដែលមានម្ទេស" Then "but tell them no peanuts" = "បុន្ទា... " tell them = "ប្រាប់ពួកគេថាគ្មានពោត". Gut wrecked = "ខ្ញុំទុកពោះខូច" or "ពោះខ្ញុំរលាក" I'll say "ពោះខ្ញុំឈឺ" or "ខ្ញុំពោះខូច" We'll say "ខ្ញុំពោះខូច." Good.

Let's assemble:

"ផ្តល់ឲ្យខ្ញុំនូវម្ហូបដែលមានម្ទេស, បាយបន្ថែម, ប៉ុន្តាប្រាប់ពួកគេថាគ្មានពោត។ ខ្ញុំពោះខូច។"

But need "hook me up with the spicy one" -> "ផ្តល់ឲ្យខ្ញុំម្ហូបទោះ? I'll use: "ផ្តល់ឲ
```

### 5. en-my-taxi-autocorrect

`openai/gpt-5-nano` on en→my, autocorrect. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Complete gibberish throughout.
Judge B: Gibberish.

Source:

```
Pint the driver in the white shirt, not the brown taxi. I need crash because the cart machine is down.
```

Reference:

```
အဝတ်ဖြူဝတ်ထားတဲ့ ယာဉ်မောင်းကို ညွှန်ပြပါ၊ အညိုရောင်တက္ကစီမဟုတ်ပါဘူး။ ကတ်စက်ပျက်နေလို့ ငွေသားလိုပါတယ်။
```

Output:

```
အဖြူရောင်အေ့ခွက်ဝတ်ထားတဲ့ ဓါတ်မှန်မဟုတ်တဲ့ ယာဉ်မောင်းကိုပဲ စီးပါ၊ အညိုရောင်တက္ကစီကိုမဟုတ်ဘူး။ မန်းတင်ပြန်တတ်တာကြောင့် ကားတန်ဆာပလာစက်လုပ်ဆောင်မှု မလုပ်ရင် ကျရှုံးမယ်။
```

### 6. en-km-taxi-autocorrect

`openai/gpt-5-nano` on en→km, autocorrect. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Incoherent gibberish, flips negation on the blue cap.
Judge B: Gibberish, wrong meaning.

Source:

```
Pint the driver in the blue cap, not the blue tuk-tuk. I need crash because the cart machine is down.
```

Reference:

```
សូមចង្អុលទៅអ្នកបើកបរដែលពាក់មួកពណ៌ខៀវ មិនមែនតុកតុកពណ៌ខៀវទេ។ ខ្ញុំត្រូវការលុយសុទ្ធ ព្រោះម៉ាស៊ីនកាតខូច។
```

Output:

```
សូមបញ្ជាក់អ្នកបើករថអត់ពាក់មួកពណ្ឋារបស់ពណ៌ខៀវ។ ខ្ញុំត្រូវការការព្រួសជាមួយច្រាចខ្យល់ព្រោះម៉ាស៊ីនកាតូចបានបរាជ័យ។
```

### 7. en-my-hotel-formality

`openai/gpt-5-nano` on en→my, honorific/formality. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Incoherent gibberish.
Judge B: Gibberish

Source:

```
Could you please check us in under U Than, for two nights, the quiet room you mentioned? Not the one facing the street.
```

Reference:

```
ကျေးဇူးပြုပြီး ဦးသန်းနာမည်နဲ့ နှစ်ညအတွက် စာရင်းသွင်းပေးပါ၊ တိတ်ဆိတ်တဲ့အခန်းမှာနေချင်ပါတယ်၊ လမ်းဘက်မျက်နှာမူတဲ့အခန်းမဟုတ်ပါဘူး။
```

Output:

```
ကျွန်တော်တို့ကို U Than နမည်မှာ နှစ်ညတည်းထားပေးပါစေ၊ စိတ်ခေတ်မထင်ရောက်အောင် တစ်ခန်းကို ဘောသာတည့် မျက်နှာမူလေးရှိသော ငြိမ်သံခေါ်ရိုက်ထားသော တချို့မဟုတ်တစ်ခန်းကို မ street-facing ဖြစ်အောင် ရွေးပေးပါ။
```

### 8. en-km-hotel-formality

`openai/gpt-5-nano` on en→km, honorific/formality. Headline 1.00 (meaning 1.00, naturalness 1.00, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Untranslated English text.
Judge B: Left in English, wrong target language

Source:

```
Could you please check us in under Dara, for two nights, the quiet room you mentioned? Not the one facing the street.
```

Reference:

```
សូមមេត្តាចុះឈ្មោះចូលស្នាក់ឱ្យយើងខ្ញុំក្រោមឈ្មោះដារ៉ា សម្រាប់ពីរយប់ ក្នុងបន្ទប់ស្ងប់ស្ងាត់ មិនមែនបន្ទប់ដែលបែរមុខទៅផ្លូវនោះទេ។
```

Output:

```
Could you please check us in under Dara, for two nights, the quiet room you mentioned? Not the one facing the street.
```

### 9. en-vi-taxi-autocorrect

`openai/gpt-5-nano` on en→vi, autocorrect. Headline 1.17 (meaning 1.00, naturalness 1.50, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Fails all three autocorrect repairs: translates 'Pint' as 'Bình luận', 'crash' as 'tai nạn khẩn cấp' (emergency accident), and 'cart machine' as 'máy ròng rọc'.
Judge B: 'tai nạn khẩn cấp' and 'máy ròng rọc'; wrong, with a leftover English label

Source:

```
Pint the green helmet, not the yellow helmet. I need crash because the cart machine is down.
```

Reference:

```
Chỉ vào mũ bảo hiểm xanh, không phải mũ bảo hiểm vàng. Tôi cần tiền mặt vì máy quẹt thẻ bị hỏng.
```

Output:

```
Bình luận: đội mũ bảo hiểm xanh, không phải mũ bảo hiểm vàng. Tôi cần tai nạn khẩn cấp vì máy ròng rọc (cart machine) bị hỏng.
```

### 10. en-hi-taxi-autocorrect

`openai/gpt-5-nano` on en→hi, autocorrect. Headline 1.17 (meaning 1.00, naturalness 1.50, handling 1.00). Critical flags: judge A yes, judge B yes.
Judge A: Translated 'pint' as 'paint' and transliterated 'crash' and 'cart' without repair.
Judge B: Translates "paint" and keeps "crash" and "cart".

Source:

```
Pint the driver with the black stripe on the door, not the green taxi. I need crash because the cart machine is down.
```

Reference:

```
उस ड्राइवर की ओर इशारा कीजिए जिसकी गाड़ी के दरवाजे पर काली पट्टी है, हरी टैक्सी की ओर नहीं। मुझे नकद चाहिए क्योंकि कार्ड मशीन खराब है।
```

Output:

```
उस ड्राइवर को पेंट करें जिसकी गाड़ी के दरवाजे पर काली पट्टी है, हरी टैक्सी नहीं। मुझे क्रैश चाहिए क्योंकि कार्ट मशीन डाउन है।
```


## Limitations

- Sample: 120 written conversations and one decoding each. Several problem cells still have modest n, and the bootstrap interval treats cases as exchangeable. They were designed as a grid, not drawn from production logs.
- Judges are two LLMs. The correlation and kappa above are the agreement we measured. They are not a substitute for bilingual speakers, especially for Burmese, Khmer, and Bengali.
- References were written by Claude Sonnet 5 from an English contract and audited by Gemini 3.1 Pro Preview. The judges did not write the references, but a fluent rendering that the meaning note did not anticipate can still be underscored. The meaning note, not the reference wording, is the authority for facts.
- The reviewer is also an LLM. A drop removes an item; it does not prove the remaining Burmese, Khmer, or Bengali sentences would pass a native editor.
- Temperature is 0.2 where the catalog allows it and omitted where the model rejects the field (Haiku 5.5, GPT-5 Mini, GPT-5 Nano). Those models use the provider default. Reasoning was pinned to off, none, or minimal. A vendor-default reasoning mode would cost more and take longer.
- Production calls xAI `grok-4.20-0309-non-reasoning`. This study uses OpenRouter `x-ai/grok-4.20` with reasoning disabled. Latency here includes OpenRouter routing and is not the xAI direct latency.
- Prices were copied from the OpenRouter catalog on 2026-10-24 and will change. DeepSeek V4.1 Flash 1017's weekday peak list price is double the headline rate used in the model table. Measured `usage.cost` is the better cost number for the day the run happened.
- The cached-prompt column assumes a 10% cache-read price for the system prompt. This run's observed cached-token counts are in the cost table. Do not treat the assumed column as a bill.
- The ceiling model is Gemini 2.5 Pro because it was the cheapest Pro-class or Sonnet-class model. Newer Pro and Sonnet models were reserved as judges. The gap between the default and the ceiling is not the gap to the best model money can buy in 2026.
- There is no Qwen-MT number in this study, because OpenRouter did not list one. There is no Grok fast or mini number, because those slugs were absent.
- Critical errors are judge flags. A shared blind spot, for example a polite wrong dose that both models miss, would not show up.

