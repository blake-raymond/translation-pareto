# Data licenses

This folder holds sampled evaluation items. Raw downloads stay in `data/raw/` and are git-ignored.

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
- License: sentences on Tatoeba are generally CC BY 2.0 (see https://tatoeba.org/en/terms_of_use)
- Use: short conversational pairs for languages missing from both WMT24++ and NTREX-128 (Assamese, Bhojpuri, Cebuano, Javanese, Odia, Sundanese).

## Synthetic chat layer

- `data/chat-cases.json` is drafted by `anthropic/claude-opus-5.5` for this project.
- License: original to this repository (MIT for the JSON as project output). Not a third-party corpus.
