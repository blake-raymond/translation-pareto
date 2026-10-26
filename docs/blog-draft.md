# The Cost-Performance Pareto Frontier for LLM Translation

Title options:

1. Translation quality against cost for 15 LLMs in 72 languages
2. A cost-quality Pareto frontier for LLM translation, judged on 4,245 cases
3. Measuring LLM translation quality per dollar across 72 languages

Draft status: second draft. Items marked [CHECK] need verification.

---

I ran 4,245 English-to-X translation cases across 72 languages through 15 LLMs, scored every output with one judge model, and plotted quality against billed cost. The cost-quality frontier has GPT-6 Luna at $0.021 per 1,000 messages, DeepSeek V4.1 Flash at $0.050 and Gemini 3.1 Flash-Lite at $0.080. Every other model tested costs more than one of those three and scores clearly lower.

Their mean scores are 4.56, 4.56 and 4.73 on a 1-5 scale. Their critical-error rates differ more. On the shared subsample, Luna made a serious mistake on 7.9% of messages, DeepSeek on 4.4% and Gemini 3.1 Flash-Lite on 1.7%.

The test set is weighted toward conversational messages: short, informal lines with typos, missing accents, slang and references to earlier turns. I built it while choosing a model for say.as, a two-person translation chat app (https://say.as [CHECK: link live?]).

## Method

### Test cases

Each of the 72 non-English languages gets up to 40 benchmark cases and 20 chat cases, all translating out of English. That gives 2,805 benchmark cases and 1,440 chat cases.

Benchmark items come from WMT24++ where the language is covered, preferring the social and speech domains and shorter segments. Languages WMT24++ lacks fall back to NTREX-128, then Tatoeba. FLORES+ requires an approved Hugging Face account, and I ran without it. Languages with fewer than 40 clean segments use every segment available, so a few have fewer cases. Bhojpuri has 30 and Sundanese 34. Per-language counts are in `data/coverage.json`, and source licenses in `data/LICENSES.md`.

Chat items are synthetic multi-turn conversations drafted by Claude Opus 5.5. Each one has the earlier turns as history, with the typos, slang and pronoun references that real chat messages have. Drafting them cost $10.67, the second-largest line in the budget.

### Translation

Every model received the same system prompt (`eval/prompts/v1.txt`):

> You are a professional interpreter for a live face-to-face conversation. Use the full history for pronouns, tone, slang, and references. Be forgiving of typos, missing accents, and bad autocorrect, and infer the intended meaning. Output only the translation with no commentary.

Chat items include the conversation history. All calls went through OpenRouter. Models that allow it ran with reasoning off. For the supplement models where OpenRouter requires reasoning (GLM 5.3 Flash, MiniMax M3.1 Flash and Muse Spark 1.3), I used the lowest accepted effort, `minimal`, with temperature 0.2 and `max_tokens` 1200. [CHECK: confirm the reasoning and temperature settings for the 11 main-run models in `eval/pareto/models.json`.]

### Judging

One judge, Claude Opus 5.5, scored all candidates for a case in one prompt. The candidates were shuffled and labelled A, B, C and so on, with no model names. For each candidate the judge returned four integers:

- meaning, 1-5
- naturalness, 1-5
- handling, 1-5, covering repair of typos, slang, autocorrect, diacritics, code-switching and honorifics
- a critical-error flag, set only for a wrong or reversed meaning, the wrong target language, a flipped negation, a wrong number, dose or price, or an offensive mistranslation. Awkward wording or a register miss alone does not count.

A candidate's score is the mean of the three 1-5 ratings. Benchmark items showed the judge the reference translation. Chat items have no reference, so the judge scored from the source line and the history. Cases went to the judge in batches of 150. The judge returned compact `m,n,h,c` strings and had no parse failures across the 4,245 cases.

Scoring all candidates side by side (listwise) is cheaper than scoring each one alone, and it makes the judge compare translations directly. In exchange, scores are partly relative to the other candidates in the prompt.

### Statistics and the frontier rule

Each language counts equally in the overall mean, so high-resource languages don't dominate. The 95% intervals come from a hierarchical bootstrap with 2,000 draws (seed 20261025) that resamples languages, then cases within each language.

A model is off the frontier only if another model costs no more and is clearly better. Clearly better means the paired bootstrap interval of the per-case difference lies entirely above zero. Models within noise of each other can all stay on the frontier.

Cost is what OpenRouter billed (`usage.cost`) for each successful translation call, including reasoning tokens, scaled to 1,000 messages. It excludes judging and chat drafting.

### The supplement and anchoring

After the main run of 11 models, I added four newer ones: GPT-6 Luna, GLM 5.3 Flash, MiniMax M3.1 Flash and Muse Spark 1.3. Luna and Muse Spark were limited to 20 requests per minute on a new OpenRouter account, so all four were judged on a fixed subsample of 1,080 cases, the first 10 benchmark and first 5 chat cases per language in file order.

The supplement used the same judge, rubric and batch format, with a six-candidate panel: the four new models plus Gemini 3.1 Flash-Lite and DeepSeek V4.1 Flash from the main run as anchors. Each new model is placed on the main-run scale as Gemini's full-run mean plus the new model's paired gap to Gemini on the subsample.

The anchors make the placement checkable. Under the main judge pass, the Gemini-DeepSeek gap on the subsample was +0.12 (0.04 to 0.20). In the supplement pass it was +0.14 (0.06 to 0.22). The subsample is slightly harder for Gemini: it scores 4.69 there in the main run against 4.73 on all cases. Placing models through the paired gap corrects for that.

Where a new model is compared with a main-run model other than the anchors, the two were never in the same prompt. The frontier rule then uses a conservative combined interval rather than a direct paired one.

During the supplement, one 150-case judge batch was refused by the provider's content filter as a false positive, and I re-judged those cases in batches of 30. Also, 11 translations failed on a local ledger file lock and were re-run, and their stale judge scores were discarded.

### Spend

| Step | USD |
| --- | ---: |
| Chat drafting | $10.67 |
| Translations | $5.23 |
| Judging | $23.81 |
| Supplement (four extra models, translation and judging) | $3.97 |
| Total | $43.68 [CHECK: supplement share is from notes, not a repo file. Confirm against the ledger.] |

That works out to $0.0094 per case including drafting and judging, and $0.00010 per model-case for translation alone. Those per-case figures are for the 11-model main run, where judging was 60% of the spend.

### Reproducing it

Everything is at https://github.com/blake-raymond/translation-pareto. Put `OPENROUTER_API_KEY=...` in `.openrouter.env`, then:

```
node eval/pareto/run.mjs --pilot   # 5-language pilot, stops before the paid full run
node eval/pareto/run.mjs --full    # 72 languages, all main-run models, one judge
```

The run keeps a spend ledger in `eval/pareto/results/ledger.json`, with a hard cap and a soft stop set in `eval/pareto/meta.mjs`. Sampling uses a fixed seed, and the sampled cases are committed in `data/benchmark-cases.json` and `data/chat-cases.json`. A rerun uses the same cases. Judge output will vary somewhat between runs. The supplement report is produced by `eval/pareto/supp-report.mjs`. [CHECK: add the exact command for the supplement run.] Without `HF_TOKEN` the sampler skips FLORES+.

## Results

![Quality against cost, main run](pareto.svg)

![Combined frontier including the four supplement models](pareto-combined.svg)

Main run, all 4,245 cases:

| Model | Mean (95% CI) | Critical | $ / 1k msgs |
| --- | --- | ---: | ---: |
| Gemini 3.1 Flash-Lite | 4.73 (4.70-4.76) | 0.9% | $0.080 |
| Gemini 2.5 Flash | 4.59 (4.56-4.62) | 1.7% | $0.117 |
| DeepSeek V4.1 Flash | 4.56 (4.51-4.61) | 2.7% | $0.050 |
| Gemini 3.5 Flash-Lite | 4.49 (4.44-4.53) | 2.9% | $0.120 |
| Gemini 2.5 Flash-Lite | 4.38 (4.32-4.43) | 4.5% | $0.025 |
| Grok 4.20 | 4.36 (4.31-4.41) | 3.4% | $0.265 |
| Claude Haiku 5.5 | 4.35 (4.28-4.42) | 4.2% | $0.051 |
| Llama 4 Maverick | 4.18 (4.11-4.25) | 5.7% | $0.046 |
| GPT-5 mini | 4.03 (3.89-4.15) | 9.2% | $0.135 |
| Qwen3 235B A22B | 3.86 (3.68-4.00) | 14.4% | $0.051 |
| GPT-5 nano | 3.17 (3.02-3.32) | 26.1% | $0.030 |

Supplement, 1,080-case subsample, scores placed on the main-run scale. † marks the four models judged in the separate anchored pass. Their scores don't come from the same listwise judge prompts as the other 11, and the combined chart puts them on the main scale through the anchors.

| Model | Score (main scale) | Critical (subsample) | $ / 1k msgs |
| --- | --- | ---: | ---: |
| Gemini 3.1 Flash-Lite (anchor) | 4.73 | 1.7% | $0.080 |
| DeepSeek V4.1 Flash (anchor) | 4.56 | 4.4% | $0.050 |
| GPT-6 Luna† | 4.56 ±0.09 | 7.9% | $0.021 |
| Muse Spark 1.3† | 4.48 ±0.10 | 9.0% | $0.843 |
| GLM 5.3 Flash† | 4.38 ±0.11 | 6.5% | $0.025 |
| MiniMax M3.1 Flash† | 3.86 ±0.20 | 18.5% | $0.101 |

The anchors' critical-error rates are higher on the subsample than in the full run (Gemini 1.7% against 0.9%, DeepSeek 4.4% against 2.7%). When comparing the new models with the anchors, use the subsample column.

**Newer and bigger didn't win.** Gemini 3.5 Flash-Lite is a newer version than 3.1 Flash-Lite and costs half as much again per message ($0.120 against $0.080), yet it scored 0.24 lower (95% CI 0.21-0.29). Grok 4.20 is the most expensive model in the main run at $0.265 per 1,000 messages and scored 4.36. Muse Spark 1.3 costs $0.843 per 1,000 messages, about ten times the Gemini price, because its reasoning can't be turned off on OpenRouter, and it still scored lower.

**Luna's place on the frontier is narrow.** GPT-6 Luna matches DeepSeek's mean (a paired gap of -0.03, CI -0.14 to 0.07) at less than half the price. Its critical-error rate is the highest of the three frontier models, though. Luna and Gemini 2.5 Flash-Lite were never judged in the same prompt, so the call that Luna scores higher rests on a conservative combined interval rather than a direct comparison.

**Benchmark and chat agree on the winner.** Gemini 3.1 Flash-Lite had the highest mean on both the benchmark cases (4.70) and the chat cases (4.80). Most models scored higher on chat than on benchmark items, likely because the chat messages are short. [CHECK: that explanation is my guess. The repo doesn't test it.]

## Where models fail

The averages hide most of the interesting failures, which are in specific languages. I flagged a language for a model when the model's mean was below 3.5 or more than 25% of its outputs had a critical error. In the main run, 46 of the 72 languages had at least one flagged model.

Most of the flags belong to two models. GPT-5 nano scored lowest on Amharic (mean 1.61, 78.3% critical), Kurdish (1.62, 73.3%), Lao (1.62, 75.0%) and Tamil (1.90, 70.0%). Qwen3 235B did worst on Yoruba (1.85, 71.7%), Hausa (1.88, 78.3%), Somali (2.06, 68.3%) and Zulu (2.16, 63.3%).

The flags that surprised me came from otherwise good models:

- DeepSeek V4.1 Flash had a 31.7% critical-error rate on Slovak (mean 3.62), against a 2.7% rate overall. [CHECK: I haven't read those outputs. Look at what went wrong before publishing; it could be the wrong target language, such as Czech.]
- Claude Haiku 5.5 crossed both thresholds on Igbo (mean 3.24, 26.7% critical).
- In the supplement, GPT-6 Luna crossed 25% critical on Swedish (3.91, 26.7%) and Igbo (4.04, 26.7%). Those cells are 15 cases each, so four bad messages are enough to flag a language.
- MiniMax M3.1 Flash was flagged on 22 languages, mostly African and South and Southeast Asian ones such as Yoruba (1.84, 80.0%), Lao (1.89, 66.7%) and Khmer (1.98, 73.3%).

Gemini 3.1 Flash-Lite had no flags. Its lowest language means were Zulu (4.23), Cebuano (4.41), Igbo (4.46) and Somali (4.46).

[CHECK: in an earlier, smaller test the weakest languages for my app were Vietnamese, Khmer, Japanese and Korean. In this run Gemini 3.1 Flash-Lite scores 4.67, 4.77, 4.70 and 4.76 on them. Decide whether to mention the earlier result and how to reconcile it. It was a different case set and judge setup.]

## The cost math

At these prices, translation cost is small in absolute terms. Translating all 4,245 cases with 11 models cost $5.23.

Per 1,000,000 messages:

| Model | Cost | Messages with a critical error |
| --- | ---: | ---: |
| GPT-6 Luna | about $21 | about 79,000 (7.9%) |
| DeepSeek V4.1 Flash | about $50 | about 44,000 (4.4%) |
| Gemini 3.1 Flash-Lite | about $80 | about 17,000 (1.7%) |
| Grok 4.20 | about $265 | |
| Muse Spark 1.3 | about $843 | about 90,000 (9.0%) |

Critical-error rates are from the 1,080-case subsample, where all three frontier models were judged together. Grok 4.20 wasn't in the supplement, and its full-run rate is 3.4%.

Going from Gemini 3.1 Flash-Lite to Luna saves about $59 per million messages and adds roughly 62,000 messages with a wrong meaning, wrong number or similar serious error. Whether that trade is acceptable depends on what a mistake costs. Actual bills also depend on message length and history depth, since billing is per token.

## Limitations

- **One LLM judge.** No native speaker checked these outputs. The scores show what Opus 5.5 thinks, and its judgment is probably weakest in exactly the low-resource languages where models differ most.
- **Judge family bias.** A judge can favor outputs that resemble its own. Claude Haiku 5.5 landed mid-table at 4.35, so there is no obvious favoritism, but this run didn't use a second judge to measure it. [CHECK: the earlier pilot used two judges. Say whether they agreed.]
- **English source only.** Every case translates out of English. The reverse direction and non-English pairs are untested.
- **Synthetic chat.** The chat cases were written by an LLM from the same family as the judge, not collected from real users.
- **Listwise drift.** Scores depend a little on which candidates share the prompt. The anchor check suggests the effect is small, not zero.
- **Noisy per-language cells.** Up to 60 cases per language in the main run and 15 in the supplement. One or two bad outputs can move a cell past a threshold.
- **Separate judge pass.** GPT-6 Luna, GLM 5.3 Flash, MiniMax M3.1 Flash and Muse Spark 1.3† were judged in a separate pass with a six-candidate panel on 1,080 cases, then anchored to the main scale through Gemini 3.1 Flash-Lite and DeepSeek V4.1 Flash. Their scores include the anchor's uncertainty, and comparing them with non-anchor main-run models relies on a conservative combined interval rather than a direct paired one.
- **Subsample costs.** Luna and Muse Spark costs come from 1,080 calls, not 4,245.
- **Language varieties.** WMT24++ uses specific locales, such as Mexican Spanish and Egyptian Arabic, and I treated each as the whole language.

## Next steps

- Native-speaker review of a sample, starting with the flagged languages.
- A second judge from a different model family on the same cases.
- Reading the outputs behind the surprising flags, starting with DeepSeek on Slovak.
- Non-English source languages and the reverse direction.
- FLORES+, plus automatic metrics such as COMET or MetricX for comparison.
- Luna and Muse Spark on the full case set.

Code, cases, judge prompts and the full result tables are at https://github.com/blake-raymond/translation-pareto, with the detailed numbers in `docs/results.md` and `docs/results-supplement.md`.
