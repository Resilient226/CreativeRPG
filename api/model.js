// Vercel serverless function: proxies requests to the Anthropic API.
// The API key lives ONLY here, as a server-side env var. It is never sent to
// the browser. This is also the fix for the artifact runtime's "Invalid
// response format" wall — a real backend can make these calls.
//
// POST body: { system?, messages, maxTokens?, useSearch? }
// Returns:   { data, usedSearch }   (data is the raw Anthropic response)

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-6";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: { message: "ANTHROPIC_API_KEY is not set on the server" } });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { system, messages, maxTokens = 1500, useSearch = false } = body || {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: { message: "messages must be an array" } });
    return;
  }

  const base = { model: MODEL, max_tokens: maxTokens, messages };
  if (system) base.system = system;

  // Try with web search first (if requested); on any API error, retry without tools.
  const attempts = [];
  if (useSearch) {
    attempts.push({
      body: { ...base, tools: [{ type: "web_search_20250305", name: "web_search" }] },
      usedSearch: true,
    });
  }
  attempts.push({ body: base, usedSearch: false });

  let lastErr = "Request failed";
  for (const attempt of attempts) {
    try {
      const r = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(attempt.body),
      });
      const data = await r.json();
      if (data && data.error) { lastErr = data.error.message || "API error"; continue; }
      if (!data || !Array.isArray(data.content)) { lastErr = "Malformed API response"; continue; }
      res.status(200).json({ data, usedSearch: attempt.usedSearch });
      return;
    } catch (e) {
      lastErr = (e && e.message) || "Network error";
      continue;
    }
  }
  res.status(502).json({ error: { message: lastErr } });
}
