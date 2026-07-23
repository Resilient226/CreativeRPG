// Vercel serverless function: proxies search requests to Tavily's API.
// The API key lives ONLY here, as a server-side env var (TAVILY_API_KEY),
// never sent to the browser. Get a key at tavily.com — free tier is 1,000
// searches/month, no billing required to start.
//
// This exists specifically to give the AI-research feature (see
// knowledgeGraphEngine.js's buildResearchPrompt) REAL facts to work from,
// as its own separate concern from text generation. Tavily returns clean,
// already-summarized results with real source URLs — exactly what a
// research prompt needs to cite honestly, instead of asking a model to
// invent plausible-sounding sources for a venue it doesn't actually know.
//
// POST body: { query, maxResults? }
// Returns:   { results: [{ title, url, content }] }

const TAVILY_URL = "https://api.tavily.com/search";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }
  const key = process.env.TAVILY_API_KEY;
  if (!key) {
    res.status(500).json({ error: { message: "TAVILY_API_KEY is not set on the server" } });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { query, maxResults = 5 } = body || {};
  if (!query || typeof query !== "string") {
    res.status(400).json({ error: { message: "query (string) is required" } });
    return;
  }

  try {
    const r = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Tavily authenticates via a key IN the JSON body, not a header —
      // this is Tavily's own convention, different from Groq's Bearer-token
      // style above; not a mistake, just a different API's shape.
      body: JSON.stringify({
        api_key: key, query, max_results: maxResults,
        search_depth: "basic", // "advanced" costs more of the free quota per call; basic is enough for venue facts
        include_answer: false, // we want raw sources with URLs, not Tavily's own synthesized answer
      }),
    });
    const raw = await r.json();

    if (!r.ok || raw.error) {
      res.status(502).json({ error: { message: raw?.error || raw?.detail || "Tavily API error" } });
      return;
    }
    // Normalize to only what the research prompt actually needs — title,
    // url (the real sourceNote), and content (the snippet to reason over).
    const results = (raw.results || []).map(x => ({ title: x.title || "", url: x.url || "", content: x.content || "" }));
    res.status(200).json({ results });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || "Network error" } });
  }
}
