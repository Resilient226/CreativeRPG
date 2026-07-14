// Skills model — six real business competencies that level from practice.
// XP curve is gentle so early progress feels alive: xpToNext(level) = 80 + 40*level.

export const SKILL_KEYS = ["negotiation", "confidence", "charisma", "mastery", "business", "resilience"];

export const SKILL_META = {
  negotiation: { label: "Negotiation", blurb: "Getting good price & terms" },
  confidence: { label: "Confidence", blurb: "Holding your price" },
  charisma: { label: "Charisma", blurb: "Rapport & warm outreach" },
  mastery: { label: "Mastery", blurb: "Craft depth & output" },
  business: { label: "Business", blurb: "Pricing & strategy" },
  resilience: { label: "Resilience", blurb: "Bouncing back from rejection" },
};

export function xpToNext(level) {
  return 80 + 40 * level;
}

export function freshSkills() {
  const s = {};
  for (const k of SKILL_KEYS) s[k] = { level: 1, xp: 0 };
  return s;
}

// Apply a flat XP delta to one skill, rolling levels over as needed.
// Negative deltas are allowed (e.g. folding hurts Confidence growth) but never
// drop below level 1 / 0 xp.
export function addXp(skills, key, amount) {
  if (!SKILL_KEYS.includes(key) || !amount) return skills;
  const cur = skills[key] || { level: 1, xp: 0 };
  let { level, xp } = cur;
  xp += amount;
  while (xp >= xpToNext(level)) { xp -= xpToNext(level); level += 1; }
  while (xp < 0) {
    if (level <= 1) { xp = 0; break; }
    level -= 1;
    xp += xpToNext(level);
  }
  return { ...skills, [key]: { level, xp } };
}

// Maps the NPC turn's `skillSignals` (semantic tags) into concrete XP awards.
// This is the single source of truth for "what teaches what."
const SIGNAL_XP = {
  negotiation: {
    held_price: { negotiation: 15, confidence: 12 },
    good_counter: { negotiation: 18, business: 6 },
    folded: { negotiation: 4, confidence: -6 },
    overpitched: { negotiation: 2, charisma: -3 },
  },
  rapport: {
    good_rapport: { charisma: 14, confidence: 4 },
    built_trust: { charisma: 10, business: 4 },
    awkward: { charisma: 2 },
  },
  outcome: {
    rejected_recovered: { resilience: 16, confidence: 6 },
    rejected: { resilience: 8 },
    closed_deal: { negotiation: 10, business: 12, confidence: 8 },
    good_pricing: { business: 12 },
    underpriced: { business: 3, confidence: -4 },
  },
};

// signals is an object like { negotiation: "held_price", rapport: "good_rapport", outcome: "closed_deal" }
export function xpFromSignals(skills, signals = {}) {
  let next = skills;
  const applied = {};
  for (const [category, tag] of Object.entries(signals)) {
    const table = SIGNAL_XP[category];
    const awards = table && table[tag];
    if (!awards) continue;
    for (const [skill, amt] of Object.entries(awards)) {
      next = addXp(next, skill, amt);
      applied[skill] = (applied[skill] || 0) + amt;
    }
  }
  return { skills: next, applied };
}
