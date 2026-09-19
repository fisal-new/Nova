import { ChevronDown, ChevronUp, TerminalSquare, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { revealLine } from "../lib/editorRef";
import { useIDE } from "../store/useIDE";

export default function TerminalPanel() {
  const {
    panelOpen, panelTab, setPanel, terminalLines, runTerminal,
    clearTerminal, terminalCwd, rootPath, diagnostics, outputLines, debugLines,
    tabs, activePath, openFile, settings,
  } = useIDE();
  const [cmd, setCmd] = useState("");
  const [hist, setHist] = useState<string[]>([]);
  const [hi, setHi] = useState(-1);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999 });
  }, [terminalLines, panelTab, panelOpen]);

  const exec = async () => {
    const raw = cmd;
    setCmd("");
    if (raw.trim()) {
      setHist((h) => [raw, ...h].slice(0, 100));
      setHi(-1);
    }
    await runTerminal(raw);
  };

  if (!panelOpen) {
    return (
      <div className="panel collapsed">
        <div className="panel-tabs">
          <button className="panel-tab" onClick={() => setPanel(true)}>▸ Terminal</button>
          <span style={{ flex: 1 }} />
          <button className="icon-btn" onClick={() => setPanel(true)}><ChevronUp size={15} /></button>
        </div>
      </div>
    );
  }

  const active = tabs.find((t) => t.path === activePath);

  return (
    <div className="panel">
      <div className="panel-tabs">
        {(["terminal", "problems", "output", "debug"] as const).map((t) => (
          <button
            key={t}
            className={`panel-tab ${panelTab === t ? "active" : ""}`}
            onClick={() => setPanel(true, t)}
          >
            {t}{t === "problems" && diagnostics.length > 0 ? ` (${diagnostics.length})` : ""}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button className="icon-btn" onClick={clearTerminal} title="Clear"><Trash2 size={14} /></button>
        <button className="icon-btn" onClick={() => setPanel(false)}><ChevronDown size={15} /></button>
        <button className="icon-btn" onClick={() => setPanel(false)}><X size={14} /></button>
      </div>

      {panelTab === "terminal" && (
        <>
          <div className="terminal-scroll" ref={scrollRef} style={{ fontSize: settings.terminalFontSize }}>
            {terminalLines.map((l, i) => (
              <div key={i} className={`t-line ${l.startsWith("$") ? "ok" : ""}`}>{l}</div>
            ))}
          </div>
          <div className="terminal-input" style={{ fontSize: settings.terminalFontSize }}>
            <TerminalSquare size={14} color="#9aa1b8" />
            <span title={terminalCwd || rootPath}>›</span>
            <input
              value={cmd}
              style={{ fontSize: settings.terminalFontSize }}
              onChange={(e) => setCmd(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") exec();
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  const n = Math.min(hi + 1, hist.length - 1);
                  setHi(n);
                  if (hist[n]) setCmd(hist[n]);
                }
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  const n = hi - 1;
                  setHi(Math.max(-1, n));
                  setCmd(n >= 0 ? hist[n] ?? "" : "");
                }
              }}
              placeholder={`terminal — ${terminalCwd || rootPath || "…"} (help)`}
              spellCheck={false}
            />
          </div>
        </>
      )}
      {panelTab === "problems" && (
        <div className="terminal-scroll">
          {diagnostics.length === 0 && (
            <div className="t-line">✓ No problems in {active?.name ?? "open file"} — clean.</div>
          )}
          {diagnostics.map((d, i) => (
            <div
              key={i}
              className="t-line prob"
              onClick={async () => {
                if (!active) return;
                await openFile(active.path, active.name);
                requestAnimationFrame(() => setTimeout(() => revealLine(d.line, d.col), 60));
              }}
              title="Click to jump to this problem"
            >
              <span className={`sev ${d.severity}`}>{d.severity}</span>
              {" "}Ln {d.line}, Col {d.col}: {d.message}
            </div>
          ))}
        </div>
      )}
      {panelTab === "output" && (
        <div className="terminal-scroll">
          {outputLines.map((l, i) => (
            <div key={i} className="t-line">{l}</div>
          ))}
        </div>
      )}
      {panelTab === "debug" && (
        <div className="terminal-scroll">
          {debugLines.map((l, i) => (
            <div key={i} className={`t-line ${l.startsWith("●") ? "ok" : ""}`}>{l}</div>
          ))}
        </div>
      )}
    </div>
  );
}
