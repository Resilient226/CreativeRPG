// THE RELATIONSHIP ENGINE — pure logic for how a person's profile is generated and
// how interacting with them changes their state. No React, no rendering, no storage
// calls. Same contract as blueprintEngine.js: same input, same output, every time.
//
// Scope of this extraction, stated honestly: this covers the contact model used by
// the main app (both practice partners you create and real people you add — they
// share one schema, differentiated only by the `sim` flag). It does NOT yet absorb
// Training Grounds' deeper Evelyn-specific model (hidden traits, life state, memory
// summarization in src/training/). That system is already reasonably separated from
// its own UI and is a larger reconciliation for a later pass — not silently merged
// in here.

/* ---------------- Role sets the domain (what someone does) ---------------- */
export const ROLE_FLAVOR = [
  { match: /collect/i, backstory: "A private collector — buys carefully, tests your price before committing.",
    need: "Wants to see where your pricing stands before committing to anything.",
    trust: 25, interest: 45, colorKey: "purple" },
  { match: /gallery|gatekeep|curat/i, backstory: "A gallery gatekeeper — polite, but your portfolio has to earn the conversation.",
    need: "Curating a new show — cohesion and consistency matter more than any single piece.",
    trust: 20, interest: 35, colorKey: "purple" },
  { match: /mentor|coach|advis/i, backstory: "A mentor figure — direct feedback, genuinely rooting for you.",
    need: "Wants to see you follow through on what you said you'd finish last time.",
    trust: 45, interest: 55, colorKey: "blue" },
  { match: /consult|agent|manager/i, backstory: "A consultant — practical, transactional, moves fast when it's worth it.",
    need: "Wants concrete numbers before making any introduction on your behalf.",
    trust: 30, interest: 40, colorKey: "blue" },
  { match: /press|writer|journal|critic/i, backstory: "A critic — thoughtful, a little guarded, cares about the story behind the work.",
    need: "Looking for an angle that isn't just 'artist sells paintings.'",
    trust: 20, interest: 50, colorKey: "gold" },
  { match: /peer|artist|friend/i, backstory: "A fellow artist — generous with advice, occasionally a bit competitive.",
    need: "Wants to trade honest feedback, not just compliments.",
    trust: 40, interest: 45, colorKey: "forestLight" },
];
export function roleFlavor(role) {
  const hit = ROLE_FLAVOR.find(r => r.match.test(role || ""));
  return hit || { backstory: "Someone you're building a practice relationship with.",
    need: "Getting to know you — no strong opinion yet either way.", trust: 30, interest: 40, colorKey: "blue" };
}

/* ---------------- Temperament sets the personality (how someone acts) — independent of role ---------------- */
export const TEMPERAMENTS = [
  { key: "warm", label: "Warm & Encouraging", trustDelta: +12, interestDelta: +8,
    tone: "They're genuinely warm — quick to encourage, slower to push back." },
  { key: "shrewd", label: "Shrewd & Guarded", trustDelta: -10, interestDelta: +5,
    tone: "Shrewd and guarded — they'll test your price and your resolve before warming up." },
  { key: "blunt", label: "Blunt & Direct", trustDelta: 0, interestDelta: 0,
    tone: "Blunt and direct — no small talk, they'll tell you exactly what they think." },
  { key: "anxious", label: "Anxious & Indecisive", trustDelta: -5, interestDelta: -10,
    tone: "A little anxious and indecisive — prone to second-guessing, needs patience." },
  { key: "charming", label: "Charming & Evasive", trustDelta: +5, interestDelta: +15,
    tone: "Charming and hard to pin down — easy to talk to, harder to get a real commitment from." },
  { key: "skeptical", label: "Skeptical", trustDelta: -15, interestDelta: -5,
    tone: "Skeptical by default — you'll have to earn every bit of their confidence." },
];
export function temperamentFlavor(key) { return TEMPERAMENTS.find(t => t.key === key) || null; }

export function clampStat(n) { return Math.max(5, Math.min(95, n)); }

/**
 * Combines role + temperament into the actual starting profile for a new person.
 * Pure: given the same role/temperament/note, always produces the same numbers.
 * Returns profile FIELDS only (trust, interest, colorKey, backstory, temperamentLabel,
 * needs) — never an id, icon component, or position. Those are identity/rendering
 * concerns the caller owns; this function only computes the character.
 */
export function buildPersonProfile({ role, temperament, note } = {}) {
  const flavor = roleFlavor(role);
  const temper = temperamentFlavor(temperament);
  const trust = clampStat(flavor.trust + (temper ? temper.trustDelta : 0));
  const interest = clampStat(flavor.interest + (temper ? temper.interestDelta : 0));
  const backstory = temper ? `${flavor.backstory} ${temper.tone}` : flavor.backstory;
  return {
    trust, interest, colorKey: flavor.colorKey, backstory,
    temperamentLabel: temper ? temper.label : null,
    needs: note && note.trim() ? note.trim() : flavor.need,
  };
}

/**
 * The state change from "log an interaction" — trust climbs, momentum turns rising.
 * NOTE (flagged, not fixed in this pass): `lastInteraction` is stored elsewhere in
 * this app as display text ("2 days ago") rather than a timestamp, which means it
 * silently goes stale as real time passes instead of updating. That's a pre-existing
 * data-model issue this extraction surfaced but deliberately did not fix here — it
 * would mean also touching the seed data and the render side, which is out of scope
 * for "move existing logic," not "change what it does." Worth its own pass.
 */
export function applyInteraction(contact) {
  return { trust: Math.min(100, contact.trust + 4), momentum: "rising", lastInteraction: "just now" };
}

/**
 * Groups a list of people by where you met them, or by their first listed connection.
 * Pure: takes the array + mode, returns grouped entries — no component state closed over.
 */
export function groupPeopleBy(people, mode) {
  const groups = {};
  people.forEach(p => {
    const key = mode === "met"
      ? (p.metContext && p.metContext.trim() ? p.metContext.trim() : "Where met not recorded")
      : ((p.connections && p.connections.length > 0) ? p.connections[0] : "No recorded connections");
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });
  return Object.entries(groups);
}
