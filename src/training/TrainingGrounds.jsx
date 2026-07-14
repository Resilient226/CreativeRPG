import { useEffect, useRef, useState } from "react";
import {
  Loader2, Send, ArrowLeft, Sparkles, Brain, Globe, GraduationCap,
  TrendingUp, ShieldCheck, MessageSquare, X, Check,
} from "lucide-react";
import { SKILL_KEYS, SKILL_META, xpToNext } from "./skills";
import { EVELYN_SEED } from "./evelyn";
import { loadSkills, loadNpc } from "./data";
import { runNpcTurn, resolveOffer } from "./engine";
import { summarizeMemory, runMentor } from "./mentor";

const C = {
  ink: "#0B0D12", surface: "#15181F", raised: "#1B1F28", hair: "#282D38",
  text: "#EDE7D9", muted: "#8A8F9C", teal: "#34D9C0", violet: "#B073F0",
  amber: "#E8A33D", rose: "#F0567A",
};
const mono = "'JetBrains Mono', ui-monospace, monospace";
const serif = "'Newsreader', Georgia, serif";

// Short, honest artist context. In the full app this comes from real inventory/goal.
const ARTIST_CONTEXT =
  "Emerging abstract painter. Recent works: 'Persistence of Alchemy' (48x60), 'Golden Unfolding' (36x48), 'City of Becoming' (48x48). Goal: build toward $100k/yr. Asking prices roughly $2,500–$4,500.";

function SimBadge() {
  return (
    <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.ink,
      background: C.amber, padding: "2px 6px", borderRadius: 4, fontWeight: 700 }}>
      SIM
    </span>
  );
}

function SkillBar({ k, s }) {
  const need = xpToNext(s.level);
  const pct = Math.min(100, (s.xp / need) * 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
          {SKILL_META[k].label}
        </span>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.muted }}>
          L{s.level} · {s.xp}/{need}
        </span>
      </div>
      <div style={{ height: 8, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%",
          background: `linear-gradient(90deg, ${C.teal}55, ${C.teal})` }} />
      </div>
    </div>
  );
}

