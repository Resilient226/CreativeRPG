// End-of-session memory summarization + the AI Mentor's pattern analysis.

import { callModel, allText, extractJson } from "../lib/model";
import { loadMemoryLog, setMemorySummary, loadInteractions } from "./data";
import { SKILL_META } from "./skills";

// Called when a conversation session ends. Compresses the full memory log into a
// 2–3 sentence summary so future sessions stay cheap but Evelyn still "remembers."
// This is the trigger that makes cross-session memory actually fire (sessions are
// short; a "every 20 messages" trigger would rarely hit).
export async function summarizeMemory(npcId, npcName = "the collector") {
  const log = await loadMemoryLog(npcId, 200);
  if (log.length === 0) return null;
  const notes = log.map((m) => `- ${m.note}`).join("\n");

  const prompt = `These are ${npcName}'s memory notes about an artist, oldest first. Write a 2–3 sentence running memory summary in ${npcName}'s own perspective — what they remember about this artist, their work, and how negotiations have gone. Be specific (pieces, prices, whether the artist holds firm). Respond with ONLY the summary text, no preamble.

NOTES:
${notes}`;

  const { data } = await callModel({ messages: [{ role: "user", content: prompt }], maxTokens: 200 });
  const summary = allText(data).trim();
  if (summary) await setMemorySummary(npcId, summary);
  return summary;
}

// The Mentor reads skills + recent interactions (+ optional artist context) and
// returns patterns, weaknesses, and concrete drills.
export async function runMentor({ skills, artistContext = "" }) {
  const interactions = await loadInteractions(40);
  const skillLines = Object.entries(skills)
    .map(([k, v]) => `${SKILL_META[k]?.label || k}: L${v.level} (${v.xp} xp)`)
    .join(", ");
  const history = interactions
    .map((i) => `${i.type}${i.signals ? " " + JSON.stringify(i.signals) : ""}`)
    .join("\n");

  const prompt = `You are the artist's practice mentor inside a career-training simulator. Read their skills and recent practice interactions and give sharp, specific, encouraging coaching. Call out real patterns (e.g. accepting first offers, never holding price, avoiding rejection). Be concrete.

SKILLS: ${skillLines}
${artistContext ? `ARTIST CONTEXT: ${artistContext}\n` : ""}
RECENT PRACTICE (most recent first):
${history || "(no sessions yet)"}

Respond with ONLY raw JSON, no markdown:
{
  "summary": "1-2 sentences on where they stand",
  "patterns": ["2-4 specific behavioral patterns you see"],
  "weaknesses": ["1-3 concrete weaknesses"],
  "drills": ["2-3 specific practice drills, e.g. 'Hold your asking price in your next 3 negotiations'"]
}`;

  const { data } = await callModel({ messages: [{ role: "user", content: prompt }], maxTokens: 900 });
  return extractJson(allText(data), "object");
}
