import { Check, Moon, Sun, MonitorSmartphone } from "lucide-react";
import React from "react";
import { ACCENTS, useIDE, type Accent } from "../store/useIDE";
import {
  clearReports,
  flushQueue,
  getQueueLength,
  peekReports,
  reportError,
  setReportEndpoint,
} from "../lib/reporter";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="set-row">
      <span>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onFlip }: { on: boolean; onFlip: () => void }) {
  return (
    <button className={`switch ${on ? "on" : ""}`} onClick={onFlip} aria-pressed={on}>
      <span className="knob" />
    </button>
  );
}

export default function SettingsPanel() {
  const { settings: s, updateSettings: u } = useIDE();
  const set = (p: Partial<typeof s>) => u(p);

  return (
    <div style={{ padding: "0 4px" }}>
      <div className="grp">appearance</div>
      <div className="seg3">
        {(
          [
            { id: "dark", icon: <Moon size={14} />, t: "Dark" },
            { id: "light", icon: <Sun size={14} />, t: "Light" },
            { id: "auto", icon: <MonitorSmartphone size={14} />, t: "Auto" },
          ] as const
        ).map((o) => (
          <button
            key={o.id}
            className={s.theme === o.id ? "on" : ""}
            onClick={() => set({ theme: o.id })}
          >
            {o.icon} {o.t}
          </button>
        ))}
      </div>
      <div className="swatches">
        {(Object.keys(ACCENTS) as Accent[]).map((k) => (
          <button
            key={k}
            title={ACCENTS[k].name}
            className={`sw ${s.accent === k ? "on" : ""}`}
            style={{ background: `linear-gradient(135deg, ${ACCENTS[k].a}, ${ACCENTS[k].b})` }}
            onClick={() => set({ accent: k })}
          >
            {s.accent === k && <Check size={13} color="#fff" />}
          </button>
        ))}
      </div>

      <div className="grp">editor</div>
      <Row label="Font size">
        <input type="range" min={10} max={24} step={0.5} value={s.fontSize} onChange={(e) => set({ fontSize: Number(e.target.value) })} />
        <b>{s.fontSize}</b>
      </Row>
      <Row label="Tab size">
        <div className="seg">
          {[2, 4, 8].map((n) => (
            <button key={n} className={s.tabSize === n ? "on" : ""} onClick={() => set({ tabSize: n })}>
              {n}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Line numbers">
        <div className="seg">
          {(["on", "relative", "off"] as const).map((v) => (
            <button key={v} className={s.lineNumbers === v ? "on" : ""} onClick={() => set({ lineNumbers: v })}>
              {v}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Cursor">
        <div className="seg">
          {(["line", "block", "underline"] as const).map((v) => (
            <button key={v} className={s.cursorStyle === v ? "on" : ""} onClick={() => set({ cursorStyle: v })}>
              {v}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Whitespace">
        <div className="seg">
          {(["none", "boundary", "all"] as const).map((v) => (
            <button key={v} className={s.renderWhitespace === v ? "on" : ""} onClick={() => set({ renderWhitespace: v })}>
              {v}
            </button>
          ))}
        </div>
      </Row>
      <Row label="Minimap"><Toggle on={s.minimap} onFlip={() => set({ minimap: !s.minimap })} /></Row>
      <Row label="Word wrap"><Toggle on={s.wordWrap} onFlip={() => set({ wordWrap: !s.wordWrap })} /></Row>
      <Row label="Ligatures"><Toggle on={s.fontLigatures} onFlip={() => set({ fontLigatures: !s.fontLigatures })} /></Row>
      <Row label="Bracket colors"><Toggle on={s.bracketColors} onFlip={() => set({ bracketColors: !s.bracketColors })} /></Row>
      <Row label="Sticky scroll"><Toggle on={s.stickyScroll} onFlip={() => set({ stickyScroll: !s.stickyScroll })} /></Row>
      <Row label="Smooth scroll"><Toggle on={s.smoothScrolling} onFlip={() => set({ smoothScrolling: !s.smoothScrolling })} /></Row>
      <Row label="Pinch zoom"><Toggle on={s.mouseWheelZoom} onFlip={() => set({ mouseWheelZoom: !s.mouseWheelZoom })} /></Row>
      <Row label="Top padding">
        <input type="range" min={0} max={40} step={2} value={s.paddingTop} onChange={(e) => set({ paddingTop: Number(e.target.value) })} />
        <b>{s.paddingTop}</b>
      </Row>

      <div className="grp">files & save</div>
      <Row label="Auto save"><Toggle on={s.autoSave} onFlip={() => set({ autoSave: !s.autoSave })} /></Row>
      <Row label="Delay (ms)">
        <input type="range" min={300} max={5000} step={100} value={s.autoSaveDelay} onChange={(e) => set({ autoSaveDelay: Number(e.target.value) })} />
        <b>{s.autoSaveDelay}</b>
      </Row>
      <Row label="Confirm delete"><Toggle on={s.confirmDelete} onFlip={() => set({ confirmDelete: !s.confirmDelete })} /></Row>

      <div className="grp">terminal</div>
      <Row label="Term font">
        <input type="range" min={10} max={20} step={0.5} value={s.terminalFontSize} onChange={(e) => set({ terminalFontSize: Number(e.target.value) })} />
        <b>{s.terminalFontSize}</b>
      </Row>

      <div className="grp">nova ai (openrouter)</div>
      <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <span>API key — stays on this device only</span>
        <input
          type="password"
          value={s.openrouterKey}
          onChange={(e) => set({ openrouterKey: e.target.value.trim() })}
          placeholder="sk-or-v1-… (your own key, or set a proxy below)"
          spellCheck={false}
          style={{
            background: "var(--bg-1)",
            borderRadius: 9,
            padding: "9px 11px",
            color: "var(--txt-0)",
            fontSize: 12,
            outline: "none",
            fontFamily: "var(--mono)",
          }}
        />
        <span>Endpoint — your proxy URL, or empty for OpenRouter directly</span>
        <input
          value={s.aiEndpoint}
          onChange={(e) => set({ aiEndpoint: e.target.value.trim() })}
          placeholder="https://<worker>.workers.dev/v1"
          spellCheck={false}
          style={{
            background: "var(--bg-1)",
            borderRadius: 9,
            padding: "9px 11px",
            color: "var(--txt-0)",
            fontSize: 12,
            outline: "none",
            fontFamily: "var(--mono)",
          }}
        />
        <span>App secret — only if your proxy set one (sent as X-App-Secret)</span>
        <input
          type="password"
          value={s.appSecret}
          onChange={(e) => set({ appSecret: e.target.value.trim() })}
          placeholder="empty = none"
          spellCheck={false}
          style={{
            background: "var(--bg-1)",
            borderRadius: 9,
            padding: "9px 11px",
            color: "var(--txt-0)",
            fontSize: 12,
            outline: "none",
            fontFamily: "var(--mono)",
          }}
        />
        <span style={{ fontSize: 11, color: "var(--txt-3)" }}>
          Free models only (:free). Your key stays on this device
          (localStorage) — it is never baked into the app. Prefer the
          proxy (ai-proxy/worker.js) for shared installs.
        </span>
      </div>

      <div className="grp">comfort</div>
      <Row label="Reduce motion"><Toggle on={s.reduceMotion} onFlip={() => set({ reduceMotion: !s.reduceMotion })} /></Row>

      <ReportsSection />

      <div className="ph">Settings save on this device and apply instantly — no restart.</div>
    </div>
  );
}

function ReportsSection() {
  const { notify } = useIDE();
  const [pending, setPending] = React.useState(getQueueLength());
  const [endpoint, setEndpoint] = React.useState(
    () => useIDE.getState().settings.errorEndpoint,
  );

  const refresh = () => setPending(getQueueLength());

  const saveEndpoint = () => {
    useIDE.getState().updateSettings({ errorEndpoint: endpoint.trim() });
    setReportEndpoint(endpoint.trim());
    void flushQueue().then(refresh);
    notify("success", endpoint.trim() ? "Custom reports endpoint saved." : "Using the built-in developer channel.");
    refresh();
  };

  const sendTest = async () => {
    reportError("test", "Manual test report from Settings", { by: "user" });
    const r = await flushQueue();
    refresh();
    notify(
      r.sent > 0 ? "success" : "info",
      r.sent > 0 ? `Test report sent (${r.pending} pending).` : "No endpoint — test report queued on-device.",
    );
  };

  const copyLatest = async () => {
    const all = peekReports();
    if (all.length === 0) {
      notify("info", "No reports queued.");
      return;
    }
    try {
      await navigator.clipboard?.writeText(JSON.stringify(all[all.length - 1], null, 2));
      notify("success", "Latest report copied — paste it to the developer.");
    } catch {
      notify("error", "Clipboard unavailable on this device.");
    }
  };

  return (
    <>
      <div className="grp">error reports ({pending} pending)</div>
      <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        <span>Server URL — mandatory built-in channel is used when empty</span>
        <input
          value={endpoint}
          onChange={(e) => setEndpoint(e.target.value)}
          placeholder="built-in developer channel (or paste your own)"
          spellCheck={false}
          style={{
            background: "var(--bg-1)",
            borderRadius: 9,
            padding: "9px 11px",
            color: "var(--txt-0)",
            fontSize: 12,
            outline: "none",
            fontFamily: "var(--mono)",
          }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={saveEndpoint}>Save</button>
          <button className="btn" onClick={sendTest}>Send test</button>
          <button className="btn" onClick={copyLatest}>Copy latest</button>
          <button
            className="btn"
            onClick={() => {
              clearReports();
              refresh();
              notify("info", "Report queue cleared.");
            }}
          >
            Clear
          </button>
        </div>
        <span style={{ fontSize: 11, color: "var(--txt-3)" }}>
          Catches crashes, failed saves, blocked commands — with device, app
          state and recent logs. Secrets are scrubbed before storing.
          Discord webhook URLs work directly (auto-formatted): Discord channel
          → Settings → Integrations → Webhooks → Copy URL → paste here.
        </span>
      </div>
    </>
  );
}