function Meter({ label, value, color }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{label}</span>
        <span style={{ fontFamily: mono, fontSize: 11, color: C.text }}>{value}/100</span>
      </div>
      <div style={{ height: 6, background: "rgba(255,255,255,0.05)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color }} />
      </div>
    </div>
  );
}

function Monogram({ name, size = 56 }) {
  const initials = name.split(" ").map((w) => w[0]).slice(0, 2).join("");
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg, ${C.violet}, ${C.teal})`, color: C.ink,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: serif, fontStyle: "italic", fontSize: size * 0.36, fontWeight: 600 }}>
      {initials}
    </div>
  );
}

export default function TrainingGrounds() {
  const [view, setView] = useState("world"); // world | talk | mentor
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState(null);
  const [npc, setNpc] = useState(null);
  const [xpFlash, setXpFlash] = useState(null);

  useEffect(() => {
    (async () => {
      const [s, n] = await Promise.all([loadSkills(), loadNpc()]);
      setSkills(s); setNpc(n); setLoading(false);
    })();
  }, []);

  function flashXp(applied) {
    if (applied && Object.keys(applied).length) {
      setXpFlash(applied);
      setTimeout(() => setXpFlash(null), 2200);
    }
  }

  if (loading) {
    return (
      <Screen>
        <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}>
          <Loader2 className="spin" color={C.teal} />
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      {view === "world" && (
        <WorldView
          skills={skills} npc={npc} xpFlash={xpFlash}
          onTalk={() => setView("talk")} onMentor={() => setView("mentor")}
        />
      )}
      {view === "talk" && (
        <TalkView
          npc={npc} skills={skills}
          setNpc={setNpc} setSkills={setSkills} flashXp={flashXp}
          onBack={() => setView("world")}
        />
      )}
      {view === "mentor" && (
        <MentorView skills={skills} onBack={() => setView("world")} />
      )}
    </Screen>
  );
}

function Screen({ children }) {
  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.text,
      maxWidth: 520, margin: "0 auto", paddingBottom: 40 }}>
      <style>{`.spin{animation:s 1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}`}</style>
      {children}
    </div>
  );
}

function Header({ title, onBack, badge }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 18px 12px",
      borderBottom: `1px solid ${C.hair}`, position: "sticky", top: 0, background: C.ink, zIndex: 5 }}>
      {onBack && (
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <ArrowLeft color={C.muted} size={20} />
        </button>
      )}
      <span style={{ fontFamily: mono, fontSize: 15, letterSpacing: 1, fontWeight: 600 }}>{title}</span>
      {badge}
    </div>
  );
}

// ---------------- WORLD ----------------
function WorldView({ skills, npc, onTalk, onMentor, xpFlash }) {
  return (
    <>
      <Header title="TRAINING GROUNDS" badge={<SimBadge />} />
      <div style={{ padding: 18 }}>
        {xpFlash && (
          <div style={{ marginBottom: 14, padding: 10, borderRadius: 8, background: `${C.teal}18`,
            border: `1px solid ${C.teal}44`, fontFamily: mono, fontSize: 12, color: C.teal }}>
            +XP {Object.entries(xpFlash).map(([k, v]) => `${SKILL_META[k]?.label || k} ${v > 0 ? "+" : ""}${v}`).join("  ·  ")}
          </div>
        )}

        <SectionTitle icon={TrendingUp}>Your skills</SectionTitle>
        <Card>
          {SKILL_KEYS.map((k) => <SkillBar key={k} k={k} s={skills[k]} />)}
        </Card>

        <SectionTitle icon={Globe}>Practice partner</SectionTitle>
        <Card>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
            {npc.portrait ? (
              <img src={npc.portrait} alt="" style={{ width: 56, height: 56, borderRadius: "50%", objectFit: "cover" }} />
            ) : <Monogram name={npc.name} />}
            <div>
              <div style={{ fontFamily: serif, fontStyle: "italic", fontSize: 19 }}>{npc.name}</div>
              <div style={{ fontFamily: mono, fontSize: 12, color: C.muted }}>
                Collector · mood: <span style={{ color: C.teal }}>{npc.state.mood}</span>
              </div>
            </div>
          </div>

          <Meter label="Relationship" value={npc.state.relationshipScore} color={C.violet} />
          <Meter label="Trust" value={npc.state.trust} color={C.teal} />
          <Meter label="Interest" value={npc.state.interest} color={C.amber} />

          <p style={{ fontFamily: serif, fontSize: 14, color: C.text, marginTop: 12, lineHeight: 1.5 }}>
            {npc.seed.backstory}
          </p>
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 4 }}>
              HER LIFE RIGHT NOW
            </div>
            <div style={{ fontFamily: serif, fontSize: 14, color: C.text }}>{npc.life.currentFocus}</div>
          </div>
          <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.muted, marginBottom: 4 }}>
              WHAT SHE REMEMBERS
            </div>
            <div style={{ fontFamily: serif, fontSize: 14, color: C.muted, fontStyle: "italic" }}>{npc.memorySummary}</div>
          </div>

          <button onClick={onTalk} style={primaryBtn}>
            <MessageSquare size={16} /> Talk to {npc.name.split(" ")[0]}
          </button>
        </Card>

        <button onClick={onMentor} style={{ ...ghostBtn, marginTop: 8 }}>
          <GraduationCap size={16} /> See your mentor
        </button>
      </div>
    </>
  );
}

// ---------------- TALK ----------------
function TalkView({ npc, skills, setNpc, setSkills, flashXp, onBack }) {
  const [history, setHistory] = useState([]); // {role, content}
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [offer, setOffer] = useState(null); // {workTitle, amount, terms, isFirst}
  const [ending, setEnding] = useState(false);
  const [err, setErr] = useState("");
  const endRef = useRef(null);
  const madeOfferBefore = useRef(false);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setErr("");
    const next = [...history, { role: "user", content: text }];
    setHistory(next); setInput(""); setBusy(true);
    try {
      const res = await runNpcTurn({ npc, skills, history: next, artistContext: ARTIST_CONTEXT });
      setNpc(res.npc); setSkills(res.skills); flashXp(res.xpApplied);
      setHistory([...next, { role: "assistant", content: res.turn.dialogue }]);
      if (res.turn.action === "offer" && res.turn.offer && res.turn.offer.amount) {
        const isFirst = !madeOfferBefore.current;
        madeOfferBefore.current = true;
        setOffer({ ...res.turn.offer, isFirst });
      }
    } catch (e) {
      setErr(`Evelyn couldn't respond (${e.message}).`);
    } finally { setBusy(false); }
  }

  async function choose(choice, counterAmount) {
    setBusy(true); setErr("");
    try {
      const res = await resolveOffer({ npc, skills, offer, choice, counterAmount });
      setNpc(res.npc); setSkills(res.skills); flashXp(res.xpApplied);
      setHistory((h) => [...h, { role: "system", content: res.note }]);
      setOffer(null);
    } catch (e) {
      setErr(`Couldn't resolve that (${e.message}).`);
    } finally { setBusy(false); }
  }

  async function endSession() {
    setEnding(true);
    try { await summarizeMemory(npc.id, npc.name.split(" ")[0]); } catch { /* non-fatal */ }
    // reload npc to pick up the fresh summary
    try { const fresh = await loadNpc(npc.id); setNpc(fresh); } catch { /* ignore */ }
    onBack();
  }

  return (
    <>
      <Header title={`TRAINING · ${npc.name.toUpperCase()}`} onBack={endSession} badge={<SimBadge />} />
      <div style={{ padding: 18, paddingBottom: 160 }}>
        {history.length === 0 && (
          <p style={{ fontFamily: serif, fontStyle: "italic", color: C.muted, fontSize: 14 }}>
            Open with a greeting, a pitch, or just show her a piece. She remembers how you carry yourself.
          </p>
        )}
        {history.map((m, i) => {
          if (m.role === "system") {
            return (
              <div key={i} style={{ textAlign: "center", margin: "10px 0", fontFamily: mono,
                fontSize: 11, color: C.amber }}>— {m.content} —</div>
            );
          }
          const isUser = m.role === "user";
          return (
            <div key={i} style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 10 }}>
              <div style={{ maxWidth: "85%", padding: "10px 13px", borderRadius: 16,
                background: isUser ? C.teal : C.raised, color: isUser ? C.ink : C.text,
                border: isUser ? "none" : `1px solid ${C.hair}`, fontFamily: serif, fontSize: 15,
                borderBottomRightRadius: isUser ? 4 : 16, borderBottomLeftRadius: isUser ? 16 : 4 }}>
                {m.content}
              </div>
            </div>
          );
        })}
        {busy && (
          <div style={{ display: "flex", gap: 8, color: C.muted, fontFamily: mono, fontSize: 13 }}>
            <Loader2 className="spin" size={14} /> …
          </div>
        )}
        {err && <p style={{ color: C.rose, fontSize: 13 }}>{err}</p>}
        <div ref={endRef} />
      </div>

      {/* Offer resolution bar */}
      {offer && <OfferBar offer={offer} onChoose={choose} disabled={busy} />}

      {/* Composer */}
      {!offer && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 520, margin: "0 auto",
          padding: 12, background: C.ink, borderTop: `1px solid ${C.hair}` }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <textarea value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Say something to Evelyn…" rows={1}
              style={{ flex: 1, resize: "none", background: "rgba(255,255,255,0.04)", color: C.text,
                border: `1px solid ${C.hair}`, borderRadius: 8, padding: "10px 12px", fontFamily: serif,
                fontSize: 15, outline: "none", minHeight: 44 }} />
            <button onClick={send} disabled={busy || !input.trim()}
              style={{ width: 44, height: 44, borderRadius: 8, border: "none",
                background: input.trim() ? C.teal : C.hair, color: C.ink, cursor: "pointer" }}>
              <Send size={18} />
            </button>
          </div>
          <button onClick={endSession} disabled={ending} style={{ ...ghostBtn, marginTop: 0, padding: "8px" }}>
            {ending ? <Loader2 className="spin" size={14} /> : <Check size={14} />}
            {ending ? "Saving what she'll remember…" : "End session"}
          </button>
        </div>
      )}
    </>
  );
}

