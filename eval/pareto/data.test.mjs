import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeLanguageSubset } from "./data.mjs";

const bench = JSON.parse(fs.readFileSync(new URL("../../data/benchmark-cases.json", import.meta.url), "utf8"));
const coverage = JSON.parse(fs.readFileSync(new URL("../../data/coverage.json", import.meta.url), "utf8"));

test("--langs subset merges into the existing files instead of replacing them", () => {
  const langs = ["jv", "or", "su"];
  const subsetCases = bench.filter((row) => langs.includes(row.target));
  const subsetCoverage = coverage.languages.filter((row) => langs.includes(row.lang));
  const merged = mergeLanguageSubset({ existingCases: bench, existingCoverage: coverage, langs, cases: subsetCases, coverage: subsetCoverage });
  assert.equal(merged.cases.length, bench.length);
  assert.deepEqual(merged.cases.map((row) => row.id).sort(), bench.map((row) => row.id).sort());
  assert.deepEqual(merged.coverage.languages.map((row) => row.lang), coverage.languages.map((row) => row.lang));
  assert.equal(merged.coverage.n_cases, bench.length);
});

test("--langs subset replaces only the named languages", () => {
  const existingCases = [
    { id: "bench-jv-01", target: "jv", reference: "old" },
    { id: "bench-fr-01", target: "fr", reference: "keep" },
  ];
  const existingCoverage = { languages: [{ lang: "fr", n_sampled: 1 }, { lang: "jv", n_sampled: 1 }], missing: [], short: [] };
  const merged = mergeLanguageSubset({
    existingCases,
    existingCoverage,
    langs: ["jv"],
    cases: [{ id: "bench-jv-01", target: "jv", reference: "new" }, { id: "bench-jv-02", target: "jv", reference: "added" }],
    coverage: [{ lang: "jv", n_sampled: 2 }],
  });
  assert.deepEqual(merged.cases.map((row) => `${row.id}:${row.reference}`), ["bench-fr-01:keep", "bench-jv-01:new", "bench-jv-02:added"]);
  assert.deepEqual(merged.coverage.languages, [{ lang: "fr", n_sampled: 1 }, { lang: "jv", n_sampled: 2 }]);
  assert.equal(merged.coverage.n_cases, 3);
});
