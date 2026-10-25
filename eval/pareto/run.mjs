// Orchestrate the Pareto eval. This stage only runs the paid pilot.
import { ensureUtf8Console, publicError } from "../api.mjs";
import { TARGET_CODES } from "./languages.mjs";
import { invokedDirectly, loadParetoLedger, parseArgs, usd } from "./lib.mjs";
import { collectData } from "./data.mjs";
import { draftChat } from "./chat.mjs";
import { runTranslate, loadCases } from "./run-translate.mjs";
import { runJudge } from "./judge.mjs";
import { writeReport } from "./report.mjs";
import { BENCH_PER_LANG, CHAT_PER_LANG } from "./meta.mjs";
import { PILOT_LANGS as PILOT } from "./languages.mjs";

function kindCost(ledger, kind) {
  return (ledger.events || [])
    .filter((event) => String(event.kind || "").startsWith(kind))
    .reduce((sum, event) => sum + (Number(event.cost_usd) || 0), 0);
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

export async function run(opts = parseArgs()) {
  ensureUtf8Console();
  if (!opts.pilot) {
    console.log("STATUS STOPPED");
    console.log("Full paid run is disabled in this stage. Re-run with --pilot.");
    process.exitCode = 2;
    return;
  }
  console.log("PILOT START 5 languages vi,km,ja,ko,es ; 10 benchmark + 5 chat ; 12 models ; cap $1.50");
  await collectData({ ...opts, pilot: false, langs: null });
  await draftChat(opts);
  const translated = await runTranslate(opts);
  await runJudge(opts);
  const ledger = loadParetoLedger(true);
  const cases = loadCases(opts);
  const proj = projection(ledger, cases);
  const spendText = [
    `Pilot spend (OpenRouter \`usage.cost\`, cap $${ledger.cap.toFixed(2)}): **$${proj.spent.toFixed(4)}**.`,
    "",
    `| Step | USD |`,
    `| --- | ---: |`,
    `| Chat drafting | $${proj.chatUsd.toFixed(4)} |`,
    `| Translations | $${proj.translateUsd.toFixed(4)} |`,
    `| Judge | $${proj.judgeUsd.toFixed(4)} |`,
    `| Total | $${proj.spent.toFixed(4)} |`,
    "",
    `Measured cost per case (all models + share of drafting and judging): **$${proj.perCase.toFixed(4)}**.`,
    `Measured translation cost per model×case: **$${proj.perTranslate.toFixed(5)}**.`,
    "",
    `Projected full run for ${proj.nFullLangs} non-English languages × ${BENCH_PER_LANG} benchmark + ${CHAT_PER_LANG} chat (linear scale from this pilot): **$${proj.projected.toFixed(2)}**.`,
    `Same projection at 73 × 30 cases: **$${proj.projectedAsked.toFixed(2)}**.`,
    "",
    "The full run was not started.",
  ].join("\n");
  writeReport(opts, spendText);
  console.log("--- PILOT COST ---");
  console.log(`spent ${usd(proj.spent)} cap $${ledger.cap}`);
  console.log(`chat ${usd(proj.chatUsd)} translate ${usd(proj.translateUsd)} judge ${usd(proj.judgeUsd)}`);
  console.log(`cost per case ${usd(proj.perCase)}`);
  console.log(`cost per translation call ${usd(proj.perTranslate)}`);
  console.log(`projected full ${proj.nFullLangs} langs x 30 cases: ${usd(proj.projected)}`);
  console.log(`projected 73 langs x 30 cases: ${usd(proj.projectedAsked)}`);
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
