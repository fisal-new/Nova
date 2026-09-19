import {
  Bug,
  Files,
  GitBranch,
  Package,
  PanelLeft,
  Play,
  Search,
  Settings as SettingsIcon,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect } from "react";
import CommandPalette from "./components/CommandPalette";
import AIPanel from "./components/AIPanel";
import DebugPanel from "./components/DebugPanel";
import EditorArea from "./components/EditorArea";
import Explorer from "./components/Explorer";
import GitPanel from "./components/GitPanel";
import MobileBar from "./components/MobileBar";
import Modal from "./components/Modal";
import SearchPanel from "./components/SearchPanel";
import SettingsPanel from "./components/SettingsPanel";
import StatusBar from "./components/StatusBar";
import TerminalPanel from "./components/TerminalPanel";
import Terms, { termsAccepted } from "./components/Terms";
import Toasts from "./components/Toasts";
import { installReporter, setReportEndpoint, setReportSecret, flushQueue } from "./lib/reporter";
import { useIDE, applySettingsToDom } from "./store/useIDE";
import { useState } from "react";

const TITLES: Record<string, string> = {
  explorer: "Explorer",
  search: "Search",
  git: "Source control",
  debug: "Run & Debug",
  extensions: "Extensions",
  settings: "Settings",
  ai: "Nova AI",
};

