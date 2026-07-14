// Vercel serverless function: proxies requests to Groq's API.
// The API key lives ONLY here, as a server-side env var. It is never sent to
// the browser.
//
// IMPORTANT: Groq's response shape is normalized back into an Anthropic-style
// shape ({ content: [{ type: "text", text }] }) before returning, so
// src/lib/model.js's allText()/extractJson() and every training file that
// calls callModel() need ZERO changes. Only this file had to change.
//
// POST body: { system?, messages, maxTokens?, useSearch? }
// Returns:   { data, usedSearch }

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
  const { system, messages, maxTokens = 1500, useSearch = false } = body || {};
  if (!Array.isArray(messages)) {
    res.status(400).json({ error: { message: "messages must be an array" } });
    return;
  }

  // Groq's chat-completions format puts the system prompt as a message,
  // not a separate top-level field like Anthropic does.
  const groqMessages = system ? [{ role: "system", content: system }, ...messages] : messages;

  // NOTE: Groq does not offer Anthropic's built-in web_search tool. If a caller
  // asks for useSearch, we can't honor it here — we proceed without it and say
  // so, rather than silently pretending search happened. Real web search would
  // need a separate implementation (e.g. calling a search API yourself and
  // stuffing results into the prompt) — that's not built here.
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
    res.status(200).json({ data, usedSearch: false });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || "Network error" } });
  }
}
