// Queries OpenStreetMap's Overpass API for real galleries, museums, and public
// art/murals within a bounding box — a genuine, free, keyless, unified discovery
// source (no separate "mural API" vs "gallery API"; one query, real OSM tags:
// tourism=gallery, tourism=museum, tourism=artwork).
//
// Runs server-side for the same reason the ArtsATL fetch does: this needs a POST
// with a specific content type Overpass expects, and keeping it off the client
// avoids CORS friction and keeps the query logic in one place, not duplicated in
// the browser bundle.
//
// Self-contained (no cross-directory import from src/engines/) for the same reason
// as fetch-opportunities.js: Vercel bundles api/ separately, and a fragile import
// path here risks the exact "Could not resolve" failures this project has hit
// repeatedly. A little duplication is safer than a brittle import.

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";

// Castleberry Hill, Atlanta — a bounding box, not a single point, since this needs
// to cover the whole district (south/west, north/east corners).
const CASTLEBERRY_HILL_BBOX = "33.744,-84.401,33.756,-84.386";

function buildQuery(bbox) {
  return `
    [out:json][timeout:20];
    (
      node["tourism"="gallery"](${bbox});
      node["tourism"="museum"](${bbox});
      node["tourism"="artwork"](${bbox});
      way["tourism"="gallery"](${bbox});
      way["tourism"="artwork"](${bbox});
    );
    out center tags;
  `;
}

function normalizeElement(el) {
  const tags = el.tags || {};
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;
  if (lat == null || lng == null || !tags.name) return null; // skip unnamed/unlocated nodes — not useful to show
  const category = tags.tourism === "artwork" ? "public_art" : tags.tourism === "museum" ? "museum" : "gallery";
  return {
    id: `osm-${el.type}-${el.id}`, name: tags.name, category, lat, lng,
    artist: tags.artist || null, artworkType: tags.artwork_type || null,
    website: tags.website || tags["contact:website"] || null,
    source: "openstreetmap", verification: "official_feed",
    verificationBadge: "🟡", verificationLabel: "From OpenStreetMap's public map data",
  };
}

export default async function handler(req, res) {
  try {
    const query = buildQuery(CASTLEBERRY_HILL_BBOX);
    const r = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });
    if (!r.ok) { res.status(502).json({ error: { message: `Overpass returned ${r.status}` } }); return; }
    const data = await r.json();
    const locations = (data.elements || []).map(normalizeElement).filter(Boolean);
    res.status(200).json({ locations, fetchedAt: Date.now() });
  } catch (e) {
    res.status(502).json({ error: { message: (e && e.message) || "Failed to fetch locations" } });
  }
}
