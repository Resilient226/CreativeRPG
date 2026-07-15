// THE CAREER DIRECTOR — reads across every other engine and decides what actually
// matters right now. This is the one engine that didn't exist even messily before —
// everything else was extracted from logic already scattered in App.jsx; this is new.
//
// Non-negotiable rule (per THE_CREATIVE_ARCHITECTURE_SPEC.md's Blueprint Engine
// principle, applied here too): this stays fully deterministic and rule-based.
// It generates a `why` string from real computed numbers — it does not call any AI,
// and does not invent a score, a probability, or a reason that isn't traceable back
// to actual data. If this is ever wired to an AI later, the AI may only be allowed to
// restate what this engine already decided in nicer language — never to change the
// ranking or invent progress itself.

const TAG_TO_PILLAR = { CAREER: "Career", RELATIONSHIPS: "Relationships", FINANCES: "Finances", TIME: "Time" };

/** Loose effort strings ("2 hrs", "25 min", "varies") -> a rough minutes estimate,
 *  for scoring only. Never shown to the player as a real time promise. */
function estimateEffortMinutes(effort) {
  if (!effort) return 60;
  const m = /(\d+(?:\.\d+)?)/.exec(effort);
  if (!m) return 60; // "varies" or unparseable — neutral default, doesn't skew ranking hard either way
  const n = parseFloat(m[1]);
  return /hr|hour/i.test(effort) ? n * 60 : n;
}

/**
 * Scans the game's real state for gaps and proposes NEW quests to close them.
 * Every proposal is traceable to a specific number — no gap is invented.
 * Returns quest-shaped objects WITHOUT an id (identity is the caller's job, same
 * boundary as every other engine here) and WITHOUT a tier yet (rankQuests decides that).
 */
export function generateGapQuests({ levels = [], events = [], contacts = [], confidence = {} } = {}) {
  const proposals = [];

  // Gap 1: an at-risk milestone event's single most-blocking unmet requirement.
  events.forEach(e => {
    if (!e.requirements || e.daysLeft == null) return;
    const unmet = e.requirements.filter(r => !r.met);
    if (unmet.length === 0) return;
    const worst = unmet[0]; // first unmet requirement — simplest honest choice, not a ranked guess among them
    proposals.push({
      id: `gap-event-${e.id}-${worst.label}`,
      title: `${worst.label} — for ${e.name}`,
      why: `${e.name} is ${e.daysLeft} days out and still needs "${worst.label}." Closing this moves you directly toward being eligible.`,
      tag: "CAREER", effort: "varies", due: `${e.daysLeft} days`,
      generatedBy: "careerDirector", sourceType: "event-requirement", sourceId: e.id,
    });
  });

  // Gap 2: whichever category on the CURRENT level is furthest from complete.
  const current = levels.find(l => l.state === "current");
  if (current && current.categories && current.categories.length) {
    const worstCat = [...current.categories].sort((a, b) => (a.met / a.total) - (b.met / b.total))[0];
    if (worstCat && worstCat.met < worstCat.total) {
      proposals.push({
        id: `gap-level-${current.n}-${worstCat.name}`,
        title: `Push forward on ${worstCat.name}`,
        why: `${worstCat.name} is at ${worstCat.met}/${worstCat.total} for Level ${current.n} — ${current.title} — the furthest-behind category standing between you and the next level.`,
        tag: worstCat.name === "Networking" ? "RELATIONSHIPS" : worstCat.name === "Business" ? "FINANCES" : "CAREER",
        effort: "varies", due: "—",
        generatedBy: "careerDirector", sourceType: "level-category", sourceId: current.n,
      });
    }
  }

  // Gap 3: a real contact who's interested but hasn't earned much trust yet.
  const trustGap = contacts
    .filter(c => c.kind === "person" && !c.sim && c.interest > 50 && c.trust < 35)
    .sort((a, b) => b.interest - a.interest)[0];
  if (trustGap) {
    proposals.push({
      id: `gap-trust-${trustGap.id}`,
      title: `Build trust with ${trustGap.name}`,
      why: `${trustGap.name} shows real interest (${trustGap.interest}/100) but trust is still low (${trustGap.trust}/100) — worth a real interaction before asking them for anything.`,
      tag: "RELATIONSHIPS", effort: "25 min", due: "—",
      generatedBy: "careerDirector", sourceType: "trust-gap", sourceId: trustGap.id,
    });
  }

  // Gap 4: whichever Confidence pillar is lowest right now.
  const pillars = Object.entries(confidence);
  if (pillars.length) {
    const [lowestName, lowestVal] = pillars.sort((a, b) => a[1] - b[1])[0];
    if (lowestVal < 60) {
      proposals.push({
        id: `gap-confidence-${lowestName}`,
        title: `Shore up ${lowestName}`,
        why: `${lowestName} is your lowest confidence pillar right now at ${lowestVal}%. It doesn't need a dramatic fix — just something real logged in this area.`,
        tag: Object.keys(TAG_TO_PILLAR).find(k => TAG_TO_PILLAR[k] === lowestName) || "CAREER",
        effort: "varies", due: "—",
        generatedBy: "careerDirector", sourceType: "low-confidence", sourceId: lowestName,
      });
    }
  }

  return proposals;
}

