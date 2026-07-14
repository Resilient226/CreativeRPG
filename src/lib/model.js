// Client-side helper that calls our own /api/model route (never Anthropic directly).
// Signature mirrors the artifact's `anthropicRequest` so the existing app component
// ports with a find/replace: fetch("https://api.anthropic.com/...") -> callModel(...).

export async function callModel({ system, messages, maxTokens = 1500, useSearch = false }) {
  const r = await fetch("/api/model", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system, messages, maxTokens, useSearch }),
  });
  const json = await r.json();
  if (!r.ok || json.error) {
    throw new Error(json?.error?.message || `Request failed (${r.status})`);
  }
  return json; // { data, usedSearch }
}

// Same JSON-extraction helpers the app already relies on, re-exported here so the
// component can import from one place after porting.
export function allText(data) {
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

function findBalancedEnd(text, start, openCh, closeCh) {
  let depth = 0, inStr = false, strCh = "", escaped = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === strCh) inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; strCh = c; continue; }
    if (c === openCh) depth++;
    else if (c === closeCh) { depth--; if (depth === 0) return i; }
  }
  return -1;
}
function candidatesFor(text, openCh, closeCh) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === openCh) {
      const end = findBalancedEnd(text, i, openCh, closeCh);
      if (end !== -1) {
        try { out.push(JSON.parse(text.slice(i, end + 1))); } catch { /* skip */ }
      }
    }
  }
  return out;
}
export function extractJson(text, preferred = "auto") {
  const cleaned = (text || "").replace(/```json|```/g, "");
  const bestArray = () => candidatesFor(cleaned, "[", "]").find((a) => Array.isArray(a) && a.length > 0 && typeof a[0] === "object");
  const bestObject = () => candidatesFor(cleaned, "{", "}").find((o) => o && typeof o === "object" && !Array.isArray(o));
  const result = preferred === "object" ? (bestObject() || bestArray())
    : preferred === "array" ? (bestArray() || bestObject())
    : (bestArray() || bestObject());
  if (!result) {
    const err = new Error("No valid JSON found in the response");
    err.rawText = cleaned.slice(0, 500);
    throw err;
  }
  return result;
}
