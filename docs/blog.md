# The Cost-Performance Pareto Frontier for LLM Translation

I ran 4,245 translation cases between English and 72 other languages through 15 LLMs, scored every output with one judge model, and plotted quality against billed cost. GPT-6 Luna had the highest mean score, 4.69 out of 5, at $0.032 per 1,000 messages. The cost-quality frontier is GPT-6 Luna, plus two cheaper and weaker models at $0.025, Gemini 2.5 Flash-Lite (4.27) and GLM 5.3 Flash (4.23). Each of the other 12 models has some model that costs no more and scores clearly higher.

Gemini 3.1 Flash-Lite came close. It scored 4.66 at $0.080, and its gap to Luna is 0.033 with a 95% interval of 0.000 to 0.065, so it misses the frontier by the narrowest margin the rule allows. It also made fewer serious mistakes: 1.5% of its outputs had a critical error, against 2.1% for Luna. Muse Spark 1.3 had the lowest critical-error rate of all, 0.8%, at $0.973 per 1,000 messages, 30 times Luna's price.

The test set is weighted toward conversational messages: short, informal lines with typos, missing accents, slang and references to earlier turns. I built it while choosing a model for say.as, a two-person translation chat app.

## Method

### Test cases

Each of the 72 non-English languages gets up to 40 benchmark cases and 20 chat cases. That gives 2,805 benchmark cases, all translating out of English, and 1,440 chat cases, of which 723 translate from English and 717 into English.

Benchmark items come from WMT24++ where the language is covered, preferring the social and speech domains and shorter segments. Languages WMT24++ lacks fall back to NTREX-128, then Tatoeba. FLORES+ requires an approved Hugging Face account, and I ran without it. Languages with fewer than 40 clean segments use every segment available, so a few have fewer cases. Bhojpuri has 30 and Sundanese 34. Per-language counts are in `data/coverage.json`, and source licenses in `data/LICENSES.md`.

Chat items are synthetic multi-turn conversations drafted by Claude Opus 5.5. Each one has the earlier turns as history, with the typos, slang and pronoun references that real chat messages have.

### Translation

Every model received the same system prompt (`eval/prompts/v1.txt`):

> You are a professional interpreter for a live face-to-face conversation. Use the full history for pronouns, tone, slang, and references. Be forgiving of typos, missing accents, and bad autocorrect, and infer the intended meaning. Output only the translation with no commentary.

Chat items include the conversation history. All calls went through OpenRouter. Models that allow it ran with reasoning off: GPT-6 Luna, Claude Haiku 5.5, DeepSeek V4.1 Flash, Gemini 2.5 Flash, Gemini 2.5 Flash-Lite and Grok 4.20. Qwen3 235B and Llama 4 Maverick have no reasoning setting. The rest ran at the lowest accepted effort, `minimal`: Gemini 3.1 and 3.5 Flash-Lite, GPT-5 mini and nano, GLM 5.3 Flash, MiniMax M3.1 Flash and Muse Spark 1.3. Temperature was 0.2, except for the OpenAI models and Claude Haiku 5.5, which ran without one. `max_tokens` was between 400 and 1,200 depending on the model. The exact settings are in `eval/pareto/models.json`.

### Judging

One judge, Claude Opus 5.5, scored all 15 candidates for a case in one prompt. The candidates were shuffled and labelled A to O, with no model names. For each candidate the judge returned four integers:

- meaning, 1-5
- naturalness, 1-5
- handling, 1-5, covering repair of typos, slang, autocorrect, diacritics, code-switching and honorifics
- a critical-error flag, set only for a wrong or reversed meaning, the wrong target language, a flipped negation, a wrong number, dose or price, or an offensive mistranslation. Awkward wording or a register miss alone does not count.

A candidate's score is the mean of the three 1-5 ratings. Benchmark items showed the judge the reference translation as a hint. Chat items have no reference, so the judge scored from the source line and the history. Cases went to the judge in batches of 30, and the judge returned compact `m,n,h,c` strings.

Scoring all candidates side by side (listwise) is cheaper than scoring each one alone, and it makes the judge compare translations directly. In exchange, scores are partly relative to the other candidates in the prompt. Changing the panel from 11 to 15 models moved the absolute scores a little. Gemini 3.1 Flash-Lite scored 4.73 in my earlier 11-model pass and 4.66 here.

4,242 of the 4,245 cases were scored. For three cases (`bench-ha-22`, `bench-ha-26` and `chat-lo-09`), the judge returned an empty or cut-off reply on every attempt, including alone in a batch of one. Their source lines are harmless, so one of the candidate outputs probably triggered the provider's filter. Each model's averages use those same 4,242 cases.

### Statistics and the frontier rule

Each language counts equally in the overall mean, so high-resource languages don't dominate. The 95% intervals come from a hierarchical bootstrap with 2,000 draws (seed 20261025) that resamples languages, then cases within each language.

