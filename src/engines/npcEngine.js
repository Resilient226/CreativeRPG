// THE NPC ENGINE — procedural personality generation for FICTIONAL characters only
// (Evelyn-style practice partners you create). This is deliberately never used for
// real contacts — a real person's profile in this app is built only from what you
// actually observed and logged, never generated. See the note on generateNpcPersonality.
//
// Everything here is deterministic. "Procedurally unique" means seeded generation,
// not Math.random() scattered through the file — the same NPC, regenerated with the
// same seed, produces the exact same personality every time. That's what makes this
// testable at all, and it's what keeps a character's personality from silently
// reshuffling itself on a re-render.
//
// Execution model (per the hybrid approach agreed on): everything in this file is
// rule-based and cheap to compute — no AI call is involved in generating a
// personality or drifting it over time. AI is reserved for actual conversations
// (Evelyn's negotiation turns already work this way) — this engine only ever
// produces the DATA a conversation might later draw on.

/* ---------------- deterministic seeded random ---------------- */
// A small string hash + mulberry32 PRNG. Given the same seed string, this produces
// the exact same sequence of "random" numbers every time — the actual property that
// matters here, not true randomness.
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
function randInt(rng, min, max) { return Math.floor(rng() * (max - min + 1)) + min; }
function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function pickN(rng, arr, n) {
  const pool = [...arr], out = [];
  for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  return out;
}

/* ---------------- trait categories ---------------- */
export const CORE_TRAIT_KEYS = ["Ambition", "Creativity", "Openness", "Reliability", "Generosity", "Competitiveness", "Confidence", "Curiosity", "Patience", "Authenticity"];
export const SOCIAL_TRAIT_KEYS = ["Friendliness", "Extroversion", "Networking Ability", "Communication", "Empathy", "Charisma", "Trustfulness", "Influence"];
export const BUSINESS_TRAIT_KEYS = ["Negotiation", "Risk Tolerance", "Financial Discipline", "Leadership", "Professionalism", "Sales Ability"];
export const ARTISTIC_PREFERENCE_KEYS = ["Abstract", "Figurative", "Minimalism", "Contemporary", "Street Art", "Sculpture", "Photography", "Installation", "Digital Art"];
export const HIDDEN_TRAIT_KEYS = ["Jealousy", "Ego", "Bias Toward Emerging Artists", "Fear Of Risk", "Burnout", "Openness To Mentorship", "Political Influence"];
export const GOAL_OPTIONS = ["Become Museum Director", "Open a Gallery", "Sell More Artwork", "Find New Artists", "Build a Collection", "Grow Business", "Win a Grant", "Expand Network"];
export const CAREER_OPTIONS = { collector: "Private Collector", gallery: "Gallery Owner", mentor: "Mentor", consultant: "Consultant", press: "Critic/Journalist", peer: "Working Artist" };

function generateTraitBlock(rng, keys) {
  const block = {};
  keys.forEach(k => { block[k] = randInt(rng, 5, 95); });
  return block;
}

/**
 * Artistic preferences deliberately anti-correlate: a couple of "primary" tastes
 * are pushed high, and their rough opposites are pushed low — this is what produces
 * "95% into conceptual work, only 15% into realism" instead of flat random noise
 * across every category.
 */
function generateArtisticPreferences(rng) {
  const prefs = {};
  ARTISTIC_PREFERENCE_KEYS.forEach(k => { prefs[k] = randInt(rng, 20, 60); }); // neutral baseline
  const primaries = pickN(rng, ARTISTIC_PREFERENCE_KEYS, 2);
  primaries.forEach(k => { prefs[k] = randInt(rng, 75, 98); });
  // a rough "opposite" pairing table — pushed down when a primary is chosen
  const OPPOSITES = { Abstract: "Figurative", Figurative: "Abstract", Minimalism: "Installation", Contemporary: "Figurative", "Street Art": "Minimalism", Photography: "Abstract" };
  primaries.forEach(k => { if (OPPOSITES[k]) prefs[OPPOSITES[k]] = randInt(rng, 5, 25); });
  return prefs;
}

