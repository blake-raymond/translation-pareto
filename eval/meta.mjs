export const CAP_USD = 10;
export const SEED = 20261024;
export const RUBRIC_VERSION = "2026-10-24-v2";

export const PROBLEMS = [
  "typo",
  "missing-diacritics",
  "autocorrect",
  "slang",
  "pronoun-reference",
  "honorific/formality",
  "code-switching",
];

export const EN_LANGS = ["id", "th", "vi", "my", "km", "zh-CN", "ja", "ko", "hi", "bn", "ar", "es"];

export const CROSS_PAIRS = [
  ["id", "th"],
  ["th", "id"],
  ["ja", "ko"],
  ["ko", "ja"],
  ["hi", "ar"],
  ["ar", "hi"],
];

export const DIACRITIC_LANGS = new Set(["vi", "es", "hi", "bn", "my", "km"]);

export function slugCode(code) {
  return code === "zh-CN" ? "zh" : code;
}

export function directionKey(source, target) {
  return `${source}→${target}`;
}
