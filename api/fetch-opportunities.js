// Fetches ArtsATL's real, public RSS feed server-side and returns normalized
// opportunities as JSON. This has to run server-side, not in the browser — RSS
// feeds generally don't send CORS headers permitting cross-origin browser fetches,
// so a client-side fetch to artsatl.org/feed would simply fail silently.
//
// Deliberately self-contained (not importing from src/engines/opportunityEngine.js)
// — Vercel bundles api/ functions separately from the Vite app in src/, and relying
// on a cross-directory import here risks the exact "Could not resolve" class of
// build failure this project has hit repeatedly. A little duplication here is safer
// than a fragile import path.

const ARTSATL_FEED_URL = "https://artsatl.org/feed";

function parseRssItems(xmlText) {
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
    items.push({
      id: `opp-artsatl-${title.slice(0, 40)}`,
      title, description: grab("description"), startDate: grab("pubDate") || null,
      location: "Atlanta, GA", category: "Arts Event", source: "artsatl",
      verification: "official_feed", verificationBadge: "🟡", verificationLabel: "From an official calendar/feed",
      lat: null, lng: null, venue: "", endDate: null, deadline: null, cost: "", tags: [],
      networkingValue: 40, portfolioValue: 40, incomePotential: 20, reputationValue: 40,
    });
  });
  return items;
}

export default async function handler(req, res) {
  try {
    const r = await fetch(ARTSATL_FEED_URL, { headers: { "User-Agent": "CreativeEmpireOS/1.0" } });
    if (!r.ok) { res.status(502).json({ error: { message: `ArtsATL feed returned ${r.status}` } }); return; }
    const xml = await r.text();
    const items = parseRssItems(xml);
    res.status(200).json({ opportunities: items, fetchedAt: Date.now() });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || "Failed to fetch opportunities" } });
  }
}
