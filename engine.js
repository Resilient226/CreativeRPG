// The conversation engine. Sends one in-character turn to the model, parses the
// strict JSON, and applies every side effect: NPC state, skill XP, memory, logs.
// The UI shows `dialogue`; everything else updates behind it.

import { callModel, allText, extractJson } from "../lib/model";
import { evelynSystemPrompt } from "./evelyn";
import { xpFromSignals } from "./skills";
import { applyNpcTurn, saveSkills, logInteraction } from "./data";

// artistContext: a short string describing the artist's current work/goal so
// Evelyn can reference real pieces. Kept small on purpose.
export async function runNpcTurn({ npc, skills, history, artistContext }) {
  const system = evelynSystemPrompt(npc, artistContext);

  // history: [{ role: "user"|"assistant", content }] — the visible dialogue so far.
  // We cap to the last 12 turns; long-term continuity comes from memorySummary.
  const messages = history.slice(-12).map((m) => ({ role: m.role, content: m.content }));

  const { data } = await callModel({ system, messages, maxTokens: 700, useSearch: false });
  const raw = allText(data);

  let turn;
  try {
    turn = extractJson(raw, "object");
  } catch {
    // Model didn't return clean JSON — degrade to plain dialogue, no state change.
    return {
      turn: { dialogue: raw.trim() || "…", action: "chat", offer: null, skillSignals: {}, stateChanges: {} },
      npc, skills, xpApplied: {},
    };
  }

  // 1) Skills
  const { skills: nextSkills, applied } = xpFromSignals(skills, turn.skillSignals || {});
  if (Object.keys(applied).length) await saveSkills(nextSkills);

  // 2) NPC state + memory note
  const nextNpc = await applyNpcTurn(npc, {
    stateChanges: turn.stateChanges || {},
    moodAfter: turn.moodAfter,
    memoryNote: turn.memoryNote,
  });

  // 3) Interaction log (for the mentor)
  await logInteraction({
    npcId: npc.id,
    type: turn.action || "chat",
    signals: turn.skillSignals || {},
    xp: applied,
    offer: turn.offer || null,
    note: turn.memoryNote || "",
  });

  return { turn, npc: nextNpc, skills: nextSkills, xpApplied: applied };
}

// Player resolves an offer via a button (Accept/Counter/Hold/Decline). This is a
// deterministic skill event — it doesn't need a model call. `counterAmount` only
// used for "counter".
export async function resolveOffer({ npc, skills, offer, choice, counterAmount }) {
  const signalMap = {
    accept: { outcome: "closed_deal" },
    hold: { negotiation: "held_price", confidence_note: "held" },
    counter: { negotiation: "good_counter" },
    decline: { outcome: "rejected_recovered" },
  };
  // Detect a fold: accepting the very first offer without pushing.
  const signals =
    choice === "accept" && offer?.isFirst
      ? { negotiation: "folded", outcome: "closed_deal" }
      : signalMap[choice] || {};

  const { skills: nextSkills, applied } = xpFromSignals(skills, signals);
  if (Object.keys(applied).length) await saveSkills(nextSkills);

  // Relationship nudges from how you handled it.
  const stateChanges =
    choice === "accept" ? { relationshipScore: +4, trust: +3 }
    : choice === "hold" ? { relationshipScore: +2, trust: +5, interest: +2 }
    : choice === "counter" ? { trust: +2 }
    : { relationshipScore: -1 };

  const note =
    choice === "accept" ? `Artist accepted your offer${offer?.amount ? ` of $${offer.amount}` : ""}.`
    : choice === "hold" ? "Artist held their asking price."
    : choice === "counter" ? `Artist countered${counterAmount ? ` at $${counterAmount}` : ""}.`
    : "Artist declined the offer.";

  const nextNpc = await applyNpcTurn(npc, { stateChanges, memoryNote: note });

  await logInteraction({
    npcId: npc.id, type: `offer_${choice}`, signals, xp: applied,
    offer: offer || null, counterAmount: counterAmount || null, note,
  });

  return { npc: nextNpc, skills: nextSkills, xpApplied: applied, note };
}
