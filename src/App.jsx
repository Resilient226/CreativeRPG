import { useState, useEffect, useRef, useMemo } from "react";
import ReactDOM from "react-dom/client";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { storageGet, storageSet } from "./lib/storage";
import { onAuthChange, signUpEmail, signInEmail, signInGoogle, signOutUser, authErrorMessage } from "./lib/firebase";
import { callModel, allText, extractJson } from "./lib/model";
import TrainingGrounds from "./training/TrainingGrounds";
import { LEVEL_TEMPLATE, computeLevels, computeReadiness, isAtRisk, computeCategoryProgress } from "./engines/blueprintEngine";
import { applyInteraction, groupPeopleBy, clampStat, normalizeTrainingNpc } from "./engines/relationshipEngine";
import { loadNpc } from "./training/data";
import { ZOOM_MIN, ZOOM_MAX, LOD_DISTRICT, LOD_INTERIOR, DEFAULT_ZOOM, clampZoom, computeTier, buildDistricts, DISTRICT_LAYOUT } from "./engines/mapEngine";
import { DEFAULT_HOME_BASE, geocodeAddress, computeHeadingFromPositions, jitterNearBase, haversineDistanceKm } from "./engines/geoEngine";
import { buildUpcomingDeadlines, isUrgentDeadline, consolidateByTitle, filterDeadlines } from "./engines/calendarEngine";
import { computeFinanceTotals, buildFinanceEntry, applyIncomeToGoal, removeIncomeFromGoal } from "./engines/economyEngine";
import { runCareerDirector } from "./engines/careerDirector";
import { driftNpcOverTime, generatePublicProfile } from "./engines/npcEngine";
import { awardXp, computeProfileLevel, checkNewAchievements, currentBadge, summarizeParticipation, ACHIEVEMENTS } from "./engines/artistProfileEngine";
import { buildCreativeDrop, getRevealedDrops } from "./engines/collectiblesEngine";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  Home as HomeIcon, Swords, Plus, Globe, User, Bell, Briefcase, Image as ImageIcon,
  DollarSign, Users, Heart, Clock, ChevronRight, ChevronLeft, ChevronDown, Check, X, Star, Lock,
  CheckCircle2, Dumbbell, Calendar, ArrowUp, Building2, Coffee, ShoppingBag, Landmark,
  Zap, Lightbulb, Sparkles, Trophy, PiggyBank, Palette, BookOpen, AlertTriangle, MapPin as PinIcon, Trash2, Edit3, Activity
} from "lucide-react";

/* ---------------- storybook design tokens ---------------- */
const T = {
  ink: "#1B140D", panel: "#241A10", wood: "#6B4A2B", woodLight: "#8A6238",
  parchment: "#EDDBB0", parchmentDark: "#E2C98C", cream: "#F6ECD2",
  gold: "#D9A441", goldBright: "#F0C25E",
  textDark: "#3B2A18", textCream: "#F3E7C9", textMuted: "#B79A6E",
  green: "#5BA85A", blue: "#3B6EA5", purple: "#6A4C93", rose: "#C0392B",
  sky: "#8FCBEA", river: "#4FA3D1", forest: "#3F6B3A", forestLight: "#4F7F49",
};
const head = "'Baloo 2', system-ui, sans-serif";
const body = "'Nunito', system-ui, sans-serif";

/* ---------------- seed data ---------------- */
const initialContacts = [
  { id: "c1", kind: "person", name: "Marcus Coleman", type: "Professional", icon: User, color: T.blue,
    trust: 82, interest: 70, momentum: "rising", lastInteraction: "2 days ago",
    needs: "Wants images for the October show.", pos: { x: 30, y: 60 } },
  { id: "c2", kind: "person", name: "Gallery Aurora", type: "Gatekeeper", icon: Landmark, color: T.purple,
    trust: 55, interest: 40, momentum: "steady", lastInteraction: "18 days ago",
    needs: "Curating a new exhibition — competitive right now.", pos: { x: 58, y: 18 } },
  { id: "c3", kind: "person", name: "Hotel Luma", type: "Commission client", icon: Building2, color: T.blue,
    trust: 60, interest: 75, momentum: "rising", lastInteraction: "6 days ago",
    needs: "Planning their grand opening — open to a lobby mural.", pos: { x: 84, y: 26 } },
  { id: "c4", kind: "person", name: "Café Indigo", type: "Local venue", icon: Coffee, color: T.forestLight,
    trust: 70, interest: 50, momentum: "steady", lastInteraction: "10 days ago",
    needs: "Slow morning traffic — open to a feature wall.", pos: { x: 12, y: 28 } },
  { id: "c5", kind: "person", name: "Boutique Rose", type: "Retail contact", icon: ShoppingBag, color: T.gold,
    trust: 45, interest: 65, momentum: "rising", lastInteraction: "4 days ago",
    needs: "Looking for new artists to feature in-store.", pos: { x: 72, y: 70 } },
];
const initialPlaces = [
  { id: "p1", kind: "place", name: "Studio", icon: Palette, color: T.wood, pos: { x: 16, y: 78 },
    note: "Painting #18 is 82% complete — final glazing stage. About 4 hours of work remain." },
  { id: "p2", kind: "place", name: "Portfolio", icon: BookOpen, color: T.blue, pos: { x: 42, y: 14 },
    note: "14 of 25 target pieces curated for a complete, gallery-ready site. Add 11 more cohesive works." },
  { id: "p3", kind: "place", name: "Market", icon: DollarSign, color: T.forestLight, pos: { x: 88, y: 82 },
    note: "Where finished work turns into sales. Nothing listed for direct sale yet this week." },
  { id: "p4", kind: "place", name: "Inventory", icon: PiggyBank, color: T.wood, pos: { x: 8, y: 50 },
    note: "14 finished works, 8 in progress. Regional festivals typically expect 20 finished." },
];
const initialEvents = [
  { id: "e1", kind: "milestone", name: "Atlanta Arts Festival", icon: Trophy, color: T.purple, pos: { x: 66, y: 52 },
    daysLeft: 8,
    requirements: [
      { label: "Website", met: true }, { label: "Artist Statement", met: true },
      { label: "Portfolio", met: true }, { label: "Booth Display", met: true },
      { label: "20 Finished Paintings", met: false, detail: "14 / 20" },
      { label: "Price List", met: false },
    ] },
];
const initialIdeas = [
  { id: "i1", text: "Rust textures mixed with bright gold — Beltline mural.", tags: ["rust", "industrial", "gold"], date: "6 days ago" },
  { id: "i2", text: "Curved architecture keeps showing up in my reference photos.", tags: ["architecture", "curves"], date: "3 weeks ago" },
];
const initialOpps = [
  { id: "o1", kind: "opportunity", name: "The Bakery Atlanta — Open Call", icon: Briefcase, color: T.gold, pos: { x: 24, y: 14 },
    budget: "$1,000 + gallery space", tag: "OPEN", source: "thebakeryatlanta.com",
    sourceUrl: "https://www.thebakeryatlanta.com/open-calls",
    note: "Pro bono gallery space, a $1,000 stipend, and marketing support for one emerging artist's solo show." },
  { id: "o2", kind: "opportunity", name: "Georgia Council for the Arts — Grants", icon: Briefcase, color: T.gold, pos: { x: 50, y: 84 },
    budget: "Varies", tag: "STATEWIDE", source: "gaarts.org", sourceUrl: "https://gaarts.org/grants/",
    note: "Georgia's state arts council runs several grant programs for practicing artists; cycles open annually." },
  { id: "o3", kind: "opportunity", name: "Atlanta Beltline — Call for Artists", icon: Briefcase, color: T.textMuted, pos: { x: 90, y: 56 },
    budget: "Varies by call", tag: "WATCH", source: "beltline.org", sourceUrl: "https://beltline.org/art/call-for-artists/",
    note: "Public art acquisitions, murals, and installations along the Beltline corridor. This round is closed — the page reopens for new calls." },
];
const OPPORTUNITY_FEEDS = [
  { label: "The Bakery Atlanta — full opportunity list", url: "https://www.thebakeryatlanta.com/artist-opportunities" },
  { label: "Burnaway — monthly Call for Artists roundup", url: "https://burnaway.org/daily/call-for-artists/" },
];
const SKILL_TEMPLATE = [
  { k: "mastery", label: "Mastery", color: T.purple },
  { k: "negotiation", label: "Negotiation", color: T.gold },
  { k: "charisma", label: "Charisma", color: T.blue },
  { k: "business", label: "Business Acumen", color: T.green },
  { k: "resilience", label: "Resilience", color: T.rose },
  { k: "confidence", label: "Confidence", color: T.gold },
  { k: "prestige", label: "Prestige", color: T.purple },
];
// Starting skill levels from what you told onboarding: picked strengths start higher,
// picked weaknesses start lower, everything else starts at a neutral baseline.
function computeSkills({ strengths = [], weaknesses = [] }) {
  return SKILL_TEMPLATE.map(s => {
    const need = 80 + 40 * (strengths.includes(s.k) ? 3 : weaknesses.includes(s.k) ? 1 : 2);
    const level = strengths.includes(s.k) ? 3 : weaknesses.includes(s.k) ? 1 : 2;
    return { ...s, level, xp: 0, need };
  });
}
/* Universal Levels — a career rank everyone climbs the same way, earned by evidence not app-usage.
   Level = permanent, never regresses. XP = progress within the current level toward the next.
   Requirements are category-based (Mastery/Business/Networking/Professionalism) so different
   disciplines (mural artist, gallery painter, illustrator) can all reach the same level differently. */
// Universal Levels — the ladder is the same for everyone; only where YOU are on it differs.
// LEVEL_TEMPLATE, computeLevels, computeReadiness, isAtRisk, and computeCategoryProgress
// now live in ./engines/blueprintEngine.js — the first engine extracted per
// THE_CREATIVE_ARCHITECTURE_SPEC.md §3. This file only renders what that module computes.
// Maps a generated quest's tag to real display fields — the engine only knows tags
// (plain strings), never icon components or T's colors, same dependency boundary
// as every other engine here.
const QUEST_TAG_META = {
  CAREER: { icon: Palette, color: T.purple },
  RELATIONSHIPS: { icon: Users, color: T.blue },
  FINANCES: { icon: DollarSign, color: T.green },
  TIME: { icon: Clock, color: T.gold },
};
const initialConfidence = { Career: 82, Inventory: 78, Finances: 51, Relationships: 74, Health: 61, Time: 71 };
const initialQuests = [
  { id: "q1", tier: "primary", title: "Finish Painting #18 (48\" x 60\")",
    why: "Completes your series and creates a cohesive body of work for gallery outreach.",
    ev: "+$2,400", effort: "2 hrs", unlock: "Atlanta Arts Festival", tag: "CAREER", color: T.purple,
    icon: Palette, due: "8 days", done: false, completion: 82 },
  { id: "q2", tier: "secondary", title: "Follow Up With Marcus",
    why: "He viewed your last series. Keep the conversation warm.",
    ev: "Pipeline", effort: "25 min", unlock: "Relationship +8", tag: "RELATIONSHIPS", color: T.blue,
    icon: Users, due: "3 days", done: false },
  { id: "q3", tier: "secondary", title: "Apply: Georgia Council for the Arts Grant",
    why: "A real, ongoing state grant program for practicing artists. Check the source for the current cycle.",
    ev: "Varies by cycle", effort: "40 min", unlock: "Runway", tag: "FINANCES", color: T.green,
    icon: DollarSign, due: "Check site", done: false,
    sourceUrl: "https://gaarts.org/grants/", source: "gaarts.org" },
  { id: "q4", tier: "optional", title: "Attend Beltline Mixer",
    why: "Decent networking density, low cost, nothing urgent pulling you there this week.",
    ev: "Moderate", effort: "2.5 hrs", unlock: "—", tag: "TIME", color: T.gold,
    icon: Clock, due: "5 days", done: false },
  { id: "q5", tier: "ignore", title: "Coffee Networking Event",
    why: "Low ROI relative to your current pipeline and Painting #18's deadline.",
    ev: "Low", effort: "1 hr", unlock: "—", tag: "TIME", color: T.textMuted,
    icon: Clock, due: "4 days", done: false },
];
const FILTERS = [
  { key: "all", label: "All", color: T.textCream },
  { key: "person", label: "People", color: T.blue },
  { key: "place", label: "Places", color: T.forestLight },
  { key: "milestone", label: "Events", color: T.purple },
  { key: "idea", label: "Ideas", color: T.gold },
];
const SPARE_SPOTS = [{ x: 20, y: 20 }, { x: 78, y: 40 }, { x: 40, y: 74 }, { x: 60, y: 62 }, { x: 30, y: 34 }, { x: 70, y: 16 }];
let spotCursor = 0;
function nextSpot() { const s = SPARE_SPOTS[spotCursor % SPARE_SPOTS.length]; spotCursor++; return s; }

// applyInteraction and groupPeopleBy live in ./engines/relationshipEngine.js.
// V1 removes simulated NPC generation entirely (buildPersonProfile, roleFlavor,
// temperamentFlavor, and npcEngine's generateNpcPersonality still exist in their
// engine files but are no longer called from anywhere) — the world is populated
// by real people only. Career Director still reads real contacts' trust/interest,
// unchanged.

/* Categories for places and events — drive icon/color and give the map real visual variety. */
// Real 3D avatar models — Kenney's "Mini Characters" pack (CC0, public domain),
// served from public/avatars/. GLB format, ~250KB each, renders via <model-viewer>
// (loaded in index.html) — no hand-written Three.js scene setup needed.
const AVATAR_OPTIONS = [
  { key: "character-female-a", label: "Female A" }, { key: "character-female-b", label: "Female B" },
  { key: "character-female-c", label: "Female C" }, { key: "character-female-d", label: "Female D" },
  { key: "character-female-e", label: "Female E" }, { key: "character-female-f", label: "Female F" },
  { key: "character-male-a", label: "Male A" }, { key: "character-male-b", label: "Male B" },
  { key: "character-male-c", label: "Male C" }, { key: "character-male-d", label: "Male D" },
  { key: "character-male-e", label: "Male E" }, { key: "character-male-f", label: "Male F" },
];

const PLACE_CATEGORIES = [
  { key: "studio", label: "Studio", icon: Palette, color: T.wood },
  { key: "gallery", label: "Gallery", icon: Landmark, color: T.purple },
  { key: "venue", label: "Venue", icon: Coffee, color: T.forestLight },
  { key: "market", label: "Market", icon: DollarSign, color: T.gold },
  { key: "other", label: "Other", icon: PinIcon, color: T.blue },
];
const EVENT_CATEGORIES = [
  { key: "festival", label: "Festival", icon: Trophy, color: T.purple },
  { key: "deadline", label: "Deadline", icon: AlertTriangle, color: T.rose },
  { key: "exhibition", label: "Exhibition", icon: ImageIcon, color: T.blue },
  { key: "meeting", label: "Meeting", icon: Users, color: T.forestLight },
  { key: "other", label: "Other", icon: PinIcon, color: T.gold },
];

/* ---------------- persistence (real Firestore now — via ./lib/storage, same one Training Grounds uses) ----------------
   Icons are React components, which JSON can't store; storageSet's JSON.stringify silently drops them on save.
   On load we re-attach the right icon by kind + category/role, same logic used when each thing was created. */
const SAVE_KEY = "game-save-v1";
function reattachIcon(obj) {
  if (!obj) return obj;
  if (obj.kind === "person") return { ...obj, icon: User };
  if (obj.kind === "place") {
    const cat = PLACE_CATEGORIES.find(c => c.label === obj.category);
    return { ...obj, icon: cat ? cat.icon : PinIcon };
  }
  if (obj.kind === "milestone") {
    const cat = EVENT_CATEGORIES.find(c => c.label === obj.category);
    return { ...obj, icon: cat ? cat.icon : Trophy };
  }
  if (obj.kind === "opportunity") return { ...obj, icon: Briefcase };
  return obj;
}
async function loadSave() {
  try {
    const data = await storageGet(SAVE_KEY);
    if (!data) return null;
    return {
      ...data,
      contacts: (data.contacts || []).map(reattachIcon),
      places: (data.places || []).map(reattachIcon),
      events: (data.events || []).map(reattachIcon),
      opps: (data.opps || []).map(reattachIcon),
      quests: (data.quests || []).map(q => ({ ...q, icon:
        { CAREER: Palette, RELATIONSHIPS: Users, FINANCES: DollarSign, TIME: Clock }[q.tag] || Palette })),
    };
  } catch { return null; }
}

/* ---------------- small helpers ---------------- */
function Bar({ pct, color, h = 8, track }) {
  return (
    <div style={{ height: h, background: track || "#00000030", borderRadius: h, overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: color, borderRadius: h, transition: "width .5s ease" }} />
    </div>
  );
}
function Toast({ text }) {
  if (!text) return null;
  return (
    <div style={{ position: "fixed", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 100,
      background: T.panel, border: `2px solid ${T.gold}`, borderRadius: 14, padding: "10px 18px",
      fontFamily: body, fontWeight: 700, fontSize: 13, color: T.textCream, boxShadow: "0 8px 24px #000a",
      maxWidth: 320, textAlign: "center" }}>{text}</div>
  );
}
function WoodPanel({ children, style }) {
  return <div style={{ background: `linear-gradient(180deg, ${T.panel}, #150f09)`, border: `2px solid ${T.gold}`,
    borderRadius: 16, boxShadow: "inset 0 0 0 1px #00000055", ...style }}>{children}</div>;
}
function Scroll({ children, style }) {
  return <div style={{ background: `linear-gradient(180deg, ${T.cream}, ${T.parchmentDark})`, border: `3px solid ${T.wood}`,
    borderRadius: 14, boxShadow: "0 4px 14px #00000044", color: T.textDark, ...style }}>{children}</div>;
}
function StatRow({ label, value, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: body, fontSize: 11, fontWeight: 700, marginBottom: 3 }}>
        <span>{label}</span><span>{value}/100</span>
      </div>
      <Bar pct={value} color={color} track="#00000022" />
    </div>
  );
}
function timeAgo(ts) {
  if (!ts) return "";
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}
/* A running, timestamped log of details — each entry appended, never overwritten,
   newest first, so you never lose history by editing. */
