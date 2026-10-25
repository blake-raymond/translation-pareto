// Orchestrate the Pareto eval. --pilot is the 5-language paid sample.
// --full runs every non-English language and reuses the pilot cache.
import fs from "node:fs";
import path from "node:path";
import { ensureUtf8Console, publicError } from "../api.mjs";
import { TARGET_CODES } from "./languages.mjs";
import { enableRunLog, invokedDirectly, kindCost, loadParetoLedger, overSoftCap, parseArgs, progress, usd } from "./lib.mjs";
import { collectData } from "./data.mjs";
import { chatWork, draftChat } from "./chat.mjs";
import { runTranslate, loadCases, translateWork } from "./run-translate.mjs";
import { judgeWork, runJudge } from "./judge.mjs";
import { writeReport } from "./report.mjs";
import { BENCH_PER_LANG, CAP_USD, CHAT_PER_LANG, RESULTS_DIR, SOFT_CAP_USD } from "./meta.mjs";
import { PILOT_LANGS as PILOT } from "./languages.mjs";

const STAGE_FILE = path.join(RESULTS_DIR, "full-stage.json");

function readStage() {
  try {
    return JSON.parse(fs.readFileSync(STAGE_FILE, "utf8"));
  } catch {
    return { open: null };
  }
}

function writeStage(state) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(STAGE_FILE, `${JSON.stringify(state)}\n`);
}

function projection(ledger, cases) {
  const nLangsPilot = PILOT.length;
  const nBenchPilot = cases.filter((item) => item.kind === "benchmark").length;
  const nChatPilot = cases.filter((item) => item.kind === "chat").length;
  const nCasesPilot = cases.length;
  const nModels = 12;
  const chatUsd = kindCost(ledger, "chat");
  const translateUsd = kindCost(ledger, "translate");
  const judgeUsd = kindCost(ledger, "judge");
  const otherUsd = Math.max(0, ledger.spent - chatUsd - translateUsd - judgeUsd);
  const nFullLangs = TARGET_CODES.length;
  const nFullCases = nFullLangs * (BENCH_PER_LANG + CHAT_PER_LANG);
  const nAsked = 73 * (BENCH_PER_LANG + CHAT_PER_LANG);
  const scaleChat = nChatPilot ? (nFullLangs * CHAT_PER_LANG) / nChatPilot : 0;
  const scaleTranslate = nCasesPilot ? (nFullCases * nModels) / (nCasesPilot * nModels) : 0;
  const scaleJudge = nCasesPilot ? nFullCases / nCasesPilot : 0;
  const projected = chatUsd * scaleChat + translateUsd * scaleTranslate + judgeUsd * scaleJudge + otherUsd;
  const askedScale = nCasesPilot ? nAsked / nCasesPilot : 0;
  const projectedAsked = chatUsd * ((73 * CHAT_PER_LANG) / Math.max(nChatPilot, 1))
    + translateUsd * askedScale
    + judgeUsd * askedScale
    + otherUsd;
  const perCase = nCasesPilot ? ledger.spent / nCasesPilot : 0;
  const perTranslate = nCasesPilot && nModels ? translateUsd / (nCasesPilot * nModels) : 0;
  return {
    nLangsPilot,
    nBenchPilot,
    nChatPilot,
    nCasesPilot,
    nFullLangs,
    nFullCases,
    nAsked,
    chatUsd,
    translateUsd,
    judgeUsd,
    otherUsd,
    spent: ledger.spent,
    perCase,
    perTranslate,
    projected,
    projectedAsked,
  };
}

function safeReport(opts, note) {
  try {
    writeReport(opts, note || "");
  } catch (error) {
    console.log(`report skipped: ${publicError(error)}`);
    if (note) console.log(note);
  }
}

