// THE CASTLEBERRY HILL VERTICAL SLICE — the game's first fully real, playable block.
// Every location here is a genuine, verified real place — researched, not invented.
// Deliberately NO hand-estimated lat/lng: addresses are real and sourced; coordinates
// get resolved through geocodeAddress() (already built, tested) at real request time,
// the same discipline held for the seed Opportunities earlier in this project.
//
// Sourcing note: addresses below were verified via live web search against real
// business listings (Yelp, official sites, ArtsATL, the Castleberry Hill Improvement
// Association). Where a source only confirmed "Castleberry Hill" generally without a
// street number, that's stated honestly rather than guessed at.

import { geocodeAddress } from "./geoEngine";

export const CASTLEBERRY_HILL_LOCATIONS = [
  { id: "nina-baldwin-gallery", name: "Nina Baldwin Gallery", category: "gallery",
    address: "309 Peters St SW, Atlanta, GA 30313", knownLocationKey: null },
  { id: "old-rabbit-gallery", name: "Old Rabbit Gallery", category: "gallery",
    address: "309A Peters St SW, Atlanta, GA 30313", knownLocationKey: null },
  { id: "peters-street-station", name: "Peters Street Station", category: "venue",
    address: "333 Peters St SW, Atlanta, GA 30313", knownLocationKey: null,
    note: "Community art center, gallery, and event space — home of the Hidden Gallery." },
  { id: "peters-street-commons", name: "Peters Street Commons", category: "venue",
    address: "Peters St SW, Atlanta, GA 30313 (Castleberry Hill)", knownLocationKey: null,
    note: "Live/work lofts and event space in a historic Castleberry Hill building." },
  { id: "zucot-gallery", name: "ZuCot Gallery", category: "gallery",
    address: "100 Centennial Olympic Park Dr SW, Atlanta, GA 30313", knownLocationKey: null,
    note: "The largest Black-owned fine art gallery in the Southeast." },
  { id: "castleberry-hill-art-gallery", name: "Castleberry Hill Art Gallery", category: "gallery",
    address: "238 Walker St SW Unit 12, Atlanta, GA 30313", knownLocationKey: null },
];

/** The real, recurring anchor event — not invented. Verified via castleberryhill.org. */
export const CASTLEBERRY_HILL_EVENT = {
  id: "castleberry-hill-art-stroll", name: "Castleberry Hill 2nd Friday Art Stroll",
  category: "Recurring Event", recurrence: "Second Friday of every month",
  description: "A free, self-guided stroll through the district's open galleries, studios, and creative spaces.",
  sourceUrl: "https://castleberryhill.org/chartstroll/",
};

/**
 * Resolves every location's real coordinate via live geocoding — never a hand-typed
 * guess. Only runs in a real browser (geocodeAddress depends on live network access
 * this sandbox can't provide); results are cached in-memory per session so the same
 * address isn't re-geocoded on every render.
 */
const geocodeCache = new Map();
export async function resolveCastleberryHillLocations() {
  const resolved = [];
  for (const loc of CASTLEBERRY_HILL_LOCATIONS) {
    if (geocodeCache.has(loc.id)) { resolved.push({ ...loc, ...geocodeCache.get(loc.id) }); continue; }
    const coords = await geocodeAddress(loc.address);
    if (coords) geocodeCache.set(loc.id, coords);
    resolved.push({ ...loc, ...(coords || {}) });
  }
  return resolved;
}