function DetailsLog({ log, onAdd }) {
  const [draft, setDraft] = useState("");
  const entries = (log || []).slice().sort((a, b) => b.date - a.date);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontFamily: head, fontSize: 9, fontWeight: 700, color: T.wood, letterSpacing: 0.5, marginBottom: 6 }}>
        DETAILS LOG {entries.length > 0 && `· ${entries.length}`}
      </div>
      {entries.length === 0 && (
        <div style={{ fontFamily: body, fontSize: 11.5, color: "#8a7350", fontStyle: "italic", marginBottom: 8 }}>Nothing logged yet.</div>
      )}
      {entries.map(e => (
        <div key={e.id} style={{ padding: "8px 10px", borderRadius: 9, background: "#00000010", marginBottom: 6 }}>
          <div style={{ fontFamily: body, fontSize: 13, lineHeight: 1.4 }}>{e.text}</div>
          <div style={{ fontFamily: head, fontSize: 9, color: "#8a7350", marginTop: 4 }}>{timeAgo(e.date)}</div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
        <input value={draft} onChange={ev => setDraft(ev.target.value)} placeholder="Add a timestamped note…"
          style={{ flex: 1, background: "#fffaf0", border: `2px solid ${T.wood}`, borderRadius: 9, padding: "8px 10px",
            color: T.textDark, fontSize: 12.5, outline: "none" }} />
        <button onClick={() => { if (draft.trim()) { onAdd(draft.trim()); setDraft(""); } }}
          style={{ padding: "0 14px", borderRadius: 9, border: "none", background: T.gold, color: T.ink, fontFamily: head, fontWeight: 700, fontSize: 12 }}>
          Add
        </button>
      </div>
    </div>
  );
}

/* ================= MAIN APP ================= */
export default function CreativeEmpireOS() {
  const [tab, setTab] = useState("map");
  const [quests, setQuests] = useState(initialQuests);
  const [confidence, setConfidence] = useState(initialConfidence);
  const [goal, setGoal] = useState({ current: 28450, target: 100000 });
  const [toast, setToast] = useState("");
  const [contacts, setContacts] = useState(initialContacts);
  const [places, setPlaces] = useState(initialPlaces);
  const [events, setEvents] = useState(initialEvents);
  const [ideas, setIdeas] = useState(initialIdeas);
  const [opps, setOpps] = useState(initialOpps);
  const [energy, setEnergy] = useState(10);
  const [inventory, setInventory] = useState([]);
  const [financeLog, setFinanceLog] = useState([]);
  const [trainingNpc, setTrainingNpc] = useState(null);
  const [lastOpportunityFetch, setLastOpportunityFetch] = useState(0);
  const [xp, setXp] = useState(0);
  const [unlockedAchievements, setUnlockedAchievements] = useState([]);
  const [archive, setArchive] = useState([]);
  const [discoveredLocations, setDiscoveredLocations] = useState([]);
  const [drops, setDrops] = useState([]);
  const [lastLocationFetch, setLastLocationFetch] = useState(0);
  const [aiNpcMode, setAiNpcMode] = useState(false);
  // AI NPC Mode acts like a genuinely separate world: generated people/businesses are
  // never deleted when the mode is off (toggling back on restores them exactly as
  // they were, since the underlying contacts/places state is untouched), but nothing
  // in the app sees or reacts to them while it's off — the Map won't show them,
  // Career Director won't generate quests about them, nothing treats them as real
  // until the mode is on again.
  const visibleContacts = aiNpcMode ? contacts : contacts.filter(c => !c.generatedByAiMode);
  const visiblePlaces = aiNpcMode ? places : places.filter(p => !p.generatedByAiMode);
  const [homeBase, setHomeBase] = useState(DEFAULT_HOME_BASE);
  const [playerPosition, setPlayerPosition] = useState(null); // { lat, lng, heading } — updates continuously
  const [simulatedPosition, setSimulatedPosition] = useState(null); // World Builder's "jump to address" override
  const [jumpTrigger, setJumpTrigger] = useState(0); // increments on each deliberate jump — distinguishes it from routine GPS updates
  const [selectedNode, setSelectedNode] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showIdeas, setShowIdeas] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState("choose");
  const [addForm, setAddForm] = useState({});
  const [debriefText, setDebriefText] = useState("");
  const [loaded, setLoaded] = useState(false);

  // onboarded: null = still checking, false = show the onboarding flow, true = show the app.
  const [onboarded, setOnboarded] = useState(null);
  const [profile, setProfile] = useState(null);
  // Defaults to "creator" — anyone who onboarded before Explorer/Creator existed
  // never answered this question, and creator is the fuller, backward-compatible
  // experience they already had.
  const playerMode = profile?.playerMode || "creator";
  const [skills, setSkills] = useState(() => computeSkills({}));
  const [levels, setLevels] = useState(() => computeLevels({}));
  const [authUser, setAuthUser] = useState(undefined); // undefined = still checking, null = signed out, object = signed in
  // World Builder admin check — a real whitelist against the authenticated email,
  // not a client-side flag someone could fake by editing local state. EMPTY until
  // you give me the real sign-in email to add here.
  const ADMIN_EMAILS = ["zakthecreativ@gmail.com"];
  const isAdmin = !!authUser?.email && ADMIN_EMAILS.includes(authUser.email.toLowerCase());
  const [worldBuilderActive, setWorldBuilderActive] = useState(false);
  // Real GPS keeps updating in the background regardless, but while World Builder
  // is active and a simulated position is set, that's what the avatar/camera
  // actually use — turning World Builder off always reverts to your real position.
  const effectivePlayerPosition = (worldBuilderActive && simulatedPosition) ? simulatedPosition : playerPosition;

  // Subscribe to real auth state — fires on sign-in, sign-out, and switching accounts.
  useEffect(() => {
    const unsub = onAuthChange((user) => setAuthUser(user || null));
    return unsub;
  }, []);

  // Whenever the signed-in user actually changes (fresh sign-in, or a different account
  // after a sign-out), reset local state and re-check profile/save for THAT account —
  // so one browser can't leak a previous person's world into a new sign-in.
  useEffect(() => {
    if (!authUser) return;
    setOnboarded(null);
    setLoaded(false);
    (async () => {
      const savedProfile = await storageGet("profile-v1");
      if (!savedProfile) { setOnboarded(false); setLoaded(true); return; }
      setProfile(savedProfile);
      const save = await loadSave();
      if (save) {
        // One-time cleanup: earlier versions could generate a broken "Apply: undefined"
        // quest when tracking a real opportunity (a missing title→name alias). This
        // removes any already-created instance rather than leaving it stuck forever.
        if (save.quests) setQuests(save.quests.filter(q => q.title !== "Apply: undefined"));
        if (save.confidence) setConfidence(save.confidence);
        if (save.goal) setGoal(save.goal);
        if (save.places) setPlaces(save.places);
        if (save.events) setEvents(save.events);
        if (save.ideas) setIdeas(save.ideas);
        if (save.opps) setOpps(save.opps);
        if (typeof save.energy === "number") setEnergy(save.energy);
        if (save.skills) setSkills(save.skills);
        if (save.levels) setLevels(save.levels);
        if (save.inventory) setInventory(save.inventory);
        if (save.financeLog) setFinanceLog(save.financeLog);
        if (typeof save.aiNpcMode === "boolean") setAiNpcMode(save.aiNpcMode);
        if (typeof save.lastOpportunityFetch === "number") setLastOpportunityFetch(save.lastOpportunityFetch);
        if (typeof save.xp === "number") setXp(save.xp);
        if (save.unlockedAchievements) setUnlockedAchievements(save.unlockedAchievements);
        if (save.archive) setArchive(save.archive);
        if (save.discoveredLocations) setDiscoveredLocations(save.discoveredLocations);
        if (save.drops) setDrops(save.drops);
        if (typeof save.lastLocationFetch === "number") setLastLocationFetch(save.lastLocationFetch);
        // Lazy catch-up for practice partners: drift their career state by however
        // much real time passed since last visit — deterministic, so this never
        // reshuffles a personality, only advances it. Real contacts are untouched;
        // this only ever applies to SIM characters with a generated personality.
        if (save.contacts) {
          const daysElapsed = save.lastSeen ? (Date.now() - save.lastSeen) / (1000 * 60 * 60 * 24) : 0;
          const drifted = save.contacts.map(c =>
            c.sim && c.personality
              ? { ...c, personality: { ...c.personality, careerState: driftNpcOverTime({ id: c.id, careerState: c.personality.careerState }, daysElapsed).careerState } }
              : c
          );
          setContacts(drifted);
        }
        flash("Welcome back.");
      }

      // Daily lazy catch-up for real opportunities — same pattern as everything
      // else here (Evelyn's drift, NPC career drift): checked once per app open,
      // not a continuously-running job. A server-side proxy is required because
      // RSS feeds generally don't send CORS headers a browser could fetch directly.
      const lastFetch = save?.lastOpportunityFetch || 0;
      if (Date.now() - lastFetch > 20 * 60 * 60 * 1000) {
        try {
          const res = await fetch("/api/fetch-opportunities");
          const data = await res.json();
          if (data?.opportunities?.length) {
            setOpps(prev => {
              const existingIds = new Set(prev.map(o => o.id));
              const fresh = data.opportunities.filter(o => !existingIds.has(o.id))
                .map(o => ({ ...o, name: o.title, tag: o.category, note: o.description, budget: o.cost, sourceUrl: "", source: "ArtsATL" }));
              if (fresh.length) flash(`${fresh.length} new real opportunit${fresh.length === 1 ? "y" : "ies"} found.`);
              return [...prev, ...fresh];
            });
          }
          setLastOpportunityFetch(Date.now());
        } catch { /* network hiccup — the game still works, just skips today's fetch */ }
      }

      // Same lazy daily catch-up for real locations (galleries/museums/public art)
      // via OpenStreetMap's Overpass API — genuinely automatic, not manual research.
      const lastLocFetch = save?.lastLocationFetch || 0;
      if (Date.now() - lastLocFetch > 20 * 60 * 60 * 1000) {
        try {
          const res = await fetch("/api/fetch-locations");
          const data = await res.json();
          if (data?.locations?.length) {
            setDiscoveredLocations(prev => {
              const existingIds = new Set(prev.map(l => l.id));
              const fresh = data.locations.filter(l => !existingIds.has(l.id));
              if (fresh.length) flash(`${fresh.length} new real location${fresh.length === 1 ? "" : "s"} discovered.`);
              return [...prev, ...fresh];
            });
          }
          setLastLocationFetch(Date.now());
        } catch { /* network hiccup — skips today's discovery, tries again next login */ }
      }

      setOnboarded(true);
      setLoaded(true);
    })();
  }, [authUser]);

  // Loads Evelyn's Training Grounds state so Career Director can finally see her too —
  // this is the actual reconciliation: her data stays where it lives, we just also
  // read it here, normalized into the shape the rest of the app understands.
  useEffect(() => {
    if (!authUser) return;
    loadNpc().then(npc => setTrainingNpc(normalizeTrainingNpc(npc))).catch(() => {});
  }, [authUser]);

  // Real device location for the map's home base and the live player avatar.
  // homeBase is set ONCE (first fix) — it anchors the map's bounds/starting center.
  // playerPosition updates CONTINUOUSLY via watchPosition — this is what actually
  // moves the avatar and drives collectible proximity checks, which a one-time
  // getCurrentPosition could never support.
  useEffect(() => {
    if (!authUser || !navigator.geolocation) return;
    let gotFirstFix = false;
    const watchId = navigator.geolocation.watchPosition(
      pos => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        if (!gotFirstFix) { setHomeBase({ ...p, label: "Your location" }); gotFirstFix = true; }
        setPlayerPosition(prev => {
          // Heading: derived from real consecutive fixes when the device doesn't
          // report one directly — never invented, just left as-is (last known
          // heading) if the player hasn't moved enough to compute a new one.
          const heading = pos.coords.heading != null && Number.isFinite(pos.coords.heading)
            ? pos.coords.heading
            : (prev ? computeHeadingFromPositions(prev, p) ?? prev.heading : null);
          // Real movement detection — not a true walk-cycle (the animated
          // character packs are FBX-only, no GLB, so a real skeletal walk
          // animation isn't achievable here), but genuine motion feedback: moved
          // more than ~2m since the last fix counts as "walking" for the avatar's
          // bob animation.
          const isMoving = prev ? haversineDistanceKm(prev.lat, prev.lng, p.lat, p.lng) * 1000 > 2 : false;
          return { ...p, heading, isMoving };
        });
      },
      () => { /* denied or unavailable — DEFAULT_HOME_BASE (Atlanta) already covers homeBase; avatar just won't show */ },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [authUser]);

  // Seeds a small set of real Creative Drops near the player's actual home base —
  // once, not re-seeded on every GPS tick. Deterministic jitter (same seed key,
  // same spot every time), not random reshuffling.
  useEffect(() => {
    if (!loaded) return; // never seed before the initial save-load has actually resolved
    if (drops.length > 0) return;
    if (homeBase.lat === DEFAULT_HOME_BASE.lat && homeBase.lng === DEFAULT_HOME_BASE.lng) return; // wait for a real fix
    const dropTypes = ["palette", "paintbrush", "sketchbook", "vinyl", "inspiration"];
    setDrops(dropTypes.map((type, i) => {
      const spot = jitterNearBase(homeBase.lat, homeBase.lng, `seed-drop-${i}`, 0.15); // small radius — genuinely nearby
      return buildCreativeDrop({ type, lat: spot.lat, lng: spot.lng });
    }));
  }, [homeBase, loaded]);

  // Save on every meaningful change. Skipped until onboarding + the initial load have
  // both resolved, so we never overwrite a real save with fresh defaults.
  useEffect(() => {
    if (!loaded || !onboarded) return;
    storageSet(SAVE_KEY, { quests, confidence, goal, contacts, places, events, ideas, opps, energy, skills, levels, inventory, financeLog, aiNpcMode, lastOpportunityFetch, xp, unlockedAchievements, archive, discoveredLocations, lastLocationFetch, drops, lastSeen: Date.now() })
      .catch(() => { /* network hiccup — game still works, just won't persist that change */ });
  }, [loaded, onboarded, quests, confidence, goal, contacts, places, events, ideas, opps, energy, skills, levels, inventory, financeLog, aiNpcMode, lastOpportunityFetch, xp, unlockedAchievements, archive, discoveredLocations, lastLocationFetch, drops]);

  // Career Director: reads across the other engines and decides what the Command
  // Board should show — re-scoring existing quests and proposing new ones from real
  // gaps (careerDirector.js). Deliberately does NOT depend on `quests` itself — it
  // reads the latest quests inside the merge, but shouldn't re-run just because a
  // quest was toggled done, only when the underlying situation actually changes.
  useEffect(() => {
    if (!loaded || !onboarded) return;
    const directed = runCareerDirector({ quests, levels, events, contacts: visibleContacts, confidence, trainingNpc, generateGaps: playerMode === "creator" });
    setQuests(prev => {
      const byId = new Map(prev.map(q => [q.id, q]));
      let changed = false;
      directed.forEach(dq => {
        const existing = byId.get(dq.id);
        if (existing) {
          if (existing.tier !== dq.tier || existing.reasoning !== dq.reasoning) {
            byId.set(dq.id, { ...existing, tier: dq.tier, reasoning: dq.reasoning });
            changed = true;
          }
        } else {
          const meta = QUEST_TAG_META[dq.tag] || QUEST_TAG_META.CAREER;
          byId.set(dq.id, { ...dq, done: false, icon: meta.icon, color: meta.color, ev: "Progress", unlock: "—" });
          changed = true;
        }
      });
      return changed ? Array.from(byId.values()) : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, onboarded, levels, events, contacts, confidence, trainingNpc, aiNpcMode, playerMode]);

  function flash(msg) { setToast(msg); setTimeout(() => setToast(""), 2600); }

  // Called once, at the end of onboarding. Replaces every piece of demo/seed data with
  // something derived from what the player actually told us about their real career.
  async function finishOnboarding(answers) {
    const newSkills = computeSkills(answers);
    const newLevels = computeLevels(answers);
    const newConfidence = {
      Career: answers.finishedWorks > 15 ? 70 : 50,
      Inventory: Math.min(90, 30 + (answers.finishedWorks || 0) * 3),
      Finances: answers.hasDayJob ? 60 : 40,
      Relationships: 35,
      Health: answers.weeklyHours > 25 ? 45 : 65,
      Time: answers.hasDayJob ? 40 : 70,
    };
    const newGoal = { current: 0, target: answers.targetAmount || 100000 };
    const newQuests = [];
    if ((answers.finishedWorks || 0) < 20) {
      newQuests.push({ id: "q-onb-1", tier: "primary", title: "Finish more work",
        why: `Regional festivals and juried shows typically expect 15–20 finished pieces. You reported ${answers.finishedWorks || 0}.`,
        ev: "Career progress", effort: "ongoing", unlock: "Festival eligibility", tag: "CAREER", color: T.purple,
        icon: Palette, due: "ongoing", done: false });
    }
    if (answers.weaknesses?.includes("confidence") || answers.weaknesses?.includes("negotiation")) {
      newQuests.push({ id: "q-onb-2", tier: "secondary", title: "Practice with Evelyn",
        why: `You flagged ${answers.weaknesses.includes("confidence") ? "confidence" : "negotiation"} as an area to work on — Training Grounds is built for exactly this.`,
        ev: "Skill XP", effort: "15 min", unlock: "—", tag: "TIME", color: T.blue,
        icon: Users, due: "ongoing", done: false });
    }
    newQuests.push({ id: "q-onb-3", tier: "secondary", title: `Toward: ${answers.missionText || "your goal"}`,
      why: `Your stated timeline was ${answers.timeline || "no fixed deadline"}. This is here as a standing reminder of why you're doing this.`,
      ev: "—", effort: "—", unlock: "—", tag: "CAREER", color: T.gold, icon: Sparkles, due: answers.timeline || "—", done: false });

    setProfile(answers);
    setSkills(newSkills);
    setLevels(newLevels);
    setConfidence(newConfidence);
    setGoal(newGoal);
    setQuests(newQuests);
    setContacts([]); // no fake demo contacts — real ones get added as you actually meet people
    const newPlaces = [
      { id: "p1", kind: "place", name: "Studio", icon: Palette, color: T.wood, pos: { x: 16, y: 78 },
        note: `Your practice space. You told onboarding you work on this ${answers.weeklyHours || 0} hrs/week.` },
      { id: "p2", kind: "place", name: "Inventory", icon: PiggyBank, color: T.wood, pos: { x: 8, y: 50 },
        note: `${answers.finishedWorks || 0} finished works reported at onboarding.` },
    ];
    setPlaces(newPlaces);
    setEvents([]);
    setIdeas([]);
    setEnergy(10);

    setInventory([]);
    setFinanceLog([]);
    await storageSet("profile-v1", answers);
    await storageSet(SAVE_KEY, {
      quests: newQuests, confidence: newConfidence, goal: newGoal, contacts: [],
      places: newPlaces, events: [], ideas: [], opps: initialOpps, energy: 10, skills: newSkills, levels: newLevels,
      inventory: [], financeLog: [],
    });
    setOnboarded(true);
    setLoaded(true);
    flash("Your world is ready.");
  }

  function toggleQuest(id) {
    setQuests(qs => qs.map(q => {
      if (q.id !== id) return q;
      const nowDone = !q.done;
      if (nowDone) {
        setGoal(g => ({ ...g, current: g.current + Math.round(200 + Math.random() * 400) }));
        setConfidence(c => ({ ...c, [capKey(q.tag)]: Math.min(99, (c[capKey(q.tag)] || 60) + 3) }));
        setEnergy(e => Math.max(0, e - 1));
        setXp(x => awardXp(x, "complete_quest"));
        flash(`✓ Logged: ${q.title} · +20 XP`);
      }
      return { ...q, done: nowDone };
    }));
  }
  // Runs after any XP-relevant change — checks real accumulated stats against the
  // achievement table and unlocks anything newly earned. Deterministic: same stats,
  // same already-unlocked set, same result every time.
  useEffect(() => {
    const stats = { ...summarizeParticipation(archive), questsCompleted: quests.filter(q => q.done).length };
    const fresh = checkNewAchievements(stats, unlockedAchievements);
    if (fresh.length) {
      setUnlockedAchievements(ids => [...ids, ...fresh.map(a => a.id)]);
      fresh.forEach(a => flash(`🏆 Achievement unlocked: ${a.name}`));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archive, quests]);
  function capKey(tag) { return { CAREER: "Career", RELATIONSHIPS: "Relationships", FINANCES: "Finances", TIME: "Time" }[tag] || "Career"; }

  function logInteraction(id) {
    setContacts(cs => cs.map(c => {
      if (c.id !== id) return c;
      const base = { ...c, ...applyInteraction(c) };
      if (!c.relationshipMetrics) return base;
      const rm = c.relationshipMetrics;
      return { ...base, relationshipMetrics: { ...rm,
        familiarity: Math.min(100, rm.familiarity + 6),
        trust: Math.min(100, rm.trust + 3),
        respect: Math.min(100, rm.respect + 2),
      } };
    }));
    flash("Logged the interaction — trust is climbing.");
    setSelectedNode(null);
  }
  // V1 removes simulated NPC generation entirely — this is a one-time cleanup for
  // anyone with leftover simulated content from before that decision, not an
  // ongoing feature. No way to turn generation back on exists anymore.
  function clearGeneratedContent() {
    const removedPeople = contacts.filter(c => c.sim || c.generatedByAiMode).length;
    const removedPlaces = places.filter(p => p.generatedByAiMode).length;
    setContacts(cs => cs.filter(c => !c.sim && !c.generatedByAiMode));
    setPlaces(ps => ps.filter(p => !p.generatedByAiMode));
    setAiNpcMode(false);
    flash(`Removed ${removedPeople} simulated people and ${removedPlaces} generated businesses.`);
  }
  // Marks a drop collected (it never re-reveals — same tested rule as
  // isPlayerNearDrop) and awards its real embedded XP reward, not a made-up amount.
  function collectDrop(drop) {
    setDrops(ds => ds.map(d => (d.type === drop.type && d.lat === drop.lat && d.lng === drop.lng) ? { ...d, collected: true } : d));
    setXp(x => x + (drop.xpReward || 15));
    flash(`✨ Collected: ${drop.label} · +${drop.xpReward || 15} XP`);
  }
  // World Builder's core workflow: name + real address in, geocoded coordinates
  // out — never a hand-placed pin. Marked adminPlaced so it's clearly an
  // intentionally important, curated location, not a jittered/auto-discovered one.
  function publishWorldBuilderLocation({ name, address, lat, lng }) {
    setPlaces(ps => [...ps, {
      id: "wb-" + Date.now(), kind: "place", name, lat, lng, address,
      icon: Palette, color: T.gold, category: "World Builder",
      note: `Published via World Builder — ${address}`,
      detailsLog: [], adminPlaced: true,
    }]);
  }
  function trackOpportunity(o) {
    setQuests(qs => [...qs, {
      id: "gen-" + o.id, tier: "secondary", title: `Apply: ${o.name}`,
      why: `Tracked from ${o.source}. ${o.note} You still need to apply directly via the source link.`,
      ev: o.budget, effort: "varies", unlock: "Pipeline entry", tag: "CAREER", color: T.purple,
      icon: Briefcase, due: "—", done: false, sourceUrl: o.sourceUrl, source: o.source,
    }]);
    flash(`Tracked — apply directly at ${o.source}`);
    setSelectedNode(null);
  }
  function dismissOpportunity(id) { setOpps(list => list.filter(x => x.id !== id)); setSelectedNode(null); flash("Passed."); }

  function requestDelete(node) { setConfirmDelete(node); }
  function cancelDelete() { setConfirmDelete(null); }
  function confirmDeleteNode() {
    const node = confirmDelete;
    if (!node) return;
    if (node.kind === "person") setContacts(cs => cs.filter(c => c.id !== node.id));
    else if (node.kind === "place") setPlaces(ps => ps.filter(p => p.id !== node.id));
    else if (node.kind === "milestone") setEvents(es => es.filter(e => e.id !== node.id));
    flash(`Removed ${node.name}.`);
    setConfirmDelete(null);
    setSelectedNode(null);
  }

  function openEdit(node) {
    if (node.kind === "person") {
      setEditForm({ name: node.name, role: node.type, trust: node.trust, interest: node.interest,
        temperament: node.temperament || "", met: node.metContext || "",
        connections: (node.connections || []).join(", "), note: node.needs, details: "" });
    } else if (node.kind === "place") {
      setEditForm({ name: node.name, category: node.category || "", note: node.note, details: "" });
    } else if (node.kind === "milestone") {
      setEditForm({ name: node.name, category: node.category || "", days: node.daysLeft ?? "",
        budget: node.budget || "", note: node.note || "", details: "" });
    }
    setEditingNode(node);
    setSelectedNode(null);
  }
  function closeEdit() { setEditingNode(null); setEditForm({}); }
  function saveEdit() {
    const node = editingNode;
    if (!node || !editForm.name) return;
    const newEntry = editForm.details && editForm.details.trim() ? { id: "d-" + Date.now(), text: editForm.details.trim(), date: Date.now() } : null;
    if (node.kind === "person") {
      setContacts(cs => cs.map(c => c.id !== node.id ? c : {
        ...c, name: editForm.name, type: editForm.role || c.type,
        trust: clampStat(Number(editForm.trust)), interest: clampStat(Number(editForm.interest)),
        metContext: editForm.met || "", connections: (editForm.connections || "").split(",").map(s => s.trim()).filter(Boolean),
        needs: editForm.note || c.needs, detailsLog: newEntry ? [...(c.detailsLog || []), newEntry] : (c.detailsLog || []),
      }));
    } else if (node.kind === "place") {
      const cat = PLACE_CATEGORIES.find(c => c.label === editForm.category || c.key === editForm.category);
      setPlaces(ps => ps.map(p => p.id !== node.id ? p : {
        ...p, name: editForm.name, category: cat ? cat.label : p.category,
        icon: cat ? cat.icon : p.icon, color: cat ? cat.color : p.color,
        note: editForm.note || p.note, detailsLog: newEntry ? [...(p.detailsLog || []), newEntry] : (p.detailsLog || []),
      }));
    } else if (node.kind === "milestone") {
      const cat = EVENT_CATEGORIES.find(c => c.label === editForm.category || c.key === editForm.category);
      setEvents(es => es.map(e => e.id !== node.id ? e : {
        ...e, name: editForm.name, category: cat ? cat.label : e.category,
        icon: cat ? cat.icon : e.icon, color: cat ? cat.color : e.color,
        daysLeft: editForm.days === "" ? null : Number(editForm.days),
        budget: editForm.budget || "", note: editForm.note || e.note,
        detailsLog: newEntry ? [...(e.detailsLog || []), newEntry] : (e.detailsLog || []),
      }));
    }
    flash(`Updated ${editForm.name}.`);
    closeEdit();
  }
  function addDetailToNode(node, text) {
    const entry = { id: "d-" + Date.now(), text, date: Date.now() };
    if (node.kind === "person") setContacts(cs => cs.map(c => c.id === node.id ? { ...c, detailsLog: [...(c.detailsLog || []), entry] } : c));
    else if (node.kind === "place") setPlaces(ps => ps.map(p => p.id === node.id ? { ...p, detailsLog: [...(p.detailsLog || []), entry] } : p));
    else if (node.kind === "milestone") setEvents(es => es.map(e => e.id === node.id ? { ...e, detailsLog: [...(e.detailsLog || []), entry] } : e));
    setSelectedNode(n => n && n.id === node.id ? { ...n, detailsLog: [...(n.detailsLog || []), entry] } : n);
    flash("Logged.");
  }

  function onQuickAccess(label) {
    if (label === "Training") { setTab("traininggrounds"); return; }
    if (label === "System") { setTab("system"); return; }
    if (label === "Inventory") { setTab("inventory"); return; }
    if (label === "Calendar") { setTab("calendar"); return; }
    if (label === "Finances") { setTab("finances"); return; }
    if (label === "Opportunities") { setTab("opportunities"); return; }
    flash(`${label} isn't built yet.`);
  }

  async function submitDebrief() {
    const text = debriefText.trim();
    if (!text) { closeAdd(); return; }
    setDebriefText(""); // clear immediately so the UI doesn't feel stuck while the call is in flight
    try {
      const system = `You read a short daily debrief from an artist about their day and decide how it should nudge their Confidence Meter — six pillars measuring how well their situation is currently known: Career, Inventory, Finances, Relationships, Health, Time. Respond with ONLY raw JSON, no markdown: {"deltas": {"Career": integer, "Inventory": integer, "Finances": integer, "Relationships": integer, "Health": integer, "Time": integer}, "summary": "one short plain sentence describing what you noted"}. Only include non-zero deltas for pillars the debrief actually touches on (roughly -6 to +8 each); omit or zero the rest. If nothing meaningful was reported, all deltas should be 0 and the summary should say so plainly.`;
      const { data } = await callModel({ system, messages: [{ role: "user", content: text }], maxTokens: 300 });
      const parsed = extractJson(allText(data), "object");
      const deltas = parsed?.deltas || {};
      setConfidence(c => {
        const next = { ...c };
        for (const k of Object.keys(next)) {
          const d = Number(deltas[k]) || 0;
          if (d) next[k] = Math.max(5, Math.min(99, next[k] + d));
        }
        return next;
      });
      flash(`🤖 ${parsed?.summary || "Logged."}`);
    } catch (e) {
      // Real AI call failed (network hiccup, bad key, malformed reply) — fall back to
      // the honest, simple keyword version rather than losing the debrief entirely.
      const t = text.toLowerCase(); let msgs = [];
      if (/paint|art|studio|canvas/.test(t)) { setConfidence(c => ({ ...c, Career: Math.min(99, c.Career + 4) })); msgs.push("Career updated"); }
      if (/met|meeting|marcus|gallery|collector|talked to/.test(t)) { setConfidence(c => ({ ...c, Relationships: Math.min(99, c.Relationships + 5) })); msgs.push("Relationship logged"); }
      if (/spent|bought|paid|\$/.test(t)) { setConfidence(c => ({ ...c, Finances: Math.min(99, c.Finances + 3) })); msgs.push("Finances updated"); }
      if (!msgs.length) msgs.push("Noted — quiet day logged");
      flash(msgs.join(" · ") + " (offline fallback)");
    }
    closeAdd();
  }
  function closeAdd() { setAddOpen(false); setAddMode("choose"); setAddForm({}); }
  function submitAdd() {
    const pos = nextSpot();
    if (addMode === "person") {
      if (!addForm.name) return;
      const newId = "person-" + Date.now();
      // V1: no simulated personalities. This is a real person you actually know —
      // trust/interest start at a neutral baseline and grow only through real
      // logged interactions, never generated.
      setContacts(cs => [...cs, { id: newId, kind: "person", name: addForm.name,
        type: addForm.role || "Contact", icon: User, color: T.blue,
        trust: 20, interest: 30, momentum: "steady", lastInteraction: "just added",
        needs: addForm.note || "Getting to know you.", backstory: "",
        detailsLog: addForm.details ? [{ id: "d-" + Date.now(), text: addForm.details, date: Date.now() }] : [],
        metContext: addForm.met || "", connections: (addForm.connections || "").split(",").map(s => s.trim()).filter(Boolean),
        sim: false, pos }]);
      flash(`${addForm.name} added.`);
    } else if (addMode === "place") {
      if (!addForm.name) return;
      const cat = PLACE_CATEGORIES.find(c => c.key === addForm.category) || PLACE_CATEGORIES[4];
      setPlaces(ps => [...ps, { id: "place-" + Date.now(), kind: "place", name: addForm.name,
        icon: cat.icon, color: cat.color, category: cat.label, pos,
        note: addForm.note || "No notes yet.",
        detailsLog: addForm.details ? [{ id: "d-" + Date.now(), text: addForm.details, date: Date.now() }] : [] }]);
      flash(`Added ${addForm.name} to the map.`);
    } else if (addMode === "event") {
      if (!addForm.name) return;
      const cat = EVENT_CATEGORIES.find(c => c.key === addForm.category) || EVENT_CATEGORIES[4];
      setEvents(es => [...es, { id: "event-" + Date.now(), kind: "milestone", name: addForm.name,
        icon: cat.icon, color: cat.color, category: cat.label, pos, daysLeft: Number(addForm.days) || null,
        budget: addForm.budget || "", requirements: [], note: addForm.note || "",
        detailsLog: addForm.details ? [{ id: "d-" + Date.now(), text: addForm.details, date: Date.now() }] : [] }]);
      flash(`Added ${addForm.name} — tracking on your map.`);
    } else if (addMode === "idea") {
      if (!addForm.text) return;
      setIdeas(is => [{ id: "idea-" + Date.now(), text: addForm.text,
        tags: (addForm.tags || "").split(",").map(s => s.trim()).filter(Boolean), date: "just now" }, ...is]);
      flash("Idea saved.");
    }
    closeAdd();
  }

  const DISCOVERY_ICON = { gallery: Palette, museum: Landmark, public_art: ImageIcon };
  const revealedDrops = getRevealedDrops(drops, playerPosition?.lat, playerPosition?.lng);
  const allNodes = [
    ...visibleContacts, ...visiblePlaces, ...events,
    ...opps.map(o => ({ ...o, kind: "opportunity" })),
    ...discoveredLocations.map(l => ({ ...l, kind: "place", icon: DISCOVERY_ICON[l.category] || Palette, color: T.forestLight, discovered: true, name: l.name })),
    ...revealedDrops.map(d => ({ ...d, id: `${d.type}-${d.lat}-${d.lng}`, kind: "place", name: d.label, isCollectible: true, color: T.forestLight })),
    { id: "ideas-hub", kind: "idea", name: "Ideas", icon: Lightbulb, color: T.gold, pos: { x: 46, y: 40 } },
  ];

  // Auth gate comes first: nothing about the game or onboarding matters until we
  // know who (if anyone) is actually signed in.
  if (authUser === undefined) {
    return (
      <div style={{ minHeight: "100vh", background: T.ink, display: "flex", alignItems: "center",
        justifyContent: "center", color: T.textCream, fontFamily: body }}>Checking sign-in…</div>
    );
  }
  if (authUser === null) {
    return <Login_ />;
  }

  // Nothing else renders until we know whether this is a new player.
  if (onboarded === null) {
    return (
      <div style={{ minHeight: "100vh", background: T.ink, display: "flex", alignItems: "center",
        justifyContent: "center", color: T.textCream, fontFamily: body }}>Loading your world…</div>
    );
  }
  if (onboarded === false) {
    return <Onboarding_ onFinish={finishOnboarding} />;
  }

  // Training Grounds and the System check each manage their own full-screen layout —
  // shown here instead of the game's usual chrome, with just a way back.
  if (tab === "traininggrounds") {
    return (
      <div style={{ minHeight: "100vh", background: "#0B0D12" }}>
        <button onClick={() => setTab("profile")} style={{ position: "fixed", top: 14, left: 14, zIndex: 50,
          background: "#181C28", border: "1px solid #282D38", borderRadius: 10, padding: "8px 14px",
          color: "#EDE7D9", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, display: "flex",
          alignItems: "center", gap: 6 }}>← Back</button>
        <TrainingGrounds />
      </div>
    );
  }
  if (tab === "system") {
    return <SystemCheck onBack={() => setTab("profile")} />;
  }
  if (tab === "inventory") {
    return <Inventory_ inventory={inventory} setInventory={setInventory} onBack={() => setTab("profile")} flash={flash} />;
  }
  if (tab === "calendar") {
    return <Calendar_ quests={quests} events={events} onBack={() => setTab("profile")} />;
  }
  if (tab === "finances") {
    return <Finances_ financeLog={financeLog} setFinanceLog={setFinanceLog} goal={goal} setGoal={setGoal} onBack={() => setTab("profile")} flash={flash} />;
  }
  if (tab === "opportunities") {
    return <OpportunitiesPage_ opps={opps} onAccept={trackOpportunity} onDecline={dismissOpportunity} onBack={() => setTab("profile")} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream,
      fontFamily: body, maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: tab === "map" ? 0 : 84 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button { cursor: pointer; font-family: inherit; }
        input, textarea { font-family: inherit; }
      `}</style>
      <Toast text={toast} />

      {tab === "home" && <Home_ quests={quests} goal={goal} energy={energy} onToggle={toggleQuest} onViewAll={() => setTab("quests")} profile={profile} levels={levels} playerMode={playerMode} xp={xp} />}
      {tab === "quests" && <Quests_ quests={quests} onToggle={toggleQuest} />}
      {tab === "map" && (
        // Full viewport, edge to edge — the map is the primary interface now, not
        // content sitting inside the usual padded screen area. The bottom nav still
        // renders (fixed, below), floating semi-transparently on top of it.
        <div style={{ position: "fixed", inset: 0, maxWidth: 480, margin: "0 auto" }}>
          <MapScreen_
            nodes={allNodes} quests={quests} events={events} energy={energy}
            onSelect={setSelectedNode} onShowIdeas={() => setShowIdeas(true)} homeBase={homeBase} xp={xp}
            playerPosition={effectivePlayerPosition} avatarModel={profile?.avatarModel} onCollectDrop={collectDrop} worldBuilderActive={worldBuilderActive}
            onPublishLocation={publishWorldBuilderLocation} jumpTrigger={jumpTrigger}
            onExitWorldBuilder={() => { setWorldBuilderActive(false); setSimulatedPosition(null); flash("Exited World Builder — back to your real position."); }}
            onJumpToAddress={async (address) => {
              const coords = await geocodeAddress(address);
              if (!coords) { flash("Couldn't find that address."); return; }
              setSimulatedPosition({ lat: coords.lat, lng: coords.lng, heading: null });
              setJumpTrigger(t => t + 1);
              flash(`Jumped to ${address}`);
            }}
          />
        </div>
      )}
      {tab === "profile" && <Profile_ confidence={confidence} onQuickAccess={onQuickAccess} skills={skills} levels={levels}
        generatedCount={contacts.filter(c => c.sim || c.generatedByAiMode).length + places.filter(p => p.generatedByAiMode).length}
        onClearGenerated={clearGeneratedContent} xp={xp} unlockedAchievements={unlockedAchievements} playerMode={playerMode} isAdmin={isAdmin}
        onEnterWorldBuilder={() => { setWorldBuilderActive(true); setTab("map"); flash("🛠 World Builder active — free roam enabled."); }} />}

      {selectedNode && (
        <NodeSheet node={selectedNode} onClose={() => setSelectedNode(null)}
          onLogInteraction={logInteraction} onTrack={trackOpportunity} onDismiss={dismissOpportunity}
          onRequestDelete={requestDelete} onEdit={openEdit} onAddDetail={addDetailToNode} />
      )}
      {editingNode && (
        <EditSheet node={editingNode} form={editForm} setForm={setEditForm} onClose={closeEdit} onSave={saveEdit} />
      )}
      {confirmDelete && (
        <ConfirmDeleteModal node={confirmDelete} onCancel={cancelDelete} onConfirm={confirmDeleteNode} />
      )}
      {showIdeas && <IdeasSheet ideas={ideas} onClose={() => setShowIdeas(false)} />}

      {addOpen && (
        <AddSheet mode={addMode} setMode={setAddMode} form={addForm} setForm={setAddForm}
          debriefText={debriefText} setDebriefText={setDebriefText}
          onClose={closeAdd} onSubmitAdd={submitAdd} onSubmitDebrief={submitDebrief} />
      )}

      {/* Edge-floating nav — no persistent bar. The map is the main app now, these
          are just quick escape hatches to the other screens, out of the way by default. */}
      <button onClick={() => setTab(tab === "home" ? "map" : "home")} style={{ position: "fixed", top: "calc(14px + env(safe-area-inset-top, 0px))", left: 14,
        width: 42, height: 42, borderRadius: "50%", background: tab === "home" ? T.gold : "#00000080", backdropFilter: "blur(8px)",
        border: `1.5px solid ${tab === "home" ? T.gold : "#ffffff33"}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
        <HomeIcon size={18} color={tab === "home" ? T.ink : "#fff"} />
      </button>
      <button onClick={() => setTab(tab === "profile" ? "map" : "profile")} style={{ position: "fixed", top: "calc(14px + env(safe-area-inset-top, 0px))", right: 14,
        width: 42, height: 42, borderRadius: "50%", background: tab === "profile" ? T.gold : "#00000080", backdropFilter: "blur(8px)",
        border: `1.5px solid ${tab === "profile" ? T.gold : "#ffffff33"}`, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 20 }}>
        <User size={18} color={tab === "profile" ? T.ink : "#fff"} />
      </button>
      <button onClick={() => setTab(tab === "quests" ? "map" : "quests")} style={{ position: "fixed", bottom: "calc(20px + env(safe-area-inset-bottom, 0px))", left: 14,
        width: 46, height: 46, borderRadius: "50%", background: tab === "quests" ? T.gold : "#00000080", backdropFilter: "blur(8px)",
        border: `1.5px solid ${tab === "quests" ? T.gold : "#ffffff33"}`, display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 4px 12px #0006", zIndex: 20 }}>
        <Swords size={19} color={tab === "quests" ? T.ink : "#fff"} />
      </button>
      <button onClick={() => setAddOpen(true)} style={{ position: "fixed", bottom: "calc(20px + env(safe-area-inset-bottom, 0px))", left: "50%", transform: "translateX(-50%)",
        width: 58, height: 58, borderRadius: "50%",
        background: `radial-gradient(circle at 35% 30%, ${T.goldBright}, ${T.gold})`, border: "3px solid #FFE9B0",
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px #000a", zIndex: 20 }}>
        <Plus color={T.ink} size={26} strokeWidth={3} />
      </button>
    </div>
  );
}

function SystemCheck({ onBack }) {
  const [storageOk, setStorageOk] = useState(null);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      const stamp = new Date().toISOString();
      const wrote = await storageSet("__healthcheck", { stamp });
      const read = await storageGet("__healthcheck");
      setStorageOk(Boolean(wrote && read && read.stamp === stamp));
    })();
  }, []);

  async function testModel() {
    setBusy(true); setErr("");
    try {
      const { data } = await callModel({ messages: [{ role: "user", content: "Reply with exactly: model wiring works." }], maxTokens: 50 });
      setReply(allText(data).trim());
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const box = { marginTop: 16, padding: 16, background: "#181C28", borderRadius: 10, border: "1px solid #282D38" };
  return (
    <div style={{ minHeight: "100vh", background: "#0B0D12", color: "#EDE7D9", fontFamily: "system-ui, sans-serif" }}>
      <button onClick={onBack} style={{ position: "fixed", top: 14, left: 14, background: "#181C28",
        border: "1px solid #282D38", borderRadius: 10, padding: "8px 14px", color: "#EDE7D9",
        fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>← Back</button>
      <div style={{ padding: "70px 24px 24px", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>System check</h1>
        <div style={box}>
          <strong>Firestore storage:</strong>{" "}
          {storageOk === null ? "checking…" : storageOk
            ? <span style={{ color: "#34D9C0" }}>✓ OK</span>
            : <span style={{ color: "#F0567A" }}>✗ check Firebase env + rules</span>}
        </div>
        <div style={box}>
          <strong>Model proxy (Groq):</strong>
          <div style={{ marginTop: 10 }}>
            <button onClick={testModel} disabled={busy} style={{ background: "#34D9C0", color: "#0B0D12",
              border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>
              {busy ? "Testing…" : "Test model call"}
            </button>
          </div>
          {reply && <p style={{ color: "#34D9C0", marginTop: 10 }}>✓ {reply}</p>}
          {err && <p style={{ color: "#F0567A", marginTop: 10 }}>✗ {err}</p>}
        </div>
      </div>
    </div>
  );
}
/* ================= INVENTORY (real, working) ================= */
function Inventory_({ inventory, setInventory, onBack, flash }) {
  const [form, setForm] = useState({ name: "", size: "", price: "", status: "in-progress" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  function add() {
    if (!form.name.trim()) return;
    setInventory(inv => [...inv, { id: "art-" + Date.now(), name: form.name, size: form.size, price: form.price, status: form.status }]);
    setForm({ name: "", size: "", price: "", status: "in-progress" });
    flash("Added to inventory.");
  }
  function remove(id) { setInventory(inv => inv.filter(a => a.id !== id)); }
  function toggleStatus(id) {
    setInventory(inv => inv.map(a => a.id === id ? { ...a, status: a.status === "finished" ? "in-progress" : "finished" } : a));
  }
  const finished = inventory.filter(a => a.status === "finished").length;
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream, fontFamily: body, maxWidth: 480, margin: "0 auto", padding: "16px 14px 40px" }}>
      <BackHeader title="🖼️ Inventory" onBack={onBack} />
      <Scroll style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{finished} finished · {inventory.length - finished} in progress</div>
        <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630" }}>Regional festivals typically expect 15–20 finished pieces.</div>
      </Scroll>
      <div style={{ margin: "16px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>ADD A PIECE</div>
      <Scroll style={{ padding: 14 }}>
        <FormInput label="Name" value={form.name} onChange={v => set("name", v)} placeholder="e.g. Persistence of Alchemy" />
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><FormInput label="Size" value={form.size} onChange={v => set("size", v)} placeholder="48x60" /></div>
          <div style={{ flex: 1 }}><FormInput label="Price" value={form.price} onChange={v => set("price", v)} placeholder="$2,400" /></div>
        </div>
        <ChipSelect label="Status" options={[{ key: "in-progress", label: "In Progress" }, { key: "finished", label: "Finished" }]}
          value={form.status} onChange={v => set("status", v)} />
        <SubmitBtn onClick={add} label="Add piece" disabled={!form.name.trim()} />
      </Scroll>
      <div style={{ margin: "16px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>YOUR WORKS</div>
      {inventory.length === 0 && <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>Nothing added yet.</div>}
      {inventory.map(a => (
        <Scroll key={a.id} style={{ padding: 12, marginBottom: 8, display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => toggleStatus(a.id)} style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0,
            border: `2px solid ${T.wood}`, background: a.status === "finished" ? T.green : "transparent",
            display: "flex", alignItems: "center", justifyContent: "center" }}>
            {a.status === "finished" && <Check size={14} color="#fff" />}
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: head, fontWeight: 700, fontSize: 14 }}>{a.name}</div>
            <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>{a.size || "—"} · {a.price || "—"}</div>
          </div>
          <button onClick={() => remove(a.id)} style={{ background: "none", border: "none" }}><Trash2 size={16} color={T.rose} /></button>
        </Scroll>
      ))}
    </div>
  );
}

/* ================= CALENDAR (upcoming list — not a month grid, see note) ================= */
function Calendar_({ quests, events, onBack }) {
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("all");
  const RANGE_OPTIONS = [
    { key: "all", label: "All", minDays: null, maxDays: null },
    { key: "week", label: "Next 7 days", minDays: null, maxDays: 7 },
    { key: "month", label: "Next 30 days", minDays: null, maxDays: 30 },
    { key: "later", label: "Beyond 30 days", minDays: 31, maxDays: null },
  ];
  const activeRange = RANGE_OPTIONS.find(r => r.key === range) || RANGE_OPTIONS[0];

  const raw = buildUpcomingDeadlines({ quests, events });
  const consolidated = consolidateByTitle(raw);
  const items = filterDeadlines(consolidated, { query, minDays: activeRange.minDays, maxDays: activeRange.maxDays });

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream, fontFamily: body, maxWidth: 480, margin: "0 auto", padding: "16px 14px 40px" }}>
      <BackHeader title="📅 Calendar" onBack={onBack} />
      <div style={{ fontFamily: body, fontSize: 11.5, color: T.textMuted, margin: "10px 2px 12px" }}>
        Upcoming, soonest first, duplicates merged. (A full month grid isn't built yet — this is the honest, useful version for now.)
      </div>

      <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by name or category…"
        style={{ width: "100%", background: "#181C28", border: "1px solid #282D38", borderRadius: 10, padding: "10px 12px",
          color: "#EDE7D9", fontFamily: body, fontSize: 13, outline: "none", marginBottom: 10 }} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {RANGE_OPTIONS.map(r => (
          <button key={r.key} onClick={() => setRange(r.key)} style={{ padding: "6px 12px", borderRadius: 20,
            border: `1.5px solid ${T.gold}`, background: range === r.key ? T.gold : "transparent",
            color: range === r.key ? T.ink : T.textCream, fontFamily: head, fontWeight: 700, fontSize: 11 }}>
            {r.label}
          </button>
        ))}
      </div>

      {items.length === 0 && (
        <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>
          {raw.length === 0 ? "Nothing with a deadline right now." : "Nothing matches that search/filter."}
        </div>
      )}
      {items.map((it, i) => (
        <Scroll key={i} style={{ padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: head, fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
              {it.label}
              {it.count > 1 && (
                <span style={{ fontFamily: body, fontSize: 9.5, fontWeight: 700, color: T.gold, background: "#00000030",
                  padding: "1px 6px", borderRadius: 10 }}>×{it.count}</span>
              )}
            </div>
            <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>{it.sub}</div>
          </div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 13, color: isUrgentDeadline(it.days) ? T.rose : T.gold }}>{it.raw}</div>
        </Scroll>
      ))}
    </div>
  );
}

/* ================= FINANCES (real income/expense log vs. goal) ================= */
function Finances_({ financeLog, setFinanceLog, goal, setGoal, onBack, flash }) {
  const [form, setForm] = useState({ desc: "", amount: "", type: "income" });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const { income, expenses } = computeFinanceTotals(financeLog);
  function add() {
    if (!form.desc.trim() || !form.amount) return;
    const entry = { id: "fin-" + Date.now(), date: Date.now(), ...buildFinanceEntry(form) };
    setFinanceLog(l => [entry, ...l]);
    if (entry.type === "income") setGoal(g => applyIncomeToGoal(g, entry.amount));
    setForm({ desc: "", amount: "", type: "income" });
    flash(entry.type === "income" ? "Income logged — goal progress updated." : "Expense logged.");
  }
  function remove(id) {
    const entry = financeLog.find(f => f.id === id);
    if (entry && entry.type === "income") setGoal(g => removeIncomeFromGoal(g, entry.amount));
    setFinanceLog(l => l.filter(f => f.id !== id));
  }
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream, fontFamily: body, maxWidth: 480, margin: "0 auto", padding: "16px 14px 40px" }}>
      <BackHeader title="💰 Finances" onBack={onBack} />
      <Scroll style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div><div style={{ fontFamily: head, fontSize: 9, color: T.wood, fontWeight: 700 }}>INCOME</div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18, color: T.forestLight }}>${income.toLocaleString()}</div></div>
          <div><div style={{ fontFamily: head, fontSize: 9, color: T.wood, fontWeight: 700 }}>EXPENSES</div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18, color: T.rose }}>${expenses.toLocaleString()}</div></div>
          <div><div style={{ fontFamily: head, fontSize: 9, color: T.wood, fontWeight: 700 }}>TOWARD GOAL</div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18 }}>${goal.current.toLocaleString()}</div></div>
        </div>
        <div style={{ marginTop: 10 }}><Bar pct={(goal.current / goal.target) * 100} color={T.green} track="#00000022" /></div>
      </Scroll>
      <div style={{ margin: "16px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>LOG AN ENTRY</div>
      <Scroll style={{ padding: 14 }}>
        <ChipSelect label="Type" options={[{ key: "income", label: "Income (a sale)" }, { key: "expense", label: "Expense" }]} value={form.type} onChange={v => set("type", v)} />
        <FormInput label="What was it?" value={form.desc} onChange={v => set("desc", v)} placeholder="e.g. Sold 'City of Becoming' to Marcus" />
        <FormInput label="Amount ($)" value={form.amount} onChange={v => set("amount", v)} type="number" placeholder="e.g. 2400" />
        <SubmitBtn onClick={add} label="Log it" disabled={!form.desc.trim() || !form.amount} />
        {form.type === "income" && <div style={{ fontFamily: body, fontSize: 10.5, color: "#8a7350", marginTop: 6 }}>Income entries move your Mission progress bar too.</div>}
      </Scroll>
      <div style={{ margin: "16px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>HISTORY</div>
      {financeLog.length === 0 && <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>Nothing logged yet.</div>}
      {financeLog.map(f => (
        <Scroll key={f.id} style={{ padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div><div style={{ fontFamily: head, fontWeight: 700, fontSize: 13.5 }}>{f.desc}</div>
            <div style={{ fontFamily: body, fontSize: 10.5, color: "#5b4630" }}>{timeAgo(f.date)}</div></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: head, fontWeight: 800, fontSize: 13, color: f.type === "income" ? T.forestLight : T.rose }}>
              {f.type === "income" ? "+" : "−"}${Number(f.amount).toLocaleString()}
            </span>
            <button onClick={() => remove(f.id)} style={{ background: "none", border: "none" }}><Trash2 size={14} color={T.rose} /></button>
          </div>
        </Scroll>
      ))}
    </div>
  );
}

/* ================= DEDICATED OPPORTUNITIES PAGE ================= */
function OpportunitiesPage_({ opps, onAccept, onDecline, onBack }) {
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream, fontFamily: body, maxWidth: 480, margin: "0 auto", padding: "16px 14px 40px" }}>
      <BackHeader title="🎯 Opportunities" onBack={onBack} />
      <div style={{ fontFamily: body, fontSize: 11.5, color: T.textMuted, margin: "10px 2px 14px" }}>
        Everything tracked or worth watching, all in one place.
      </div>
      {opps.length === 0 && <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>Nothing tracked right now.</div>}
      {opps.map(o => (
        <Scroll key={o.id} style={{ padding: 13, marginBottom: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ fontFamily: head, fontWeight: 700, fontSize: 14.5, flex: 1 }}>{o.name}</div>
            <span style={{ fontFamily: head, fontSize: 8.5, padding: "3px 8px", borderRadius: 20, background: T.rose, color: "#fff" }}>{o.tag}</span>
          </div>
          <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630", marginTop: 5 }}>{o.note}</div>
          <div style={{ display: "flex", gap: 12, marginTop: 7, fontFamily: body, fontSize: 11, fontWeight: 700 }}>
            <span style={{ color: T.forestLight }}>{o.budget}</span>
          </div>
          <a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4,
            marginTop: 7, fontFamily: body, fontSize: 10.5, color: T.blue, fontWeight: 700, textDecoration: "none" }}>
            <ChevronRight size={11} /> Source: {o.source} ↗
          </a>
          <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
            <button onClick={() => onAccept(o)} style={{ flex: 1, padding: "8px 0", borderRadius: 9, border: "none",
              background: T.green, color: "#fff", fontFamily: head, fontWeight: 700, fontSize: 11 }}>Track</button>
            <button onClick={() => onDecline(o.id)} style={{ flex: 1, padding: "8px 0", borderRadius: 9,
              border: `2px solid ${T.wood}`, background: "transparent", color: T.textDark, fontFamily: head, fontWeight: 700, fontSize: 11 }}>Not now</button>
          </div>
        </Scroll>
      ))}
    </div>
  );
}
function BackHeader({ title, onBack }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button onClick={onBack} style={{ background: "#181C28", border: "1px solid #282D38", borderRadius: 10,
        padding: "8px 12px", color: "#EDE7D9", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>← Back</button>
      <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18 }}>{title}</div>
    </div>
  );
}
function NavBtn({ icon: Icon, label, active, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", display: "flex", flexDirection: "column",
      alignItems: "center", gap: 3, color: active ? T.goldBright : T.textMuted, flex: 1 }}>
      <Icon size={20} /><span style={{ fontFamily: head, fontSize: 10, fontWeight: 700 }}>{label}</span>
    </button>
  );
}

