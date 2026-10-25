import fs from "node:fs";
import path from "node:path";
import { rootDir } from "../api.mjs";
import { languageName } from "./languages.mjs";

export const SYSTEM_PROMPT = fs.readFileSync(
  path.join(rootDir(), "eval", "prompts", "v1.txt"),
  "utf8",
).trim();

export function buildUserPrompt(text, source, target, history = []) {
  const lines = [`Translate the next line from ${languageName(source)} into ${languageName(target)}.`];
  if (!history.length) {
    lines.push("There are no earlier lines.");
  } else {
    const transcript = history
      .map((entry) => `${entry.speaker} (${languageName(entry.lang)}): ${entry.text}`)
      .join("\n");
    lines.push(`Conversation so far:\n${transcript}`);
  }
  lines.push(`Next line:\n${text}`);
  return lines.join("\n\n");
}
