import test from "node:test";
import assert from "node:assert/strict";
import { paretoFrontier } from "./report.mjs";

const row = (slug, mean, costPer1k) => ({ slug, mean, costPer1k });

test("frontier uses strict Pareto dominance on point estimates", () => {
  const rows = [
    row("cheap-low", 4.23, 0.02509),
    row("cheap-higher", 4.27, 0.02526),
    row("best", 4.69, 0.0319),
    row("close-but-pricier", 4.66, 0.0803),
    row("same-cost-worse", 4.2, 0.02526),
  ];
  assert.deepEqual(paretoFrontier(rows).map((r) => r.slug), ["cheap-low", "cheap-higher", "best"]);
});

test("exactly equal mean and cost do not dominate each other", () => {
  const rows = [row("a", 4.5, 0.03), row("b", 4.5, 0.03)];
  assert.deepEqual(paretoFrontier(rows).map((r) => r.slug).sort(), ["a", "b"]);
});