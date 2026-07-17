// THE CALENDAR ENGINE — pure deadline math. No React, no rendering. Same contract
// as every other engine here: same input, same output, every time.
//
// This was found as genuine duplication, not just a tidy-up target: MapScreen_'s
// "nearest deadlines" panel and the Calendar screen each hand-built their own sorted
// deadline list, slightly differently (one silently assumed every quest had a
// parseable due date, one didn't). One shared function now serves both.

/**
 * A quest's `due` field is loose display text ("8 days", "Check site", "—") rather
 * than a real date — this pulls the leading number out if there is one, or returns
 * null. Matches the exact parsing already in use (parseInt stops at the first
 * non-digit, so "8 days" correctly yields 8).
 */
export function parseDueDays(due) {
  if (!due || !/^\d+/.test(due)) return null;
  return parseInt(due, 10);
}

/**
 * Builds one sorted, soonest-first deadline list from quests and milestone events —
 * the single source both the Map screen's alert panel and the full Calendar screen
 * read from, instead of each hand-rolling a slightly different version.
 * Items with no parseable deadline sort last (never crash, never disappear).
 */
export function buildUpcomingDeadlines({ quests = [], events = [], limit } = {}) {
  const items = [
    ...quests.filter(q => !q.done).map(q => ({
      label: q.title, sub: q.tag, days: parseDueDays(q.due), raw: q.due,
    })),
    ...events.filter(e => e.daysLeft != null).map(e => ({
      label: e.name, sub: e.category || "Event", days: e.daysLeft, raw: `${e.daysLeft}d`,
    })),
  ].sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
  return typeof limit === "number" ? items.slice(0, limit) : items;
}

/** Is a deadline close enough to flag visually? A single, named threshold instead
 *  of a magic number (`<= 5`) scattered across whichever component renders it. */
export function isUrgentDeadline(days, threshold = 5) {
  return days != null && days <= threshold;
}

/**
 * Merges items that share the same title (case/whitespace-insensitive) into one
 * entry — e.g. the same real opportunity tracked twice, or a quest and an event
 * both referencing the same thing. Keeps the SOONEST date among duplicates (never
 * the stalest), and tags how many were merged so the UI can show "×2" honestly
 * instead of silently hiding that a merge happened.
 */
export function consolidateByTitle(items) {
  const groups = new Map();
  items.forEach(item => {
    const key = (item.label || "").trim().toLowerCase();
    const existing = groups.get(key);
    if (!existing) { groups.set(key, { ...item, count: 1 }); return; }
    const itemIsSooner = (item.days ?? Infinity) < (existing.days ?? Infinity);
    groups.set(key, { ...existing, days: itemIsSooner ? item.days : existing.days,
      raw: itemIsSooner ? item.raw : existing.raw, count: existing.count + 1 });
  });
  return Array.from(groups.values()).sort((a, b) => (a.days ?? 9999) - (b.days ?? 9999));
}

/**
 * Filters by a name/category text search and/or a day-range window. Items with no
 * parseable deadline always pass the date filters (never hidden just because we
 * couldn't parse a date) — same "never silently disappear" rule as the rest of
 * this engine.
 */
export function filterDeadlines(items, { query = "", minDays = null, maxDays = null } = {}) {
  const q = query.trim().toLowerCase();
  return items.filter(item => {
    const matchesQuery = !q || (item.label || "").toLowerCase().includes(q) || (item.sub || "").toLowerCase().includes(q);
    const matchesMin = minDays == null || item.days == null || item.days >= minDays;
    const matchesMax = maxDays == null || item.days == null || item.days <= maxDays;
    return matchesQuery && matchesMin && matchesMax;
  });
}
