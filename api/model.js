// Vercel serverless function: proxies requests to Groq's API.
// The API key lives ONLY here, as a server-side env var (GROQ_API_KEY). It
// is never sent to the browser.
//
// This is deliberately back to plain text generation ONLY — no bundled
// search/grounding tool. That's not a step backward: Gemini's bundled
// google_search grounding ran on its own, separately (and tightly) limited
// quota, which is exactly what broke the research feature last round, and
// there was no way to tell "out of text quota" from "out of search quota"
// apart from the error message. Search is now its own concern (see
// api/search.js, backed by Tavily's free tier) — the research flow calls
// search FIRST, then hands the results to THIS endpoint as plain context in
// the prompt. Two separately-documented free allowances, each doing the one
// thing it's built for, instead of one bundled black box.
//
// IMPORTANT: Groq's response shape is normalized back into an Anthropic-style
// shape ({ content: [{ type: "text", text }] }) before returning, so
// src/lib/model.js's allText()/extractJson() and every caller of callModel()
// need ZERO changes.
//
// POST body: { system?, messages, maxTokens? }
// Returns:   { data }

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// Pick your model — this is a real choice, not swapped automatically.
// Other options as of writing: "llama-3.1-8b-instant" (faster/cheaper),
// "mixtral-8x7b-32768" (long context). Check console.groq.com for the current list.
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(500).json({ error: { message: "GROQ_API_KEY is not set on the server" } });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const { system, messages, maxTokens = 1500 } = body || {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: { message: "messages must be an array" } });
    return;
  }

  // Groq's chat-completions format puts the system prompt as a message,
  // not a separate top-level field like Anthropic does.
  const groqMessages = system ? [{ role: "system", content: system }, ...messages] : messages;
  const reqBody = { model: MODEL, max_tokens: maxTokens, messages: groqMessages };

  try {
    const r = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${key}`,
      },
      body: JSON.stringify(reqBody),
    });
    const raw = await r.json();

    if (raw && raw.error) {
      res.status(502).json({ error: { message: raw.error.message || "Groq API error" } });
      return;
    }
    const text = raw?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      res.status(502).json({ error: { message: "Malformed response from Groq" } });
      return;
    }

    // Normalize to the same shape the rest of the app already expects.
    const data = { content: [{ type: "text", text }] };
    res.status(200).json({ data });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || "Network error" } });
  }
}