function OfferBar({ offer, onChoose, disabled }) {
  const [counter, setCounter] = useState(offer.amount ? String(offer.amount + 500) : "");
  return (
    <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 520, margin: "0 auto",
      padding: 14, background: C.raised, borderTop: `1px solid ${C.violet}66` }}>
      <div style={{ fontFamily: mono, fontSize: 11, color: C.muted, marginBottom: 6 }}>
        HER OFFER{offer.isFirst ? " · first offer" : ""}
      </div>
      <div style={{ fontFamily: serif, fontSize: 16, marginBottom: 4 }}>
        <b style={{ color: C.teal }}>${Number(offer.amount).toLocaleString()}</b>
        {offer.workTitle ? ` for “${offer.workTitle}”` : ""}
      </div>
      {offer.terms && <div style={{ fontFamily: serif, fontSize: 13, color: C.muted, marginBottom: 10 }}>{offer.terms}</div>}

      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <input value={counter} onChange={(e) => setCounter(e.target.value)} inputMode="numeric"
          placeholder="Your counter" style={{ flex: 1, background: "rgba(255,255,255,0.04)", color: C.text,
            border: `1px solid ${C.hair}`, borderRadius: 8, padding: "9px 11px", fontFamily: mono, outline: "none" }} />
        <button disabled={disabled} onClick={() => onChoose("counter", Number(counter) || null)}
          style={{ ...pill(C.violet), flex: "0 0 auto" }}>Counter</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <button disabled={disabled} onClick={() => onChoose("accept")} style={pill(C.teal)}>Accept</button>
        <button disabled={disabled} onClick={() => onChoose("hold")} style={pill(C.amber)}>Hold price</button>
        <button disabled={disabled} onClick={() => onChoose("decline")} style={pill(C.rose)}>Decline</button>
      </div>
    </div>
  );
}