A model is off the frontier only if another model costs no more and is clearly better. Clearly better means the paired bootstrap interval of the per-case difference lies entirely above zero. Models within noise of each other can all stay on the frontier.

Cost is what OpenRouter billed (`usage.cost`) for each successful translation call, including reasoning tokens, scaled to 1,000 messages. It excludes judging and chat drafting.

### Checking the judge

Different models sometimes produce exactly the same translation, and the judge should score identical text the same way. Of 37,274 such pairs, 38 (0.10%) got a different critical flag or scores at least 2 points apart. They come from 9 cases, 12 of the pairs from one Thai case. In each, the judge scored one copy lower than an identical copy in the same prompt, probably by mixing up candidate labels in a 15-item list. I left these scores as they are. Spread across 4,242 cases, they move no model's mean by more than about 0.01. The full list is in `docs/sanity-all15.txt`.

This check exists because an earlier version of this eval had a caching bug. I first ran 11 models, then added four newer ones in a separate pass. One batch in that second pass was scored while two models' translations were still empty, and the stale scores were later attached to the real outputs. That understated GPT-6 Luna (4.56 with 7.9% critical errors, against 4.69 and 2.1% now) and Muse Spark (4.48 and 9.0%, against 4.64 and 0.8%). I fixed the cache key, made the judge refuse empty candidates, and re-ran all 15 models in the one pass reported here.

### Spend

Ledger totals for the whole project, including the earlier passes:

| Step | USD |
| --- | ---: |
| Chat drafting | $10.67 |
| First pass, 11 models: translations | $5.23 |
| First pass: judging | $23.81 |
| Separate pass, 4 models: translations and judging | $3.98 |
| Single 15-model pass: missing translations | $3.33 |
| Single 15-model pass: judging | $31.66 |
| Total | $78.67 |

The 15-model judge pass by itself cost about $0.0075 per case. Re-running the results in this post from the committed cases and cached translations would cost about the judging line, around $32.

### Reproducing it

Everything is at https://github.com/blake-raymond/translation-pareto. Put `OPENROUTER_API_KEY=...` in `.openrouter.env`. The combined run is `eval/pareto/run-all15.sh` (or `run-all15.ps1` on Windows), which sets the 15-model panel and translates anything missing. It then judges in batches of 30, retries failed batches in smaller ones and runs the identical-output check. The report is `node eval/pareto/report.mjs --full` with the same environment; the README lists the exact commands.

The run keeps a spend ledger in `eval/pareto/results/ledger.json`, with a hard cap and a soft stop set in `eval/pareto/meta.mjs`. Sampling uses a fixed seed, and the sampled cases are committed in `data/benchmark-cases.json` and `data/chat-cases.json`. A rerun uses the same cases. Judge output will vary somewhat between runs. Without `HF_TOKEN` the sampler skips FLORES+.

## Results

![Quality against cost, all 15 models in one judge pass](pareto.svg)

| Model | Mean (95% CI) | Critical | $ / 1k msgs |
| --- | --- | ---: | ---: |
| GPT-6 Luna | 4.69 (4.66-4.72) | 2.1% | $0.032 |
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

**The top three are close.** Luna leads Gemini 3.1 Flash-Lite by 0.033 (95% CI 0.000 to 0.065) and Muse Spark by 0.051 (0.008 to 0.090). On chat cases alone the three are level at 4.74. Luna's lead comes from the benchmark cases, where it scored 4.67 against 4.62 for Gemini and 4.59 for Muse Spark.

**Mean score and critical-error rate rank the top models differently.** By mean, Luna is first. By critical-error rate, the order is Muse Spark (0.8%), Gemini 3.1 Flash-Lite (1.5%), then Luna (2.1%). Which matters more depends on the application.

**Newer and bigger didn't win.** Gemini 3.5 Flash-Lite is a newer version than 3.1 Flash-Lite and costs $0.120 against $0.080, yet it scored 0.26 lower. Grok 4.20 is the second most expensive model at $0.265 per 1,000 messages and scored 4.27. Muse Spark's reasoning can't be turned off on OpenRouter, and that reasoning brings its cost to about $1 per 1,000 messages.

**DeepSeek fell back.** In my earlier 11-model pass, DeepSeek V4.1 Flash was on the frontier. Here it scores 4.47, 0.19 below Gemini 3.1 Flash-Lite, and Luna is both cheaper and higher-scoring.

## Where models fail

The averages hide most of the interesting failures, which are in specific languages. For models that cost at most $0.10 per 1,000 messages, I flagged a language when the model's mean there was below 3.5 or more than 25% of its outputs had a critical error. 50 of the 72 languages had at least one flagged model.

