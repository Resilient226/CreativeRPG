// THE BUSINESS ENGINE — procedural generation for FICTIONAL businesses (galleries,
// studios, venues) created in AI NPC Mode. Same rules as npcEngine.js: deterministic
// seeded generation, no AI call involved, never used to invent a real business that
// actually exists — this is for populating your world with fictional practice
// entities, exactly like SIM practice partners.

const NAME_PREFIXES = ["White", "North", "Iron", "Golden", "Blue", "Copper", "Salt", "Ash", "Cedar", "Marble"];
const NAME_NOUNS = ["Gallery", "Studio", "Collective", "Annex", "Loft", "Room", "Works", "House", "Space"];
const CURATORIAL_FOCI = ["Abstract", "Figurative", "Contemporary", "Emerging Artists", "Sculpture", "Photography", "Mixed Media", "Street Art"];
const SIZE_CATEGORIES = ["Small storefront", "Mid-size gallery", "Large exhibition space", "Warehouse-scale venue", "Boutique studio"];
const BUSINESS_CATEGORY_KEYS = ["gallery", "studio", "venue", "market"];

function hashSeed(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0);
  };
}
function makeRng(seed) {
  const seedFn = hashSeed(String(seed));
  let a = seedFn();
  return function rng() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }

/**
 * Deterministic: same seedKey always generates the same fictional business.
 * category defaults to a random pick from the same categories real places use
 * (gallery/studio/venue/market/coop), so generated businesses fit right into the
 * existing map districts without special-casing.
 */
export function generateBusinessProfile({ seedKey, category }) {
  const rng = makeRng(seedKey);
  const cat = category || pick(rng, BUSINESS_CATEGORY_KEYS);
  const name = `${pick(rng, NAME_PREFIXES)} ${pick(rng, NAME_NOUNS)}`;
  return {
    name, category: cat,
    reputation: randInt(rng, 15, 80),
    prestige: randInt(rng, 10, 70),
    commissionRate: randInt(rng, 30, 55), // typical gallery commission range
    opennessToNewArtists: randInt(rng, 10, 90),
    footTraffic: randInt(rng, 20, 85),
    financialHealth: randInt(rng, 25, 85),
    curatorialFocus: pick(rng, CURATORIAL_FOCI),
    sizeCategory: pick(rng, SIZE_CATEGORIES),
    yearsOpen: randInt(rng, 1, 30),
  };
}

/** Same drift shape as npcEngine's — a business's financial health and foot traffic
 *  can nudge over simulated time, bounded and deterministic. */
export function driftBusinessOverTime(business, daysElapsed) {
  if (!daysElapsed || daysElapsed <= 0) return business;
  const rng = makeRng(`${business.name}-drift-${Math.floor(daysElapsed / 7)}`);
  const drift = Math.min(daysElapsed, 90) / 30;
  return {
    ...business,
    footTraffic: Math.max(5, Math.min(100, business.footTraffic + (rng() - 0.5) * 10 * drift)),
    financialHealth: Math.max(5, Math.min(100, business.financialHealth + (rng() - 0.5) * 8 * drift)),
  };
}
