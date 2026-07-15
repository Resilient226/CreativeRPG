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
