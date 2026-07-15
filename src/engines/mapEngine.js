// THE MAP ENGINE — pure district/entity layout and level-of-detail math.
// No React, no DOM, no pointer events, no camera useState — those are legitimately
// the World Engine component's job (per THE_CREATIVE_ARCHITECTURE_SPEC.md: "camera
// state stays in the component"). This module only answers: given the game's actual
// entities, where does everything sit in world-space, and given a zoom level, which
// LOD tier are we looking at? Same input, same output, every time.

/* ---------------- zoom bounds + LOD thresholds ---------------- */
export const ZOOM_MIN = 0.35, ZOOM_MAX = 3.2;
export const LOD_DISTRICT = 0.7, LOD_INTERIOR = 1.9;

export function clampZoom(z) {
  if (!Number.isFinite(z)) return 1; // guards against NaN/Infinity (e.g. a zero-distance pinch start)
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

/**
 * Which LOD tier is currently active. Pure function of zoom + whether an entity is
 * "entered" — the World Engine component just renders whatever this says, it never
 * decides the boundary itself.
 */
export function computeTier(zoom, interiorEntity) {
  if (interiorEntity) return "interior";
  return zoom < LOD_DISTRICT ? "district" : "building";
}

/* ---------------- Districts: the universal layout ----------------
   Only 5 districts, fixed world-space centers — same idea as the Level ladder:
   the LAYOUT never changes per player, only which entities land in each one does.
   World coordinates are offset by WORLD_ORIGIN so every center is a positive number —
   this is what let the world container declare an honest bounding box that actually
   contains its content (the fix for the black-screen-on-zoom bug). */
export const WORLD_ORIGIN = 400;
export const DISTRICT_LAYOUT = [
  { key: "place", label: "Career", colorKey: "wood", cx: WORLD_ORIGIN - 260, cy: WORLD_ORIGIN - 200 },
  { key: "person", label: "People", colorKey: "blue", cx: WORLD_ORIGIN + 260, cy: WORLD_ORIGIN - 200 },
  { key: "opportunity", label: "Opportunities", colorKey: "gold", cx: WORLD_ORIGIN - 260, cy: WORLD_ORIGIN + 220 },
  { key: "milestone", label: "Events", colorKey: "purple", cx: WORLD_ORIGIN + 260, cy: WORLD_ORIGIN + 220 },
  { key: "idea", label: "Ideas", colorKey: "forestLight", cx: WORLD_ORIGIN, cy: WORLD_ORIGIN },
];

/**
 * Groups the game's actual entities into their districts and computes each one's
 * world-space position — a ring around its district's center, evenly spaced.
 * Pure: same nodes array in, same districts+positions out, every time.
 */
export function buildDistricts(nodes) {
  return DISTRICT_LAYOUT.map(d => {
    const entities = nodes.filter(n => n.kind === d.key);
    const n = Math.max(entities.length, 1);
    const withPos = entities.map((e, i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      const radius = entities.length <= 1 ? 0 : 70;
      return { ...e, worldX: d.cx + Math.cos(angle) * radius, worldY: d.cy + Math.sin(angle) * radius };
    });
    return { ...d, entities: withPos };
  });
}

/**
 * The CSS transform string for the world container, given the camera and viewport
 * size. District tier ALWAYS centers on WORLD_ORIGIN regardless of camera.x/y (the
 * fix for "zooming out showed only 2 of 5 districts" — District View is meant to be
 * the fixed overview, not a crop of wherever you'd last panned to).
 */
export function computeWorldTransform({ camera, vw, vh, tier }) {
  const effX = tier === "district" ? WORLD_ORIGIN : camera.x;
  const effY = tier === "district" ? WORLD_ORIGIN : camera.y;
  return `translate(${vw / 2 - effX * camera.zoom}px, ${vh / 2 - effY * camera.zoom}px) scale(${camera.zoom})`;
}
