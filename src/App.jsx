import { useState, useEffect, useRef, useMemo } from "react";
import { storageGet, storageSet } from "./lib/storage";
import { onAuthChange, signUpEmail, signInEmail, signInGoogle, signOutUser, authErrorMessage } from "./lib/firebase";
import { callModel, allText, extractJson } from "./lib/model";
import TrainingGrounds from "./training/TrainingGrounds";
import { LEVEL_TEMPLATE, computeLevels, computeReadiness, isAtRisk, computeCategoryProgress } from "./engines/blueprintEngine";
import { buildPersonProfile, applyInteraction, groupPeopleBy, temperamentFlavor, clampStat, normalizeTrainingNpc } from "./engines/relationshipEngine";
import { loadNpc } from "./training/data";
import { ZOOM_MIN, ZOOM_MAX, LOD_DISTRICT, LOD_INTERIOR, clampZoom, computeTier, buildDistricts, computeWorldTransform, WORLD_ORIGIN, DISTRICT_LAYOUT } from "./engines/mapEngine";
import { buildUpcomingDeadlines, isUrgentDeadline } from "./engines/calendarEngine";
import { computeFinanceTotals, buildFinanceEntry, applyIncomeToGoal, removeIncomeFromGoal } from "./engines/economyEngine";
import { runCareerDirector } from "./engines/careerDirector";
import {
  Home as HomeIcon, Swords, Plus, Globe, User, Bell, Briefcase, Image as ImageIcon,
  DollarSign, Users, Heart, Clock, ChevronRight, ChevronLeft, Check, X, Star, Lock,
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

// ROLE_FLAVOR, TEMPERAMENTS, roleFlavor, temperamentFlavor, clampStat, buildPersonProfile,
// applyInteraction, and groupPeopleBy now live in ./engines/relationshipEngine.js — the
// second engine extracted per THE_CREATIVE_ARCHITECTURE_SPEC.md §3. This file only
// renders what that module computes; it doesn't compute the profile itself anymore.

/* Categories for places and events — drive icon/color and give the map real visual variety. */
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
  const [tab, setTab] = useState("home");
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
  const [skills, setSkills] = useState(() => computeSkills({}));
  const [levels, setLevels] = useState(() => computeLevels({}));
  const [authUser, setAuthUser] = useState(undefined); // undefined = still checking, null = signed out, object = signed in

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
        if (save.quests) setQuests(save.quests);
        if (save.confidence) setConfidence(save.confidence);
        if (save.goal) setGoal(save.goal);
        if (save.contacts) setContacts(save.contacts);
        if (save.places) setPlaces(save.places);
        if (save.events) setEvents(save.events);
        if (save.ideas) setIdeas(save.ideas);
        if (save.opps) setOpps(save.opps);
        if (typeof save.energy === "number") setEnergy(save.energy);
        if (save.skills) setSkills(save.skills);
        if (save.levels) setLevels(save.levels);
        if (save.inventory) setInventory(save.inventory);
        if (save.financeLog) setFinanceLog(save.financeLog);
        flash("Welcome back.");
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

  // Save on every meaningful change. Skipped until onboarding + the initial load have
  // both resolved, so we never overwrite a real save with fresh defaults.
  useEffect(() => {
    if (!loaded || !onboarded) return;
    storageSet(SAVE_KEY, { quests, confidence, goal, contacts, places, events, ideas, opps, energy, skills, levels, inventory, financeLog })
      .catch(() => { /* network hiccup — game still works, just won't persist that change */ });
  }, [loaded, onboarded, quests, confidence, goal, contacts, places, events, ideas, opps, energy, skills, levels, inventory, financeLog]);

  // Career Director: reads across the other engines and decides what the Command
  // Board should show — re-scoring existing quests and proposing new ones from real
  // gaps (careerDirector.js). Deliberately does NOT depend on `quests` itself — it
  // reads the latest quests inside the merge, but shouldn't re-run just because a
  // quest was toggled done, only when the underlying situation actually changes.
  useEffect(() => {
    if (!loaded || !onboarded) return;
    const directed = runCareerDirector({ quests, levels, events, contacts, confidence, trainingNpc });
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
  }, [loaded, onboarded, levels, events, contacts, confidence, trainingNpc]);

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
        flash(`✓ Logged: ${q.title}`);
      }
      return { ...q, done: nowDone };
    }));
  }
  function capKey(tag) { return { CAREER: "Career", RELATIONSHIPS: "Relationships", FINANCES: "Finances", TIME: "Time" }[tag] || "Career"; }

  function logInteraction(id) {
    setContacts(cs => cs.map(c => c.id === id ? { ...c, ...applyInteraction(c) } : c));
    flash("Logged the interaction — trust is climbing.");
    setSelectedNode(null);
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
        temperament: editForm.temperament ? (temperamentFlavor(editForm.temperament)?.label || editForm.temperament) : c.temperament,
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
      const profile = buildPersonProfile({ role: addForm.role, temperament: addForm.temperament, note: addForm.note });
      setContacts(cs => [...cs, { id: "person-" + Date.now(), kind: "person", name: addForm.name,
        type: addForm.role || "Practice partner", icon: User, color: T[profile.colorKey],
        trust: profile.trust, interest: profile.interest, momentum: "steady", lastInteraction: "just added",
        needs: profile.needs, backstory: profile.backstory,
        temperament: profile.temperamentLabel,
        detailsLog: addForm.details ? [{ id: "d-" + Date.now(), text: addForm.details, date: Date.now() }] : [],
        metContext: addForm.met || "", connections: (addForm.connections || "").split(",").map(s => s.trim()).filter(Boolean),
        sim: true, pos }]);
      flash(`${addForm.name} is ready to practice with.`);
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

  const allNodes = [
    ...contacts, ...places, ...events,
    ...opps.map(o => ({ ...o, kind: "opportunity" })),
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
      fontFamily: body, maxWidth: 480, margin: "0 auto", position: "relative", paddingBottom: 84 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@500;600;700;800&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        button { cursor: pointer; font-family: inherit; }
        input, textarea { font-family: inherit; }
      `}</style>
      <Toast text={toast} />

      {tab === "home" && <Home_ quests={quests} goal={goal} energy={energy} onToggle={toggleQuest} onViewAll={() => setTab("quests")} profile={profile} levels={levels} />}
      {tab === "quests" && <Quests_ quests={quests} onToggle={toggleQuest} />}
      {tab === "map" && (
        <MapScreen_
          nodes={allNodes} quests={quests} events={events} energy={energy}
          onSelect={setSelectedNode} onShowIdeas={() => setShowIdeas(true)}
        />
      )}
      {tab === "profile" && <Profile_ confidence={confidence} onQuickAccess={onQuickAccess} skills={skills} levels={levels} />}

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

      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 480, margin: "0 auto",
        display: "flex", alignItems: "center", justifyContent: "space-around",
        background: `linear-gradient(180deg, ${T.wood}, ${T.ink})`, borderTop: `3px solid ${T.gold}`,
        padding: "10px 8px calc(10px + env(safe-area-inset-bottom, 0px))" }}>
        <NavBtn icon={HomeIcon} label="Home" active={tab === "home"} onClick={() => setTab("home")} />
        <NavBtn icon={Swords} label="Quests" active={tab === "quests"} onClick={() => setTab("quests")} />
        <button onClick={() => setAddOpen(true)} style={{ width: 54, height: 54, borderRadius: "50%",
          background: `radial-gradient(circle at 35% 30%, ${T.goldBright}, ${T.gold})`, border: `3px solid #FFE9B0`,
          display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 16px #000a", marginTop: -20 }}>
          <Plus color={T.ink} size={26} strokeWidth={3} />
        </button>
        <NavBtn icon={Globe} label="Map" active={tab === "map"} onClick={() => setTab("map")} />
        <NavBtn icon={User} label="Profile" active={tab === "profile"} onClick={() => setTab("profile")} />
      </nav>
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
  const items = buildUpcomingDeadlines({ quests, events });
  return (
    <div style={{ minHeight: "100vh", background: `linear-gradient(180deg, ${T.ink}, #100b06)`, color: T.textCream, fontFamily: body, maxWidth: 480, margin: "0 auto", padding: "16px 14px 40px" }}>
      <BackHeader title="📅 Calendar" onBack={onBack} />
      <div style={{ fontFamily: body, fontSize: 11.5, color: T.textMuted, margin: "10px 2px 14px" }}>
        Upcoming, soonest first. (A full month grid isn't built yet — this is the honest, useful version for now.)
      </div>
      {items.length === 0 && <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted, textAlign: "center", padding: 20 }}>Nothing with a deadline right now.</div>}
      {items.map((it, i) => (
        <Scroll key={i} style={{ padding: 12, marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: head, fontWeight: 700, fontSize: 14 }}>{it.label}</div>
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
function Home_({ quests, goal, energy, onToggle, onViewAll, profile, levels }) {
  const pct = Math.round((goal.current / goal.target) * 100);
  const top3 = quests.filter(q => q.tier !== "ignore").slice(0, 3);
  const primary = quests.find(q => q.tier === "primary");
  const currentLevel = levels.find(l => l.state === "current") || levels[0];
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

      <WoodPanel style={{ margin: "6px 14px 0", padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontFamily: head, fontSize: 10, letterSpacing: 1, color: T.gold }}>MISSION</div>
            <div style={{ fontFamily: head, fontWeight: 800, fontSize: 18 }}>$100,000 in 12 months</div>
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

      <div style={{ display: "flex", gap: 8, margin: "10px 14px 0" }}>
        <Scroll style={{ flex: 1, padding: "9px 10px", textAlign: "center" }}>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1 }}>DAYS LEFT</div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20 }}>312</div>
          <div style={{ fontFamily: body, fontSize: 9, color: T.green, fontWeight: 700 }}>ON PACE ↑</div>
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
function MapScreen_({ nodes, quests, events, energy, onSelect, onShowIdeas }) {
  const [filter, setFilter] = useState("all");
  const [organizeBy, setOrganizeBy] = useState("map"); // map | met | connections
  const visible = nodes.filter(n => filter === "all" || n.kind === filter || (filter === "idea" && n.kind === "idea"));
  const peopleOnly = nodes.filter(n => n.kind === "person");

  const deadlineItems = buildUpcomingDeadlines({ quests, events, limit: 2 });

  const urgentEvent = events.find(e => e.requirements && isAtRisk(e.requirements, e.daysLeft));
  const lowEnergy = energy <= 3;

  // Group people by met-context or by connections. Simple text matching — not real AI reasoning,
  // just a grouping the app can do consistently while you decide if it's useful.
  // grouping logic now lives in ./engines/relationshipEngine.js (groupPeopleBy)

  return (
    <div>
      <div style={{ padding: "16px 14px 8px" }}>
        <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20 }}>🗺️ Your World</div>
        <div style={{ fontFamily: body, fontSize: 12, color: T.textMuted }}>Tap anyone or anything for the full picture.</div>
      </div>

      <div style={{ display: "flex", gap: 8, padding: "0 14px" }}>
        <WoodPanel style={{ flex: 1, padding: "8px 10px" }}>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1, color: T.gold }}>LEVEL</div>
          <div style={{ fontFamily: head, fontWeight: 800, fontSize: 16 }}>17</div>
          <div style={{ fontFamily: body, fontSize: 9, color: T.textMuted }}>2,840 XP to next</div>
        </WoodPanel>
        <Scroll style={{ flex: 2, padding: "8px 10px" }}>
          <div style={{ fontFamily: head, fontSize: 9, letterSpacing: 1 }}>NEAREST DEADLINES</div>
          {deadlineItems.length === 0 && <div style={{ fontFamily: body, fontSize: 11, marginTop: 2 }}>Nothing urgent.</div>}
          {deadlineItems.map((d, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: body, fontSize: 11, fontWeight: 700, marginTop: 2 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 150 }}>{d.label}</span>
              <span style={{ color: isUrgentDeadline(d.days) ? T.rose : T.textDark }}>{d.days != null ? `${d.days}d` : d.raw}</span>
            </div>
          ))}
        </Scroll>
      </div>

      {(urgentEvent || lowEnergy) && (
        <div style={{ margin: "8px 14px 0", display: "flex", flexDirection: "column", gap: 6 }}>
          {urgentEvent && (() => {
            const { met, total } = computeReadiness(urgentEvent.requirements);
            return (
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#5a1c14", border: `2px solid ${T.rose}`,
                borderRadius: 12, padding: "9px 11px" }}>
                <AlertTriangle size={16} color="#ffb4a8" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontFamily: body, fontSize: 11.5, color: "#ffe2dc", lineHeight: 1.4 }}>
                  <b>Consider pivoting:</b> at this pace you may miss <b>{urgentEvent.name}</b> ({urgentEvent.daysLeft} days left,
                  only {met}/{total} requirements met).
                </div>
              </div>
            );
          })()}
          {lowEnergy && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#3a2a10", border: `2px solid ${T.gold}`,
              borderRadius: 12, padding: "9px 11px" }}>
              <Zap size={16} color={T.goldBright} style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: body, fontSize: 11.5, color: T.textCream }}>Energy is low — consider a lighter day before your next big push.</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "12px 14px 0" }}>
        {FILTERS.map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); if (f.key !== "person") setOrganizeBy("map"); }} style={{ display: "flex", alignItems: "center", gap: 5,
            padding: "6px 11px", borderRadius: 20, background: filter === f.key ? f.color : T.panel,
            border: `1.5px solid ${f.color}`, color: filter === f.key ? T.ink : T.textCream }}>
            <span style={{ fontFamily: head, fontSize: 11, fontWeight: 700 }}>{f.label}</span>
          </button>
        ))}
      </div>

      {filter === "person" && (
        <div style={{ margin: "10px 14px 0" }}>
          <div style={{ fontFamily: head, fontSize: 10, letterSpacing: 1, color: T.textMuted, marginBottom: 6 }}>ORGANIZE BY</div>
          <div style={{ display: "flex", gap: 6 }}>
            {[["map", "📍 Map"], ["met", "🤝 Where Met"], ["connections", "🔗 Connections"]].map(([key, label]) => (
              <button key={key} onClick={() => setOrganizeBy(key)} style={{ flex: 1, padding: "7px 0", borderRadius: 20,
                border: `1.5px solid ${T.gold}`, background: organizeBy === key ? T.gold : T.panel,
                color: organizeBy === key ? T.ink : T.textCream, fontFamily: head, fontSize: 10.5, fontWeight: 700 }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {filter === "person" && organizeBy !== "map" ? (
        <div style={{ margin: "12px 14px 0" }}>
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
      ) : (
        <WorldEngine_ nodes={visible} onSelect={onSelect} onShowIdeas={onShowIdeas} />
      )}
    </div>
  );
}

/* ================================================================
   WORLD ENGINE — a real camera (x, y, zoom), not a fixed image.
   Districts are COMPUTED from actual game state (grouped by kind),
   never hand-placed art. Three LOD tiers driven purely by zoom level:
     zoom < 0.7          → Districts (colored regions, aggregate counts)
     0.7 <= zoom < 1.9   → Buildings/NPCs (individual entities, clickable)
     zoom >= 1.9 + focus → Interior (one entity's full scene, inline)
   Deliberate scope: DOM + CSS transforms, not canvas/WebGL — the right
   choice for tens-to-low-hundreds of entities, not thousands. "Infinite"
   pan means no hard boundary is enforced, not that content exists forever.
   ================================================================ */
// ZOOM_MIN/MAX, LOD_DISTRICT/INTERIOR, clampZoom, WORLD_ORIGIN, DISTRICT_LAYOUT,
// buildDistricts, and computeWorldTransform now live in ./engines/mapEngine.js —
// the third engine extracted per THE_CREATIVE_ARCHITECTURE_SPEC.md §3. Camera state
// (useState, pointer handlers, refs) legitimately stays in this component — only the
// pure district/entity/LOD math moved out.


function WorldEngine_({ nodes, onSelect, onShowIdeas }) {
  const [camera, setCamera] = useState({ x: WORLD_ORIGIN, y: WORLD_ORIGIN, zoom: 0.5 });
  const [animating, setAnimating] = useState(false);
  const [interior, setInterior] = useState(null); // the one entity shown in interior view
  const dragRef = useRef(null);
  const pinchRef = useRef(null); // { id0, id1, startDist, startZoom }
  const activePointers = useRef(new Map());
  const viewportRef = useRef(null);

  const districts = useMemo(() => buildDistricts(nodes), [nodes]);

  function flyTo(x, y, zoom) {
    setAnimating(true);
    setCamera({ x, y, zoom: clampZoom(zoom) });
    setTimeout(() => setAnimating(false), 420);
  }
  function zoomOutToDistricts() {
    setInterior(null);
    flyTo(WORLD_ORIGIN, WORLD_ORIGIN, 0.5);
  }
  function enterDistrict(d) { flyTo(d.cx, d.cy, 1.2); }
  function enterEntity(e) {
    if (e.kind === "idea") { onShowIdeas(); return; }
    flyTo(e.worldX, e.worldY, LOD_INTERIOR + 0.3);
    setInterior(e);
  }

  // Pointer-based drag-to-pan (mouse or single touch) — 1:1, never CSS-transitioned.
  function onPointerDown(e) {
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 1) {
      dragRef.current = { startX: e.clientX, startY: e.clientY, camX: camera.x, camY: camera.y };
    } else if (activePointers.current.size === 2) {
      const pts = [...activePointers.current.values()];
      const startDist = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)); // never 0 — avoids a divide-by-zero
      pinchRef.current = { startDist, startZoom: camera.zoom };
      dragRef.current = null;
    }
  }
  function onPointerMove(e) {
    if (!activePointers.current.has(e.pointerId)) return;
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointers.current.size === 2 && pinchRef.current) {
      const pts = [...activePointers.current.values()];
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const nz = clampZoom(pinchRef.current.startZoom * (dist / pinchRef.current.startDist));
      setCamera(c => ({ ...c, zoom: nz }));
      return;
    }
    if (dragRef.current && tier === "building") {
      // FIX: capture the drag-start snapshot NOW, as plain values. Reading dragRef.current
      // a second time from *inside* setCamera's updater (as this used to) is unsafe — that
      // callback can run after a subsequent fast pointerup has already nulled dragRef.current,
      // crashing with "null is not an object" (confirmed by the actual production error).
      const start = dragRef.current;
      const dx = e.clientX - start.startX, dy = e.clientY - start.startY;
      setCamera(c => ({ ...c, x: start.camX - dx / c.zoom, y: start.camY - dy / c.zoom }));
    }
  }
  function onPointerUp(e) {
    activePointers.current.delete(e.pointerId);
    if (activePointers.current.size < 2) pinchRef.current = null;
    if (activePointers.current.size === 0) dragRef.current = null;
  }
  function onWheel(e) {
    e.preventDefault();
    setCamera(c => ({ ...c, zoom: clampZoom(c.zoom * (e.deltaY < 0 ? 1.15 : 0.87)) }));
  }

  const tier = computeTier(camera.zoom, interior);
  const rect = viewportRef.current?.getBoundingClientRect();
  const vw = rect?.width || 400, vh = rect?.height || 360;
  // District tier always renders centered on WORLD_ORIGIN (computeWorldTransform's job) —
  // this is the fix for "zooming out showed only 2 of 5 districts," now living in the
  // engine and covered by its own regression test rather than inline logic here.
  const worldTransform = computeWorldTransform({ camera, vw, vh, tier });

  return (
    <div style={{ margin: "10px 14px 0", borderRadius: 18, overflow: "hidden", border: `3px solid ${T.wood}`,
      position: "relative", height: 380, background: "linear-gradient(180deg,#1a2a44,#0d1420)" }}>

      {/* the pan/zoom viewport */}
      <div ref={viewportRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove}
        onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}
        style={{ position: "absolute", inset: 0, touchAction: "none", cursor: dragRef.current ? "grabbing" : "grab", overflow: "hidden" }}>
        {/* FIX: this div previously declared itself as 1x1px while its real children rendered
            hundreds of pixels away in every direction (districts span roughly x:65-735,
            y:65-735 in world space). That size/content mismatch, combined with a live
            scale() transform during pinch-zoom, is a known way to make mobile browsers
            briefly black out while recompositing — the browser's declared layer bounds
            didn't match what it actually had to paint. Now the box honestly contains its
            content (world coordinates are pre-shifted into 0-800 range via WORLD_ORIGIN),
            plus explicit GPU-layer hints as a second line of defense. */}
        <div style={{ position: "absolute", left: 0, top: 0, width: 800, height: 800,
          transform: worldTransform, transformOrigin: "0 0", willChange: "transform",
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transition: animating ? "transform 0.42s cubic-bezier(.2,.8,.2,1)" : "none" }}>

          {districts.map(d => {
            const districtVisible = tier === "district";
            const dColor = T[d.colorKey];
            return (
              <div key={d.key}>
                {districtVisible && (
                  <button onClick={() => enterDistrict(d)} style={{ position: "absolute", left: d.cx, top: d.cy,
                    transform: "translate(-50%,-50%)", width: 150, height: 150, borderRadius: "50%",
                    background: `${dColor}33`, border: `3px solid ${dColor}`, display: "flex",
                    flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <div style={{ fontFamily: head, fontWeight: 800, fontSize: 15, color: "#fff" }}>{d.label}</div>
                    <div style={{ fontFamily: mono_body(), fontSize: 11, color: "#ffffffcc" }}>{d.entities.length} {d.entities.length === 1 ? "item" : "items"}</div>
                  </button>
                )}
                {tier === "building" && d.entities.map(e => (
                  <EntityPin key={e.id} entity={e} onClick={() => enterEntity(e)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* interior takeover — a real third tier, not just the same detail sheet */}
      {tier === "interior" && interior && (
        <InteriorScene entity={interior} onExit={() => { setInterior(null); flyTo(interior.worldX, interior.worldY, 1.2); }}
          onOpenFull={() => onSelect(interior)} />
      )}

      {/* zoom controls — reliable fallback alongside wheel/pinch, esp. on mobile */}
      {tier !== "interior" && (
        <div style={{ position: "absolute", right: 10, bottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
          <button onClick={() => setCamera(c => ({ ...c, zoom: clampZoom(c.zoom * 1.3) }))}
            style={{ width: 34, height: 34, borderRadius: 8, background: "#00000088", border: "1px solid #ffffff33", color: "#fff", fontSize: 16 }}>+</button>
          <button onClick={() => setCamera(c => ({ ...c, zoom: clampZoom(c.zoom * 0.77) }))}
            style={{ width: 34, height: 34, borderRadius: 8, background: "#00000088", border: "1px solid #ffffff33", color: "#fff", fontSize: 16 }}>−</button>
          {tier !== "district" && (
            <button onClick={zoomOutToDistricts}
              style={{ width: 34, height: 34, borderRadius: 8, background: "#00000088", border: "1px solid #ffffff33", color: "#fff", fontSize: 13 }}>⌂</button>
          )}
        </div>
      )}

      <div style={{ position: "absolute", top: 8, left: 10, background: "#00000088", border: "1px solid #ffffff22",
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
              <ChipSelect label="Temperament" options={TEMPERAMENTS.map(t => ({ key: t.key, label: t.label }))}
                value={TEMPERAMENTS.find(t => t.label === form.temperament)?.key || ""} onChange={v => set("temperament", v)} />
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
function Profile_({ confidence, onQuickAccess, skills, levels }) {
  const meta = { Career: Briefcase, Inventory: ImageIcon, Finances: DollarSign, Relationships: Users, Health: Heart, Time: Clock };
  return (
    <div style={{ padding: "18px 14px" }}>
      <div style={{ fontFamily: head, fontWeight: 800, fontSize: 20 }}>📜 Profile</div>
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
      <div style={{ margin: "18px 0 8px", fontFamily: head, fontSize: 12, fontWeight: 700, color: T.gold }}>QUICK ACCESS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
        {[["Inventory", ImageIcon], ["Calendar", Calendar], ["Finances", DollarSign], ["Training", Dumbbell], ["System", Activity], ["Opportunities", Trophy]].map(([label, Icon]) => (
          <button key={label} onClick={() => onQuickAccess(label)} style={{ background: T.panel, border: `2px solid ${T.wood}`,
            borderRadius: 12, padding: "12px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
            <Icon size={16} color={T.gold} /><span style={{ fontFamily: head, fontSize: 10, fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>
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
              <div style={{ background: `${T.purple}18`, border: `1.5px solid ${T.purple}55`, borderRadius: 10,
                padding: "8px 11px", marginBottom: 12, fontFamily: body, fontSize: 11, color: "#4a3568", lineHeight: 1.4 }}>
                🎭 This creates a <b>practice partner</b> — a fictional person to rehearse relationships with, like Evelyn.
                Not a real contact. Pick any name and role.
              </div>
              <FormInput label="Name" value={form.name} onChange={v => set("name", v)} placeholder="e.g. Dana Whitfield — pick anything" />
              <FormInput label="Role" value={form.role} onChange={v => set("role", v)} placeholder="e.g. Collector, gallery owner, mentor, critic…" />
              <ChipSelect label="Temperament (shapes how they'll act)" options={TEMPERAMENTS.map(t => ({ key: t.key, label: t.label }))}
                value={form.temperament} onChange={v => set("temperament", v)} />
              <FormInput label="Where did you meet them?" value={form.met} onChange={v => set("met", v)} placeholder="e.g. Atlanta Art Fair, March 2027" />
              <FormInput label="Connected to (comma-separated names, if any)" value={form.connections} onChange={v => set("connections", v)} placeholder="e.g. Marcus, Gallery Aurora" />
              <FormInput label="Starting need (optional — auto-generated from role otherwise)" value={form.note} onChange={v => set("note", v)} placeholder="Leave blank to auto-generate" />
              <FormInput label="Any other details — age, quirks, history, anything" value={form.details} onChange={v => set("details", v)}
                placeholder="e.g. 60s, runs a small gallery, recently divorced, loves opera, distrusts younger artists…" area />
              <SubmitBtn onClick={onSubmitAdd} label="Create practice partner" disabled={!form.name} />
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
  const steps = ["Who are you", "Your mission", "Strengths & weaknesses", "Life & time", "Career so far", "Your world"];

  function next() { setStep(s => Math.min(steps.length - 1, s + 1)); }
  function back() { setStep(s => Math.max(0, s - 1)); }

  const preview = step === steps.length - 1 ? computeLevels(a) : null;
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
            <FormInput label="Your name" value={a.name} onChange={v => set("name", v)} placeholder="What should the app call you?" />
            <FormInput label="Your medium / craft" value={a.medium} onChange={v => set("medium", v)} placeholder="e.g. Oil painting, illustration, sculpture…" />
            <FormInput label="Years creating" value={a.yearsCreating} onChange={v => set("yearsCreating", v)} type="number" placeholder="e.g. 5" />
          </>
        )}
        {step === 1 && (
          <>
            <FormInput label="What does success actually look like to you?" value={a.missionText} onChange={v => set("missionText", v)} area
              placeholder="e.g. I want to quit my day job. I want gallery representation. I want museum shows." />
            <ChipSelect label="Timeline" options={TIMELINE_OPTIONS} value={a.timeline} onChange={v => set("timeline", v)} />
            <FormInput label="Target income this period ($)" value={a.targetAmount} onChange={v => set("targetAmount", v)} type="number" placeholder="100000" />
          </>
        )}
        {step === 2 && (
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
        {step === 3 && (
          <>
            <ChipSelect label="Do you currently work a day job?" options={[{ key: "yes", label: "Yes" }, { key: "no", label: "No" }]}
              value={a.hasDayJob === true ? "yes" : a.hasDayJob === false ? "no" : ""} onChange={v => set("hasDayJob", v === "yes")} />
            <FormInput label="Realistic hours per week for your art" value={a.weeklyHours} onChange={v => set("weeklyHours", v)} type="number" placeholder="e.g. 15" />
          </>
        )}
        {step === 4 && (
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
        {step === 5 && previewLevel && (
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
            <button onClick={next} style={{ flex: 2, padding: 13, borderRadius: 11, border: "none",
              background: T.gold, color: T.ink, fontFamily: head, fontWeight: 800, fontSize: 14 }}>Continue</button>
          ) : (
            <button onClick={() => onFinish(a)} style={{ flex: 2, padding: 13, borderRadius: 11, border: "none",
              background: T.green, color: "#fff", fontFamily: head, fontWeight: 800, fontSize: 14 }}>Enter your world →</button>
          )}
        </div>
      </Scroll>
    </div>
  );
}