/* ================= HOME (simplified — map lives on its own tab now) ================= */
function Home_({ quests, goal, energy, onToggle, onViewAll, profile, levels, playerMode = "creator", xp = 0 }) {
  const pct = Math.round((goal.current / goal.target) * 100);
  const top3 = quests.filter(q => q.tier !== "ignore").slice(0, 3);
  const primary = quests.find(q => q.tier === "primary");
  const currentLevel = levels.find(l => l.state === "current") || levels[0];
  const questsDone = quests.filter(q => q.done).length;
  return (
    <div>
      <div style={{ display: "flex", gap: 10, padding: "16px 14px 8px" }}>
        <div style={{ position: "relative", width: 54, height: 54, flexShrink: 0 }}>
          <div style={{ width: "100%", height: "100%", borderRadius: "50%", background: "#3a2f28",
            border: `3px solid ${T.blue}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>🧑🏾‍🎨</div>
          <div style={{ position: "absolute", bottom: -4, right: -4, width: 24, height: 24, borderRadius: "50%",
            background: T.gold, border: `2px solid ${T.ink}`, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: head, fontWeight: 800, fontSize: 10, color: T.ink }}>{currentLevel.n}</div>
        </div>
        <WoodPanel style={{ flex: 1, padding: "8px 12px" }}>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 16 }}>{profile?.name || "Artist"}</div>
          <div style={{ fontFamily: body, fontSize: 11, color: T.green, fontWeight: 700 }}>{currentLevel.title}</div>
          <div style={{ fontFamily: body, fontSize: 10, color: T.textMuted }}>
            Lv {currentLevel.n} · {currentLevel.xp ?? 0}/{currentLevel.xpNeed ?? 2000} XP
          </div>
        </WoodPanel>
      </div>

      {playerMode === "creator" ? (
        <WoodPanel style={{ margin: "6px 14px 0", padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontFamily: head, fontSize: 10, letterSpacing: 1, color: T.gold }}>MISSION</div>
              <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18 }}>${goal.target.toLocaleString()} goal</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{ fontFamily: head, fontWeight: 800, fontSize: 18, color: T.goldBright }}>${goal.current.toLocaleString()}</span>
              <span style={{ fontFamily: body, fontSize: 12, color: T.textMuted }}> / ${goal.target.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1 }}><Bar pct={pct} color={T.green} h={9} /></div>
            <span style={{ fontFamily: head, fontWeight: 800, fontSize: 13, color: T.green }}>{pct}%</span>
          </div>
        </WoodPanel>
      ) : (
        <WoodPanel style={{ margin: "6px 14px 0", padding: 14 }}>
          <div style={{ fontFamily: head, fontSize: 10, letterSpacing: 1, color: T.gold }}>YOUR PARTICIPATION</div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18, marginTop: 3 }}>{xp} XP earned</div>
          <div style={{ fontFamily: body, fontSize: 11.5, color: T.textMuted, marginTop: 4 }}>
            Explore galleries, check in at real places, complete quests — every real thing you do here counts.
          </div>
        </WoodPanel>
      )}

      <div style={{ display: "flex", gap: 8, margin: "10px 14px 0" }}>
        <Scroll style={{ flex: 1, padding: "9px 10px", textAlign: "center" }}>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1 }}>QUESTS DONE</div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20 }}>{questsDone}</div>
          <div style={{ fontFamily: body, fontSize: 9, color: T.green, fontWeight: 700 }}>REAL PROGRESS</div>
        </Scroll>
        <Scroll style={{ flex: 1.3, padding: "9px 10px" }}>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1, textAlign: "center" }}>ENERGY</div>
          <div style={{ display: "flex", gap: 2, justifyContent: "center", marginTop: 4 }}>
            {Array.from({ length: 12 }).map((_, i) => <Zap key={i} size={11} fill={i < energy ? T.gold : "none"} color={i < energy ? T.gold : "#00000033"} />)}
          </div>
          <div style={{ fontFamily: body, fontSize: 9, textAlign: "center", marginTop: 2 }}>{energy}/12</div>
        </Scroll>
        <WoodPanel style={{ flex: 1.3, padding: "9px 10px" }}>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1, color: T.gold }}>TODAY'S FOCUS</div>
          <div style={{ fontFamily: body, fontSize: 11, marginTop: 3, lineHeight: 1.3 }}>{primary ? primary.title : "All clear"}</div>
        </WoodPanel>
      </div>

      <div style={{ margin: "16px 14px 0" }}>
        <Scroll style={{ padding: 14 }}>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15, marginBottom: 8 }}>📋 TODAY'S TASKS</div>
          {top3.map(q => (
            <div key={q.id} style={{ display: "flex", gap: 10, padding: "9px 0", borderTop: `1px solid ${T.wood}33` }}>
              <button onClick={() => onToggle(q.id)} style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${T.wood}`, background: q.done ? T.green : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                {q.done && <Check size={13} color="#fff" />}
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: head, fontWeight: 700, fontSize: 13.5 }}>{q.title}</div>
                {q.completion != null && <div style={{ fontFamily: body, fontSize: 11, color: T.green, fontWeight: 700 }}>{q.completion}% complete</div>}
                <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630", marginTop: 1 }}>{q.why}</div>
                {q.completion != null && <div style={{ marginTop: 5 }}><Bar pct={q.completion} color={T.green} track="#00000022" /></div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontFamily: head, fontWeight: 800, fontSize: 12, color: T.forestLight }}>{q.ev}</div>
                <div style={{ fontFamily: body, fontSize: 10, color: T.rose, fontWeight: 700 }}>{q.due}</div>
              </div>
            </div>
          ))}
          <button onClick={onViewAll} style={{ width: "100%", marginTop: 10, padding: 10, borderRadius: 10, border: "none",
            background: T.wood, color: T.textCream, fontFamily: head, fontWeight: 700, fontSize: 12 }}>VIEW ALL TASKS ▸</button>
        </Scroll>
      </div>

      {primary && (
        <div style={{ margin: "12px 14px 0" }}>
          <Scroll style={{ padding: 14 }}>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15, marginBottom: 6 }}>⭐ WHY THIS MATTERS</div>
            <div style={{ fontFamily: body, fontSize: 12.5, lineHeight: 1.5 }}>{primary.why}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-around", marginTop: 12 }}>
              <MiniStep icon={Palette} label={primary.title.split("(")[0].trim()} />
              <ChevronRight size={16} color={T.wood} />
              <MiniStep icon={Trophy} label={primary.unlock || "Unlocks"} />
              <ChevronRight size={16} color={T.wood} />
              <MiniStep icon={DollarSign} label="Closer to $100k" />
            </div>
          </Scroll>
        </div>
      )}
    </div>
  );
}
function MiniStep({ icon: Icon, label }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ width: 34, height: 34, borderRadius: "50%", background: T.parchmentDark, border: `2px solid ${T.wood}`,
        display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto" }}><Icon size={16} color={T.wood} /></div>
      <div style={{ fontFamily: body, fontSize: 9, fontWeight: 700, marginTop: 4, maxWidth: 62 }}>{label}</div>
    </div>
  );
}

