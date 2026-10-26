// node --test eval/pareto/judge.test.mjs  (free, no API calls)
import test from "node:test";
import assert from "node:assert/strict";
import { _panelForTest as panel, _bindingHashForTest as bindingHash } from "./judge.mjs";

const item = { id: "chat-xx-01" };
const rng = () => 0.5;

test("judge refuses an empty candidate", () => {
  const runs = [{ case_id: "chat-xx-01", slug: "a", output: "hola" }, { case_id: "chat-xx-01", slug: "b", output: "  " }];
  assert.throws(() => panel(item, ["a", "b"], runs, rng), /refuses empty/);
});

test("judge refuses an errored candidate", () => {
  const runs = [{ case_id: "chat-xx-01", slug: "a", output: "hola", error: "timeout" }];
  assert.throws(() => panel(item, ["a"], runs, rng), /refuses empty/);
});

test("cache key changes when any candidate output changes", () => {
  const r1 = [{ case_id: "chat-xx-01", slug: "a", output: "" }, { case_id: "chat-xx-01", slug: "b", output: "x" }];
  const r2 = [{ case_id: "chat-xx-01", slug: "a", output: "hola" }, { case_id: "chat-xx-01", slug: "b", output: "x" }];
  assert.notEqual(bindingHash(item, ["a", "b"], r1, "j"), bindingHash(item, ["a", "b"], r2, "j"));
  assert.notEqual(bindingHash(item, ["a", "b"], r2, "j"), bindingHash(item, ["b", "a"], r2, "j"));
});