/**
 * Behavioral tendencies are DERIVED from core/social traits, not independently
 * random — a high-Reliability, high-Communication NPC should reliably reply
 * quickly and follow through; that internal consistency is what makes a generated
 * personality feel like one coherent person instead of assembled noise.
 */
function generateBehavioralTendencies(core, social) {
  const clamp = n => Math.max(2, Math.min(98, Math.round(n)));
  return {
    "Replies quickly": clamp(social.Communication * 0.6 + social.Extroversion * 0.4),
    "Cancels meetings": clamp(100 - core.Reliability),
    "Introduces others": clamp(social["Networking Ability"] * 0.7 + social.Friendliness * 0.3),
    "Follows through": clamp(core.Reliability),
    "Forgets conversations": clamp(100 - core.Patience * 0.5 - social.Empathy * 0.5),
    "Ghosts contacts": clamp(100 - core.Reliability * 0.6 - core.Authenticity * 0.4),
    "Gives feedback": clamp(social.Communication * 0.5 + core.Authenticity * 0.5),
  };
}

/**
 * The full procedural generation. Same (name, role, temperamentKey, seedKey) always
 * produces the same NPC — regenerating is a no-op, not a reshuffle.
 *
 * IMPORTANT — this is for FICTIONAL characters only. Never call this for a real
 * contact: a real person's traits should only ever come from what the player
 * actually observed and logged, never from a generator standing in for a real
 * person's inner life.
 */
export function generateNpcPersonality({ name, role, temperamentKey, seedKey }) {
  const rng = makeRng(seedKey || `${name}-${role}`);
  const core = generateTraitBlock(rng, CORE_TRAIT_KEYS);
  const social = generateTraitBlock(rng, SOCIAL_TRAIT_KEYS);
  const business = generateTraitBlock(rng, BUSINESS_TRAIT_KEYS);
  const artisticPreferences = generateArtisticPreferences(rng);
  const hiddenTraits = generateTraitBlock(rng, HIDDEN_TRAIT_KEYS);
  const behavioralTendencies = generateBehavioralTendencies(core, social);
  const goals = pickN(rng, GOAL_OPTIONS, randInt(rng, 1, 2));
  const careerKind = Object.keys(CAREER_OPTIONS).find(k => (role || "").toLowerCase().includes(k)) || pick(rng, Object.keys(CAREER_OPTIONS));
  const careerState = {
    career: CAREER_OPTIONS[careerKind], position: pick(rng, ["Assistant", "Associate", "Senior", "Director", "Independent"]),
    influence: randInt(rng, 10, 60), experience: randInt(rng, 1, 25), reputation: randInt(rng, 15, 70),
    salary: randInt(rng, 30, 150) * 1000, stress: randInt(rng, 15, 55), energy: randInt(rng, 40, 90),
    availableHoursPerWeek: randInt(rng, 2, 12), currentProject: pick(rng, ["a group show", "a new acquisition", "restructuring their roster", "a grant application", "no active project right now"]),
  };
  return { core, social, business, artisticPreferences, hiddenTraits, behavioralTendencies, goals, careerState };
}

/** Starting relationship metrics — separate from the NPC's own personality, this is
 *  specifically how THIS PLAYER and this NPC relate, and it's the only part that
 *  changes purely through interaction, never through drift. */
export function initRelationshipMetrics() {
  return { trust: 20, respect: 20, familiarity: 5, professionalInterest: 30, friendship: 10, reliability: 50, memoryStrength: 10 };
}

/**
 * Deterministic drift over simulated time — career state and goals nudge forward
 * as time passes, whether or not the player is looking. Same npc + same
 * daysElapsed always produces the same result (seeded by npc identity + a
 * time-bucket, so drift doesn't re-shuffle if called twice for the same span).
 * Bounded and modest by design — real career-change "life events" are a
 * deliberately small possibility here, not a guaranteed dramatic arc.
 */