/* ================= MAP SCREEN (now its own full page — the whole focus) ================= */
function MapScreen_({ nodes, quests, events, energy, onSelect, onShowIdeas, homeBase, xp = 0, playerPosition, avatarModel, onCollectDrop, worldBuilderActive, onPublishLocation, onExitWorldBuilder, onJumpToAddress, jumpTrigger }) {
  const [filter, setFilter] = useState("all");
  const [organizeBy, setOrganizeBy] = useState("map"); // map | met | connections
  const [showList, setShowList] = useState(false); // minimal UI: the deadlines/level panel is collapsed by default
  const [wbName, setWbName] = useState("");
  const [wbAddress, setWbAddress] = useState("");
  const [wbBusy, setWbBusy] = useState(false);
  const [wbMsg, setWbMsg] = useState("");
  const [wbPanelOpen, setWbPanelOpen] = useState(true);
  const [wbJumpAddress, setWbJumpAddress] = useState("");
  const [wbJumpBusy, setWbJumpBusy] = useState(false);
  const visible = nodes.filter(n => filter === "all" || n.kind === filter || (filter === "idea" && n.kind === "idea"));
  const peopleOnly = nodes.filter(n => n.kind === "person");

  const deadlineItems = buildUpcomingDeadlines({ quests, events, limit: 2 });
  const urgentEvent = events.find(e => e.requirements && isAtRisk(e.requirements, e.daysLeft));
  const lowEnergy = energy <= 3;
  const profileLevel = computeProfileLevel(xp);

  async function publishLocation() {
    if (!wbName.trim() || !wbAddress.trim()) { setWbMsg("Name and address both required."); return; }
    setWbBusy(true); setWbMsg("");
    const coords = await geocodeAddress(wbAddress.trim());
    setWbBusy(false);
    if (!coords) { setWbMsg("Couldn't find that address — try being more specific."); return; }
    onPublishLocation({ name: wbName.trim(), address: wbAddress.trim(), lat: coords.lat, lng: coords.lng });
    setWbMsg(`✓ Published "${wbName.trim()}" — real geocoded location, live now.`);
    setWbName(""); setWbAddress("");
  }

  // grouping logic lives in ./engines/relationshipEngine.js (groupPeopleBy)

  if (filter === "person" && organizeBy !== "map") {
    return (
      <div style={{ minHeight: "100vh", background: T.ink, padding: "16px 14px" }}>
        <button onClick={() => setOrganizeBy("map")} style={{ background: "none", border: "none",
          fontFamily: head, fontWeight: 700, fontSize: 13, color: T.gold, marginBottom: 12 }}>← Back to map</button>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          {[["met", "🤝 Where Met"], ["connections", "🔗 Connections"]].map(([key, label]) => (
            <button key={key} onClick={() => setOrganizeBy(key)} style={{ flex: 1, padding: "7px 0", borderRadius: 20,
              border: `1.5px solid ${T.gold}`, background: organizeBy === key ? T.gold : T.panel,
              color: organizeBy === key ? T.ink : T.textCream, fontFamily: head, fontSize: 10.5, fontWeight: 700 }}>{label}</button>
          ))}
        </div>
        {groupPeopleBy(peopleOnly, organizeBy).map(([groupName, people]) => (
          <div key={groupName} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: head, fontWeight: 700, fontSize: 12.5, color: T.goldBright, marginBottom: 6 }}>
              {organizeBy === "met" ? "📍" : "🔗"} {groupName}
            </div>
            {people.map(p => {
              const Icon = p.icon;
              return (
                <button key={p.id} onClick={() => onSelect(p)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 10,
                  background: T.panel, border: `1.5px solid ${p.color}`, borderRadius: 12, padding: "9px 11px", marginBottom: 7 }}>
                  <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#fffaf0", border: `2px solid ${p.color}`,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={13} color={p.color} /></div>
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: head, fontWeight: 700, fontSize: 12.5, color: T.textCream }}>{p.name}</div>
                    <div style={{ fontFamily: body, fontSize: 10, color: T.textMuted }}>{p.type}</div>
                  </div>
                  <ChevronRight size={15} color={T.textMuted} />
                </button>
              );
            })}
          </div>
        ))}
        {peopleOnly.length === 0 && (
          <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>No people added yet.</div>
        )}
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: "100%", width: "100%" }}>
      {/* the map itself — full-screen, edge to edge, the primary interface now */}
      <WorldEngine_ nodes={visible} onSelect={onSelect} onShowIdeas={onShowIdeas} homeBase={homeBase} playerPosition={playerPosition} avatarModel={avatarModel} onCollectDrop={onCollectDrop} worldBuilderActive={worldBuilderActive} jumpTrigger={jumpTrigger} />

      {worldBuilderActive && (
        <>
          <div style={{ position: "absolute", top: "calc(60px + env(safe-area-inset-top, 0px))", left: 10, right: 10,
            background: "#D9A441", borderRadius: 10, padding: "6px 12px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontFamily: head, fontWeight: 800, fontSize: 11.5, color: "#1B140D" }}>🛠 WORLD BUILDER — FREE ROAM</span>
            <button onClick={onExitWorldBuilder} style={{ background: "#1B140D", color: "#D9A441", border: "none",
              borderRadius: 6, padding: "3px 9px", fontFamily: head, fontWeight: 700, fontSize: 10.5 }}>EXIT</button>
          </div>

          {!wbPanelOpen ? (
            <button onClick={() => setWbPanelOpen(true)} style={{ position: "absolute", bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", right: 10,
              background: "#D9A441", border: "none", borderRadius: 20, padding: "9px 16px", fontFamily: head, fontWeight: 700, fontSize: 12, color: "#1B140D" }}>
              🛠 Builder Tools
            </button>
          ) : (
            <div style={{ position: "absolute", bottom: "calc(84px + env(safe-area-inset-bottom, 0px))", left: 10, right: 10,
              background: "#00000095", backdropFilter: "blur(8px)", border: "1.5px solid #D9A441", borderRadius: 14, padding: 12, maxHeight: "48vh", overflowY: "auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontFamily: head, fontSize: 10, letterSpacing: 1, color: "#D9A441" }}>BUILDER TOOLS</div>
                <button onClick={() => setWbPanelOpen(false)} style={{ background: "none", border: "none", color: "#fff", fontSize: 16, lineHeight: 1 }}>×</button>
              </div>

              <div style={{ fontFamily: head, fontSize: 9.5, letterSpacing: 1, color: "#8FA8D9", marginBottom: 5 }}>JUMP AVATAR TO ADDRESS</div>
              <input value={wbJumpAddress} onChange={e => setWbJumpAddress(e.target.value)} placeholder="Real street address"
                style={{ width: "100%", background: "#181C28", border: "1px solid #282D38", borderRadius: 8, padding: "8px 10px",
                  color: "#EDE7D9", fontFamily: body, fontSize: 12.5, outline: "none", marginBottom: 6 }} />
              <button onClick={async () => { setWbJumpBusy(true); await onJumpToAddress(wbJumpAddress); setWbJumpBusy(false); }} disabled={wbJumpBusy || !wbJumpAddress.trim()}
                style={{ width: "100%", padding: 9, borderRadius: 8, border: "none", marginBottom: 12,
                  background: wbJumpBusy ? "#2c3a52" : "#5B8FD9", color: "#fff", fontFamily: head, fontWeight: 700, fontSize: 12 }}>
                {wbJumpBusy ? "Finding address…" : "Jump Here"}
              </button>

              <div style={{ fontFamily: head, fontSize: 9.5, letterSpacing: 1, color: "#D9A441", marginBottom: 5 }}>ADD REAL LOCATION</div>
              <input value={wbName} onChange={e => setWbName(e.target.value)} placeholder="Name (e.g. Nina Baldwin Gallery)"
                style={{ width: "100%", background: "#181C28", border: "1px solid #282D38", borderRadius: 8, padding: "8px 10px",
                  color: "#EDE7D9", fontFamily: body, fontSize: 12.5, outline: "none", marginBottom: 6 }} />
              <input value={wbAddress} onChange={e => setWbAddress(e.target.value)} placeholder="Real street address"
                style={{ width: "100%", background: "#181C28", border: "1px solid #282D38", borderRadius: 8, padding: "8px 10px",
                  color: "#EDE7D9", fontFamily: body, fontSize: 12.5, outline: "none", marginBottom: 8 }} />
              <button onClick={publishLocation} disabled={wbBusy} style={{ width: "100%", padding: 10, borderRadius: 8, border: "none",
                background: wbBusy ? "#6b5a2e" : "#D9A441", color: "#1B140D", fontFamily: head, fontWeight: 700, fontSize: 12.5 }}>
                {wbBusy ? "Geocoding real address…" : "Publish"}
              </button>
              {wbMsg && <div style={{ fontFamily: body, fontSize: 11, color: "#fff", marginTop: 6 }}>{wbMsg}</div>}
            </div>
          )}
        </>
      )}

      {/* minimal floating UI — one small button, not a persistent row, since Home/
          Profile now occupy the top corners. Everything else lives behind it. */}
      <div style={{ position: "absolute", top: "calc(14px + env(safe-area-inset-top, 0px))", left: "50%", transform: "translateX(-50%)" }}>
        <button onClick={() => setShowList(s => !s)} style={{ background: "#00000090", backdropFilter: "blur(6px)",
          border: "1px solid #ffffff22", borderRadius: 20, padding: "7px 14px", display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: head, fontWeight: 800, fontSize: 12, color: T.goldBright }}>Lv {profileLevel.level}</span>
          {(urgentEvent || lowEnergy) && <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.rose }} />}
          <ChevronDown size={12} color="#fff" style={{ transform: showList ? "rotate(180deg)" : "none" }} />
        </button>
      </div>

      {showList && (
        <div style={{ position: "absolute", top: 60, left: 10, right: 10, background: "#00000090", backdropFilter: "blur(6px)",
          border: "1px solid #ffffff22", borderRadius: 14, padding: 12 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => { setFilter(f.key); if (f.key !== "person") setOrganizeBy("map"); }}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 20,
                  background: filter === f.key ? f.color : "transparent", border: `1.5px solid ${f.color}`,
                  color: filter === f.key ? T.ink : "#fff" }}>
                <span style={{ fontFamily: head, fontSize: 10.5, fontWeight: 700 }}>{f.label}</span>
              </button>
            ))}
          </div>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1, color: T.goldBright, marginBottom: 4 }}>
            NEAREST DEADLINES · {profileLevel.xpForNextLevel != null ? `${profileLevel.xpForNextLevel - profileLevel.xpIntoLevel} XP to next level` : "Max level"}
          </div>
          {deadlineItems.length === 0 && <div style={{ fontFamily: body, fontSize: 11, color: "#fff" }}>Nothing urgent.</div>}
          {deadlineItems.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: body, fontSize: 11, fontWeight: 700, color: "#fff", marginTop: 2 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200 }}>{d.label}</span>
              <span style={{ color: isUrgentDeadline(d.days) ? T.rose : T.goldBright }}>{d.days != null ? `${d.days}d` : d.raw}</span>
            </div>
          ))}
          {urgentEvent && (() => {
            const { met, total } = computeReadiness(urgentEvent.requirements);
            return (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #ffffff22", fontFamily: body, fontSize: 11, color: "#ffb4a8" }}>
                ⚠️ May miss <b>{urgentEvent.name}</b> — {met}/{total} requirements, {urgentEvent.daysLeft}d left.
              </div>
            );
          })()}
          {lowEnergy && (
            <div style={{ marginTop: 6, fontFamily: body, fontSize: 11, color: T.goldBright }}>⚡ Energy is low.</div>
          )}
        </div>
      )}

      {filter === "person" && (
        <div style={{ position: "absolute", top: 64, right: 10, display: "flex", gap: 6 }}>
          {[["met", "🤝"], ["connections", "🔗"]].map(([key, emoji]) => (
            <button key={key} onClick={() => setOrganizeBy(key)} style={{ width: 30, height: 30, borderRadius: "50%",
              background: "#00000090", backdropFilter: "blur(6px)", border: `1px solid ${T.gold}`, fontSize: 13 }}>{emoji}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   WORLD ENGINE — now a REAL MapLibre GL JS map as the base layer, with the game's
   existing Districts/Buildings/NPCs/Opportunities/Events rendered as overlays on
   top. Same three LOD tiers as before, now driven by real MapLibre zoom levels:
     zoom < LOD_DISTRICT   → Districts (category legend, small color-coded dots)
     LOD_DISTRICT..INTERIOR → Buildings/NPCs (individual entities, clickable)
     zoom >= LOD_INTERIOR + focus → Interior (one entity's full scene, inline)
   Upgraded from the previous DOM+CSS-transform renderer per explicit instruction —
   no gameplay logic was removed, only the rendering technology underneath it.
   ================================================================ */

// ZOOM_MIN/MAX, LOD_DISTRICT/INTERIOR, clampZoom, DISTRICT_LAYOUT, and buildDistricts
// now live in ./engines/mapEngine.js. The camera itself is now a REAL MapLibre GL JS
// map — this file only wires the game's existing entities/districts/interior logic
// onto it as overlays, per the explicit instruction: upgrade the renderer, keep
// every existing gameplay system. Nothing about Districts, Buildings, NPCs,
// Opportunities, Quests, or Events was removed — only how their positions are
// computed (real lat/lng via mapEngine + geoEngine) and how they're drawn
// (MapLibre Markers instead of CSS-transformed divs) changed.
//
// Free, no-API-key vector tile style — OpenFreeMap hosts unlimited, keyless OSM
// vector tiles specifically for MapLibre GL JS. No account, no cost, no rate limit
// tied to a key. This is a live network dependency: it can't be verified from a
// sandboxed environment with restricted egress, only from the deployed app in a
// real browser.
const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";

/** Real local time drives a genuine day/night palette swap — not a shader, a
 *  real-time color choice, which achieves the feeling honestly. */
function isNightNow() {
  const h = new Date().getHours();
  return h < 6 || h >= 19;
}

const ART_DISTRICT_PALETTE = {
  // Direction shifted from realistic asphalt gray toward a brighter, more
  // game-like look (Pokémon GO as the reference) — warm cream/tan roads, plain
  // sky blue background, per direct request rather than the earlier moody dark theme.
  night: { bg: "#1B3A5C", building: "#c9a878", road: "#D9C9A3", roadMinor: "#B8A67D", water: "#123c3a", land: "#7d9678", label: "#f0dcae", halo: "#0a0a0a" },
  day: { bg: "#6EB5E8", building: "#e0c29c", road: "#F0DFC0", roadMinor: "#D9C9A3", water: "#1a4f4d", land: "#96b08e", label: "#3a2a1a", halo: "#fff8ea" },
};
// Non-interactive buildings sit back at partial opacity so real entity locations
// naturally draw the eye — this is the actual mechanism behind "important places
// should stand out," not a lighting trick.
const BUILDING_OPACITY_BASELINE = 0.5;

/**
 * Re-paints the loaded base style into the "Art District" theme — sandstone
 * buildings glowing softly against a dark charcoal backdrop, amber streets, sage
 * parks, deep teal water — by walking every layer and matching on TYPE and a loose
 * name pattern, not hardcoded exact layer IDs. Deliberately defensive (try/catch
 * per layer): OpenFreeMap's exact style JSON can't be inspected from this
 * sandboxed environment, so this needs real-device confirmation, not just a
 * syntax check, before it's trusted to look right.
 */
// Caches each road layer's ORIGINAL width the first time it's seen — the theme
// gets re-applied on every day/night transition, and without this the road would
// get 4x wider every single time that happens, compounding indefinitely instead
// of staying at a stable 4x.
const originalRoadWidths = {};
function widenRoadLayer(map, layerId, roadClasses) {
  try {
    if (!(layerId in originalRoadWidths)) {
      originalRoadWidths[layerId] = map.getPaintProperty(layerId, "line-width") ?? 1;
    }
    const original = originalRoadWidths[layerId];
    // 6x, not 4x — "wide, cartoon-like roads" is a stronger statement than the
    // earlier 4x turned out to be. Anything not a real road class (path,
    // sidewalk, track, rail) gets width 0 — genuinely hidden, not just left
    // thin and unstyled.
    map.setPaintProperty(layerId, "line-width", ["match", ["get", "class"], roadClasses, ["*", 6, original], 0]);
  } catch { /* this layer may not support line-width as expected — skip it */ }
}

function applyArtDistrictTheme(map, night) {
  const p = night ? ART_DISTRICT_PALETTE.night : ART_DISTRICT_PALETTE.day;
  const style = map.getStyle();
  if (!style || !style.layers) return;
  style.layers.forEach(layer => {
    try {
      if (layer.type === "background") map.setPaintProperty(layer.id, "background-color", p.bg);
      else if (layer.type === "fill" && /water|ocean|sea|lake|river/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", p.water);
      else if (layer.type === "fill" && /(landuse|park|grass|wood|forest|golf|pitch)/i.test(layer.id)) map.setPaintProperty(layer.id, "fill-color", p.land);
      else if (layer.type === "fill-extrusion") {
        map.setPaintProperty(layer.id, "fill-extrusion-color", p.building);
        // "Background buildings extruded inches from the ground" — 0.15m (≈6
        // inches), not 6 meters. Nearly flat, just enough presence to read as a
        // real building footprint rather than a painted-on shape, while the
        // important-location beam/halo does all the actual visual work of
        // drawing the eye.
        map.setPaintProperty(layer.id, "fill-extrusion-height", 0.15);
        map.setPaintProperty(layer.id, "fill-extrusion-opacity", BUILDING_OPACITY_BASELINE);
      }
      else if (layer.type === "line" && layer["source-layer"] === "transportation") {
        // Real road data (OpenMapTiles schema, the standard this style is built on)
        // puts every road AND every sidewalk/footpath/cycleway inside this one
        // layer, distinguished by a "class" property per segment — not by
        // separate layer names. Matching on layer.id alone (the previous
        // approach) couldn't actually tell them apart, which is why roads looked
        // unstyled/thin and sidewalks stayed visible — both were the same bug.
        // This colors real vehicle-road classes and makes everything else
        // (path, track, rail, ferry) fully transparent and zero-width instead
        // of just leaving it in its default style.
        const MAJOR = ["motorway", "trunk", "primary"];
        const MINOR = ["secondary", "tertiary", "minor", "service"];
        map.setPaintProperty(layer.id, "line-color", ["match", ["get", "class"], MAJOR, p.road, MINOR, p.roadMinor, "rgba(0,0,0,0)"]);
        widenRoadLayer(map, layer.id, [...MAJOR, ...MINOR]);
      }
      else if (layer.type === "symbol") {
        map.setPaintProperty(layer.id, "text-color", p.label);
        map.setPaintProperty(layer.id, "text-halo-color", p.halo);
      }
    } catch { /* this layer doesn't support this paint property — skip it, don't break the rest */ }
  });
}

/**
 * Adds real 3D building extrusion if the loaded style has vector building data —
 * OpenFreeMap's Liberty style is built on the standard OpenMapTiles schema, where
 * a "building" source-layer with render_height is typical. Also defensive for the
 * same reason as the theme function: unverifiable from this sandbox, needs a real
 * device to confirm buildings actually extrude with real height data vs. the
 * generic fallback height.
 */
function addBuildingExtrusion(map, night) {
  if (map.getLayer("art-district-buildings-3d")) return;
  try {
    const sources = map.getStyle().sources || {};
    const vectorSourceId = Object.keys(sources).find(id => sources[id].type === "vector");
    if (!vectorSourceId) return;
    map.addLayer({
      id: "art-district-buildings-3d", type: "fill-extrusion", source: vectorSourceId, "source-layer": "building",
      paint: {
        "fill-extrusion-color": night ? ART_DISTRICT_PALETTE.night.building : ART_DISTRICT_PALETTE.day.building,
        // Same "inches, not meters" rule as the theme function applies to a
        // pre-existing building layer — a fallback shouldn't look more dramatic
        // than the real thing would have.
        "fill-extrusion-height": 0.15,
        "fill-extrusion-base": 0,
        "fill-extrusion-opacity": BUILDING_OPACITY_BASELINE,
      },
    });
  } catch { /* this style's source-layer naming may differ from the OpenMapTiles assumption */ }
}

/** Builds a small square polygon around a point — real building footprints don't
 *  reliably line up with entity coordinates, so interactive locations get their
 *  own synthetic footprint to extrude, rather than trying to match OSM geometry. */
function squareAround(lat, lng, radiusMeters) {
  const dLat = radiusMeters / 111000;
  const dLng = radiusMeters / (111000 * Math.cos((lat * Math.PI) / 180));
  return [[
    [lng - dLng, lat - dLat], [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat], [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ]];
}

/**
 * The actual mechanism behind "interactive buildings are fully 3D, background
 * buildings are flat": generic OSM building polygons don't know about game
 * entities, so precisely re-coloring/re-extruding only the "right" real building
 * footprints isn't reliable. Instead, every interactive location gets its own
 * synthetic footprint, extruded genuinely tall — visibly popping above the
 * flattened city fabric — plus a soft ground-halo for extra visibility from a
 * distance. The currently-entered entity gets both a taller box and a stronger
 * halo, covering "selected building: subtle glow and highlight."
 */
function updateEntityHighlights(map, districts, selectedId) {
  const haloFeatures = districts.flatMap(d => d.entities.map(e => ({
    type: "Feature", geometry: { type: "Point", coordinates: [e.lng, e.lat] },
    properties: { selected: e.id === selectedId ? 1 : 0, color: T[d.colorKey] || "#D9A441" },
  })));
  const haloGeojson = { type: "FeatureCollection", features: haloFeatures };
  try {
    const existingHalo = map.getSource("entity-highlights");
    if (existingHalo) { existingHalo.setData(haloGeojson); }
    else {
      map.addSource("entity-highlights", { type: "geojson", data: haloGeojson });
      map.addLayer({
        id: "entity-highlight-halo", type: "circle", source: "entity-highlights",
        paint: {
          "circle-radius": ["case", ["==", ["get", "selected"], 1], 26, 16],
          "circle-color": ["get", "color"],
          "circle-opacity": ["case", ["==", ["get", "selected"], 1], 0.35, 0.18],
          "circle-blur": 1,
        },
      });
    }
    // The tall synthetic building extrusion that used to live here is gone —
    // it created a second, competing tall vertical shape right next to the new
    // light beam, and the two visually merged into one ugly brown column instead
    // of reading as a glowing beam. The ground halo + the beam are the actual
    // "this is important" signal now, not an extruded box.
  } catch { /* non-critical visual layer — if this fails, markers still work fine on their own */ }
}

/**
 * Embeds real 3D building models INSIDE the map's actual 3D scene, at real
 * ground level and real geographic scale — not a floating marker icon. This is
 * the standard, documented technique for placing a real GLTF/GLB model into a
 * MapLibre scene: a "custom layer" that shares MapLibre's own WebGL context with
 * a Three.js renderer, so the model is drawn using the map's real projection
 * matrix on every frame, the same way MapLibre draws its own buildings/roads.
 *
 * Honest limit: I cannot render WebGL or verify 3D math visually from this
 * sandbox. This follows the well-established MapLibre/Mapbox official pattern
 * for this exact use case as precisely as I can, but it genuinely needs a real
 * device to confirm the positioning/scale/orientation actually looks right —
 * this is meaningfully more complex than anything else built for this map so far.
 */
function createBuildingModelsLayer() {
  const gltfCache = {}; // buildingModel key -> loaded THREE.Group template, cloned per placed instance
  const placed = new Map(); // entity.id -> the THREE.Object3D currently in the scene
  const loader = new GLTFLoader();

  return {
    id: "building-models-3d",
    type: "custom",
    renderingMode: "3d",
    onAdd(map, gl) {
      this.map = map;
      this.camera = new THREE.Camera();
      this.scene = new THREE.Scene();
      this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
      const sun = new THREE.DirectionalLight(0xffffff, 0.55);
      sun.position.set(0, -1, 1);
      this.scene.add(sun);
      this.renderer = new THREE.WebGLRenderer({ canvas: map.getCanvas(), context: gl, antialias: true });
      this.renderer.autoClear = false;
    },
    render(gl, matrix) {
      this.camera.projectionMatrix = new THREE.Matrix4().fromArray(matrix);
      this.renderer.resetState();
      this.renderer.render(this.scene, this.camera);
      this.map.triggerRepaint();
    },
    // Not part of MapLibre's custom-layer interface — called manually (from
    // WorldEngine_) whenever the entity list changes, to add/remove/reposition
    // the actual building models.
    updateEntities(districts) {
      const seenIds = new Set();
      districts.forEach(d => {
        d.entities.forEach(e => {
          const category = getMarkerCategory(e);
          const style = CATEGORY_MARKER_STYLE[category];
          if (!style || !style.buildingModel) return;
          seenIds.add(e.id);
          if (placed.has(e.id)) return; // already positioned — entities don't move

          const placeAt = (templateScene) => {
            // Real ground position and real-world scale — maplibregl.MercatorCoordinate
            // converts an actual lat/lng into the map's internal projection space, and
            // meterInMercatorCoordinateUnits() gives the correct scale factor at that
            // specific latitude (Mercator projection distorts scale, so this isn't a
            // constant — it has to be computed per-location).
            const merc = maplibregl.MercatorCoordinate.fromLngLat([e.lng, e.lat], 0);
            const scale = merc.meterInMercatorCoordinateUnits();
            const model = templateScene.clone();
            model.position.set(merc.x, merc.y, merc.z);
            // Standard Y-up (Three.js) to Mercator-space correction — the
            // established pattern for this exact integration, not an arbitrary guess.
            model.rotation.x = Math.PI / 2;
            model.scale.set(scale, -scale, scale);
            this.scene.add(model);
            placed.set(e.id, model);
          };

          if (gltfCache[style.buildingModel]) { placeAt(gltfCache[style.buildingModel]); }
          else {
            loader.load(`/buildings/${style.buildingModel}.glb`, gltf => {
              gltfCache[style.buildingModel] = gltf.scene;
              placeAt(gltf.scene);
              this.map.triggerRepaint();
            }, undefined, () => { /* model failed to load — entity just has no embedded building, not a crash */ });
          }
        });
      });
      // Remove anything no longer in the entity list.
      for (const [id, model] of placed) {
        if (!seenIds.has(id)) { this.scene.remove(model); placed.delete(id); }
      }
    },
  };
}

/**
 * Makes every important location's building gently pulse — MapLibre has no
 * built-in animation for paint properties, so this drives it with a real
 * interval (6-7 times/second, smooth enough to read as a pulse without
 * repainting every frame) that adds a small oscillating amount on top of each
 * feature's real base height (22m, or 34m if selected) rather than replacing it.
 * Returns a cleanup function to stop the interval.
 */
function startBuildingPulse(map) {
  const start = Date.now();
  const id = setInterval(() => {
    if (!map.getLayer("entity-buildings-3d")) return;
    const t = (Date.now() - start) / 1000;
    const pulse = Math.sin(t * 1.8) * 2.5; // small, slow breathing amount, in meters
    try {
      map.setPaintProperty("entity-buildings-3d", "fill-extrusion-height",
        ["+", pulse, ["case", ["==", ["get", "selected"], 1], 34, 22]]);
    } catch { /* layer may not be ready yet this tick — next tick will catch up */ }
  }, 140);
  return () => clearInterval(id);
}

/**
 * Subtle atmospheric depth-fade so distant buildings soften into the background
 * instead of the whole city looking uniformly sharp — a real MapLibre fog/sky
 * feature (available in recent versions), not a hand-rolled effect. Defensive: if
 * this MapLibre version or the loaded style doesn't support it, it fails silently
 * rather than breaking the map.
 */
function applyAtmosphere(map, night) {
  try {
    map.setFog({
      range: [0.3, 3.5],
      color: night ? "rgba(27,58,92,0.9)" : "rgba(110,181,232,0.85)",
      "horizon-blend": 0.2,
    });
  } catch { /* fog/sky not supported by this MapLibre version or style — the map still works without it */ }
}

/**
 * These colors are sampled directly from the actual uploaded skybox images (Kenney's
 * "Skyboxes" pack), not estimated — zenith and horizon bands averaged from the real
 * PNGs.
 */
const SKY_PALETTE = {
  morning: { horizon: "#f4cdb5", zenith: "#fdedd6" },
  day: { horizon: "#a7bbf2", zenith: "#98bdf0" },
  night: { horizon: "#28335d", zenith: "#2e3c6f" },
};

/** Morning/day/night — a real, slightly finer-grained time check than the plain
 *  isNightNow() day/night split, since the morning skybox has a genuinely distinct
 *  warm palette worth showing during its own window rather than folding into "day." */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h < 6 || h >= 20) return "night";
  if (h < 8) return "morning";
  return "day";
}

/**
 * Two native MapLibre sky attempts (setSky(), then a real "sky" style layer)
 * both failed to render on a real device. A third attempt — making the
 * background layer transparent so a CSS gradient could show through — was also
 * reverted: it removed ground coverage entirely, not just the empty-sky region,
 * turning the whole visible ground blue. The background stays opaque (the real
 * Art District ground color) until there's an actual, verified way to
 * distinguish "empty sky above the horizon" from "the ground plane" — sky
 * remains unsolved rather than broken in a new way each attempt.
 */

/* ---------------- custom category markers — designed shapes, not generic pins ---------------- */
const MARKER_ANIMATIONS = `
  @keyframes markerGlowPulse { 0%,100% { box-shadow: 0 0 8px 2px var(--glow), 0 0 2px 0 #fff8; } 50% { box-shadow: 0 0 20px 8px var(--glow), 0 0 4px 1px #fff8; } }
  @keyframes markerBob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
  @keyframes markerShimmer { 0%,100% { filter: brightness(1); } 50% { filter: brightness(1.4); } }
  @keyframes beamFlicker { 0%,100% { opacity: 0.85; } 50% { opacity: 1; } }
  @keyframes avatarWalkBob { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-3px) scale(1.03); } }
  @keyframes avatarIdleSway { 0%,100% { transform: rotate(-1.5deg); } 50% { transform: rotate(1.5deg); } }
`;
const CATEGORY_MARKER_STYLE = {
  gallery: { glow: "#D9A441", emoji: "🖼️", buildingModel: "building-a" },
  museum: { glow: "#5B8FD9", emoji: "🏛️", buildingModel: "building-b" },
  public_art: { glow: "#C25BD9", emoji: "🎨", buildingModel: "building-c" },
  venue: { glow: "#E0955B", emoji: "☕", buildingModel: "building-d" },
  milestone: { glow: "#F0567A", emoji: "🎉" },
  collectible: { glow: "#5BD9B0", emoji: "✨" },
  person: { glow: "#5BD9E8", emoji: "🧑" },
  opportunity: { glow: "#D9A441", emoji: "🎯" },
  place: { glow: "#D9A441", emoji: "📍", buildingModel: "building-e" }, // generic default — nothing falls through beam-less anymore
};
function CustomCategoryMarker({ category, onClick, label, selected = false }) {
  const style = CATEGORY_MARKER_STYLE[category] || CATEGORY_MARKER_STYLE.gallery;
  const animation = selected ? "markerGlowPulse 0.9s ease-in-out infinite"
    : category === "milestone" ? "markerGlowPulse 1.6s ease-in-out infinite"
    : category === "collectible" ? "markerBob 2s ease-in-out infinite, markerShimmer 1.8s ease-in-out infinite"
    : "markerGlowPulse 3s ease-in-out infinite";
  const beamHeight = selected ? 70 : 52;
  return (
    // MapLibre anchors a marker at the BOTTOM-CENTER of this element by default —
    // that's deliberately where the ground-ring sits, so the icon/label float
    // above the real geographic point the same way the reference image's beams do,
    // instead of the icon itself marking the ground position.
    <button onClick={onClick} style={{ background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <style>{MARKER_ANIMATIONS}</style>
      {/* Categories with a real buildingModel show no floating icon at all —
          the actual 3D building is now embedded at ground level via the custom
          layer (createBuildingModelsLayer), not duplicated here as a floating
          copy. The beam + label below still provide the click target and the
          "this is important" visual cue. */}
      {!style.buildingModel && (
        <span style={{ "--glow": style.glow, fontSize: selected ? 30 : 24, animation,
          filter: `drop-shadow(0 0 6px ${style.glow}) drop-shadow(0 0 10px ${style.glow}88)` }}>
          {style.emoji}
        </span>
      )}
      {label && <div style={{ background: "#000000b0", borderRadius: 5, padding: "1px 6px", fontFamily: head, fontSize: 8, color: "#fff", maxWidth: 76, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>}
      <div style={{ width: 3, height: beamHeight, marginTop: 2,
        background: `linear-gradient(180deg, ${style.glow}00, ${style.glow}dd 70%, ${style.glow}ff)`,
        boxShadow: `0 0 6px 1px ${style.glow}aa`, animation: "beamFlicker 2.4s ease-in-out infinite" }} />
      <div style={{ width: 20, height: 7, borderRadius: "50%", background: `${style.glow}55`,
        boxShadow: `0 0 10px 3px ${style.glow}66`, marginTop: -2 }} />
    </button>
  );
}

function getMarkerCategory(e) {
  if (e.category === "gallery" || e.category === "museum" || e.category === "public_art") return e.category;
  if (e.kind === "milestone") return "milestone";
  if (e.isCollectible) return "collectible";
  if (typeof e.category === "string" && e.category.toLowerCase() === "venue") return "venue";
  if (e.kind === "person") return "person";
  if (e.kind === "opportunity") return "opportunity";
  if (e.kind === "idea") return null; // ideas open a separate screen (onShowIdeas), never rendered as a beam marker
  return "place"; // generic default — every real place/entity gets the beam now, nothing falls through unstyled
}

/**
 * The player's own avatar — a real 3D model (Kenney's CC0 Mini Characters, GLB
 * format) rendered via <model-viewer>, not an emoji. No camera-controls attribute
 * on purpose: this should never capture touch/drag gestures away from the map.
 * Heading is applied as a 2D rotation of the whole marker — an honest
 * approximation (not true 3D yaw inside the model-viewer scene), the right
 * trade-off for something rendered at marker scale, not a full 3D character screen.
 */
function PlayerAvatar({ heading, avatarModel = "character-male-a", isMoving = false }) {
  return (
    <div style={{ position: "relative", width: 64, height: 72, display: "flex", flexDirection: "column",
      alignItems: "center", transform: heading != null ? `rotate(${heading}deg)` : "none", transformOrigin: "50% 50%" }}>
      <style>{MARKER_ANIMATIONS}</style>
      {/* Not a true walk-cycle — the animated character packs are FBX-only (no
          GLB), and the walk/run clips live in separate files meant to be merged
          onto the skeleton in a 3D tool I don't have here (no Blender, no
          FBX-to-GLB converter in this sandbox). This is real motion feedback
          using the model that's actually working: a genuine bob while you're
          detected as moving (real GPS distance since the last fix), a subtler
          idle sway otherwise — not the same thing as a skeletal walk animation,
          but honest about what it is. */}
      <div style={{ width: 64, height: 64, borderRadius: "50%", overflow: "hidden", background: "#1a1420cc",
        border: "3px solid #5BD9E8", boxShadow: "0 0 12px 3px #5BD9E888",
        animation: isMoving ? "avatarWalkBob 0.5s ease-in-out infinite" : "avatarIdleSway 2.4s ease-in-out infinite" }}>
        {/* eslint-disable-next-line react/no-unknown-property */}
        {/* orientation corrects an up-axis mismatch that was rendering the
            model upside down — common with FBX-derived GLB exports where the
            source tool's up-axis convention doesn't match what model-viewer
            expects by default. */}
        <model-viewer src={`/avatars/${avatarModel}.glb`} camera-orbit="0deg 82deg 2.6m" orientation="180deg 0deg 0deg" disable-zoom
          interaction-prompt="none" style={{ width: "100%", height: "100%", "--poster-color": "transparent" }} />
      </div>
      {heading != null && (
        <div style={{ width: 0, height: 0, marginTop: -3, borderLeft: "6px solid transparent",
          borderRight: "6px solid transparent", borderBottom: "10px solid #5BD9E8", filter: "drop-shadow(0 0 3px #5BD9E8)" }} />
      )}
    </div>
  );
}

function WorldEngine_({ nodes, onSelect, onShowIdeas, homeBase, playerPosition, avatarModel, onCollectDrop, worldBuilderActive, jumpTrigger }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]); // { marker, root } — so React roots get cleanly unmounted, not leaked
  const avatarRef = useRef(null); // { marker, root } — the player's own avatar, separate from entity markers
  const hasArrivedRef = useRef(false); // gates the one-time arrival flyTo vs. ongoing quick follow
  const isAnimatingRef = useRef(false); // true during any flyTo — guards against the center-lock fighting it
  const worldBuilderActiveRef = useRef(false);
  const originalBoundsRef = useRef(null);
  const pulseCleanupRef = useRef(null);
  const buildingLayerRef = useRef(null);
  useEffect(() => { worldBuilderActiveRef.current = worldBuilderActive; }, [worldBuilderActive]);
  // The map's zoom/rotate handlers are attached once, in an empty-dependency effect —
  // without these refs, they'd close over playerPosition/interior's initial (null)
  // values forever, never seeing real updates. Refs always read current.
  const playerPositionRef = useRef(playerPosition);
  const interiorForCameraRef = useRef(null);
  useEffect(() => { playerPositionRef.current = playerPosition; }, [playerPosition]);
  const [zoom, setZoom] = useState(LOD_DISTRICT - 1);
  const [interior, setInterior] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [night, setNight] = useState(isNightNow());
  useEffect(() => { interiorForCameraRef.current = interior; }, [interior]);

  const districts = useMemo(() => buildDistricts(nodes, homeBase), [nodes, homeBase]);
  const tier = computeTier(zoom, interior);

  // Initialize the real map exactly once. Tilted camera (pitch) makes this feel like
  // a living city, not a flat navigation map. Centered on the player's actual home
  // base (real geolocation, with an Atlanta fallback). minZoom + maxBounds are what
  // actually LOCK gameplay to neighborhood scale — not just a starting position,
  // a structural limit on how far out/away you can go. dragPan is deliberately
  // disabled: the camera should only move by following the real player (see the
  // playerPosition effect below), not by free dragging — you can still rotate
  // (twist gesture) and pinch-zoom, just not pan away from where you actually are.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const boundsRadius = 0.018; // roughly ~2km — keeps panning within the surrounding blocks, not the whole city
    // Pushes the geographic center (where the player stands) down into the lower
    // third of the screen, Pokémon GO style — a plain top-padding trick, not a
    // different projection.
    const viewportHeight = containerRef.current.clientHeight || 600;
    const initialBounds = [
      [homeBase.lng - boundsRadius, homeBase.lat - boundsRadius],
      [homeBase.lng + boundsRadius, homeBase.lat + boundsRadius],
    ];
    originalBoundsRef.current = initialBounds;
    const map = new maplibregl.Map({
      container: containerRef.current, style: MAP_STYLE_URL,
      // Starts at a wider establishing view — "camera flies smoothly to the
      // player's location" only means something if it isn't already there.
      // The real arrival flyTo (below) carries it into the actual gameplay
      // position once GPS resolves, instead of snapping there instantly.
      center: [homeBase.lng, homeBase.lat], zoom: ZOOM_MIN,
      // CRITICAL: MapLibre's default maxPitch cap is 60° — setting pitch above that
      // without also raising maxPitch gets silently clamped back down to 60, and
      // nothing about "increase the pitch toward the horizon" would actually happen.
      pitch: 60, maxPitch: 82, minZoom: ZOOM_MIN, maxZoom: ZOOM_MAX, attributionControl: false,
      dragPan: false, // camera follows the player instead of being freely draggable — World Builder re-enables this
      padding: { top: viewportHeight * 0.38, bottom: 0, left: 0, right: 0 },
      maxBounds: initialBounds,
    });
    // Keeps the avatar pinned at the exact center through zoom and rotate gestures —
    // MapLibre's default touch handlers pivot around the touch point (pinch midpoint,
    // twist center), not necessarily the current map center, so without this the
    // avatar could visibly drift off-center mid-gesture even though zoom/rotate
    // themselves are meant to feel normal. Re-centering on every 'zoom'/'rotate' tick
    // (fired continuously during the gesture, not just at the end) keeps the avatar
    // as the fixed pivot throughout, not just once you let go.
    function relockCenterOnAvatar() {
      // Skip entirely during an active flyTo (arrival, entering a building, etc.) —
      // that animation is already moving the center deliberately; instantly
      // snapping it back on every 'zoom' tick fights the animation and can cut it
      // short before it reaches its real target (this is what was likely capping
      // the arrival sequence at a flatter pitch than intended).
      if (isAnimatingRef.current) return;
      if (worldBuilderActiveRef.current) return; // free roam — no GPS lock at all
      if (!playerPositionRef.current || interiorForCameraRef.current) return;
      const c = map.getCenter();
      const { lng, lat } = playerPositionRef.current;
      if (Math.abs(c.lng - lng) > 1e-7 || Math.abs(c.lat - lat) > 1e-7) map.setCenter([lng, lat]);
    }
    map.on("zoom", () => { setZoom(map.getZoom()); relockCenterOnAvatar(); });
    map.on("rotate", relockCenterOnAvatar);
    // Tracks any programmatic camera animation (flyTo/easeTo) so the relock above
    // can get out of its way — 'movestart' with a non-gesture source means our own
    // code triggered it, not a touch gesture we still want to relock during.
    // Only clears isAnimatingRef broadly (harmless — clearing an already-false flag
    // is a no-op). SETTING it happens explicitly around the two deliberate
    // animations that should suppress rotation (the flyTo() helper and the arrival
    // sequence), not here — a blanket movestart listener was also catching the
    // routine GPS-follow easeTo, which fires every few seconds during normal play
    // and was blocking rotation almost all the time in player mode specifically.
    map.on("moveend", () => { isAnimatingRef.current = false; });

    // Two-finger gesture becomes zoom-only — rotation now happens via one-finger
    // drag instead (below), so pinch shouldn't also rotate at the same time.
    map.touchZoomRotate.disableRotation();

    // Custom one-finger-drag-to-rotate: MapLibre's default touch mapping doesn't
    // offer this combination (single-finger = pan, two-finger twist = rotate) out
    // of the box, and dragPan is already off, so single-finger drag currently does
    // nothing without this. Only engages for exactly one touch — a second touch
    // starting mid-gesture hands off to the native pinch-zoom handler instead.
    let rotateStartX = null, rotateStartBearing = null;
    // Edge-pitch gesture: both fingers near the LEFT/RIGHT screen edges, sliding
    // vertically together, adjusts pitch — distinct from a normal central pinch,
    // which still just zooms. Down = lower pitch (bird's eye), up = higher pitch
    // (toward the horizon). touchZoomRotate gets disabled for the duration of this
    // specific gesture so pinch-zoom doesn't also fire from the same two touches.
    const EDGE_ZONE = 70;
    let edgePitchActive = false, edgePitchStartY = null, edgePitchStartPitch = null;
    function isNearEdge(x) { return x < EDGE_ZONE || x > window.innerWidth - EDGE_ZONE; }
    const el = map.getContainer();
    function onTouchStart(e) {
      if (e.touches.length === 2 && isNearEdge(e.touches[0].clientX) && isNearEdge(e.touches[1].clientX)) {
        edgePitchActive = true;
        edgePitchStartY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        edgePitchStartPitch = map.getPitch();
        map.touchZoomRotate.disable();
        rotateStartX = null;
        return;
      }
      if (e.touches.length !== 1 || isAnimatingRef.current) { rotateStartX = null; return; }
      rotateStartX = e.touches[0].clientX;
      rotateStartBearing = map.getBearing();
    }
    function onTouchMove(e) {
      if (edgePitchActive && e.touches.length === 2) {
        const avgY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        const newPitch = Math.max(20, Math.min(82, edgePitchStartPitch - (avgY - edgePitchStartY) * 0.25));
        map.setPitch(newPitch);
        return;
      }
      if (rotateStartX == null || e.touches.length !== 1 || isAnimatingRef.current) return;
      const dx = e.touches[0].clientX - rotateStartX;
      map.setBearing(rotateStartBearing + dx * 0.3);
    }
    function onTouchEnd(e) {
      if (e.touches.length < 2 && edgePitchActive) { edgePitchActive = false; map.touchZoomRotate.enable(); map.touchZoomRotate.disableRotation(); }
      if (e.touches.length !== 1) rotateStartX = null;
    }
    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });

    map.on("load", () => {
      setMapReady(true);
      applyArtDistrictTheme(map, isNightNow());
      addBuildingExtrusion(map, isNightNow());
      applyAtmosphere(map, isNightNow());
      pulseCleanupRef.current = startBuildingPulse(map);
      buildingLayerRef.current = createBuildingModelsLayer();
      try { map.addLayer(buildingLayerRef.current); } catch { /* custom layers require WebGL2 in some environments — map still works without embedded buildings */ }
    });
    mapRef.current = map;
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      if (pulseCleanupRef.current) pulseCleanupRef.current();
      if (avatarRef.current) { avatarRef.current.root.unmount(); avatarRef.current.marker.remove(); avatarRef.current = null; }
      map.remove(); mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The actual free-roam mechanism: World Builder disables the GPS lock for real
  // (re-enables dragging, removes the bounds restriction) rather than just hiding
  // a UI element. Turning it back off restores the exact original bounds, not a
  // freshly-recomputed one, so normal play resumes exactly where it left off.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    if (worldBuilderActive) { map.dragPan.enable(); map.setMaxBounds(null); }
    else { map.dragPan.disable(); map.setMaxBounds(originalBoundsRef.current); }
  }, [worldBuilderActive, mapReady]);

  // Real-time day/night/morning check — re-applies the palette, atmosphere, and
  // sky if the time-of-day actually changes while the app is open (checked every
  // 5 minutes, not a continuous shader).
  const [timeOfDay, setTimeOfDay] = useState(getTimeOfDay());
  useEffect(() => {
    const id = setInterval(() => {
      const n = isNightNow();
      const t = getTimeOfDay();
      setNight(prevNight => {
        if (n !== prevNight && mapRef.current) { applyArtDistrictTheme(mapRef.current, n); applyAtmosphere(mapRef.current, n); }
        return n;
      });
      setTimeOfDay(t);
    }, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Keeps the entity-highlight halos current whenever entities or the selected
  // (entered) one changes — same "important places draw attention" mechanism,
  // updated live rather than only set once.
  useEffect(() => {
    if (mapRef.current && mapReady) updateEntityHighlights(mapRef.current, districts, interior?.id);
    if (buildingLayerRef.current) buildingLayerRef.current.updateEntities(districts);
  }, [districts, mapReady, interior]);

  // The player's own avatar — a real GPS-located marker, separate from entity
  // markers, that moves and rotates to face the direction of travel as real
  // position updates arrive. The camera smoothly follows it (easeTo, not a jarring
  // re-fly on every tiny GPS tick) — this IS "the camera can only move slightly":
  // dragPan is off, so the only way the view moves is by tracking the real player.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !playerPosition) return;
    if (!avatarRef.current) {
      const el = document.createElement("div");
      const root = ReactDOM.createRoot(el);
      avatarRef.current = { marker: new maplibregl.Marker({ element: el }).setLngLat([playerPosition.lng, playerPosition.lat]).addTo(map), root };
    } else {
      avatarRef.current.marker.setLngLat([playerPosition.lng, playerPosition.lat]);
    }
    avatarRef.current.root.render(<PlayerAvatar heading={playerPosition.heading} avatarModel={avatarModel} isMoving={playerPosition.isMoving} />);
    if (!interior) {
      if (!hasArrivedRef.current) {
        // The arrival sequence: camera flies smoothly from the wide establishing
        // view down into the real gameplay position — a deliberate moment, not an
        // instant snap. Bearing starts matching the real heading if known ("camera
        // starts behind the player"); if heading isn't known yet, bearing is left
        // as-is rather than guessing a direction.
        hasArrivedRef.current = true;
        isAnimatingRef.current = true;
        map.flyTo({
          center: [playerPosition.lng, playerPosition.lat], zoom: DEFAULT_ZOOM, pitch: 72,
          bearing: playerPosition.heading != null ? playerPosition.heading : map.getBearing(),
          duration: 2600, essential: true,
        });
        // Safety net: if anything (a touch, another effect) still knocked the
        // pitch off target during the animation, correct it once flyTo's
        // duration has elapsed rather than leaving the camera stuck flatter
        // than intended.
        setTimeout(() => { if (mapRef.current && Math.abs(mapRef.current.getPitch() - 72) > 1) mapRef.current.setPitch(72); }, 2700);
      } else {
        // Only follows (recenters) while not inside a specific entity's interior
        // scene, and not in World Builder free-roam — walking around shouldn't
        // yank you out of something you're viewing, and free-roam shouldn't keep
        // snapping back to your real position while you're deliberately exploring
        // away from it.
        if (!worldBuilderActive) map.easeTo({ center: [playerPosition.lng, playerPosition.lat], duration: 800 });
      }
    }
  }, [playerPosition, mapReady, interior, avatarModel, worldBuilderActive]);

  // A deliberate "jump to address" always moves the camera, even during World
  // Builder free-roam — the free-roam guard above is specifically meant to stop
  // routine GPS updates from yanking the camera around while you're deliberately
  // exploring elsewhere, but an explicit jump is the opposite: you asked for the
  // camera to go there. jumpTrigger (a counter, not the position itself) is what
  // distinguishes "this changed because you jumped" from every other reason
  // playerPosition might update.
  useEffect(() => {
    if (!jumpTrigger || !mapRef.current || !playerPosition) return;
    mapRef.current.flyTo({ center: [playerPosition.lng, playerPosition.lat], duration: 1200 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTrigger]);

  function flyTo(lng, lat, targetZoom, pitch) {
    if (!mapRef.current) return;
    isAnimatingRef.current = true;
    mapRef.current.flyTo({ center: [lng, lat], zoom: targetZoom, pitch: pitch ?? mapRef.current.getPitch(), duration: 600 });
  }
  function returnToDistrictView() {
    setInterior(null);
    // Never fully flattens — "always feel tilted, Pokémon GO style" even at the
    // widest allowed overview, not a top-down map-app view.
    flyTo(homeBase.lng, homeBase.lat, DEFAULT_ZOOM, 65);
  }
  function enterEntity(e) {
    if (e.kind === "idea") { onShowIdeas(); return; }
    if (e.isCollectible) { onCollectDrop?.(e); return; }
    flyTo(e.lng, e.lat, LOD_INTERIOR + 0.5, 78); // near-horizon, immersive tilt right up close
    setInterior(e);
  }

  // Rebuild markers whenever the entities, tier, or map readiness changes. Entity
  // counts here are small (tens, not thousands) — a full rebuild each time is simple
  // and correct, not a real performance concern at this scale.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markersRef.current.forEach(({ marker, root }) => { root.unmount(); marker.remove(); });
    markersRef.current = [];

    districts.forEach(d => {
      const dColor = T[d.colorKey];
      d.entities.forEach(e => {
        const el = document.createElement("div");
        const root = ReactDOM.createRoot(el);
        const markerCategory = getMarkerCategory(e);
        if (tier === "district") {
          // District tier: a small color-coded dot per category — real geography
          // doesn't have floating fictional circles, but the category/count concept
          // is preserved as color + the legend panel below, not silently dropped.
          root.render(
            <button onClick={() => flyTo(e.lng, e.lat, LOD_DISTRICT + 1, 72)} style={{ width: 16, height: 16, borderRadius: "50%",
              background: dColor, border: "2px solid #fff", boxShadow: "0 1px 4px #0008" }} />
          );
        } else if (markerCategory) {
          root.render(<CustomCategoryMarker category={markerCategory} label={e.name} selected={e.id === interior?.id} onClick={() => enterEntity(e)} />);
        } else {
          root.render(<EntityPin entity={e} onClick={() => enterEntity(e)} />);
        }
        const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([e.lng, e.lat]).addTo(map);
        markersRef.current.push({ marker, root });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [districts, tier, mapReady, interior]);

  return (
    <div style={{ position: "relative", height: "100%", width: "100%",
      background: night ? "#1B3A5C" : "#6EB5E8" }}>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />

      {/* district-tier legend — the count/label information the old floating circles
          used to carry, now a real overlay panel instead of fictional map geometry */}
      {tier === "district" && (
        <div style={{ position: "absolute", top: 64, left: 10, background: "#00000090", backdropFilter: "blur(6px)", borderRadius: 10,
          padding: "8px 10px", display: "flex", flexDirection: "column", gap: 4 }}>
          {districts.map(d => (
            <div key={d.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: T[d.colorKey] }} />
              <span style={{ fontFamily: head, fontSize: 10.5, fontWeight: 700, color: "#fff" }}>{d.label} · {d.entities.length}</span>
            </div>
          ))}
        </div>
      )}

      {/* interior takeover — unchanged from before, a real third tier, not a modal */}
      {tier === "interior" && interior && (
        <InteriorScene entity={interior} onExit={() => { setInterior(null); flyTo(interior.lng, interior.lat, LOD_DISTRICT + 3); }}
          onOpenFull={() => onSelect(interior)} />
      )}

      {/* zoom controls — same custom styling as before, now calling the real map */}
      {tier !== "interior" && (
        <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => mapRef.current?.zoomIn()} style={{ width: 34, height: 34, borderRadius: 8, background: "#00000088", border: "1px solid #ffffff33", color: "#fff", fontSize: 16 }}>+</button>
          <button onClick={() => mapRef.current?.zoomOut()} style={{ width: 34, height: 34, borderRadius: 8, background: "#00000088", border: "1px solid #ffffff33", color: "#fff", fontSize: 16 }}>−</button>
          {tier !== "district" && (
            <button onClick={returnToDistrictView} style={{ width: 34, height: 34, borderRadius: 8, background: "#00000088", border: "1px solid #ffffff33", color: "#fff", fontSize: 13 }}>⌂</button>
          )}
        </div>
      )}

      <div style={{ position: "absolute", top: 64, right: 10, background: "#00000088", border: "1px solid #ffffff22",
        borderRadius: 8, padding: "3px 9px", fontFamily: head, fontSize: 9.5, fontWeight: 700, color: "#fff" }}>
        {tier === "district" ? "DISTRICT VIEW" : tier === "building" ? "BUILDING VIEW" : "INTERIOR"}
      </div>
    </div>
  );
}
function mono_body() { return "'JetBrains Mono', monospace"; }
function EntityPin({ entity, onClick }) {
  const Icon = entity.icon || PinIcon; // never crash the whole app over one missing icon reference
  return (
    <button onClick={onClick} style={{ position: "absolute", left: entity.worldX, top: entity.worldY,
      transform: "translate(-50%,-50%)", display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div style={{ position: "relative", width: 40, height: 40, borderRadius: "50%", background: "#fffaf0",
        border: `2.5px solid ${entity.color}`, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px #0008" }}>
        <Icon size={17} color={entity.color} />
        {entity.sim && <span style={{ position: "absolute", top: -5, right: -5, background: T.purple, color: "#fff",
          fontFamily: head, fontSize: 6.5, fontWeight: 800, borderRadius: 5, padding: "1px 3px" }}>SIM</span>}
      </div>
      <div style={{ background: "#00000099", borderRadius: 6, padding: "2px 6px", maxWidth: 80 }}>
        <div style={{ fontFamily: head, fontWeight: 700, fontSize: 8, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entity.name}</div>
      </div>
    </button>
  );
}
// The third LOD tier: an inline scene, not a modal — this is what "zoomed all the way in" means.
function InteriorScene({ entity, onExit, onOpenFull }) {
  const Icon = entity.icon || PinIcon;
  return (
    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,#241a10,#100b06)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center" }}>
      <div style={{ width: 74, height: 74, borderRadius: "50%", background: "#fffaf0", border: `3px solid ${entity.color}`,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
        <Icon size={30} color={entity.color} />
      </div>
      <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18, color: "#fff" }}>{entity.name}</div>
      <div style={{ fontFamily: mono_body(), fontSize: 11, color: "#ffffff99", marginTop: 3 }}>
        {entity.kind === "person" ? entity.type : entity.kind === "milestone" ? "Milestone event" : entity.kind === "opportunity" ? entity.tag : "Place"}
      </div>
      {(entity.needs || entity.note) && (
        <div style={{ marginTop: 12, maxWidth: 260, fontFamily: "'Nunito',sans-serif", fontSize: 13, color: "#ffffffcc", lineHeight: 1.5 }}>
          {entity.needs || entity.note}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 18 }}>
        <button onClick={onOpenFull} style={{ padding: "10px 16px", borderRadius: 10, border: "none",
          background: T.gold, color: T.ink, fontFamily: head, fontWeight: 700, fontSize: 12.5 }}>Open full details</button>
        <button onClick={onExit} style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #ffffff44",
          background: "transparent", color: "#fff", fontFamily: head, fontWeight: 700, fontSize: 12.5 }}>Step back out</button>
      </div>
    </div>
  );
}
function MapBackground() {
  // Candy Land-style board: a bright winding path of alternating candy-colored
  // spaces, with lollipops and gumdrops scattered around instead of trees.
  const spaceColors = ["#FF5B7A", "#FF9F45", "#FFD447", "#7ED957", "#4FC3F7", "#B57EDC"];
  const spacePts = [];
  const pathD = "M 40 40 Q 130 90 190 55 T 340 90 Q 300 210 210 250 Q 120 290 70 250 Q 30 180 40 40";
  // sample points evenly along a smooth loop for the candy spaces (approximate, not exact arc-length)
  const raw = [[40,40],[80,58],[130,90],[160,72],[190,55],[230,60],[270,75],[310,85],[340,90],
    [325,140],[300,180],[270,215],[230,240],[190,258],[150,270],[110,262],[75,235],[50,190],[40,120],[40,40]];
  raw.forEach((p, i) => spacePts.push({ x: p[0], y: p[1], color: spaceColors[i % spaceColors.length] }));

  return (
    <svg viewBox="0 0 400 360" width="100%" height="100%" style={{ display: "block", position: "absolute", inset: 0 }}>
      <defs>
        <linearGradient id="candysky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFD9EC" /><stop offset="0.5" stopColor="#D6E9FF" /><stop offset="1" stopColor="#FFF3C4" />
        </linearGradient>
      </defs>
      <rect width="400" height="360" fill="url(#candysky)" />

      {/* the winding candy path, cream road with a soft shadow */}
      <path d={pathD} fill="none" stroke="#FFF7E8" strokeWidth="22" strokeLinecap="round" opacity="0.95" />
      <path d={pathD} fill="none" stroke="#F0567A22" strokeWidth="26" strokeLinecap="round" opacity="0.3" />

      {/* alternating candy-colored spaces along the path */}
      {spacePts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="9" fill={p.color} stroke="#fff" strokeWidth="2" />
        </g>
      ))}

      {/* lollipops and gumdrops scattered around, standing in for trees */}
      {[[35,300,"#FF5B7A"],[100,320,"#4FC3F7"],[340,300,"#FFD447"],[365,230,"#B57EDC"],[20,150,"#7ED957"]].map((t,i)=>(
        <g key={"lolly"+i} transform={`translate(${t[0]},${t[1]})`}>
          <line x1="0" y1="0" x2="0" y2="20" stroke="#e8d9b5" strokeWidth="3" strokeLinecap="round" />
          <circle cx="0" cy="-8" r="13" fill={t[2]} stroke="#fff" strokeWidth="2.5" />
          <path d={`M -6 -8 A 6 6 0 0 1 6 -8`} fill="none" stroke="#ffffff88" strokeWidth="2" />
        </g>
      ))}
      {[[60,20,"#FF9F45"],[280,335,"#FF5B7A"],[380,60,"#7ED957"]].map((t,i)=>(
        <g key={"gum"+i} transform={`translate(${t[0]},${t[1]})`}>
          <path d="M -12 8 A 12 12 0 0 1 12 8 Z" fill={t[2]} stroke="#fff" strokeWidth="2" />
        </g>
      ))}
    </svg>
  );
}
function MapNodePin({ node, onClick }) {
  const Icon = node.icon;
  return (
    <button onClick={onClick} style={{ position: "absolute", left: `${node.pos.x}%`, top: `${node.pos.y}%`,
      transform: "translate(-50%,-50%)", background: "none", border: "none",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: 36, height: 36, borderRadius: "50%", background: "#fffaf0", border: `2.5px solid ${node.color}`,
        display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 6px #0006" }}>
        <Icon size={16} color={node.color} />
        {node.sim && (
          <span style={{ position: "absolute", top: -5, right: -5, background: T.purple, color: "#fff",
            fontFamily: head, fontSize: 6.5, fontWeight: 800, borderRadius: 5, padding: "1px 3px" }}>SIM</span>
        )}
      </div>
      <div style={{ background: T.parchment, border: `1.5px solid ${T.wood}`, borderRadius: 8, padding: "3px 7px",
        boxShadow: "0 2px 4px #0004", maxWidth: 92, textAlign: "center" }}>
        <div style={{ fontFamily: head, fontWeight: 800, fontSize: 8.5, color: T.textDark, lineHeight: 1.1 }}>{node.name}</div>
      </div>
    </button>
  );
}

/* ---- unified node detail sheet: switches on node.kind ---- */
function NodeSheet({ node, onClose, onLogInteraction, onTrack, onDismiss, onRequestDelete, onEdit, onAddDetail }) {
  const Icon = node.icon;
  const editable = node.kind === "person" || node.kind === "place" || node.kind === "milestone";
  const deletable = editable;
  const readiness = node.requirements ? computeReadiness(node.requirements) : null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000c0", zIndex: 95, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
        <Scroll style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 18, maxHeight: "80vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div style={{ width: 46, height: 46, borderRadius: "50%", background: "#fffaf0", border: `2.5px solid ${node.color}`,
                display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={19} color={node.color} /></div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <div style={{ fontFamily: head, fontWeight: 800, fontSize: 16 }}>{node.name}</div>
                  {node.sim && <span style={{ fontFamily: head, fontSize: 8.5, fontWeight: 800, letterSpacing: 0.5,
                    color: "#fff", background: T.purple, padding: "2px 7px", borderRadius: 6 }}>SIM</span>}
                </div>
                <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>
                  {node.kind === "person" ? node.type : node.kind === "milestone" ? "Milestone event" :
                    node.kind === "opportunity" ? node.tag : "Place"}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {editable && (
                <button onClick={() => onEdit(node)} style={{ background: "none", border: "none" }}><Edit3 size={17} color={T.blue} /></button>
              )}
              {deletable && (
                <button onClick={() => onRequestDelete(node)} style={{ background: "none", border: "none" }}><Trash2 size={18} color={T.rose} /></button>
              )}
              <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={20} color={T.textDark} /></button>
            </div>
          </div>

          {node.kind === "person" && (
            <>
              {(node.metContext || (node.connections && node.connections.length > 0)) && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
                  {node.metContext && (
                    <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630" }}>
                      <b style={{ color: T.wood }}>Met:</b> {node.metContext}
                    </div>
                  )}
                  {node.connections && node.connections.length > 0 && (
                    <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630" }}>
                      <b style={{ color: T.wood }}>Connected to:</b> {node.connections.join(", ")}
                    </div>
                  )}
                </div>
              )}
              {node.backstory && (
                <div style={{ fontFamily: body, fontSize: 12.5, fontStyle: "italic", color: "#5b4630", marginTop: 10, lineHeight: 1.4 }}>
                  {node.backstory}
                </div>
              )}
              {node.personality && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#00000010" }}>
                  <div style={{ fontFamily: head, fontSize: 9, fontWeight: 700, color: T.wood }}>WHAT YOU'VE NOTICED</div>
                  {generatePublicProfile(node.personality, node.relationshipMetrics).map((line, i) => (
                    <div key={i} style={{ fontFamily: body, fontSize: 12.5, marginTop: i === 0 ? 4 : 3, lineHeight: 1.4 }}>• {line}</div>
                  ))}
                  <div style={{ fontFamily: body, fontSize: 9.5, color: "#8a7350", marginTop: 6, fontStyle: "italic" }}>
                    More reveals itself the better you know them.
                  </div>
                </div>
              )}
              {node.temperament && (
                <div style={{ display: "inline-block", marginTop: 8, padding: "3px 9px", borderRadius: 20,
                  background: `${T.purple}22`, border: `1px solid ${T.purple}55`, fontFamily: head, fontSize: 10, fontWeight: 700, color: "#4a3568" }}>
                  {node.temperament}
                </div>
              )}
              <div style={{ marginTop: 14 }}>
                <StatRow label="Trust" value={node.trust} color={node.color} />
                <StatRow label="Interest" value={node.interest} color={T.gold} />
              </div>
              <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>Last contact: {node.lastInteraction}</div>
              <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#00000010" }}>
                <div style={{ fontFamily: head, fontSize: 9, fontWeight: 700, color: T.wood }}>CURRENT NEED</div>
                <div style={{ fontFamily: body, fontSize: 13, marginTop: 3 }}>{node.needs}</div>
              </div>
              <DetailsLog log={node.detailsLog} onAdd={text => onAddDetail(node, text)} />
              <button onClick={() => onLogInteraction(node.id)} style={{ width: "100%", marginTop: 14, padding: 12, borderRadius: 10,
                border: "none", background: node.color, color: "#fff", fontFamily: head, fontWeight: 700, fontSize: 13 }}>
                Log an interaction (+trust)
              </button>
            </>

          )}

          {node.kind === "place" && (
            <>
              {node.category && (
                <div style={{ display: "inline-block", marginTop: 10, padding: "3px 9px", borderRadius: 20,
                  background: `${node.color}22`, border: `1px solid ${node.color}55`, fontFamily: head, fontSize: 10, fontWeight: 700, color: node.color }}>
                  {node.category}
                </div>
              )}
              <div style={{ marginTop: 10, fontFamily: body, fontSize: 13.5, lineHeight: 1.5 }}>{node.note}</div>
              <DetailsLog log={node.detailsLog} onAdd={text => onAddDetail(node, text)} />
            </>
          )}

          {node.kind === "milestone" && (
            <>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {node.category && (
                  <span style={{ padding: "3px 9px", borderRadius: 20, background: `${node.color}22`,
                    border: `1px solid ${node.color}55`, fontFamily: head, fontSize: 10, fontWeight: 700, color: node.color }}>{node.category}</span>
                )}
                {node.budget && (
                  <span style={{ padding: "3px 9px", borderRadius: 20, background: `${T.green}22`,
                    border: `1px solid ${T.green}55`, fontFamily: head, fontSize: 10, fontWeight: 700, color: T.forestLight }}>{node.budget}</span>
                )}
              </div>
              {node.daysLeft != null && (
                <div style={{ marginTop: 10, fontFamily: head, fontWeight: 700, fontSize: 13, color: node.daysLeft <= 10 ? T.rose : T.textDark }}>
                  {node.daysLeft} days left
                </div>
              )}
              {node.requirements && node.requirements.length > 0 ? (
                <div style={{ marginTop: 12 }}>
                  <div style={{ background: "#00000012", borderRadius: 10, padding: "10px 12px", marginBottom: 12,
                    display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1, color: T.wood }}>READINESS SCORE</div>
                      <div style={{ fontFamily: body, fontSize: 10, color: "#5b4630" }}>How ready you are for this specific target</div>
                    </div>
                    <div style={{ fontFamily: head, fontWeight: 800, fontSize: 22,
                      color: readiness.pct >= 75 ? T.green : T.gold }}>
                      {readiness.pct}%
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontFamily: head, fontSize: 11, fontWeight: 700, marginBottom: 5 }}>
                    <span>REQUIREMENTS</span>
                    <span>{readiness.met}/{readiness.total}</span>
                  </div>
                  <Bar pct={readiness.pct} color={T.green} track="#00000022" />
                  <div style={{ marginTop: 10 }}>
                    {node.requirements.map((r, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: i ? `1px solid ${T.wood}22` : "none" }}>
                        {r.met ? <CheckCircle2 size={16} color={T.green} /> : <X size={16} color={T.rose} />}
                        <span style={{ fontFamily: body, fontSize: 13, fontWeight: r.met ? 500 : 700 }}>{r.label}</span>
                        {r.detail && <span style={{ fontFamily: body, fontSize: 11, color: "#5b4630", marginLeft: "auto" }}>{r.detail}</span>}
                      </div>
                    ))}
                  </div>
                  {node.requirements.some(r => !r.met) && (
                    <div style={{ marginTop: 10, padding: 10, borderRadius: 10, background: "#00000010", fontFamily: body, fontSize: 12.5, lineHeight: 1.4 }}>
                      To move forward: <b>{node.requirements.find(r => !r.met).label}</b> is what's standing between you and eligibility.
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 10, fontFamily: body, fontSize: 13, lineHeight: 1.5 }}>{node.note || "No requirements tracked yet."}</div>
              )}
              <DetailsLog log={node.detailsLog} onAdd={text => onAddDetail(node, text)} />
            </>
          )}

          {node.kind === "opportunity" && (
            <>
              <div style={{ fontFamily: body, fontSize: 12.5, color: "#5b4630", marginTop: 8, lineHeight: 1.5 }}>{node.note}</div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, fontFamily: body, fontSize: 12, fontWeight: 700 }}>
                <span style={{ color: T.forestLight }}>{node.budget}</span>
              </div>
              <a href={node.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center", gap: 4,
                marginTop: 8, fontFamily: body, fontSize: 11, color: T.blue, fontWeight: 700, textDecoration: "none" }}>
                <ChevronRight size={12} /> Source: {node.source} ↗
              </a>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => onTrack(node)} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
                  background: T.green, color: "#fff", fontFamily: head, fontWeight: 700, fontSize: 12 }}>Track</button>
                <button onClick={() => onDismiss(node.id)} style={{ flex: 1, padding: "10px 0", borderRadius: 9,
                  border: `2px solid ${T.wood}`, background: "transparent", color: T.textDark, fontFamily: head, fontWeight: 700, fontSize: 12 }}>Not now</button>
              </div>
            </>
          )}
        </Scroll>
      </div>
    </div>
  );
}
function EditSheet({ node, form, setForm, onClose, onSave }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000c0", zIndex: 97, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
        <Scroll style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 18, maxHeight: "85vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 17 }}>✏️ Edit {node.name}</div>
            <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={20} color={T.textDark} /></button>
          </div>

          {node.kind === "person" && (
            <>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} />
              <FormInput label="Role" value={form.role} onChange={v => set("role", v)} />
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1 }}><FormInput label="Trust (0-100)" value={form.trust} onChange={v => set("trust", v)} type="number" /></div>
                <div style={{ flex: 1 }}><FormInput label="Interest (0-100)" value={form.interest} onChange={v => set("interest", v)} type="number" /></div>
              </div>
              <FormInput label="Where did you meet them?" value={form.met} onChange={v => set("met", v)} />
              <FormInput label="Connected to (comma-separated)" value={form.connections} onChange={v => set("connections", v)} />
              <FormInput label="Current need" value={form.note} onChange={v => set("note", v)} area />
              <FormInput label="Other details" value={form.details} onChange={v => set("details", v)} area />
            </>
          )}
          {node.kind === "place" && (
            <>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} />
              <ChipSelect label="Category" options={PLACE_CATEGORIES.map(c => ({ key: c.key, label: c.label }))}
                value={PLACE_CATEGORIES.find(c => c.label === form.category)?.key || ""} onChange={v => set("category", PLACE_CATEGORIES.find(c => c.key === v)?.label || v)} />
              <FormInput label="Note" value={form.note} onChange={v => set("note", v)} area />
              <FormInput label="Other details" value={form.details} onChange={v => set("details", v)} area />
            </>
          )}
          {node.kind === "milestone" && (
            <>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} />
              <ChipSelect label="Category" options={EVENT_CATEGORIES.map(c => ({ key: c.key, label: c.label }))}
                value={EVENT_CATEGORIES.find(c => c.label === form.category)?.key || ""} onChange={v => set("category", EVENT_CATEGORIES.find(c => c.key === v)?.label || v)} />
              <FormInput label="Days until it matters" value={form.days} onChange={v => set("days", v)} type="number" />
              <FormInput label="Budget or value" value={form.budget} onChange={v => set("budget", v)} />
              <FormInput label="Note" value={form.note} onChange={v => set("note", v)} area />
              <FormInput label="Other details" value={form.details} onChange={v => set("details", v)} area />
              <div style={{ fontFamily: body, fontSize: 10.5, color: "#8a7350", marginBottom: 8 }}>
                Requirements checklists aren't editable here yet — only the basics.
              </div>
            </>
          )}
          <SubmitBtn onClick={onSave} label="Save changes" disabled={!form.name} />
        </Scroll>
      </div>
    </div>
  );
}
function ConfirmDeleteModal({ node, onCancel, onConfirm }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000c8", zIndex: 99, display: "flex",
      alignItems: "center", justifyContent: "center", padding: 24 }} onClick={onCancel}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 340 }}>
        <Scroll style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 26 }}>🗑️</div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 16, marginTop: 6 }}>Remove {node.name}?</div>
          <div style={{ fontFamily: body, fontSize: 12.5, color: "#5b4630", marginTop: 6, lineHeight: 1.4 }}>
            This removes them from your map for good. This can't be undone.
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={onCancel} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: `2px solid ${T.wood}`,
              background: "transparent", color: T.textDark, fontFamily: head, fontWeight: 700, fontSize: 13 }}>Cancel</button>
            <button onClick={onConfirm} style={{ flex: 1, padding: "11px 0", borderRadius: 10, border: "none",
              background: T.rose, color: "#fff", fontFamily: head, fontWeight: 700, fontSize: 13 }}>Remove</button>
          </div>
        </Scroll>
      </div>
    </div>
  );
}
function IdeasSheet({ ideas, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000c0", zIndex: 95, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
        <Scroll style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 18, maxHeight: "75vh", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 17 }}>💡 Ideas</div>
            <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={20} color={T.textDark} /></button>
          </div>
          {ideas.length === 0 && <div style={{ fontFamily: body, fontSize: 13, color: "#5b4630" }}>Nothing saved yet — use + to add one.</div>}
          {ideas.map(idea => (
            <div key={idea.id} style={{ padding: "10px 0", borderTop: `1px solid ${T.wood}22` }}>
              <div style={{ fontFamily: body, fontSize: 13.5, lineHeight: 1.4 }}>{idea.text}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                {idea.tags.map(t => (
                  <span key={t} style={{ fontFamily: head, fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                    background: `${T.gold}30`, color: T.wood }}>{t}</span>
                ))}
                <span style={{ fontFamily: body, fontSize: 10, color: "#8a7350", marginLeft: "auto" }}>{idea.date}</span>
              </div>
            </div>
          ))}
        </Scroll>
      </div>
    </div>
  );
}