async function runFull(opts) {
  enableRunLog();
  const fullOpts = { ...opts, pilot: false, full: true, langs: null };
  console.log(`FULL START ${TARGET_CODES.length} languages ; up to ${BENCH_PER_LANG} benchmark + ${CHAT_PER_LANG} chat ; 12 models ; hard cap $${CAP_USD.toFixed(2)} ; soft stop $${SOFT_CAP_USD.toFixed(2)}`);
  await collectData(fullOpts);
  const stages = [
    {
      name: "chat",
      pending() {
        const work = chatWork(fullOpts);
        return work.needsPay > 0 || work.needsWrite > 0;
      },
      run: () => draftChat(fullOpts),
    },
    {
      name: "translate",
      pending() {
        return translateWork(fullOpts).pending > 0;
      },
      run: () => runTranslate(fullOpts),
    },
    {
      name: "judge",
      pending() {
        return judgeWork(fullOpts).pending > 0;
      },
      run: () => runJudge(fullOpts),
    },
  ];
  for (const stage of stages) {
    const ledger = loadParetoLedger(false);
    let pending = true;
    try {
      pending = stage.pending();
    } catch (error) {
      console.log(`progress stage=${stage.name} pending-check ${publicError(error)}`);
      pending = true;
    }
    if (!pending) {
      progress(stage.name, 1, 1, ledger.spent);
      console.log(`progress stage=${stage.name} done=complete spend=${usd(ledger.spent)}`);
      continue;
    }
    const continuing = readStage().open === stage.name;
    if (!continuing && overSoftCap(ledger)) {
      const note = `Soft stop before ${stage.name}. Spent $${ledger.spent.toFixed(4)} (soft $${SOFT_CAP_USD.toFixed(2)}, hard $${CAP_USD.toFixed(2)}). No further paid stage was started.`;
      console.log(`SOFT STOP before ${stage.name} spend=${usd(ledger.spent)} soft=$${SOFT_CAP_USD.toFixed(2)} hard=$${CAP_USD.toFixed(2)}`);
      console.log(note);
      safeReport(fullOpts, note);
      process.exitCode = 2;
      return;
    }
    writeStage({ open: stage.name, at: new Date().toISOString() });
    const result = await stage.run();
    const after = result?.ledger || loadParetoLedger(false);
    console.log(`stage ${stage.name} chat=${usd(kindCost(after, "chat"))} translate=${usd(kindCost(after, "translate"))} judge=${usd(kindCost(after, "judge"))} total=${usd(after.spent)}`);
    if (after.aborted) {
      const note = `Hard stop during ${stage.name}. ${after.reason || "aborted"} Spent $${after.spent.toFixed(4)}.`;
      console.log(note);
      writeStage({ open: stage.name, aborted: true, reason: after.reason || "", at: new Date().toISOString() });
      safeReport(fullOpts, note);
      process.exitCode = 2;
      return;
    }
    writeStage({ open: null, finished: stage.name, at: new Date().toISOString() });
  }
  const ledger = loadParetoLedger(false);
  console.log(`FULL DONE spend=${usd(ledger.spent)} chat=${usd(kindCost(ledger, "chat"))} translate=${usd(kindCost(ledger, "translate"))} judge=${usd(kindCost(ledger, "judge"))}`);
  writeReport(fullOpts);
}

export async function run(opts = parseArgs()) {
  ensureUtf8Console();
  if (opts.full) {
    await runFull(opts);
    return;
  }
  if (!opts.pilot) {
    console.log("STATUS STOPPED");
    console.log("Pass --pilot or --full.");
    process.exitCode = 2;
    return;
  }
  console.log("PILOT START 5 languages vi,km,ja,ko,es ; 10 benchmark + 5 chat ; 12 models ; cap $1.50");
  await collectData({ ...opts, pilot: false, langs: null });
  await draftChat(opts);
  await runTranslate(opts);
  await runJudge(opts);
  const ledger = loadParetoLedger(true);
  const cases = loadCases(opts);
  const proj = projection(ledger, cases);
  writeReport(opts);
  console.log("--- PILOT COST ---");
  console.log(`spent ${usd(proj.spent)} cap $${ledger.cap}`);
  console.log(`chat ${usd(proj.chatUsd)} translate ${usd(proj.translateUsd)} judge ${usd(proj.judgeUsd)}`);
  console.log(`cost per case ${usd(proj.perCase)}`);
  console.log(`cost per translation call ${usd(proj.perTranslate)}`);
  console.log(`projected full ${proj.nFullLangs} langs x ${BENCH_PER_LANG}+${CHAT_PER_LANG} cases: ${usd(proj.projected)}`);
  console.log("PILOT STOP. Full run not started.");
  if (ledger.aborted) {
    console.log(ledger.reason);
    process.exitCode = 2;
  }
}

if (invokedDirectly(import.meta.url)) {
  run().catch((error) => {
    console.error(publicError(error));
    console.log("STATUS FAILED");
    process.exitCode = 1;
  });
}
