# Data licenses

This folder holds the sampled evaluation cases (`benchmark-cases.json`, `chat-cases.json`) and the raw results of the 15-model run (`results/`). Raw downloads stay in `data/raw/` and are git-ignored. Every case records its `dataset` and `license`.

Counts in `benchmark-cases.json`: WMT24++ 1,800, NTREX-128 840, Tatoeba 165 (90 from the Tatoeba.org API, 75 from OPUS). FLORES+ 0.

## WMT24++

- Source: https://huggingface.co/datasets/google/wmt24pp
- Paper: Deutsch et al., *WMT24++: Expanding the Language Coverage of WMT24 to 55 Languages & Dialects*
- License: Apache 2.0
- Use: English→xx benchmark segments. Sampling prefers the `social` and `speech` domains, then shorter segments. Canary and `is_bad_source` rows are dropped.

## FLORES+

- Source: https://huggingface.co/datasets/openlanguagedata/flores_plus
- License: CC BY-SA 4.0
- Notes: Gated on Hugging Face. This run did not have a token, so FLORES+ was not downloaded and is not stored. If `HF_TOKEN` or `.huggingface.env` is present, `eval/pareto/data.mjs` will try `devtest` and keep raw files under `data/raw/flores_plus/` (git-ignored).

## NTREX-128

- Source: https://github.com/MicrosoftTranslator/NTREX
- Paper: Federmann, Kocmi, and Xin, *NTREX-128 — News Test References for MT Evaluation of 128 Languages*
- License: CC BY-SA 4.0
- Use: English news sources with human references for languages that WMT24++ does not cover.

## Tatoeba (OPUS / Tatoeba.org)

- Source: OPUS Tatoeba v2023-04-12 (https://opus.nlpl.eu/Tatoeba.php) and the Tatoeba.org search API
- License: CC BY 2.0 FR (some sentences CC0), see https://tatoeba.org/en/terms_of_use. Attribution: sentences by the Tatoeba contributors, https://tatoeba.org.
- Known issue: the 75 OPUS-derived cases (Javanese, Odia, Sundanese) have misaligned `reference` fields that contain lines from the corpus's license file instead of translations. The English `text` fields are correct Tatoeba sentences.
- Use: short conversational pairs for languages missing from both WMT24++ and NTREX-128 (Assamese, Bhojpuri, Cebuano, Javanese, Odia, Sundanese).

## Synthetic chat layer

- `data/chat-cases.json` is drafted by `anthropic/claude-opus-5.5` for this project.
- License: original to this repository (MIT for the JSON as project output). Not a third-party corpus.

## Raw results (`data/results/`)

- Model translations of the benchmark and chat cases, judge scores and raw judge replies, produced for this project through OpenRouter.
- Translations of NTREX-128 items are adaptations of CC BY-SA 4.0 material and are shared under CC BY-SA 4.0. Translations of WMT24++ items follow Apache 2.0, and of Tatoeba items CC BY 2.0 FR, with the attribution above. Everything else in `data/results/` is project output under the repository's MIT license.
- Model outputs are also subject to each provider's terms of use.
