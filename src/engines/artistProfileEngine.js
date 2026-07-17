// THE ARTIST PROFILE ENGINE — XP, achievements, badges, check-ins, and the Creative
// Archive. This is a genuinely new, separate track from Career Level (Blueprint
// Engine): Career Level reflects career milestones (finished works, shows, sales);
// this reflects PARTICIPATION — did you actually go somewhere, do something, show
// up. Same discipline as every engine here: fully deterministic, no AI involved in
// awarding XP or unlocking an achievement — those are facts computed from what you
// actually did, not something an AI decides.

/* ---------------- XP: real-world participation only ---------------- */
export const XP_ACTIONS = {
  VISIT_GALLERY: { key: "visit_gallery", label: "Visited a gallery", xp: 10 },
  ATTEND_EVENT: { key: "attend_event", label: "Attended an event", xp: 15 },
  DISCOVER_PUBLIC_ART: { key: "discover_public_art", label: "Discovered public art", xp: 10 },
  COMPLETE_QUEST: { key: "complete_quest", label: "Completed a quest", xp: 20 },
  HOST_EVENT: { key: "host_event", label: "Hosted an event", xp: 40 },
  EXHIBIT_WORK: { key: "exhibit_work", label: "Exhibited work", xp: 50 },
  CHECK_IN: { key: "check_in", label: "Checked in somewhere real", xp: 5 },
};

/** Pure: given current XP and an action, returns the new total. Never negative,
 *  never invents an amount not in the table above. */
export function awardXp(currentXp, actionKey) {
  const action = Object.values(XP_ACTIONS).find(a => a.key === actionKey);
  if (!action) return currentXp;
  return currentXp + action.xp;
}

// A real ladder, separate from Career Level — this is "how active/engaged," not
// "how far along your career." Thresholds grow, same idea as Career Level's curve.
const PROFILE_LEVEL_THRESHOLDS = [0, 50, 120, 220, 350, 520, 750, 1050, 1450, 2000, 2700];

export function computeProfileLevel(xp) {
  let level = 1;
  for (let i = 0; i < PROFILE_LEVEL_THRESHOLDS.length; i++) {
    if (xp >= PROFILE_LEVEL_THRESHOLDS[i]) level = i + 1;
  }
  const idx = level - 1;
  const current = PROFILE_LEVEL_THRESHOLDS[idx];
  const next = PROFILE_LEVEL_THRESHOLDS[idx + 1] ?? null;
  return { level, xp, xpIntoLevel: xp - current, xpForNextLevel: next != null ? next - current : null };
}

/* ---------------- Achievements: unlocked by real accumulated stats ---------------- */
export const ACHIEVEMENTS = [
  { id: "first_checkin", name: "First Steps", description: "Checked in somewhere for the first time.", check: s => s.checkIns >= 1 },
  { id: "gallery_hopper", name: "Gallery Hopper", description: "Visited 10 galleries.", check: s => s.galleryVisits >= 10 },
  { id: "quest_master", name: "Quest Master", description: "Completed 10 quests.", check: s => s.questsCompleted >= 10 },
  { id: "public_art_scout", name: "Public Art Scout", description: "Discovered 5 pieces of public art.", check: s => s.publicArtDiscovered >= 5 },
  { id: "exhibitor", name: "Exhibitor", description: "Exhibited your own work for the first time.", check: s => s.worksExhibited >= 1 },
  { id: "event_host", name: "Community Builder", description: "Hosted your first event.", check: s => s.eventsHosted >= 1 },
  { id: "regular", name: "Regular", description: "Attended 20 real events.", check: s => s.eventsAttended >= 20 },
];

/** Returns achievements newly unlocked given current stats vs. already-unlocked ids.
 *  Pure: same stats + same already-unlocked set always returns the same new list. */
export function checkNewAchievements(stats, alreadyUnlockedIds = []) {
  return ACHIEVEMENTS.filter(a => !alreadyUnlockedIds.includes(a.id) && a.check(stats));
}

