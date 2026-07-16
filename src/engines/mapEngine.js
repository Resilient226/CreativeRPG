// THE MAP ENGINE — pure district/entity geo-placement and level-of-detail math.
// No React, no DOM, no MapLibre import — this only decides WHERE things sit in
// real-world coordinates and WHICH LOD tier a real zoom level implies. The World
// Engine component owns the actual MapLibre instance and camera.
//
// Rewritten for real-world placement (previously an invented pixel-space with no
// relation to any real place). Districts are no longer floating shapes at made-up
// coordinates — that doesn't mean anything on a real map. They're now what they
// always functionally were underneath: a category + a color, used for filtering
// and coloring real markers. Every entity resolves to an actual lat/lng.

import { KNOWN_LOCATIONS, jitterNearBase } from "./geoEngine";

/* ---------------- LOD thresholds, now real MapLibre zoom levels (roughly 0-22) ---------------- */
export const ZOOM_MIN = 3, ZOOM_MAX = 20;
export const LOD_DISTRICT = 12, LOD_INTERIOR = 17;

export function clampZoom(z) {
  if (!Number.isFinite(z)) return 12;
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/** Same shape as before: pure function of real zoom + whether an entity is entered. */
export function computeTier(zoom, interiorEntity) {
  if (interiorEntity) return "interior";
  return zoom < LOD_DISTRICT ? "district" : "building";
}

/* ---------------- Districts: category + color only, no fixed position anymore ---------------- */
export const DISTRICT_LAYOUT = [
  { key: "place", label: "Career", colorKey: "wood" },
  { key: "person", label: "People", colorKey: "blue" },
  { key: "opportunity", label: "Opportunities", colorKey: "gold" },
  { key: "milestone", label: "Events", colorKey: "purple" },
  { key: "idea", label: "Ideas", colorKey: "forestLight" },
];

/**
 * Resolves ONE entity's real coordinate, in priority order:
 *   1. An explicit lat/lng already on the entity (set by geocoding a real address).
 *   2. A knownLocationKey matching a sourced, verified real location.
 *   3. A deterministic jitter near the player's home base — never a random reshuffle,
 *      same entity always lands in the same spot until it gets a real address.
 * Pure: same entity + same homeBase always resolves to the same coordinate.
 */
export function resolveEntityLocation(entity, homeBase) {
  if (typeof entity.lat === "number" && typeof entity.lng === "number") return { lat: entity.lat, lng: entity.lng };
  if (entity.knownLocationKey && KNOWN_LOCATIONS[entity.knownLocationKey]) {
    const k = KNOWN_LOCATIONS[entity.knownLocationKey];
    return { lat: k.lat, lng: k.lng };
  }
  return jitterNearBase(homeBase.lat, homeBase.lng, entity.id, 4);
}

/**
 * Groups entities into their category districts and resolves every one to a real
 * coordinate. Pure: same nodes + homeBase in, same districts+coordinates out.
 */
export function buildDistricts(nodes, homeBase) {
  return DISTRICT_LAYOUT.map(d => {
    const entities = nodes.filter(n => n.kind === d.key).map(e => ({ ...e, ...resolveEntityLocation(e, homeBase) }));
    return { ...d, entities };
  });
}