export function driftNpcOverTime(npc, daysElapsed) {
  if (!daysElapsed || daysElapsed <= 0) return npc;
  const rng = makeRng(`${npc.id}-drift-${Math.floor(daysElapsed / 7)}`); // re-seeds weekly, stable within a week
  const cs = { ...npc.careerState };
  const drift = Math.min(daysElapsed, 90) / 30; // bounded — even a huge elapsed gap only drifts ~3 "months" worth
  cs.experience = cs.experience + drift * 0.05;
  cs.stress = Math.max(5, Math.min(95, cs.stress + (rng() - 0.5) * 10 * drift));
  cs.energy = Math.max(10, Math.min(100, cs.energy + (rng() - 0.5) * 8 * drift));
  // small, bounded chance of real career progression the longer the gap
  if (rng() < 0.08 * drift) {
    cs.influence = Math.min(100, cs.influence + randInt(rng, 3, 10));
    cs.reputation = Math.min(100, cs.reputation + randInt(rng, 2, 8));
  }
  if (rng() < 0.03 * drift) {
    cs.position = pick(rng, ["Assistant", "Associate", "Senior", "Director", "Independent"]);
  }
  return { ...npc, careerState: cs };
}

/* ---------------- qualitative Public Profile ---------------- */
// Deterministic, rule-based observation text — NOT AI-generated. Same principle as
// the Blueprint Engine: the underlying numbers are real, but the player only ever
// sees a human-readable interpretation, gated by how much they've actually earned
// through familiarity — never the raw percentage.
const OBSERVATION_RULES = [
  { check: n => n.core.Reliability > 70, text: "Usually follows through on what they say.", minFamiliarity: 0 },
  { check: n => n.core.Reliability < 35, text: "Follow-through has been inconsistent so far.", minFamiliarity: 15 },
  { check: n => n.social.Communication > 70, text: "Responds thoughtfully, usually within a few days.", minFamiliarity: 0 },
  { check: n => n.behavioralTendencies["Replies quickly"] > 70, text: "Tends to reply quickly.", minFamiliarity: 10 },
  { check: n => n.behavioralTendencies["Ghosts contacts"] > 55, text: "Has gone quiet before without much warning.", minFamiliarity: 30 },
  { check: n => n.core.Generosity > 70, text: "Generous with introductions and advice.", minFamiliarity: 20 },
  { check: n => n.business["Risk Tolerance"] > 70, text: "Seems drawn to bold, less conventional work.", minFamiliarity: 15 },
  { check: n => n.business["Risk Tolerance"] < 30, text: "Seems to prefer safe, proven choices over experiments.", minFamiliarity: 15 },
  { check: n => n.careerState.stress > 65, text: "Seems extremely busy lately.", minFamiliarity: 0 },
  { check: n => n.hiddenTraits["Openness To Mentorship"] > 65, text: "Seems genuinely open to mentoring newer artists.", minFamiliarity: 40 },
  { check: n => n.hiddenTraits.Ego > 70, text: "Conversations tend to circle back to their own taste and judgment.", minFamiliarity: 45 },
];
function topArtisticPreference(prefs) {
  const [name] = Object.entries(prefs).sort((a, b) => b[1] - a[1])[0];
  return name;
}

/**
 * Builds the observations the player has actually "earned" — gated by
 * relationship.familiarity, so a stranger reveals almost nothing and a
 * well-known practice partner reveals real texture. Never returns a raw number.
 */
export function generatePublicProfile(npc, relationship) {
  const familiarity = relationship?.familiarity || 0;
  const lines = [];
  lines.push(`Loves ${topArtisticPreference(npc.artisticPreferences).toLowerCase()} work.`);
  OBSERVATION_RULES.forEach(rule => {
    if (familiarity >= rule.minFamiliarity && rule.check(npc)) lines.push(rule.text);
  });
  if (familiarity < 15) return lines.slice(0, 2); // a stranger — almost nothing earned yet
  if (familiarity < 40) return lines.slice(0, 4);
  return lines;
}
