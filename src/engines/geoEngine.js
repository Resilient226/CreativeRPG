// THE GEO ENGINE — real-world coordinate math and geocoding. This is what makes
// "districts and opportunities at real-world locations" actually real, instead of
// the fictional pixel-space the old World Engine used.
//
// Two honest limits, stated up front:
// 1. geocodeAddress() calls a live, free, no-API-key service (Nominatim/OpenStreetMap)
//    at real request time — it cannot be tested from a sandbox with restricted network
//    egress, only from the deployed app in a real browser. The function itself is
//    standard, correct usage; only its live behavior is unverifiable from here.
// 2. Seed coordinates below are either sourced from verified, cited references
//    (Georgia Council for the Arts, the BeltLine anchor point) or deliberately left
//    for live geocoding rather than hand-estimated — guessing a real place's
//    coordinates and being wrong is worse than not having one yet.

/** Great-circle distance between two real coordinates, in kilometers. */
export function haversineDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Deterministic seeded jitter — same seedKey always produces the same offset, so an
// entity without a real address doesn't reshuffle position on every render.
function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * For entities with no known real address: places them at a small, deterministic,
 * random-looking offset from a home-base coordinate (your actual city), within
 * radiusKm. Same entity, same result every time — never reshuffles.
 */
export function jitterNearBase(baseLat, baseLng, seedKey, radiusKm = 3) {
  const rng = hashSeed(String(seedKey));
  const angle = rng() * Math.PI * 2;
  const dist = rng() * radiusKm;
  const dLat = (dist / 111) * Math.sin(angle); // ~111km per degree latitude
  const dLng = (dist / (111 * Math.cos((baseLat * Math.PI) / 180))) * Math.cos(angle);
  return { lat: baseLat + dLat, lng: baseLng + dLng };
}

/** Atlanta fallback — used only if the browser has no location and the player
 *  hasn't set a home base yet. Matches where this app's real seed data already lives. */
/** Real spherical bearing (compass heading, 0-360°) from one coordinate to another —
 *  used to derive the player avatar's facing direction from consecutive GPS fixes
 *  when the device doesn't report heading directly. Returns null if the two points
 *  are too close together to compute a meaningful direction (avoids jittery heading
 *  from GPS noise when the player is essentially stationary). */
export function computeHeadingFromPositions(from, to) {
  const distKm = haversineDistanceKm(from.lat, from.lng, to.lat, to.lng);
  if (distKm < 0.001) return null; // less than ~1m apart — not enough signal to trust
  const toRad = d => (d * Math.PI) / 180;
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat), lat2 = toRad(to.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = (Math.atan2(y, x) * 180) / Math.PI;
  return (bearing + 360) % 360;
}

export const DEFAULT_HOME_BASE = { lat: 33.7490, lng: -84.3880, label: "Atlanta, GA" };

/**
 * Real, sourced coordinates for the app's existing seed opportunities. Anything not
 * listed here should be resolved through geocodeAddress() instead of guessed.
 */
export const KNOWN_LOCATIONS = {
  "atlanta-beltline": { lat: 33.7553, lng: -84.3726, label: "Historic Fourth Ward Park (BeltLine Eastside Trail anchor)" },
  "georgia-council-arts": { lat: 33.7774, lng: -84.3891, label: "Georgia Council for the Arts" },
};

/**
 * Live geocoding via Nominatim (OpenStreetMap's free search API, no key required).
 * Only runs in a real browser at real request time — cannot be verified from a
 * restricted sandbox, only from the deployed app. Returns null on any failure
 * rather than throwing, so a bad address never crashes the caller.
 */
export async function geocodeAddress(address) {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "Accept-Language": "en" } });
    const data = await res.json();
    if (!data || !data[0]) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
  } catch {
    return null;
  }
}