/* ---------------- Badges: simpler, cosmetic tier markers on top of XP level ---------------- */
export const BADGE_TIERS = [
  { minLevel: 1, name: "Newcomer", icon: "🌱" },
  { minLevel: 3, name: "Regular", icon: "🎨" },
  { minLevel: 6, name: "Fixture", icon: "⭐" },
  { minLevel: 9, name: "Scene Veteran", icon: "🏆" },
  { minLevel: 11, name: "Legend", icon: "👑" },
];
/* ---------------- Public vs. private profile — the enforced boundary ----------------
   Real people will eventually see each other's profiles (multi-user platform). This
   defines EXACTLY what's shareable, on purpose, before that viewing feature exists —
   not as a filter bolted onto raw data later, where something private could slip
   through by accident. Anything not explicitly listed here never leaves this function. */
export function buildPublicProfile({ profile, xp, unlockedAchievements, levels, archive } = {}) {
  const currentLevel = (levels || []).find(l => l.state === "current");
  const profileLevel = computeProfileLevel(xp || 0);
  return {
    name: profile?.name || "Artist",
    medium: profile?.medium || "",
    playerMode: profile?.playerMode || "explorer",
    participationLevel: profileLevel.level,
    badge: currentBadge(profileLevel.level),
    careerLevelTitle: currentLevel?.title || null, // the label only — never the raw
    // finishedWorks/soloShows/salesnumbers behind it; those stay private.
    achievements: (unlockedAchievements || []).map(id => ACHIEVEMENTS.find(a => a.id === id)).filter(Boolean)
      .map(a => ({ name: a.name, description: a.description })),
    portfolio: (archive || []).filter(e => e.verified && e.type === "exhibited_work").map(e => ({ title: e.title })),
    // Portfolio deliberately omits the archive entry's free-text `note` — someone
    // could type a real sale price or other private detail in there, and nothing
    // told them that field would ever be public. Title only, until a more deliberate
    // "add a public portfolio description" field exists as its own explicit thing.
    // Explicitly NEVER included, even by omission-prone refactor: goal ($ target/progress),
    // confidence meter, financeLog, inventory, quests, onboarding answers (day job,
    // weekly hours, mission text, timeline, target amount), real contacts. Those are
    // private by default unless a much more deliberate future feature explicitly
    // shares one, one at a time.
  };
}

export function currentBadge(level) {
  return [...BADGE_TIERS].reverse().find(b => level >= b.minLevel) || BADGE_TIERS[0];
}

/* ---------------- Check-ins: proximity-verified, not just self-reported ---------------- */
import { haversineDistanceKm } from "./geoEngine";

/**
 * A check-in only counts as REAL participation if you're actually near the place —
 * otherwise this is just a form field, not "you went there." Default tolerance is
 * generous (300m) to allow for GPS drift indoors/in dense areas.
 */
export function verifyCheckIn({ userLat, userLng, placeLat, placeLng, toleranceKm = 0.3 }) {
  if ([userLat, userLng, placeLat, placeLng].some(v => typeof v !== "number")) {
    return { verified: false, reason: "Missing location data" };
  }
  const distanceKm = haversineDistanceKm(userLat, userLng, placeLat, placeLng);
  return { verified: distanceKm <= toleranceKm, distanceKm, reason: distanceKm <= toleranceKm ? null : "Too far from the venue" };
}

/* ---------------- Creative Archive: a running record of real participation ---------------- */
/** Normalizes one archive entry — a gallery visited, a piece discovered, a work
 *  exhibited, whatever. Deliberately no id/date generation here (identity/timestamp
 *  are the caller's job, same boundary as every other engine here). */
export function buildArchiveEntry({ type, title, note = "", placeId = null, verified = false }) {
  return { type, title, note, placeId, verified };
}

/** Simple, honest counts from an archive + logged actions — the input to both
 *  achievements and any "your year in art" style summary. */
export function summarizeParticipation(archive = []) {
  const count = t => archive.filter(e => e.type === t).length;
  return {
    checkIns: archive.filter(e => e.verified).length,
    galleryVisits: count("gallery_visit"),
    publicArtDiscovered: count("public_art"),
    worksExhibited: count("exhibited_work"),
    eventsHosted: count("hosted_event"),
    eventsAttended: count("attended_event"),
  };
}
