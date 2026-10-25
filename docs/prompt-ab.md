# Prompt A/B

Translator: `google/gemini-3.1-flash-lite` at temperature 0.2 with reasoning effort minimal. Judges: `x-ai/grok-4.7` (reasoning effort low, temperature 0.2) and `anthropic/claude-sonnet-5.5` (reasoning effort low, temperature omitted). Each judge saw the two outputs in a seeded blind order and used the same rubric as `eval/spot-judge.mjs`.

Critical group: the 14 ids in `eval/results/s31-critical.json`. Control group: 16 other cases from `eval/cases.json`, sorted by id, then shuffled with seed 20261024.

New OpenRouter spend on this A/B (ledger kinds `ab-translate` and `ab-judge`): $0.3335. Cap: $1.50.

Mean is the average of meaning, naturalness, and handling on paired judgements (a judge counted only when it scored both prompts). Critical errors are the number of those judgements flagged `critical_error`.

## initial

| Group | Prompt | Mean | Critical errors | Judgements |
| --- | --- | ---: | ---: | ---: |
| critical | old | 3.06 | 22 | 28 |
| critical | new | 4.18 | 8 | 28 |
| control | old | 4.66 | 0 | 32 |
| control | new | 4.76 | 0 | 32 |

| Group | Judge | Old mean | New mean | Old critical | New critical |
| --- | --- | ---: | ---: | ---: | ---: |
| critical | `x-ai/grok-4.7` | 3.21 | 4.33 | 12 | 4 |
| critical | `anthropic/claude-sonnet-5.5` | 2.90 | 4.02 | 10 | 4 |
| control | `x-ai/grok-4.7` | 4.75 | 4.77 | 0 | 0 |
| control | `anthropic/claude-sonnet-5.5` | 4.56 | 4.75 | 0 | 0 |

Controls did not regress.

## Decision

The new prompt did not regress on the controls, so it stays the production prompt.

