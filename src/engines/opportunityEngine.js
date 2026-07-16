// THE OPPORTUNITY ENGINE — normalized schema + deterministic ranking. No AI call
// searches the web here, and no AI call decides the ranking either — same
// discipline as every other engine in this project (Blueprint Engine explains,
// never invents; Career Director ranks by real computed score, not a vibe).
//
// Scope, stated honestly: this builds the ONE verified-legitimate source (ArtsATL's
// public RSS feed) plus the schema and ranking every future source will plug into.
// It does NOT build scrapers for the other seven named sources from the design doc —
// each of those needs its own check (does it have a real API or feed? does its ToS
// allow this?) before a Collector gets built for it. Batch-committing to eight
// scrapers without that check isn't responsible engineering, it's a shortcut that
// creates fragile, possibly-prohibited code.

/* ---------------- verification levels — shown to the player, never hidden ---------------- */
export const VERIFICATION = {
  VERIFIED: { key: "verified", label: "Verified by the organization", badge: "✅" },
  OFFICIAL_FEED: { key: "official_feed", label: "From an official calendar/feed", badge: "🟡" },
  COMMUNITY: { key: "community", label: "Submitted by a trusted community member", badge: "🔵" },
  SELF_ADDED: { key: "self_added", label: "Added by you", badge: "✍️" },
  AI_DISCOVERED: { key: "ai_discovered", label: "Found automatically, not yet verified", badge: "⚪" },
};

/**
 * The one shared shape every opportunity becomes, regardless of source. Pure
 * normalization — same raw input, same Opportunity object out.
 */
export function normalizeOpportunity(raw, { source, verification = VERIFICATION.AI_DISCOVERED } = {}) {
  return {
    id: raw.id || `opp-${source}-${(raw.title || "").slice(0, 40)}`,
    title: raw.title || "Untitled opportunity",
    description: raw.description || "",
    category: raw.category || "General",
    source, verification: verification.key, verificationBadge: verification.badge, verificationLabel: verification.label,
    location: raw.location || "", lat: raw.lat ?? null, lng: raw.lng ?? null,
    venue: raw.venue || "", startDate: raw.startDate || null, endDate: raw.endDate || null, deadline: raw.deadline || null,
    cost: raw.cost || "", tags: raw.tags || [],
    // 0-100 relevance dimensions — the deterministic scorer weighs these against the
    // player's actual goal, rather than an AI guessing at "how good" an opportunity is.
    networkingValue: raw.networkingValue ?? 40, portfolioValue: raw.portfolioValue ?? 40,
    incomePotential: raw.incomePotential ?? 20, reputationValue: raw.reputationValue ?? 40,
  };
}

/**
 * Deterministic scoring against the player's actual goal — the "AI Ranker" from the
 * design doc, built as rules first (consistent with this project's whole approach:
 * the engine computes the real number, an AI layer may only ever explain it later,
 * never invent or override it).
 */
const GOAL_WEIGHTS = {
  "Become Gallery Represented": { portfolioValue: 0.4, reputationValue: 0.4, networkingValue: 0.2, incomePotential: 0.0 },
  "Become Full-Time": { incomePotential: 0.5, portfolioValue: 0.2, reputationValue: 0.2, networkingValue: 0.1 },
  "Earn $100,000/year": { incomePotential: 0.6, reputationValue: 0.2, networkingValue: 0.1, portfolioValue: 0.1 },
  "Build Passive Income": { incomePotential: 0.5, networkingValue: 0.3, portfolioValue: 0.1, reputationValue: 0.1 },
  "Become Museum Collected": { reputationValue: 0.5, portfolioValue: 0.3, networkingValue: 0.2, incomePotential: 0.0 },
  "Build a Creative Business": { incomePotential: 0.3, networkingValue: 0.3, reputationValue: 0.2, portfolioValue: 0.2 },
};
const DEFAULT_WEIGHTS = { portfolioValue: 0.3, reputationValue: 0.25, networkingValue: 0.25, incomePotential: 0.2 };

export function scoreOpportunityForGoal(opportunity, playerGoal) {
  const w = GOAL_WEIGHTS[playerGoal] || DEFAULT_WEIGHTS;
  const base = Object.keys(w).reduce((sum, k) => sum + (opportunity[k] || 0) * w[k], 0);
  // Deadline urgency nudges score up slightly as it approaches — never invents a
  // deadline that isn't there; only applies if one is actually known.
  let urgencyBonus = 0;
  if (opportunity.deadline) {
    const days = Math.ceil((new Date(opportunity.deadline) - Date.now()) / 86400000);
    if (days >= 0 && days <= 30) urgencyBonus = Math.max(0, 10 - days / 3);
  }
  return Math.round(Math.min(100, base + urgencyBonus));
}

/** Ranks a list of opportunities for a specific goal, highest first. */
export function rankOpportunities(opportunities, playerGoal) {
  return opportunities
    .map(o => ({ ...o, score: scoreOpportunityForGoal(o, playerGoal) }))
    .sort((a, b) => b.score - a.score);
}

/* ---------------- Collector 1 — ArtsATL, a real, verified, public RSS feed ---------------- */
export const ARTSATL_FEED_URL = "https://artsatl.org/feed";

/**
 * Simple regex-based RSS 2.0 item extractor — deliberately not a full XML parser
 * dependency, since RSS's <item> structure is simple and stable enough for this.
 * Pure: same feed text in, same normalized items out. Network fetching happens in
 * the caller (a Vercel Cron function), not here — this only parses text already fetched.
 */
export function parseRssItems(xmlText, { source = "artsatl", category = "Arts Event" } = {}) {
  const items = [];
  const itemBlocks = xmlText.match(/<item[\s\S]*?<\/item>/g) || [];
  itemBlocks.forEach(block => {
    const grab = tag => {
      const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      if (!m) return "";
      return m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").replace(/<[^>]+>/g, "").trim();
    };
    const title = grab("title");
    if (!title) return;
    items.push(normalizeOpportunity({
      title, description: grab("description"), startDate: grab("pubDate") || null,
      location: "Atlanta, GA", category,
    }, { source, verification: VERIFICATION.OFFICIAL_FEED }));
  });
  return items;
}
