// A/B the production interpreter prompt against eval/prompts/v1.txt.
//
//   node eval/ab-prompt.mjs --dry-run
//   node eval/ab-prompt.mjs
//
// Uses google/gemini-3.1-flash-lite for both prompts, then blind-scores with
// x-ai/grok-4.7 and anthropic/claude-sonnet-5.5. New OpenRouter spend for
// kind ab-translate / ab-judge stays under 1.50 USD via the shared ledger.
// A control regression loosens the prompt once and scores that version too.

import fs from "node:fs";
import path from "node:path";
import { SYSTEM_PROMPT, buildUserPrompt } from "../src/worker.js";
import { SEED } from "./meta.mjs";
import {
  cacheFile,
  ensureUtf8Console,
  estimateUsd,
  hashString,
  loadKey,
  loadLedger,
  mapPool,
  paidChat,
  parseJsonObject,
  publicError,
  readCache,
  readJson,
  rootDir,
  writeJson,
} from "./api.mjs";

const NEW_CAP = 1.5;
const TRANSLATE_MAX = 1200;
const JUDGE_MAX = 1600;
const LOG_FILE = path.join(rootDir(), "eval", "results", "ab-progress.log");
const OUT_FILE = path.join(rootDir(), "eval", "results", "ab-prompt.json");
const DOC_FILE = path.join(rootDir(), "docs", "prompt-ab.md");

const TRANSLATOR = {
  slug: "google/gemini-3.1-flash-lite",
  prompt_per_million: 0.25,
  completion_per_million: 1.5,
  reasoning: { effort: "minimal" },
  temperature: 0.2,
};

const JUDGES = [
  {
    slug: "x-ai/grok-4.7",
    reasoning: { effort: "low" },
    temperature: 0.2,
    prompt_per_million: 2,
    completion_per_million: 6,
  },
  {
    slug: "anthropic/claude-sonnet-5.5",
    reasoning: { effort: "low" },
    temperature: null,
    prompt_per_million: 2,
    completion_per_million: 10,
  },
];

const LOOSE_PROMPT = [
  "You are a professional interpreter for a live face-to-face conversation.",
  "Use the full history for pronouns, tone, slang, and references.",
  "Be forgiving of typos, missing accents, and bad autocorrect, and infer the intended meaning from the situation and the conversation.",
  "Translate that meaning, not a literal misspelling or a word-for-word idiom, and do not invent a proper name for a typo.",
  "Do not add a unit that was not said. Keep stated numbers and units.",
  "Keep who needs or does what.",
  "Output only the translation with no commentary.",
].join(" ");

const src = fs.readFileSync(new URL("./run.mjs", import.meta.url), "utf8");
const grab = (name) => {
  const i = src.indexOf(`function ${name}`);
  let depth = 0;
  let j = src.indexOf("{", i);
  const start = j;
  for (; j < src.length; j += 1) {
    if (src[j] === "{") depth += 1;
    if (src[j] === "}") {
      depth -= 1;
      if (!depth) break;
    }
  }
  return src.slice(i, j + 1);
};
const { judgeMessages } = new Function(
  `${grab("transcript")}\n${grab("judgeMessages")}\nreturn { judgeMessages };`,
)();
const { parseScores } = new Function(
  "parseJsonObject",
  `${grab("clampScore")}\n${grab("parseScores")}\nreturn { parseScores };`,
)(parseJsonObject);