/* ================= QUESTS / COMMAND BOARD ================= */
function Quests_({ quests, onToggle }) {
  const groups = [
    { key: "primary", label: "Primary Objective", color: T.green },
    { key: "secondary", label: "Secondary", color: T.gold },
    { key: "optional", label: "Optional", color: T.textMuted },
    { key: "ignore", label: "Ignore", color: "#6b5a3f" },
  ];
  return (
    <div style={{ padding: "18px 14px" }}>
      <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20 }}>⚔ Command Board</div>
      <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, marginTop: 2 }}>Not a to-do list. Your strategy for today.</div>
      {groups.map(g => {
        const items = quests.filter(q => q.tier === g.key);
        if (!items.length) return null;
        return (
          <div key={g.key} style={{ marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: g.color }} />
              <span style={{ fontFamily: head, fontSize: 12, fontWeight: 700, letterSpacing: .5 }}>{g.label}</span>
            </div>
            {items.map(q => {
              const Icon = q.icon;
              return (
                <Scroll key={q.id} style={{ padding: 12, marginBottom: 10, opacity: g.key === "ignore" ? 0.65 : 1 }}>
                  <div style={{ display: "flex", gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 9, background: `${q.color}22`, border: `2px solid ${q.color}`,
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon size={16} color={q.color} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: head, fontWeight: 700, fontSize: 13.5 }}>{q.title}</div>
                      <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630", marginTop: 3 }}>{q.reasoning || q.why}</div>
                      <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontFamily: head, fontSize: 9, fontWeight: 700, color: q.color }}>{q.tag}</span>
                        <span style={{ fontFamily: body, fontSize: 10, color: T.wood, fontWeight: 700 }}>REWARD: {q.ev}</span>
                      </div>
                      {q.sourceUrl && (
                        <a href={q.sourceUrl} target="_blank" rel="noopener noreferrer" style={{ display: "flex", alignItems: "center",
                          gap: 4, marginTop: 6, fontFamily: body, fontSize: 10.5, color: T.blue, textDecoration: "none", fontWeight: 700 }}>
                          <ChevronRight size={11} /> Apply at {q.source} ↗
                        </a>
                      )}
                    </div>
                    <button onClick={() => onToggle(q.id)} style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0,
                      border: `2px solid ${T.wood}`, background: q.done ? T.green : "transparent",
                      display: "flex", alignItems: "center", justifyContent: "center" }}>{q.done && <Check size={15} color="#fff" />}</button>
                  </div>
                </Scroll>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

/* ================= PROFILE ================= */
function Profile_({ confidence, onQuickAccess, skills, levels, generatedCount, onClearGenerated, xp = 0, unlockedAchievements = [], playerMode = "creator", isAdmin = false, onEnterWorldBuilder }) {
  const meta = { Career: Briefcase, Inventory: ImageIcon, Finances: DollarSign, Relationships: Users, Health: Heart, Time: Clock };
  const profileLevel = computeProfileLevel(xp);
  const badge = currentBadge(profileLevel.level);
  return (
    <div style={{ padding: "18px 14px" }}>
      <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20 }}>📜 Profile</div>

      <Scroll style={{ padding: 14, marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15 }}>{badge.icon} {badge.name}</div>
            <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>Participation Level {profileLevel.level} · {xp} XP total</div>
          </div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20, color: T.gold }}>{unlockedAchievements.length}</div>
        </div>
        {profileLevel.xpForNextLevel != null && (
          <div style={{ marginTop: 8 }}>
            <Bar pct={(profileLevel.xpIntoLevel / profileLevel.xpForNextLevel) * 100} color={T.gold} track="#00000022" h={5} />
            <div style={{ fontFamily: body, fontSize: 9.5, color: "#8a7350", marginTop: 3 }}>
              {profileLevel.xpForNextLevel - profileLevel.xpIntoLevel} XP to next level — earned through real participation: quests, gallery visits, events, exhibiting work.
            </div>
          </div>
        )}
      </Scroll>

      {playerMode === "creator" ? (
        <>
          <div style={{ margin: "14px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>CONFIDENCE METER</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {Object.entries(confidence).map(([k, v]) => {
              const Icon = meta[k];
              return (
                <Scroll key={k} style={{ padding: "10px 6px", textAlign: "center" }}>
                  <Icon size={16} color={T.wood} style={{ margin: "0 auto" }} />
                  <div style={{ fontFamily: head, fontSize: 9, fontWeight: 700, marginTop: 4 }}>{k}</div>
                  <div style={{ fontFamily: head, fontWeight: 800, fontSize: 14 }}>{v}%</div>
                  <Bar pct={v} color={T.green} track="#00000022" h={4} />
                </Scroll>
              );
            })}
          </div>
          <div style={{ margin: "18px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>SKILLS</div>
          <Scroll style={{ padding: 14 }}>
            {skills.map(s => (
              <div key={s.k} style={{ marginBottom: 11 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontFamily: body, fontSize: 12, fontWeight: 700, marginBottom: 3 }}>
                  <span>{s.label}</span><span style={{ color: "#5b4630" }}>Lv.{s.level} · {s.xp}/{s.need}</span>
                </div>
                <Bar pct={(s.xp / s.need) * 100} color={s.color} track="#00000022" />
              </div>
            ))}
          </Scroll>
          <div style={{ margin: "18px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>
            CAREER PATH <span style={{ fontWeight: 500, color: "#c9a75a" }}>· Universal Levels</span>
          </div>
          <div style={{ fontFamily: body, fontSize: 11, color: T.textMuted, margin: "-4px 0 8px" }}>
            Everyone climbs the same ladder. A level is earned by evidence, not by time spent in the app.
          </div>
          <Scroll style={{ padding: 14 }}>
            {levels.map((t, i) => (
              <div key={t.n} style={{ display: "flex", gap: 10, opacity: t.state === "locked" ? 0.55 : 1 }}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 24 }}>
                  <div style={{ width: 22, height: 22, borderRadius: "50%",
                    background: t.state === "done" ? T.green : t.state === "current" ? T.gold : "#00000015",
                    display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {t.state === "done" ? <CheckCircle2 size={13} color="#fff" /> : t.state === "locked" ? <Lock size={11} color={T.textDark} /> :
                      <span style={{ fontFamily: head, fontSize: 10, fontWeight: 800 }}>{t.n}</span>}
                  </div>
                  {i < levels.length - 1 && <div style={{ width: 2, flex: 1, minHeight: 18, background: T.wood, opacity: 0.4, marginTop: 2 }} />}
                </div>
                <div style={{ paddingBottom: 14, flex: 1 }}>
                  <div style={{ fontFamily: head, fontWeight: 700, fontSize: 13.5 }}>{t.n}. {t.title}</div>
                  <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>{t.sub}</div>
                  {t.state === "current" && (
                    <div style={{ marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: head, fontSize: 10, fontWeight: 700, marginBottom: 3 }}>
                        <span>LEVEL XP</span><span>{t.xp} / {t.xpNeed} · {Math.round(t.xp / t.xpNeed * 100)}%</span>
                      </div>
                      <Bar pct={(t.xp / t.xpNeed) * 100} color={T.gold} track="#00000022" />
                      <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 6 }}>
                        {computeCategoryProgress(t.categories).categories.map(c => (
                          <div key={c.name}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: body, fontSize: 10.5, fontWeight: 700 }}>
                              <span>{c.name}</span><span>{c.met}/{c.total}</span>
                            </div>
                            <Bar pct={c.pct} color={c.complete ? T.green : T.wood} track="#00000018" h={5} />
                          </div>
                        ))}
                      </div>
                      <div style={{ fontFamily: body, fontSize: 10.5, color: "#5b4630", marginTop: 6, fontStyle: "italic" }}>
                        Different disciplines clear these differently — a mural artist and a gallery painter can both reach Level 5 through different work.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </Scroll>
        </>
      ) : (
        <>
          <div style={{ margin: "14px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>ACHIEVEMENTS</div>
          <Scroll style={{ padding: 14 }}>
            {unlockedAchievements.length === 0 && (
              <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 10 }}>
                Nothing unlocked yet — get out there and explore.
              </div>
            )}
            {unlockedAchievements.map(id => {
              const a = ACHIEVEMENTS.find(x => x.id === id);
              if (!a) return null;
              return (
                <div key={id} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: `1px solid ${T.wood}22` }}>
                  <div style={{ fontSize: 18 }}>🏆</div>
                  <div>
                    <div style={{ fontFamily: head, fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                    <div style={{ fontFamily: body, fontSize: 11, color: "#5b4630" }}>{a.description}</div>
                  </div>
                </div>
              );
            })}
          </Scroll>
        </>
      )}
      <div style={{ margin: "18px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>QUICK ACCESS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {(playerMode === "creator"
          ? [["Inventory", ImageIcon], ["Calendar", Calendar], ["Finances", DollarSign], ["Training", Dumbbell], ["System", Activity], ["Opportunities", Trophy]]
          : [["Calendar", Calendar], ["System", Activity], ["Opportunities", Trophy]]
        ).map(([label, Icon]) => (
          <button key={label} onClick={() => onQuickAccess(label)} style={{ background: T.panel, border: `2px solid ${T.wood}`,
            borderRadius: 12, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <Icon size={16} color={T.gold} /><span style={{ fontFamily: head, fontSize: 10, fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>
      {generatedCount > 0 && (
        <>
          <div style={{ margin: "18px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>CLEANUP</div>
          <div style={{ background: T.panel, border: `2px solid ${T.wood}`, borderRadius: 12, padding: 12 }}>
            <div style={{ fontFamily: body, fontSize: 12, color: T.textCream, lineHeight: 1.5 }}>
              Simulated NPCs are removed in this version — this app is built around the real Atlanta arts scene. You still have some simulated content from an earlier session.
            </div>
            <button onClick={onClearGenerated} style={{ width: "100%", marginTop: 10, padding: 11, borderRadius: 10,
              border: `2px solid ${T.rose}`, background: "transparent", color: T.rose, fontFamily: head, fontWeight: 700, fontSize: 13 }}>
              Remove {generatedCount} simulated {generatedCount === 1 ? "item" : "items"}
            </button>
          </div>
        </>
      )}
      {isAdmin && (
        <button onClick={onEnterWorldBuilder}
          style={{ width: "100%", marginTop: 18, padding: 12, borderRadius: 11, border: `2px solid ${T.wood}`,
          background: "transparent", color: T.textCream, fontFamily: head, fontWeight: 700, fontSize: 13,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          🛠 World Builder
        </button>
      )}
      <button onClick={() => signOutUser().catch(() => {})} style={{ width: "100%", marginTop: 18, padding: 12,
        borderRadius: 11, border: `2px solid ${T.rose}66`, background: "transparent", color: T.rose,
        fontFamily: head, fontWeight: 700, fontSize: 13 }}>
        Sign out
      </button>
    </div>
  );
}

/* ================= ADD SHEET (the + button — a real chooser now) ================= */
function AddSheet({ mode, setMode, form, setForm, debriefText, setDebriefText, onClose, onSubmitAdd, onSubmitDebrief }) {
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const back = () => setMode("choose");

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000c0", zIndex: 96, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", maxWidth: 480 }}>
        <Scroll style={{ borderBottomLeftRadius: 0, borderBottomRightRadius: 0, padding: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {mode !== "choose" && (
                <button onClick={back} style={{ background: "none", border: "none" }}><ChevronLeft size={20} color={T.textDark} /></button>
              )}
              <div style={{ fontFamily: head, fontWeight: 800, fontSize: 17 }}>
                {mode === "choose" ? "Add to your world" : mode === "debrief" ? "📖 What happened?" :
                  mode === "person" ? "🧑 Add a person" : mode === "place" ? "📍 Add a place" :
                  mode === "event" ? "🚩 Add an event" : "💡 Save an idea"}
              </div>
            </div>
            <button onClick={onClose} style={{ background: "none", border: "none" }}><X size={20} color={T.textDark} /></button>
          </div>

          {mode === "choose" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[["debrief", "📖", "Debrief", "What happened today"], ["person", "🧑", "Person", "A contact or collector"],
                ["place", "📍", "Place", "A venue or studio"], ["event", "🚩", "Event", "A festival or deadline"],
                ["idea", "💡", "Idea", "Save a spark"]].map(([key, emoji, label, sub]) => (
                <button key={key} onClick={() => setMode(key)} style={{ background: T.parchmentDark, border: `2px solid ${T.wood}`,
                  borderRadius: 12, padding: "14px 10px", textAlign: "left" }}>
                  <div style={{ fontSize: 20 }}>{emoji}</div>
                  <div style={{ fontFamily: head, fontWeight: 800, fontSize: 14, marginTop: 4 }}>{label}</div>
                  <div style={{ fontFamily: body, fontSize: 10.5, color: "#5b4630" }}>{sub}</div>
                </button>
              ))}
            </div>
          )}

          {mode === "debrief" && (
            <>
              <div style={{ fontFamily: body, fontSize: 12, color: "#5b4630", marginBottom: 10 }}>Tell me naturally, like recapping to a friend.</div>
              <textarea value={debriefText} onChange={e => setDebriefText(e.target.value)} rows={3}
                placeholder="e.g. Finished the painting, met a gallery owner, spent $180 on supplies…"
                style={{ width: "100%", background: "#fffaf0", border: `2px solid ${T.wood}`, borderRadius: 10, padding: 12, color: T.textDark, fontSize: 14, outline: "none", resize: "none" }} />
              <button onClick={onSubmitDebrief} style={{ width: "100%", marginTop: 14, padding: 13, borderRadius: 11, border: "none",
                background: T.gold, color: T.ink, fontFamily: head, fontWeight: 800, fontSize: 14 }}>Log it</button>
              <div style={{ fontFamily: body, fontSize: 10, color: "#8a7350", textAlign: "center", marginTop: 9 }}>This actually asks the AI to read what happened — if the connection ever fails, it quietly falls back to simple keyword matching instead.</div>
            </>
          )}

          {mode === "person" && (
            <>
              <div style={{ background: `${T.blue}18`, border: `1.5px solid ${T.blue}55`, borderRadius: 10,
                padding: "8px 11px", marginBottom: 12, fontFamily: body, fontSize: 11, color: "#2d4a68", lineHeight: 1.4 }}>
                Add a real person you've actually met — a gallerist, curator, fellow artist, collector, anyone in your real network.
              </div>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} placeholder="Their real name" />
              <FormInput label="Role" value={form.role} onChange={v => set("role", v)} placeholder="e.g. Collector, gallery owner, mentor, critic…" />
              <FormInput label="Where did you meet them?" value={form.met} onChange={v => set("met", v)} placeholder="e.g. Atlanta Art Fair, March 2027" />
              <FormInput label="Connected to (comma-separated names, if any)" value={form.connections} onChange={v => set("connections", v)} placeholder="e.g. Marcus, Gallery Aurora" />
              <FormInput label="What do they need or want right now?" value={form.note} onChange={v => set("note", v)} placeholder="Optional" />
              <FormInput label="Any other details" value={form.details} onChange={v => set("details", v)}
                placeholder="Anything worth remembering about them" area />
              <SubmitBtn onClick={onSubmitAdd} label="Add person" disabled={!form.name} />
            </>
          )}
          {mode === "place" && (
            <>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} placeholder="e.g. Whitespace Gallery" />
              <ChipSelect label="Category" options={PLACE_CATEGORIES.map(c => ({ key: c.key, label: c.label }))}
                value={form.category} onChange={v => set("category", v)} />
              <FormInput label="Note (optional)" value={form.note} onChange={v => set("note", v)} placeholder="Why does this place matter?" />
              <FormInput label="Any other details" value={form.details} onChange={v => set("details", v)}
                placeholder="Hours, vibe, who runs it, history…" area />
              <SubmitBtn onClick={onSubmitAdd} label="Add place" disabled={!form.name} />
            </>
          )}
          {mode === "event" && (
            <>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} placeholder="e.g. Decatur Arts Festival" />
              <ChipSelect label="Category" options={EVENT_CATEGORIES.map(c => ({ key: c.key, label: c.label }))}
                value={form.category} onChange={v => set("category", v)} />
              <FormInput label="Days until it matters" value={form.days} onChange={v => set("days", v)} placeholder="e.g. 21" type="number" />
              <FormInput label="Budget or value (optional)" value={form.budget} onChange={v => set("budget", v)} placeholder="e.g. $500 entry, or $6,000 commission" />
              <FormInput label="Note (optional)" value={form.note} onChange={v => set("note", v)} placeholder="What's the opportunity here?" />
              <FormInput label="Any other details" value={form.details} onChange={v => set("details", v)}
                placeholder="Location, who's involved, application steps…" area />
              <SubmitBtn onClick={onSubmitAdd} label="Add event" disabled={!form.name} />
            </>
          )}
          {mode === "idea" && (
            <>
              <FormInput label="What's the idea?" value={form.text} onChange={v => set("text", v)} placeholder="A visual, a phrase, a feeling…" area />
              <FormInput label="Tags (comma separated)" value={form.tags} onChange={v => set("tags", v)} placeholder="e.g. rust, gold, industrial" />
              <SubmitBtn onClick={onSubmitAdd} label="Save idea" disabled={!form.text} />
            </>
          )}
        </Scroll>
      </div>
    </div>
  );
}
function ChipSelect({ label, options, value, onChange }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: head, fontSize: 11, fontWeight: 700, color: T.wood, marginBottom: 6 }}>{label}</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o.key} onClick={() => onChange(value === o.key ? "" : o.key)} style={{
            padding: "6px 11px", borderRadius: 20, fontFamily: body, fontSize: 11.5, fontWeight: 700,
            border: `2px solid ${T.wood}`, background: value === o.key ? T.gold : "#fffaf0",
            color: value === o.key ? T.ink : T.textDark }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
function FormInput({ label, value, onChange, placeholder, type, area }) {
  const Comp = area ? "textarea" : "input";
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: head, fontSize: 11, fontWeight: 700, color: T.wood, marginBottom: 4 }}>{label}</div>
      <Comp value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type}
        rows={area ? 3 : undefined}
        style={{ width: "100%", background: "#fffaf0", border: `2px solid ${T.wood}`, borderRadius: 10,
          padding: 10, color: T.textDark, fontSize: 14, outline: "none", resize: area ? "none" : undefined }} />
    </div>
  );
}
function SubmitBtn({ onClick, label, disabled }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ width: "100%", marginTop: 6, padding: 13, borderRadius: 11, border: "none",
      background: disabled ? "#00000022" : T.gold, color: disabled ? T.textMuted : T.ink, fontFamily: head, fontWeight: 800, fontSize: 14 }}>
      {label}
    </button>
  );
}

function MultiChipSelect({ label, options, values, onChange, max }) {
  const toggle = key => {
    const has = values.includes(key);
    if (has) onChange(values.filter(v => v !== key));
    else if (!max || values.length < max) onChange([...values, key]);
  };
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontFamily: head, fontSize: 11, fontWeight: 700, color: T.wood, marginBottom: 6 }}>
        {label} {max && <span style={{ color: T.textMuted, fontWeight: 500 }}>(up to {max})</span>}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {options.map(o => (
          <button key={o.key} onClick={() => toggle(o.key)} style={{
            padding: "6px 11px", borderRadius: 20, fontFamily: body, fontSize: 11.5, fontWeight: 700,
            border: `2px solid ${T.wood}`, background: values.includes(o.key) ? T.gold : "#fffaf0",
            color: values.includes(o.key) ? T.ink : T.textDark }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ================= ONBOARDING — "Let's build your world" =================
   A short, structured interview, not a freeform AI chat — this is the very first
   thing a player does, and it's exactly the wrong place to risk AI misreading
   free text. Structured questions are boring but reliable, which matters most here. */
const SKILL_OPTIONS = SKILL_TEMPLATE.map(s => ({ key: s.k, label: s.label }));
const TIMELINE_OPTIONS = [
  { key: "1 year", label: "1 year" }, { key: "3 years", label: "3 years" },
  { key: "5 years", label: "5 years" }, { key: "10 years", label: "10 years" },
  { key: "No deadline", label: "No deadline" },
];
function Login_() {
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true); setErr("");
    try {
      if (mode === "signup") await signUpEmail(email, password);
      else await signInEmail(email, password);
      // No further action needed — onAuthChange (subscribed in the main App) picks this
      // up automatically and moves past this screen.
    } catch (e) {
      setErr(authErrorMessage(e));
    } finally { setBusy(false); }
  }
  async function google() {
    setBusy(true); setErr("");
    try { await signInGoogle(); } catch (e) { setErr(authErrorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream,
      fontFamily: body, maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column",
      justifyContent: "center", padding: "24px 22px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; } input, button { font-family: inherit; }`}</style>
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{ fontFamily: head, fontWeight: 800, fontSize: 26 }}>Creative Empire <span style={{ color: T.gold }}>OS</span></div>
        <div style={{ fontFamily: body, fontSize: 13, color: T.textMuted, marginTop: 4 }}>
          {mode === "signup" ? "Create your account to start your world." : "Sign in to your world."}
        </div>
      </div>
      <Scroll style={{ padding: 20 }}>
        <FormInput label="Email" value={email} onChange={setEmail} placeholder="you@example.com" />
        <FormInput label="Password" value={password} onChange={setPassword} type="password" placeholder="At least 6 characters" />
        {err && <div style={{ fontFamily: body, fontSize: 12, color: T.rose, marginBottom: 10 }}>{err}</div>}
        <SubmitBtn onClick={submit} disabled={busy || !email || !password}
          label={busy ? "Please wait…" : mode === "signup" ? "Create account" : "Sign in"} />
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0" }}>
          <div style={{ flex: 1, height: 1, background: T.wood, opacity: 0.4 }} />
          <span style={{ fontFamily: body, fontSize: 11, color: T.textMuted }}>or</span>
          <div style={{ flex: 1, height: 1, background: T.wood, opacity: 0.4 }} />
        </div>
        <button onClick={google} disabled={busy} style={{ width: "100%", padding: 12, borderRadius: 11,
          border: `2px solid ${T.wood}`, background: "#fffaf0", color: T.textDark, fontFamily: head,
          fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          🔵 Continue with Google
        </button>
        <button onClick={() => { setMode(m => m === "signup" ? "signin" : "signup"); setErr(""); }}
          style={{ width: "100%", background: "none", border: "none", marginTop: 16, fontFamily: body,
            fontSize: 12.5, color: T.textMuted, textDecoration: "underline" }}>
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </Scroll>
    </div>
  );
}
function Onboarding_({ onFinish }) {
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ strengths: [], weaknesses: [] });
  const set = (k, v) => setA(f => ({ ...f, [k]: v }));
  // Two genuinely different paths — Explorer isn't necessarily a practicing artist,
  // so the career-assessment questions (finished works, shows, sales) don't apply
  // and shouldn't be asked.
  const isExplorer = a.playerMode === "explorer";
  const steps = isExplorer
    ? ["Explorer or Creator", "Who are you", "What you love", "You're in"]
    : ["Explorer or Creator", "Who are you", "Your mission", "Strengths & weaknesses", "Life & time", "Career so far", "Your world"];

  function next() { setStep(s => Math.min(steps.length - 1, s + 1)); }
  function back() { setStep(s => Math.max(0, s - 1)); }

  const preview = (!isExplorer && step === steps.length - 1) ? computeLevels(a) : null;
  const previewLevel = preview ? preview.find(l => l.state === "current") : null;

  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream,
      fontFamily: body, maxWidth: 480, margin: "0 auto", padding: "24px 18px 40px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; } input, textarea, button { font-family: inherit; }`}</style>

      <div style={{ fontFamily: head, fontWeight: 800, fontSize: 22, textAlign: "center" }}>Let's build your world</div>
      <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", marginTop: 4 }}>
        Step {step + 1} of {steps.length} · {steps[step]}
      </div>
      <div style={{ display: "flex", gap: 4, margin: "14px 0 20px" }}>
        {steps.map((_, i) => (
          <div key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? T.gold : "#ffffff22" }} />
        ))}
      </div>

      <Scroll style={{ padding: 18 }}>
        {step === 0 && (
          <>
            <div style={{ fontFamily: body, fontSize: 12.5, color: "#5b4630", textAlign: "center", marginBottom: 14, lineHeight: 1.5 }}>
              Two ways to use this — pick what fits you right now. You can't switch later in this version, so choose the one that's actually true today.
            </div>
            <button onClick={() => set("playerMode", "explorer")} style={{ width: "100%", textAlign: "left", padding: 14, borderRadius: 12, marginBottom: 10,
              border: `3px solid ${a.playerMode === "explorer" ? T.gold : T.wood}`, background: a.playerMode === "explorer" ? `${T.gold}22` : "#fffaf0" }}>
              <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15 }}>🧭 Explorer <span style={{ color: T.forestLight, fontSize: 11 }}>(Free)</span></div>
              <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630", marginTop: 4, lineHeight: 1.4 }}>
                Discover art, visit galleries and museums, complete quests, earn XP and badges. For anyone who loves the scene, not just artists.
              </div>
            </button>
            <button onClick={() => set("playerMode", "creator")} style={{ width: "100%", textAlign: "left", padding: 14, borderRadius: 12,
              border: `3px solid ${a.playerMode === "creator" ? T.gold : T.wood}`, background: a.playerMode === "creator" ? `${T.gold}22` : "#fffaf0" }}>
              <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15 }}>🎨 Creator</div>
              <div style={{ fontFamily: body, fontSize: 11.5, color: "#5b4630", marginTop: 4, lineHeight: 1.4 }}>
                A full artist profile, portfolio, AI-ranked opportunities, career analytics, and everything Explorer has too.
              </div>
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <FormInput label="Your name" value={a.name} onChange={v => set("name", v)} placeholder="What should the app call you?" />
            {!isExplorer && (
              <>
                <FormInput label="Your medium / craft" value={a.medium} onChange={v => set("medium", v)} placeholder="e.g. Oil painting, illustration, sculpture…" />
                <FormInput label="Years creating" value={a.yearsCreating} onChange={v => set("yearsCreating", v)} type="number" placeholder="e.g. 5" />
              </>
            )}
            <div style={{ fontFamily: head, fontSize: 11, fontWeight: 700, color: T.wood, margin: "12px 0 6px" }}>
              Choose your avatar — this is who you'll see on the real map.
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {AVATAR_OPTIONS.map(av => (
                <button key={av.key} onClick={() => set("avatarModel", av.key)} style={{ padding: 4, borderRadius: 10,
                  border: `2.5px solid ${a.avatarModel === av.key ? T.gold : T.wood}`,
                  background: a.avatarModel === av.key ? `${T.gold}22` : "#fffaf0" }}>
                  <div style={{ width: "100%", height: 64, borderRadius: 6, overflow: "hidden", background: "#eee" }}>
                    {/* eslint-disable-next-line react/no-unknown-property */}
                    <model-viewer src={`/avatars/${av.key}.glb`} camera-orbit="0deg 75deg 2.2m" disable-zoom
                      interaction-prompt="none" style={{ width: "100%", height: "100%" }} />
                  </div>
                  <div style={{ fontFamily: body, fontSize: 9, marginTop: 3, color: "#5b4630" }}>{av.label}</div>
                </button>
              ))}
            </div>
          </>
        )}
        {isExplorer && step === 2 && (
          <>
            <FormInput label="What draws you to the art scene?" value={a.missionText} onChange={v => set("missionText", v)} area
              placeholder="e.g. I love discovering new galleries. I want to support local artists. I'm just curious." />
            <MultiChipSelect label="What kind of art do you love?" options={SKILL_OPTIONS} values={a.strengths}
              onChange={v => set("strengths", v)} max={3} />
          </>
        )}
        {isExplorer && step === 3 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🧭</div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18, marginTop: 6 }}>You're in, {a.name || "Explorer"}.</div>
            <div style={{ fontFamily: body, fontSize: 13, color: "#5b4630", marginTop: 10, lineHeight: 1.5 }}>
              Start discovering — check in at real places, complete quests, and earn XP as you actually go explore the scene.
            </div>
          </div>
        )}
        {!isExplorer && step === 2 && (
          <>
            <FormInput label="What does success actually look like to you?" value={a.missionText} onChange={v => set("missionText", v)} area
              placeholder="e.g. I want to quit my day job. I want gallery representation. I want museum shows." />
            <ChipSelect label="Timeline" options={TIMELINE_OPTIONS} value={a.timeline} onChange={v => set("timeline", v)} />
            <FormInput label="Target income this period ($)" value={a.targetAmount} onChange={v => set("targetAmount", v)} type="number" placeholder="100000" />
          </>
        )}
        {!isExplorer && step === 3 && (
          <>
            <MultiChipSelect label="What are you already strong in?" options={SKILL_OPTIONS} values={a.strengths}
              onChange={v => set("strengths", v)} max={3} />
            <MultiChipSelect label="What do you struggle with?" options={SKILL_OPTIONS} values={a.weaknesses}
              onChange={v => set("weaknesses", v)} max={3} />
            <div style={{ fontFamily: body, fontSize: 11, color: T.textMuted }}>
              Anything you don't pick starts at a neutral baseline — this just gives the app an honest starting read, not a permanent label.
            </div>
          </>
        )}
        {!isExplorer && step === 4 && (
          <>
            <ChipSelect label="Do you currently work a day job?" options={[{ key: "yes", label: "Yes" }, { key: "no", label: "No" }]}
              value={a.hasDayJob === true ? "yes" : a.hasDayJob === false ? "no" : ""} onChange={v => set("hasDayJob", v === "yes")} />
            <FormInput label="Realistic hours per week for your art" value={a.weeklyHours} onChange={v => set("weeklyHours", v)} type="number" placeholder="e.g. 15" />
          </>
        )}
        {!isExplorer && step === 5 && (
          <>
            <FormInput label="Finished works you have right now" value={a.finishedWorks} onChange={v => set("finishedWorks", v)} type="number" placeholder="e.g. 12" />
            <FormInput label="Solo shows to date" value={a.soloShows} onChange={v => set("soloShows", v)} type="number" placeholder="e.g. 0" />
            <FormInput label="Group shows to date" value={a.groupShows} onChange={v => set("groupShows", v)} type="number" placeholder="e.g. 2" />
            <FormInput label="Total career art sales so far ($)" value={a.totalSales} onChange={v => set("totalSales", v)} type="number" placeholder="e.g. 3000" />
            <div style={{ fontFamily: body, fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              This is self-reported, not verified against a real portfolio or account — it's here to give you a fair starting point, not to audit you.
            </div>
          </>
        )}
        {!isExplorer && step === 6 && previewLevel && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 30 }}>🎉</div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18, marginTop: 6 }}>
              Based on what you told me, you're starting at
            </div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 24, color: T.gold, marginTop: 6 }}>
              Level {previewLevel.n} — {previewLevel.title}
            </div>
            <div style={{ fontFamily: body, fontSize: 13, color: "#5b4630", marginTop: 10, lineHeight: 1.5 }}>
              This is a rough, self-reported estimate — not an audit of your career. It'll get more accurate as you actually play.
              {a.finishedWorks < 20 && " I've already queued a quest around finishing more work, since most opportunities expect 15–20 pieces."}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          {step > 0 && (
            <button onClick={back} style={{ flex: 1, padding: 13, borderRadius: 11, border: `2px solid ${T.wood}`,
              background: "transparent", color: T.textDark, fontFamily: head, fontWeight: 700, fontSize: 13 }}>Back</button>
          )}
          {step < steps.length - 1 ? (
            <button onClick={next} disabled={step === 0 && !a.playerMode} style={{ flex: 2, padding: 13, borderRadius: 11, border: "none",
              background: (step === 0 && !a.playerMode) ? "#00000022" : T.gold, color: T.ink, fontFamily: head, fontWeight: 800, fontSize: 14 }}>Continue</button>
          ) : (
            <button onClick={() => onFinish(a)} style={{ flex: 2, padding: 13, borderRadius: 11, border: "none",
              background: T.green, color: "#fff", fontFamily: head, fontWeight: 800, fontSize: 14 }}>Enter your world →</button>
          )}
        </div>
      </Scroll>
    </div>
  );
}
