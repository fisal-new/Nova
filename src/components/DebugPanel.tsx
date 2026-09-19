import { Bug, CircleDot, Play, Trash2 } from "lucide-react";
import { useIDE } from "../store/useIDE";
import LanguageIcon from "./LanguageIcon";

export default function DebugPanel() {
  const {
    tabs, activePath, breakpoints, toggleBreakpoint, clearBreakpoints,
    debugActive, debugging, setPanel,
  } = useIDE();
  const active = tabs.find((t) => t.path === activePath);
  const entries = Object.entries(breakpoints).filter(([, v]) => v.length > 0);
  const total = entries.reduce((n, [, v]) => n + v.length, 0);

  return (
    <div style={{ padding: "0 4px" }}>
      <button
        className="btn btn-primary"
        style={{ width: "100%", justifyContent: "center", margin: "4px 0 10px" }}
        disabled={debugging || !active}
        onClick={() => {
          debugActive();
          setPanel(true, "debug");
        }}
      >
        {debugging ? "Debugging…" : <><Play size={14} /> Start Debugging</>}
      </button>

      <div className="ph" style={{ padding: "0 8px 6px" }}>
        {active ? (
          <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <LanguageIcon lang={active.language} size={20} /> {active.name} • Python pdb
          </span>
        ) : (
          "Open a Python file to debug."
        )}
        <br />
        Click the gutter (line numbers) to toggle breakpoints.
      </div>

      <div className="grp">
        <Bug size={12} /> breakpoints • {total}
        {total > 0 && (
          <button className="icon-btn" title="Remove all" onClick={() => clearBreakpoints()} style={{ marginLeft: "auto" }}>
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {total === 0 && <div className="ph">No breakpoints yet.</div>}
      {entries.map(([path, lines]) => (
        <div key={path} style={{ marginBottom: 8 }}>
          <div className="grp">{path.split("/").pop()}</div>
          {lines.map((l) => (
            <button
              key={l}
              className="tree-row"
              onClick={() => toggleBreakpoint(path, l)}
              title="Click to remove"
            >
              <CircleDot size={13} color="#ff6369" />
              <span className="fname">line {l}</span>
            </button>
          ))}
        </div>
      ))}

      <div className="grp">how it works</div>
      <div className="ph">
        Nova runs <code>python3 -m pdb</code> with your breakpoints scripted:
        at each stop it prints a backtrace (<code>bt</code>) then continues.
        The full transcript lands in Panel → <b>debug</b>. Fully interactive
        stepping (watches, conditional breakpoints) needs a DAP adapter and
        is on the roadmap.
      </div>
    </div>
  );
}