/**
 * A deterministic score for ranking — never shown to the player directly, only used
 * to sort. Combines: urgency (closer deadline = higher), impact (helps a currently
 * weak pillar = higher), effort (lower effort = a small tie-breaking bonus).
 */
export function scoreQuest(quest, confidence = {}) {
  const days = /^\d+/.test(quest.due || "") ? parseInt(quest.due, 10) : null;
  const urgency = days == null ? 5 : Math.max(0, 30 - days); // closer deadlines score higher, capped at 30 days out
  const pillar = TAG_TO_PILLAR[quest.tag];
  const pillarWeakness = pillar && confidence[pillar] != null ? (100 - confidence[pillar]) / 4 : 5; // weaker pillar = more impact
  const effortMin = estimateEffortMinutes(quest.effort);
  const effortBonus = Math.max(0, (120 - effortMin) / 20); // small bonus for genuinely quick wins
  return urgency + pillarWeakness + effortBonus;
}

/**
 * Ranks a combined list of existing + generated quests into the four Command Board
 * tiers, and attaches a `reasoning` string to every one — built from the same real
 * numbers the score came from, so the explanation and the ranking can never disagree.
 */
export function rankQuests(quests, confidence = {}) {
  const scored = quests
    .filter(q => !q.done)
    .map(q => ({ ...q, _score: scoreQuest(q, confidence) }))
    .sort((a, b) => b._score - a._score);

  return scored.map((q, i) => {
    let tier;
    if (i === 0) tier = "primary";
    else if (i <= 2) tier = "secondary";
    else if (i <= 4) tier = "optional";
    else tier = "ignore";
    const reasoning = q.generatedBy === "careerDirector"
      ? q.why
      : `${q.why} Ranked ${tier} based on urgency and how much it moves your currently weaker areas.`;
    const { _score, ...rest } = q;
    return { ...rest, tier, reasoning };
  });
}

/**
 * The orchestrator: merges hand-created quests with freshly generated gap-quests,
 * ranks the whole set, and returns what the Command Board should show. Quests marked
 * `done` are passed through untouched (already-completed history isn't re-ranked).
 */
export function runCareerDirector({ quests = [], levels = [], events = [], contacts = [], confidence = {} } = {}) {
  const doneQuests = quests.filter(q => q.done);
  const activeExisting = quests.filter(q => !q.done);
  const gapQuests = generateGapQuests({ levels, events, contacts, confidence });
  const ranked = rankQuests([...activeExisting, ...gapQuests], confidence);
  return [...ranked, ...doneQuests];
}
