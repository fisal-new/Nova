import { Bell, GitBranch, Wifi, AlertTriangle } from "lucide-react";
import { isTauri } from "../lib/tauri";
import { useIDE } from "../store/useIDE";

export default function StatusBar() {
  const { tabs, activePath, status, panelOpen, setPanel, git, diagnostics, settings, notify, toasts } = useIDE();
  const active = tabs.find((t) => t.path === activePath);
  const dirty = tabs.filter((t) => t.content !== t.savedContent).length;
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.filter((d) => d.severity === "warning").length;
  const gitChanges =
    (git?.modified.length || 0) + (git?.untracked.length || 0) + (git?.staged.length || 0);

  return (
    <div className="statusbar">
      <span className="st" title={git?.is_repo ? "Git repo" : "No git repo"}>
        <GitBranch size={12} /> {git?.branch || "no git"}
        {(git?.ahead || 0) > 0 && ` ↑${git?.ahead}`}
        {(git?.behind || 0) > 0 && ` ↓${git?.behind}`}
        {gitChanges > 0 && ` • ${gitChanges}Δ`}
      </span>
      <span className="st">
        <span className={dirty === 0 ? "ok-dot" : "dirty-dot"} />{" "}
        {dirty === 0 ? "clean" : `${dirty} unsaved`}
      </span>
      <span
        className="st"
        onClick={() => setPanel(true, "problems")}
        style={{ cursor: "pointer" }}
      >
        <AlertTriangle size={12} />{" "}
        {diagnostics.length === 0
          ? "0 problems"
          : `${errors} errors, ${warnings} warnings`}
      </span>
      <span className="st hide-m">{status}</span>
      <span className="st right hide-m">{active ? active.language : "nova"} • {settings.theme} • {settings.fontSize}px</span>
      <span className="st" onClick={() => setPanel(!panelOpen)} style={{ cursor: "pointer" }}>
        <Wifi size={12} /> {isTauri ? "tauri" : "web-demo"}
      </span>
      <span
        className="st"
        title={toasts.length > 0 ? `${toasts.length} active notification(s) — click to recap` : "No notifications"}
        onClick={() => {
          if (toasts.length === 0) {
            notify("info", `Workspace: ${dirty} unsaved • ${errors} errors • ${warnings} warnings • ${gitChanges} git changes`);
          } else {
            toasts.forEach((t) => notify(t.kind, t.msg));
          }
        }}
        style={{ cursor: "pointer" }}
      >
        <Bell size={12} />
        {toasts.length > 0 && ` ${toasts.length}`}
      </span>
    </div>
  );
}
