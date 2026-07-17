import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

// Without this, ANY render error anywhere in the app unmounts the entire tree with
// no recovery — and since the page background is near-black, a crashed app looks
// exactly like "it went black and nothing works." This turns that into a recoverable
// screen that also shows what actually broke, instead of a silent permanent crash.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null, componentStack: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) {
    console.error("App crashed:", error, info);
    this.setState({ componentStack: info?.componentStack || null });
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ minHeight: "100vh", background: "#1B140D", color: "#F3E7C9",
          fontFamily: "system-ui, sans-serif", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Something broke.</div>
          <div style={{ fontSize: 12, color: "#B79A6E", maxWidth: 320, marginBottom: 6 }}>
            This is the actual error, so it can be fixed for real instead of guessed at:
          </div>
          <div style={{ fontSize: 11, color: "#F0567A", background: "#00000040", padding: 10,
            borderRadius: 8, maxWidth: 340, wordBreak: "break-word", marginBottom: 12 }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          {this.state.componentStack && (
            <>
              <div style={{ fontSize: 11, color: "#B79A6E", maxWidth: 320, marginBottom: 6 }}>
                Which component was rendering when it broke — this is the exact thing needed to find it:
              </div>
              <div style={{ fontSize: 9.5, color: "#D9A441", background: "#00000040", padding: 10,
                borderRadius: 8, maxWidth: 340, maxHeight: 160, overflow: "auto", textAlign: "left",
                whiteSpace: "pre-wrap", wordBreak: "break-word", marginBottom: 18, fontFamily: "monospace" }}>
                {this.state.componentStack.trim()}
              </div>
            </>
          )}
          <button onClick={() => this.setState({ error: null, componentStack: null })} style={{ padding: "10px 20px",
            borderRadius: 10, border: "none", background: "#D9A441", color: "#1B140D",
            fontWeight: 700, fontSize: 13 }}>
            Try to recover
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);