// ---------------- MENTOR ----------------
function MentorView({ skills, onBack }) {
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function analyze() {
    setBusy(true); setErr("");
    try { setData(await runMentor({ skills, artistContext: ARTIST_CONTEXT })); }
    catch (e) { setErr(`Couldn't analyze (${e.message}).`); }
    finally { setBusy(false); }
  }

  return (
    <>
      <Header title="AI MENTOR" onBack={onBack} />
      <div style={{ padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <Brain color={C.violet} size={22} />
          <p style={{ fontFamily: serif, fontSize: 14, color: C.muted, margin: 0 }}>
            Reads your skills and every practice session, then tells you what to fix.
          </p>
        </div>
        <button onClick={analyze} disabled={busy} style={{ ...primaryBtn, marginTop: 0 }}>
          {busy ? <Loader2 className="spin" size={16} /> : <Sparkles size={16} />}
          {data ? "Re-analyze" : "Analyze my practice"}
        </button>
        {err && <p style={{ color: C.rose, fontSize: 13, marginTop: 12 }}>{err}</p>}

        {data && (
          <div style={{ marginTop: 16 }}>
            <p style={{ fontFamily: serif, fontSize: 16, fontStyle: "italic", marginBottom: 14 }}>{data.summary}</p>
            <MentorList title="Patterns" items={data.patterns} color={C.violet} icon="•" />
            <MentorList title="Weaknesses" items={data.weaknesses} color={C.rose} icon="!" />
            <MentorList title="Drills" items={data.drills} color={C.teal} icon="→" />
          </div>
        )}
      </div>
    </>
  );
}

function MentorList({ title, items, color, icon }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1, color: C.muted, marginBottom: 6 }}>
        {title.toUpperCase()}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 8, fontFamily: serif, fontSize: 14 }}>
            <span style={{ color }}>{icon}</span><span>{it}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------- shared bits ----------------
function SectionTitle({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, margin: "18px 0 8px" }}>
      <Icon size={13} color={C.muted} />
      <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: 1.5, color: C.muted, textTransform: "uppercase" }}>
        {children}
      </span>
    </div>
  );
}
function Card({ children }) {
  return <div style={{ background: C.surface, border: `1px solid ${C.hair}`, borderRadius: 12, padding: 16 }}>{children}</div>;
}
const primaryBtn = {
  width: "100%", marginTop: 14, padding: "12px", borderRadius: 10, border: "none",
  background: C.teal, color: C.ink, fontFamily: mono, fontWeight: 600, fontSize: 14,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
};
const ghostBtn = {
  width: "100%", padding: "12px", borderRadius: 10, border: `1px solid ${C.hair}`,
  background: "transparent", color: C.muted, fontFamily: mono, fontSize: 13,
  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
};
function pill(color) {
  return { padding: "11px 8px", borderRadius: 8, border: "none", background: color, color: C.ink,
    fontFamily: mono, fontWeight: 600, fontSize: 13, cursor: "pointer" };
}