Most of the flags belong to two models. GPT-5 nano was flagged in all 50 of those languages, with its lowest scores in Amharic (mean 1.53, 80.0% critical), Kurdish (1.63, 81.7%) and Lao (1.72, 81.4%). Qwen3 235B was flagged in 14, worst in Hausa (1.94, 77.6%) and Yoruba (1.94, 75.0%). MiniMax M3.1 Flash, at $0.101, sits just outside the cheap group, but its mean was below 3.5 in 29 languages, lowest in Sindhi (1.89).

Some flags came from otherwise solid models:

- DeepSeek V4.1 Flash had a 33.3% critical-error rate on Slovak (mean 3.35). 18 of its 20 critical outputs were in Slovenian, not Slovak: the wrong target language.
- Claude Haiku 5.5 was flagged on Igbo (3.13, 28.3% critical).
- Gemini 2.5 Flash-Lite was flagged on Kurdish (3.38, 31.7%).
- GLM 5.3 Flash was flagged on Yoruba (3.26, 35.0%), Zulu, Somali and Kurdish.

GPT-6 Luna and Gemini 3.1 Flash-Lite had no flags. Luna's lowest language means were Kurdish (4.06), Lao (4.39) and Igbo (4.41). Gemini 3.1 Flash-Lite's were Kurdish (4.20), Zulu (4.22) and Igbo (4.39). Muse Spark 1.3 had no language below 3.5. Its second-lowest language was French (4.39), which is odd for a high-resource language. It made no critical errors in French. The lower mean comes from a few hard benchmark lines, such as the garbled `when in on $big 4.25-.35`, which it copied through almost unchanged and which scored 1.

Each language cell has up to 60 cases, so one or two bad outputs can move a cell past a threshold.

## The cost math

At these prices, translation cost is small in absolute terms. Translating all 4,245 cases with all 15 models cost about $10 in total across the passes ($5.23 + $1.50 + $3.33).

Per 1,000,000 messages:

| Model | Cost | Messages with a critical error |
| --- | ---: | ---: |
| GLM 5.3 Flash | about $25 | about 65,000 (6.5%) |
| Gemini 2.5 Flash-Lite | about $25 | about 59,000 (5.9%) |
| GPT-6 Luna | about $32 | about 21,000 (2.1%) |
| DeepSeek V4.1 Flash | about $50 | about 36,000 (3.6%) |
| Gemini 3.1 Flash-Lite | about $80 | about 15,000 (1.5%) |
| Grok 4.20 | about $265 | about 45,000 (4.5%) |
| Muse Spark 1.3 | about $973 | about 8,000 (0.8%) |

Going from Luna to Gemini 3.1 Flash-Lite costs about $48 more per million messages and avoids roughly 6,000 critical errors. Going from Gemini 3.1 Flash-Lite to Muse Spark costs about $893 more and avoids about 7,000. The right choice depends on what a mistake costs. Actual bills also depend on message length and history depth, since billing is per token.

## Limitations

- **One LLM judge.** No native speaker checked these outputs. The scores show what Opus 5.5 thinks, and its judgment is probably weakest in exactly the low-resource languages where models differ most.
- **Judge family bias.** A judge can favor outputs that resemble its own. Claude Haiku 5.5 landed mid-table at 4.26, so there is no obvious favoritism, but this run didn't use a second judge to measure it. In an earlier 120-case pilot, two judges from different families (Gemini 4 Argon and Claude Sonnet 5.5) agreed fairly well: Pearson 0.88 on overall scores and Cohen's kappa 0.76 on the critical-error flag. That pilot is in `docs/translation-model-comparison.md`.
- **Judge label errors.** The identical-output check found 38 inconsistent pairs out of 37,274. That's small, but it means some individual scores are wrong.
- **English on one side.** Benchmark cases translate out of English, and chat cases translate from or into English. Pairs without English are untested.
- **Synthetic chat.** The chat cases were written by an LLM from the same family as the judge, not collected from real users.
- **Listwise scores are relative.** Scores depend on which candidates share the prompt. The numbers here aren't comparable to my earlier 11-model pass. Compare models within one table.
- **Narrow frontier calls.** Gemini 3.1 Flash-Lite is off the frontier by an interval whose lower bound is 0.0001. A rerun with a different seed or judge sample could put it back on.
- **Noisy per-language cells.** One or two bad outputs can move a language past a threshold.
- **Unscored cases.** The judge never returned scores for three cases, and they're excluded for all models.
- **Language varieties.** WMT24++ uses specific locales, such as Mexican Spanish and Egyptian Arabic, and I treated each as the whole language.

## Next steps

- Native-speaker review of a sample, starting with the flagged languages.
- A second judge from a different model family on the same cases.
- An automatic wrong-target-language check, since DeepSeek's Slovak failures were mostly Slovenian.
- Language pairs without English, and reference-based benchmark cases into English.
- FLORES+, plus automatic metrics such as COMET or MetricX for comparison.

Code, cases, judge prompts and the full result tables are at https://github.com/blake-raymond/translation-pareto, with the numbers in `docs/results.md`.
