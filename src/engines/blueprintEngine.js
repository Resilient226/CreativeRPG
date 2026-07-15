// THE BLUEPRINT ENGINE — deterministic progress math, and nothing else.
//
// Rule this module exists to enforce (per THE_CREATIVE_ARCHITECTURE_SPEC.md §3.1):
// no gameplay logic in UI components. Every function here is pure — same input,
// same output, no React, no rendering, fully testable with plain Node. The AI never
// invents a progress number; it can only ever explain a number this module computed.
//
// This is the first engine extracted from App.jsx. It owns:
//   - Readiness Score (requirements met/total for any specific target — a festival,
//     an opportunity, eventually a goal)
//   - Category-based Level progress (the Universal Levels ladder's per-category bars)
//   - The Career Assessment score (onboarding's starting-level placement)

/* ---------------- Universal Levels (the ladder itself never changes per player) ---------------- */
export const LEVEL_TEMPLATE = [
  { n: 1, title: "The Beginner", sub: "You've started making work." },
  { n: 2, title: "The Creator", sub: "A consistent practice exists." },
  { n: 3, title: "The Finisher", sub: "You complete what you start." },
  { n: 4, title: "The Seller", sub: "People buy from you." },
  { n: 5, title: "The Networker", sub: "Relationships become assets." },
  { n: 6, title: "The Professional", sub: "You run this like a business." },
  { n: 7, title: "The Gallery Artist", sub: "Become gallery ready." },
  { n: 8, title: "The Brand", sub: "People remember you." },
  { n: 9, title: "The Collector's Choice", sub: "Collectors seek you out." },
  { n: 10, title: "The Studio Owner", sub: "You're running a company." },
  { n: 11, title: "The Six-Figure Artist", sub: "You hit the mission." },
  { n: 12, title: "The Empire Builder", sub: "You're building culture." },
];

// Rough score-based placement (Career Assessment, self-reported — not auto-verified
// from imported accounts; that's a separate, bigger capability this doesn't attempt).
const LEVEL_THRESHOLDS = [0, 5, 15, 30, 50, 75, 110, 150, 200, 260, 330, 420];

/**
 * Scores a player's self-reported career history against the Universal Levels
 * ladder and returns the full 12-level array with done/current/locked state,
 * plus category-based requirements for whichever level is current.
 */
export function computeLevels({ finishedWorks, soloShows, groupShows, totalSales } = {}) {
  const score = (finishedWorks || 0) * 1 + (soloShows || 0) * 8 + (groupShows || 0) * 3 + (totalSales || 0) / 1000;
  let currentIdx = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= LEVEL_THRESHOLDS[i]) { currentIdx = i; break; }
  }
  return LEVEL_TEMPLATE.map((l, i) => ({
    ...l,
    state: i < currentIdx ? "done" : i === currentIdx ? "current" : "locked",
    xp: i === currentIdx ? 0 : undefined,
    xpNeed: i === currentIdx ? 2000 : undefined,
    categories: i === currentIdx ? [
      { name: "Mastery", met: Math.min(5, Math.round((finishedWorks || 0) / 6)), total: 5 },
      { name: "Business", met: Math.min(5, Math.round((totalSales || 0) / 3000)), total: 5 },
      { name: "Networking", met: Math.min(5, groupShows || 0), total: 5 },
      { name: "Professionalism", met: Math.min(3, soloShows || 0), total: 3 },
    ] : undefined,
  }));
}

/* ---------------- Readiness Score (any target: a festival, an opportunity, a goal) ---------------- */
/**
 * requirements: [{ label, met: boolean, weight?: number }]
 * weight defaults to 1 — every existing requirements array (no weight field) behaves
 * identically to before; weighting is additive, not a breaking change.
 * Returns { met, total, pct } where met/total are requirement COUNTS (for "3/6" display)
 * and pct is the weighted percentage (for the score itself) — these intentionally can
 * differ slightly if weights are ever used; both are exposed so UI can show either.
 */
export function computeReadiness(requirements) {
  if (!requirements || requirements.length === 0) return { met: 0, total: 0, pct: 0 };
  const met = requirements.filter(r => r.met).length;
  const total = requirements.length;
  const weightSum = requirements.reduce((s, r) => s + (r.weight ?? 1), 0);
  const metWeightSum = requirements.filter(r => r.met).reduce((s, r) => s + (r.weight ?? 1), 0);
  const pct = weightSum > 0 ? Math.round((metWeightSum / weightSum) * 100) : 0;
  return { met, total, pct };
}

/**
 * Is this target at risk given how much time is left? Pure threshold check — the
 * Career Director (Decision Engine) is the one allowed to decide what to DO about
 * this; this function only ever answers the yes/no math question.
 */
export function isAtRisk(requirements, daysLeft, { minDays = 10, minReadyPct = 75 } = {}) {
  if (daysLeft == null) return false;
  const { pct } = computeReadiness(requirements);
  return daysLeft <= minDays && pct < minReadyPct;
}

/* ---------------- Category-based Level progress ---------------- */
/**
 * categories: [{ name, met, total }] — returns each with a computed pct, plus an
 * overall pct across all categories combined. Used by the Career Path screen so
 * different disciplines can clear a level's categories differently while the
 * overall number still means the same thing.
 */
export function computeCategoryProgress(categories) {
  if (!categories || categories.length === 0) return { categories: [], overallPct: 0 };
  const withPct = categories.map(c => ({ ...c, pct: c.total > 0 ? Math.round((c.met / c.total) * 100) : 0, complete: c.met >= c.total }));
  const totalMet = categories.reduce((s, c) => s + c.met, 0);
  const totalOf = categories.reduce((s, c) => s + c.total, 0);
  const overallPct = totalOf > 0 ? Math.round((totalMet / totalOf) * 100) : 0;
  return { categories: withPct, overallPct };
}