export default function App() {
  const {
    sidebarView, setSidebar, sidebarOpen, toggleSidebar,
    setPalette, setPanel, saveActive, saveAll,
    refreshTree, refreshGit, settings, runActive, debugActive,
  } = useIDE();

  useEffect(() => {
    applySettingsToDom(useIDE.getState().settings);
    // error reporting starts ONLY after Terms acceptance (see effect below),
    // so nothing is ever sent before consent — endpoint is still recorded now
    setReportEndpoint(useIDE.getState().settings.errorEndpoint);
    setReportSecret(useIDE.getState().settings.appSecret);
    // Real writable workspace: phones return content:// URIs from the system
    // picker and /demo doesn't exist on disk — so default to the app's own
    // data folder (a real filesystem path where Rust fs + sandbox work).
    (async () => {
      try {
        const [{ isTauri, apiCreateDir }, pathApi] = await Promise.all([
          import("./lib/tauri"),
          import("@tauri-apps/api/path"),
        ]);
        if (isTauri) {
          const dir = await pathApi.join(await pathApi.appDataDir(), "workspace");
          await apiCreateDir(dir).catch(() => {});
          useIDE.getState().setRoot(dir);
        } else {
          useIDE.getState().refreshTree();
        }
      } catch {
        useIDE.getState().refreshTree();
      }
      useIDE.getState().refreshGit();
    })();
    // phones: start with chrome hidden so the editor owns the screen
    try {
      if (window.matchMedia?.("(pointer: coarse)").matches) {
        useIDE.setState({ sidebarOpen: false, panelOpen: false });
      }
    } catch { /* ignore */ }
    // warn about unsaved tabs when closing / reloading (desktop web)
    const guard = (e: BeforeUnloadEvent) => {
      const dirty = useIDE.getState().tabs.some((t) => t.content !== t.savedContent);
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);

  useEffect(() => {
    applySettingsToDom(settings);
    setReportEndpoint(settings.errorEndpoint);
    setReportSecret(settings.appSecret);
    void flushQueue();
  }, [settings]);

  // follow OS theme while "auto" is selected
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const sync = () => {
      if (useIDE.getState().settings.theme === "auto") {
        applySettingsToDom(useIDE.getState().settings);
      }
    };
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // terms gate state (rendered after ALL hooks below)
  const [accepted, setAccepted] = useState(() => termsAccepted());

  // Error reporting hooks install only AFTER consent — nothing (not even
  // queued reports) leaves the device before the user accepts Terms.
  useEffect(() => {
    if (!accepted) return;
    installReporter();
    void flushQueue();
  }, [accepted]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); setPalette(true); }
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) saveAll();
        else saveActive();
      }
      if (mod && e.key === "`") { e.preventDefault(); setPanel(!useIDE.getState().panelOpen); }
      if (mod && e.key.toLowerCase() === "b") { e.preventDefault(); toggleSidebar(); }
      if (e.key === "F5") {
        e.preventDefault();
        if (e.shiftKey || e.ctrlKey || e.metaKey) debugActive();
        else runActive();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setPalette, setPanel, saveActive, saveAll, toggleSidebar, runActive, debugActive]);

  // Gate AFTER all hooks: IDE stays hidden until terms are accepted
  // (re-shown automatically when TERMS_VERSION bumps).
  if (!accepted) {
    return (
      <div className="ide">
        <Terms onAccept={() => setAccepted(true)} />
      </div>
    );
  }

  return (
    <div className="ide">
      <div className="titlebar">
        <button className="icon-btn hide-m" onClick={toggleSidebar} title="Toggle sidebar (Ctrl+B)">
          <PanelLeft size={16} />
        </button>
        <div className="brand">
          <span className="brand-mark">⚡</span>
          Nova IDE
          <small>v0.8.6</small>
        </div>
        <div className="omnibox" onClick={() => setPalette(true)}>
          <Search size={14} />
          <span className="hide-m">Search files, or type &gt; for commands…</span>
        </div>
        <div className="title-actions">
          <button
            className="btn btn-primary"
            onClick={() => runActive()}
            title="Run current file (F5)"
          >
            <Play size={14} /> <span className="hide-m">Run</span>
          </button>
        </div>
      </div>

      <div className="workspace">
        <div className="activity">
          <button
            className={`icon-btn ${sidebarView === "explorer" && sidebarOpen ? "active" : ""}`}
            title="Explorer"
            onClick={() => (sidebarView === "explorer" ? toggleSidebar() : setSidebar("explorer"))}
          >
            <Files size={19} />
          </button>
          <button
            className={`icon-btn ${sidebarView === "search" && sidebarOpen ? "active" : ""}`}
            title="Search"
            onClick={() => (sidebarView === "search" ? toggleSidebar() : setSidebar("search"))}
          >
            <Search size={19} />
          </button>
          <button
            className={`icon-btn ${sidebarView === "git" && sidebarOpen ? "active" : ""}`}
            title="Source control"
            onClick={() => (sidebarView === "git" ? toggleSidebar() : setSidebar("git"))}
          >
            <GitBranch size={19} />
          </button>
          <button
            className={`icon-btn ${sidebarView === "debug" && sidebarOpen ? "active" : ""}`}
            title="Run & Debug"
            onClick={() => (sidebarView === "debug" ? toggleSidebar() : setSidebar("debug"))}
          >
            <Bug size={19} />
          </button>
          <button
            className={`icon-btn ${sidebarView === "extensions" && sidebarOpen ? "active" : ""}`}
            title="Extensions"
            onClick={() => (sidebarView === "extensions" ? toggleSidebar() : setSidebar("extensions"))}
          >
            <Package size={19} />
          </button>
          <div className="spacer" />
          <button
            className={`icon-btn ${sidebarView === "ai" && sidebarOpen ? "active" : ""}`}
            title="Nova AI"
            onClick={() => (sidebarView === "ai" ? toggleSidebar() : setSidebar("ai"))}
          >
            <Sparkles size={18} />
          </button>
          <button
            className={`icon-btn ${sidebarView === "settings" && sidebarOpen ? "active" : ""}`}
            title="Settings"
            onClick={() => (sidebarView === "settings" ? toggleSidebar() : setSidebar("settings"))}
          >
            <SettingsIcon size={18} />
          </button>
        </div>

        <aside className={`sidebar ${sidebarOpen ? "" : "hidden"}`}>
          <div className="side-head">
            <h3>{TITLES[sidebarView] ?? sidebarView}</h3>
            <button className="icon-btn drawer-close" title="Close panel" onClick={toggleSidebar} aria-label="Close panel">
              <X size={16} />
            </button>
          </div>
          <div className="side-body">
            {sidebarView === "explorer" && <Explorer />}
            {sidebarView === "search" && <SearchPanel />}
            {sidebarView === "git" && <GitPanel />}
            {sidebarView === "debug" && <DebugPanel />}
            {sidebarView === "ai" && <AIPanel />}
            {sidebarView === "settings" && <SettingsPanel />}
            {sidebarView === "extensions" && (
              <div>
                {[
                  { n: "Snippets + keywords", d: "built-in completion", e: "✨" },
                  { n: "Diagnostics", d: "Problems panel • builtin", e: "🩺" },
                  { n: "Git", d: "Status/diff/commit • builtin", e: "🌿" },
                  { n: "Themes", d: "Dark + Light • builtin", e: "🎨" },
                ].map((x) => (
                  <div key={x.n} className="ext-row">
                    <div className="ext-ico">{x.e}</div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{x.n}</div>
                      <div style={{ fontSize: 11.5, color: "var(--txt-2)" }}>{x.d}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>

        <div className="main-col">
          <EditorArea />
          <TerminalPanel />
        </div>
      </div>

      <StatusBar />
      <MobileBar />
      {sidebarOpen && (
        <div
          className="drawer-bg"
          onClick={toggleSidebar}
          aria-hidden="true"
        />
      )}
      <Modal />
      <Toasts />
      <CommandPalette />
    </div>
  );
}
