// THE CREATIVE DROPS ENGINE — the game's own vocabulary of floating discoverables,
// deliberately not generic treasure chests. Pure data + pure proximity math; the
// actual floating/rotating/glowing animation lives in App.jsx as CSS, same
// separation as every other engine here (this decides WHAT and WHEN, not HOW it's drawn).

import { haversineDistanceKm } from "./geoEngine";

export const CREATIVE_DROP_TYPES = {
  PALETTE: { key: "palette", label: "Paint Palette", emoji: "🎨" },
  PAINTBRUSH: { key: "paintbrush", label: "Floating Paintbrush", emoji: "🖌️" },
  SKETCHBOOK: { key: "sketchbook", label: "Sketchbook", emoji: "📖" },
  FRAMED_ART: { key: "framed_art", label: "Framed Artwork", emoji: "🖼️" },
  VINYL: { key: "vinyl", label: "Vinyl Record", emoji: "🎵" },
  FILM_REEL: { key: "film_reel", label: "Film Reel", emoji: "🎬" },
  CAMERA: { key: "camera", label: "Camera", emoji: "📷" },
  MASK: { key: "mask", label: "Theater Mask", emoji: "🎭" },
  TICKET: { key: "ticket", label: "Event Ticket", emoji: "🎟️" },
  KEY: { key: "key", label: "Gallery Key", emoji: "🔑" },
  IDEA: { key: "idea_bulb", label: "Idea", emoji: "💡" },
  INSPIRATION: { key: "inspiration", label: "Inspiration Orb", emoji: "✨" },
};

// Real-world proximity, not screen distance — "within 15–20 feet" is a physical
// radius around the player's actual GPS position, checked against real coordinates.
const PROXIMITY_REVEAL_METERS = 6; // ~18-20 feet

/** Normalizes a drop — deliberately no id/spawn-time here, same identity boundary
 *  as every other engine (the caller owns creation, this only computes behavior). */
export function buildCreativeDrop({ type, lat, lng, xpReward = 15 }) {
  const def = Object.values(CREATIVE_DROP_TYPES).find(t => t.key === type) || CREATIVE_DROP_TYPES.INSPIRATION;
  return { type: def.key, label: def.label, emoji: def.emoji, lat, lng, xpReward, collected: false };
}

/**
 * Real proximity check — is the player currently within reveal range of a drop?
 * Pure: same two coordinates always produce the same answer.
 */
export function isPlayerNearDrop(playerLat, playerLng, drop) {
  if (drop.collected) return false;
  const distanceMeters = haversineDistanceKm(playerLat, playerLng, drop.lat, drop.lng) * 1000;
  return distanceMeters <= PROXIMITY_REVEAL_METERS;
}

/** Returns every drop currently within reveal range — what the renderer should
 *  actually show as floating/glowing right now, vs. dormant/invisible. */
export function getRevealedDrops(drops, playerLat, playerLng) {
  if (playerLat == null || playerLng == null) return [];
  return drops.filter(d => isPlayerNearDrop(playerLat, playerLng, d));
}