function log(line) {
  const text = `${new Date().toISOString()} ${line}\n`;
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  fs.appendFileSync(LOG_FILE, text);
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, seed) {
  const copy = [...items];
  const rand = mulberry32(seed >>> 0);
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function avg(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function overall(score) {
  return (score.meaning + score.naturalness + score.handling) / 3;
}

function userContent(item) {
  const history = item.history.map(({ speaker, lang, text }) => ({ speaker, lang, text }));
  return buildUserPrompt(item.text, item.source, item.target, history);
}

function abSpent(ledger) {
  return ledger.events
    .filter((event) => event.kind === "ab-translate" || event.kind === "ab-judge")
    .reduce((sum, event) => sum + (Number(event.cost_usd) || 0), 0);
}

function selectCases() {
  const cases = readJson(path.join(rootDir(), "eval", "cases.json"));
  const criticalFile = readJson(path.join(rootDir(), "eval", "results", "s31-critical.json"));
  const criticalIds = criticalFile.ids;
  if (!Array.isArray(criticalIds) || criticalIds.length !== 14) {
    throw new Error(`expected 14 critical ids, found ${criticalIds ? criticalIds.length : 0}`);
  }
  const byId = new Map(cases.map((item) => [item.id, item]));
  const critical = criticalIds.map((id) => {
    const item = byId.get(id);
    if (!item) throw new Error(`missing critical case ${id}`);
    return item;
  });
  const pool = cases
    .filter((item) => !criticalIds.includes(item.id))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const controls = shuffle(pool, SEED).slice(0, 16);
  if (controls.length !== 16) throw new Error(`expected 16 controls, found ${controls.length}`);
  return { critical, controls };
}

function pairedSummary(items, judgements) {
  const byJudge = {};
  for (const judge of JUDGES) {
    byJudge[judge.slug] = { old: [], new: [], oldCritical: 0, newCritical: 0 };
  }
  const oldAll = [];
  const newAll = [];
  let oldCritical = 0;
  let newCritical = 0;
  for (const item of items) {
    const row = judgements.get(item.id);
    if (!row) continue;
    for (const judge of JUDGES) {
      const scored = row[judge.slug];
      if (!scored?.old || !scored?.new) continue;
      const oldValue = overall(scored.old);
      const newValue = overall(scored.new);
      oldAll.push(oldValue);
      newAll.push(newValue);
      if (scored.old.critical_error) oldCritical += 1;
      if (scored.new.critical_error) newCritical += 1;
      const bucket = byJudge[judge.slug];
      bucket.old.push(oldValue);
      bucket.new.push(newValue);
      if (scored.old.critical_error) bucket.oldCritical += 1;
      if (scored.new.critical_error) bucket.newCritical += 1;
    }
  }
  const pack = (values, critical) => ({
    mean: avg(values),
    critical_errors: critical,
    judgements: values.length,
  });
  return {
    old: pack(oldAll, oldCritical),
    new: pack(newAll, newCritical),
    by_judge: Object.fromEntries(JUDGES.map((judge) => {
      const bucket = byJudge[judge.slug];
      return [judge.slug, { old: pack(bucket.old, bucket.oldCritical), new: pack(bucket.new, bucket.newCritical) }];
    })),
  };
}

function regressed(summary) {
  const oldStats = summary.old;
  const newStats = summary.new;
  if (newStats.critical_errors > oldStats.critical_errors) return true;
  if (oldStats.mean != null && newStats.mean != null && oldStats.mean - newStats.mean > 0.1) return true;
  return false;
}

function fmt(value) {
  return value == null ? "—" : value.toFixed(2);
}

function writeDoc(report) {
  const lines = [
    "# Prompt A/B",
    "",
    `Translator: \`${TRANSLATOR.slug}\` at temperature 0.2 with reasoning effort minimal. Judges: \`${JUDGES[0].slug}\` (reasoning effort low, temperature 0.2) and \`${JUDGES[1].slug}\` (reasoning effort low, temperature omitted). Each judge saw the two outputs in a seeded blind order and used the same rubric as \`eval/spot-judge.mjs\`.`,
    "",
    `Critical group: the 14 ids in \`eval/results/s31-critical.json\`. Control group: 16 other cases from \`eval/cases.json\`, sorted by id, then shuffled with seed ${SEED}.`,
    "",
    `New OpenRouter spend on this A/B (ledger kinds \`ab-translate\` and \`ab-judge\`): $${report.spent_ab_usd.toFixed(4)}. Cap: $${NEW_CAP.toFixed(2)}.`,
    "",
    "Mean is the average of meaning, naturalness, and handling on paired judgements (a judge counted only when it scored both prompts). Critical errors are the number of those judgements flagged `critical_error`.",
    "",
  ];
  for (const round of report.rounds) {
    lines.push(`## ${round.label}`);
    lines.push("");
    lines.push("| Group | Prompt | Mean | Critical errors | Judgements |");
    lines.push("| --- | --- | ---: | ---: | ---: |");
    for (const group of ["critical", "control"]) {
      for (const prompt of ["old", "new"]) {
        const row = round.summary[group][prompt];
        lines.push(`| ${group} | ${prompt} | ${fmt(row.mean)} | ${row.critical_errors} | ${row.judgements} |`);
      }
    }
    lines.push("");
    lines.push("| Group | Judge | Old mean | New mean | Old critical | New critical |");
    lines.push("| --- | --- | ---: | ---: | ---: | ---: |");
    for (const group of ["critical", "control"]) {
      for (const judge of JUDGES) {
        const row = round.summary[group].by_judge[judge.slug];
        lines.push(`| ${group} | \`${judge.slug}\` | ${fmt(row.old.mean)} | ${fmt(row.new.mean)} | ${row.old.critical_errors} | ${row.new.critical_errors} |`);
      }
    }
    lines.push("");
    lines.push(round.regressed
      ? "Controls regressed: the new prompt had more critical errors, or a mean more than 0.1 lower, than v1."
      : "Controls did not regress.");
    lines.push("");
  }
  lines.push("## Decision");
  lines.push("");
  lines.push(report.decision);
  lines.push("");
  fs.writeFileSync(DOC_FILE, `${lines.join("\n")}\n`, "utf8");
}

function applyPrompt(prompt) {
  const file = path.join(rootDir(), "src", "worker.js");
  const text = fs.readFileSync(file, "utf8");
  const start = text.indexOf("export const SYSTEM_PROMPT = [");
  const marker = "].join(\" \");";
  const end = text.indexOf(marker, start);
  if (start < 0 || end < 0) throw new Error("SYSTEM_PROMPT block not found");
  const block = `export const SYSTEM_PROMPT = [\n  ${JSON.stringify(prompt)},\n].join(" ");`;
  fs.writeFileSync(file, text.slice(0, start) + block + text.slice(end + marker.length), "utf8");
}

function messagesFor(system, item) {
  return [
    { role: "system", content: system },
    { role: "user", content: userContent(item) },
  ];
}

async function main() {
  ensureUtf8Console();
  const dryRun = process.argv.includes("--dry-run");
  const v1 = fs.readFileSync(path.join(rootDir(), "eval", "prompts", "v1.txt"), "utf8").trim();
  if (!v1.startsWith("You are a professional interpreter")) {
    throw new Error("v1 prompt did not load");
  }
  if (!String(judgeMessages({ history: [], source: "en", target: "id", problem: "typo", text: "a", meaning: "b", reference: "c" }, [{ label: "A", output: "x" }])[0].content).includes("critical_error is true only")) {
    throw new Error("judge prompt did not load");
  }
  const { critical, controls } = selectCases();
  if (dryRun) {
    const sample = messagesFor(SYSTEM_PROMPT, critical[0]);
    const translateEstimate = estimateUsd(TRANSLATOR, sample.map((message) => message.content).join("").length, TRANSLATE_MAX);
    console.log(`critical ${critical.length} controls ${controls.length} seed ${SEED}`);
    console.log(`control ids ${controls.map((item) => item.id).join(",")}`);
    console.log(`v1 chars ${v1.length} new chars ${SYSTEM_PROMPT.length} loose chars ${LOOSE_PROMPT.length}`);
    console.log(`sample translate estimate $${translateEstimate.toFixed(5)} calls ${(critical.length + controls.length) * 2}`);
    console.log("dry-run ok");
    return;
  }

  if (!fs.existsSync(path.join(rootDir(), ".openrouter.env"))) {
    throw new Error("missing .openrouter.env");
  }
  const key = loadKey();
  const ledger = loadLedger();
  let inflight = 0;
  let aborted = "";
  log(`start seed=${SEED} ab_spent=${abSpent(ledger).toFixed(4)} cap=${NEW_CAP}`);

  async function budgeted(model, messages, maxTokens, event) {
    if (aborted) return { ok: false, error: aborted, cost_usd: 0 };
    const estimate = estimateUsd(model, messages.map((message) => message.content).join("").length, maxTokens);
    if (abSpent(ledger) + inflight + estimate > NEW_CAP) {
      aborted = "ab_cap";
      log(`AB_CAP estimated next call $${estimate.toFixed(4)} spent=${abSpent(ledger).toFixed(4)}`);
      return { ok: false, error: "ab_cap", cost_usd: 0 };
    }
    inflight += estimate;
    try {
      const result = await paidChat(key, ledger, model, messages, maxTokens, event);
      if (!result.ok && (result.error === "credits" || result.error === "spend_cap")) {
        aborted = result.error;
        log(`stop ${result.error}`);
      }
      return result;
    } finally {
      inflight = Math.max(0, inflight - estimate);
    }
  }

  async function translateOne(item, promptKey, system) {
    const messages = messagesFor(system, item);
    const hash = hashString({
      slug: TRANSLATOR.slug,
      system,
      user: messages[1].content,
      temperature: TRANSLATOR.temperature,
      reasoning: TRANSLATOR.reasoning,
      max: TRANSLATE_MAX,
    });
    const file = cacheFile("ab", "translations", `${item.id}.${promptKey}.${hash}.json`);
    const hit = readCache(file, hash);
    if (hit && hit.error == null && typeof hit.text === "string") {
      log(`cache translate ${item.id} ${promptKey}`);
      return hit;
    }
    const result = await budgeted(TRANSLATOR, messages, TRANSLATE_MAX, {
      kind: "ab-translate",
      case_id: item.id,
      prompt: promptKey,
    });
    const record = {
      hash,
      text: result.ok ? result.text : "",
      error: result.ok ? null : (result.error || "translate"),
      cost_usd: result.cost_usd || 0,
    };
    if (result.ok) writeJson(file, record);
    log(`translate ${item.id} ${promptKey} ok=${Boolean(result.ok)} chars=${record.text.length} cost=${(result.cost_usd || 0).toFixed(5)} ${record.error || ""} ab=${abSpent(ledger).toFixed(4)}`);
    return record;
  }

  async function judgeOne(judge, item, outputs) {
    const seed = Number.parseInt(hashString({
      id: item.id,
      judge: judge.slug,
      old: outputs.old,
      new: outputs.new,
    }).slice(0, 8), 16);
    const ordered = shuffle(
      [
        { key: "old", output: outputs.old },
        { key: "new", output: outputs.new },
      ],
      seed,
    ).map((row, index) => ({ ...row, label: "AB"[index] }));
    const messages = judgeMessages(item, ordered);
    const hash = hashString({
      judge: judge.slug,
      messages,
      reasoning: judge.reasoning,
      temperature: judge.temperature,
      max: JUDGE_MAX,
    });
    const file = cacheFile("ab", "judgements", `${judge.slug}.${item.id}.${hash}.json`);
    const hit = readCache(file, hash);
    if (hit?.scores?.old && hit?.scores?.new) {
      log(`cache judge ${judge.slug} ${item.id}`);
      return hit.scores;
    }
    let spent = 0;
    let scores = null;
    let error = null;
    for (let attempt = 0; attempt < 2 && !scores; attempt += 1) {
      const result = await budgeted(judge, messages, JUDGE_MAX, {
        kind: "ab-judge",
        case_id: item.id,
        judge: judge.slug,
        attempt,
      });
      spent += result.cost_usd || 0;
      if (!result.ok) {
        error = result.error || "judge";
        break;
      }
      scores = parseScores(result.text, ordered);
      if (!scores?.old || !scores?.new) {
        scores = null;
        error = "parse";
      }
    }
    if (scores?.old && scores?.new) {
      writeJson(file, { hash, scores });
      error = null;
    }
    log(`judge ${judge.slug} ${item.id} ok=${Boolean(scores)} cost=${spent.toFixed(5)} ${error || ""} ab=${abSpent(ledger).toFixed(4)}`);
    return scores;
  }

  async function runRound(label, newPrompt) {
    const selected = [
      ...critical.map((item) => ({ ...item, group: "critical" })),
      ...controls.map((item) => ({ ...item, group: "control" })),
    ];
    const outputs = new Map();
    await mapPool(selected, 3, async (item) => {
      const old = await translateOne(item, "old", v1);
      const neu = await translateOne(item, "new", newPrompt);
      outputs.set(item.id, {
        old: old.text || "",
        new: neu.text || "",
        errors: { old: old.error, new: neu.error },
      });
    });
    let empty = 0;
    for (const output of outputs.values()) {
      const oldEmpty = !output.errors.old && !output.old.trim();
      const newEmpty = !output.errors.new && !output.new.trim();
      if (oldEmpty || newEmpty) empty += 1;
    }
    if (empty > selected.length / 2) {
      aborted = aborted || "empty_outputs";
      log(`stop empty translations ${empty}/${selected.length}`);
    }
    const judgements = new Map();
    await mapPool(selected, 2, async (item) => {
      const output = outputs.get(item.id);
      const scores = {};
      if (output.errors.old || output.errors.new || aborted) {
        judgements.set(item.id, scores);
        return;
      }
      for (const judge of JUDGES) {
        scores[judge.slug] = await judgeOne(judge, item, output);
      }
      judgements.set(item.id, scores);
    });
    const summary = {
      critical: pairedSummary(critical, judgements),
      control: pairedSummary(controls, judgements),
    };
    const cases = selected.map((item) => {
      const output = outputs.get(item.id);
      const judged = judgements.get(item.id) || {};
      const judges = {};
      for (const judge of JUDGES) {
        const row = judged[judge.slug];
        if (row?.old && row?.new) judges[judge.slug] = { old: row.old, new: row.new };
      }
      return {
        id: item.id,
        group: item.group,
        errors: output.errors,
        outputs: { old: output.old, new: output.new },
        judges,
      };
    });
    const expected = controls.length * JUDGES.length;
    const got = summary.control.old.judgements;
    const complete = !aborted && got >= expected;
    return {
      label,
      prompt_new: newPrompt,
      summary,
      regressed: complete ? regressed(summary.control) : null,
      complete,
      cases,
    };
  }

  const rounds = [];
  const first = await runRound("initial", SYSTEM_PROMPT);
  rounds.push(publicRound(first));
  let decision = "";
  let adopted = SYSTEM_PROMPT;
  if (!first.complete) {
    decision = `The run stopped before every control judgement finished (${aborted || "incomplete"}). Production prompt was left unchanged.`;
  } else if (!first.regressed) {
    decision = "The new prompt did not regress on the controls, so it stays the production prompt.";
  } else {
    log("controls regressed; loosening the prompt and retrying once");
    const second = await runRound("loosened", LOOSE_PROMPT);
    rounds.push(publicRound(second));
    if (!second.complete) {
      decision = `The first prompt regressed on the controls. The loosened retry stopped early (${aborted || "incomplete"}). Production still uses the first new prompt.`;
    } else if (!second.regressed) {
      applyPrompt(LOOSE_PROMPT);
      adopted = LOOSE_PROMPT;
      decision = "The first prompt regressed on the controls. A shorter prompt without the worked examples passed the same check, and that text is now SYSTEM_PROMPT.";
    } else {
      decision = "The first prompt regressed on the controls. The loosened retry also regressed, so production still uses the first new prompt. Both rounds are in this file.";
    }
  }

  const report = {
    model: TRANSLATOR.slug,
    judges: JUDGES.map((judge) => ({
      slug: judge.slug,
      reasoning: judge.reasoning,
      temperature: judge.temperature,
    })),
    seed: SEED,
    cap_usd: NEW_CAP,
    spent_ab_usd: Math.round(abSpent(ledger) * 1e6) / 1e6,
    aborted: aborted || null,
    critical_ids: critical.map((item) => item.id),
    control_ids: controls.map((item) => item.id),
    prompt_old: v1,
    prompt_adopted: adopted,
    decision,
    rounds,
  };
  writeJson(OUT_FILE, report);
  writeDoc(report);
  const finished = first.complete && (rounds.length === 1 || rounds[1].complete);
  const marker = finished ? "AB_DONE" : "AB_FAILED";
  log(`${marker} spent=${report.spent_ab_usd.toFixed(4)} aborted=${report.aborted || "no"} rounds=${rounds.length}`);
  if (!finished) process.exitCode = 1;
}

function publicRound(round) {
  return {
    label: round.label,
    prompt_new: round.prompt_new,
    summary: round.summary,
    regressed: round.regressed,
    complete: round.complete,
    cases: round.cases,
  };
}

main().catch((error) => {
  const message = publicError(error);
  try {
    log(`AB_FAILED ${message}`);
  } catch {
    console.error(message);
  }
  process.exitCode = 1;
});
