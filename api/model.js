// Vercel serverless function: proxies requests to Google's Gemini API.
// The API key lives ONLY here, as a server-side env var (GEMINI_API_KEY —
// set this in Vercel's project settings; GROQ_API_KEY is no longer read and
// can be removed whenever). It is never sent to the browser.
//
// IMPORTANT: Gemini's response shape is normalized back into the same
// Anthropic-style shape ({ content: [{ type: "text", text }] }) the app has
// always used, so src/lib/model.js's allText()/extractJson() and every
// caller of callModel() need ZERO changes. Only this file changed.
//
// REAL SEARCH GROUNDING, finally: Groq had no web-search capability at all —
// `useSearch` was a documented no-op there, meaning the AI-research feature
// (knowledgeGraphEngine.js) could only draw on the model's training data,
// with real risk of confident-sounding fabrication for small/obscure real
// venues. Gemini genuinely supports Google Search grounding via the
// `google_search` tool below — when useSearch is true, the model can
// actually search before answering. This directly improves the accuracy of
// AI-suggested artists/artworks/history, though everything still lands as
// "pending" in the review queue and nothing goes live unreviewed.
//
// POST body: { system?, messages, maxTokens?, useSearch? }
// Returns:   { data, usedSearch }

// Pick your model — this is a real choice, not swapped automatically.
// gemini-2.5-flash (the previous value here) was retired for new API keys
// as of this writing — Google deprecates specific model snapshots on an
// ongoing basis. Using "gemini-flash-latest" instead of a pinned snapshot
// name means Google always points this at whatever their current
// recommended fast/cheap model is (currently Gemini 3.5 Flash), so this
// exact "model no longer available" error shouldn't recur just from time
// passing. Trade-off: behavior/quality can shift slightly whenever Google
// updates what's behind the alias, with no app-side change or warning. For
// a solo project updated infrequently, that trade is almost certainly
// worth it — pin to an explicit snapshot (e.g. "gemini-3.5-flash") instead
// if you'd rather control exactly when the model changes.
const MODEL = "gemini-flash-latest";
const GEMINI_URL = (model, key) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

function toGeminiContents(messages) {
  // Every existing caller in this app passes messages as
  // [{ role: "user", content: "plain string" }] (never Anthropic-style
  // content-block arrays), so this only needs to handle that shape —
  // defensively stringifies anything else rather than crashing on it.
  return messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : JSON.stringify(m.content) }],
  }));
}

async function callGemini(key, { system, messages, maxTokens, useSearch }) {
  const body = {
    contents: toGeminiContents(messages),
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  if (useSearch) body.tools = [{ google_search: {} }];

  const r = await fetch(GEMINI_URL(MODEL, key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await r.json();
  return { ok: r.ok, raw };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed" } });
    return;
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(500).json({ error: { message: "GEMINI_API_KEY is not set on the server" } });
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

  try {
    let { ok, raw } = await callGemini(key, { system, messages, maxTokens, useSearch });

    // Defensive fallback: if the grounding tool name/shape is ever rejected
    // by Gemini (API conventions do shift), retry once WITHOUT search rather
    // than hard-failing the whole feature over a tool-schema mismatch.
    if (!ok && useSearch && /tool/i.test(raw?.error?.message || "")) {
      ({ ok, raw } = await callGemini(key, { system, messages, maxTokens, useSearch: false }));
      raw._searchFallback = true;
    }

    if (!ok || raw.error) {
      res.status(502).json({ error: { message: raw?.error?.message || "Gemini API error" } });
      return;
    }

    const candidate = raw?.candidates?.[0];
    // A safety/policy block or empty response comes back with no candidate
    // content at all — surface that plainly instead of a confusing crash.
    if (!candidate) {
      const reason = raw?.promptFeedback?.blockReason;
      res.status(502).json({ error: { message: reason ? `Blocked by Gemini (${reason})` : "No response from Gemini" } });
      return;
    }
    const text = (candidate.content?.parts || []).map(p => p.text || "").join("");
    if (!text) {
      res.status(502).json({ error: { message: "Malformed response from Gemini" } });
      return;
    }

    // Normalize to the same shape the rest of the app already expects.
    const data = { content: [{ type: "text", text }] };
    // usedSearch reflects whether grounding actually fired (Gemini attaches
    // groundingMetadata when it really searched) — not just whether it was
    // requested, since the fallback above can silently drop it.
    const usedSearch = !!candidate.groundingMetadata && !raw._searchFallback;
    res.status(200).json({ data, usedSearch });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || "Network error" } });
  }
}
