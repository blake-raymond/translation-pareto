# translation-pareto

An open, reproducible benchmark of the cost-versus-quality frontier of LLMs for **conversational translation**: short, informal chat messages with conversation history, typos, missing diacritics, slang and pronoun references, across many languages. Costs are what OpenRouter actually billed, including reasoning tokens.

Status: work in progress. The first run (120 cases, 12 languages, 15 models, two judges, plus a single-prompt Opus 5.5 judge) is written up in `docs/translation-model-comparison.md`. A larger run (benchmark sets WMT24++ and FLORES+, plus a synthetic chat layer, one judge, bootstrap confidence intervals) is in progress.

## Layout
- `eval/` the first harness: case generation and review, candidate runs, judges (`mega-judge.mjs` scores all cases in one prompt), reports (`mega-report.mjs`, `ci-check.mjs`), spend ledger and cap.
- `eval/pareto/` the 73-language cost-vs-quality run: WMT24++ / NTREX / Tatoeba samples, synthetic chat, one Opus 5.5 judge, bootstrap CIs.
- `data/` sampled benchmark and chat cases, plus `LICENSES.md`. Raw downloads stay in `data/raw/` (git-ignored).
- `docs/` write-ups. Pilot/full Pareto tables land in `docs/results.md` and `docs/pareto.svg`.

## Running
Create `.openrouter.env` containing `OPENROUTER_API_KEY=...` (git-ignored). Then `node eval/run.mjs`. A spend cap (`CAP_USD` in `eval/meta.mjs`) stops runs when reached.

The Pareto stage has its own ledger (`eval/pareto/results/ledger.json`) and a **$48** cap (`eval/pareto/meta.mjs`). Run the 5-language pilot only until the printed projection is reviewed:

```
node eval/pareto/run.mjs --pilot
```

That command samples benchmark data, drafts chat cases, translates, judges, writes `docs/results.md`, and **stops**. It does not start the 73-language paid run. FLORES+ is gated; without `HF_TOKEN` the sampler uses WMT24++ plus NTREX-128 and Tatoeba.

## Caveats
LLM-judged, not human-verified. Single-judge results can favor the judge's own model family. Per-language results are noisy at small sample sizes; see the confidence-interval analysis in the docs.

## License
Code: MIT. Benchmark data from third parties keeps its own license (WMT24++ Apache 2.0, FLORES+ CC BY-SA 4.0).
