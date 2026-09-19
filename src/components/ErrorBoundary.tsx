import React from "react";
import { reportError } from "../lib/reporter";

interface S {
  failed: boolean;
  message: string;
}

/** Catches render crashes so the IDE never goes blank. */
export default class ErrorBoundary extends React.Component<{ children: React.ReactNode }, S> {
  state: S = { failed: false, message: "" };

  static getDerivedStateFromError(e: unknown): S {
    return { failed: true, message: e instanceof Error ? e.message : String(e) };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError("fatal", error, { componentStack: (info.componentStack || "").slice(0, 2000) });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div
        style={{
          height: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0b0e14",
          color: "#fff",
          fontFamily: "system-ui",
          padding: 24,
          textAlign: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 44 }}>⚡</div>
          <h2>Nova IDE hit a glitch</h2>
          <p style={{ color: "#8b93a9", maxWidth: 460 }}>{this.state.message}</p>
          <button
            onClick={() => {
              try {
                localStorage.removeItem("nova-settings");
              } catch { /* ignore */ }
              location.reload();
            }}
            style={{
              background: "linear-gradient(135deg,#7c5cff,#00d4ff)",
              border: "none",
              color: "#fff",
              padding: "10px 22px",
              borderRadius: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset & reload
          </button>
        </div>
      </div>
    );
  }
}
