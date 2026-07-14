import { useEffect, useState } from "react";
import { Activity, Dumbbell } from "lucide-react";
import { storageGet, storageSet } from "./lib/storage";
import { callModel, allText } from "./lib/model";
import TrainingGrounds from "./training/TrainingGrounds";

const C = { ink: "#0B0D12", surface: "#15181F", hair: "#282D38", text: "#EDE7D9", muted: "#8A8F9C", teal: "#34D9C0", rose: "#F0567A" };

export default function App() {
  const [tab, setTab] = useState("training");
  return (
    <div style={{ minHeight: "100vh", background: C.ink }}>
      <div style={{ paddingBottom: 72 }}>
        {tab === "training" && <TrainingGrounds />}
        {tab === "health" && <HealthCheck />}
      </div>
      <nav style={{ position: "fixed", bottom: 0, left: 0, right: 0, maxWidth: 520, margin: "0 auto",
        display: "flex", justifyContent: "space-around", background: "rgba(11,13,18,0.94)",
        backdropFilter: "blur(12px)", borderTop: `1px solid ${C.hair}`,
        paddingBottom: "env(safe-area-inset-bottom, 0px)" }}>
        <NavBtn active={tab === "training"} onClick={() => setTab("training")} icon={Dumbbell} label="Training" />
        <NavBtn active={tab === "health"} onClick={() => setTab("health")} icon={Activity} label="System" />
      </nav>
    </div>
  );
}

function NavBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button onClick={onClick} style={{ flex: 1, padding: "10px 0", background: "none", border: "none",
      cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
      color: active ? C.teal : C.muted }}>
      <Icon size={20} />
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10 }}>{label}</span>
    </button>
  );
}

function HealthCheck() {
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

  const box = { marginTop: 16, padding: 16, background: C.surface, borderRadius: 10, border: `1px solid ${C.hair}` };
  return (
    <div style={{ color: C.text, fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>System check</h1>
      <div style={box}>
        <strong>Firestore storage:</strong>{" "}
        {storageOk === null ? "checking…" : storageOk
          ? <span style={{ color: C.teal }}>✓ OK</span>
          : <span style={{ color: C.rose }}>✗ check Firebase env + rules</span>}
      </div>
      <div style={box}>
        <strong>Model proxy:</strong>
        <div style={{ marginTop: 10 }}>
          <button onClick={testModel} disabled={busy} style={{ background: C.teal, color: C.ink, border: "none",
            borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}>
            {busy ? "Testing…" : "Test model call"}
          </button>
        </div>
        {reply && <p style={{ color: C.teal, marginTop: 10 }}>✓ {reply}</p>}
        {err && <p style={{ color: C.rose, marginTop: 10 }}>✗ {err}</p>}
      </div>
    </div>
  );
}
