import { TerminalSquare } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { triggerAction } from "../lib/editorRef";
import { useIDE } from "../store/useIDE";
import type { FileEntry } from "../lib/tauri";
import LanguageIcon from "./LanguageIcon";

function flatten(nodes: FileEntry[]): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (ns: FileEntry[]) => ns.forEach((n) => {
    if (n.is_dir && n.children) walk(n.children);
    else if (!n.is_dir) out.push(n);
  });
  walk(nodes);
  return out;
}

const COMMANDS = [
  { id: "run", label: "Run current file", hint: "F5" },
  { id: "debug", label: "Debug current file", hint: "Ctrl+F5" },
  { id: "find", label: "Find in file", hint: "" },
  { id: "terminal", label: "Toggle terminal", hint: "Ctrl+`" },
  { id: "problems", label: "Show problems", hint: "" },
  { id: "save-all", label: "Save all files", hint: "Ctrl+Shift+S" },
  { id: "theme", label: "Cycle theme dark/light/auto", hint: "" },
  { id: "wrap", label: "Toggle word wrap", hint: "" },
  { id: "minimap", label: "Toggle minimap", hint: "" },
  { id: "autosave", label: "Toggle auto save", hint: "" },
  { id: "ligatures", label: "Toggle font ligatures", hint: "" },
  { id: "font+", label: "Font bigger", hint: "" },
  { id: "font-", label: "Font smaller", hint: "" },
  { id: "git", label: "Open Git panel", hint: "" },
  { id: "debug-panel", label: "Open Debug panel", hint: "" },
  { id: "search", label: "Open search", hint: "" },
  { id: "new-file", label: "New file in project root", hint: "" },
  { id: "refresh", label: "Refresh explorer + git", hint: "" },
  { id: "settings", label: "Open settings", hint: "" },
];

const THEMES = ["dark", "light", "auto"] as const;

export default function CommandPalette() {
  const {
    paletteOpen, setPalette, tree, openFile, setPanel, saveAll,
    pushTerminal, updateSettings, settings, setSidebar, refreshTree, refreshGit,
    runActive, debugActive, newFile, rootPath,
  } = useIDE();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);

  const files = useMemo(() => flatten(tree), [tree]);
  const isCmd = q.startsWith(">");
  const filteredFiles = useMemo(() => {
    const needle = q.toLowerCase();
    if (!needle) return files.slice(0, 20);
    return files.filter((f) => f.path.toLowerCase().includes(needle)).slice(0, 20);
  }, [files, q]);
  const filteredCmds = useMemo(() => {
    const needle = q.slice(1).trim().toLowerCase();
    if (!needle) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(needle));
  }, [q]);

  useEffect(() => {
    if (paletteOpen) {
      setQ("");
      setSel(0);
    }
  }, [paletteOpen]);

  const runCommand = (id: string) => {
    const s = useIDE.getState().settings;
    if (id === "run") runActive();
    else if (id === "debug") debugActive();
    else if (id === "find") triggerAction("actions.find");
    else if (id === "terminal") setPanel(!useIDE.getState().panelOpen, "terminal");
    else if (id === "problems") setPanel(true, "problems");
    else if (id === "save-all") saveAll();
    else if (id === "theme")
      updateSettings({ theme: THEMES[(THEMES.indexOf(s.theme) + 1) % THEMES.length] });
    else if (id === "wrap") updateSettings({ wordWrap: !s.wordWrap });
    else if (id === "minimap") updateSettings({ minimap: !s.minimap });
    else if (id === "autosave") updateSettings({ autoSave: !s.autoSave });
    else if (id === "ligatures") updateSettings({ fontLigatures: !s.fontLigatures });
    else if (id === "font+") updateSettings({ fontSize: Math.min(24, +(s.fontSize + 1).toFixed(1)) });
    else if (id === "font-") updateSettings({ fontSize: Math.max(10, +(s.fontSize - 1).toFixed(1)) });
    else if (id === "git") setSidebar("git");
    else if (id === "debug-panel") setSidebar("debug");
    else if (id === "search") setSidebar("search");
    else if (id === "settings") setSidebar("settings");
    else if (id === "new-file") newFile(useIDE.getState().rootPath);
    else if (id === "refresh") {
      refreshTree();
      refreshGit();
    }
    pushTerminal(`: > ${id}`);
    setPalette(false);
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!paletteOpen) return;
      if (e.key === "Escape") setPalette(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSel((s) => s + 1);
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSel((s) => Math.max(0, s - 1));
      }
      if (e.key === "Enter") {
        if (isCmd) {
          const c = filteredCmds[sel % Math.max(1, filteredCmds.length)];
          if (c) runCommand(c.id);
        } else {
          const f = filteredFiles[sel % Math.max(1, filteredFiles.length)];
          if (f) {
            openFile(f.path, f.name);
            setPalette(false);
          }
        }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [paletteOpen, isCmd, filteredCmds, filteredFiles, sel, openFile, setPalette]);

  if (!paletteOpen) return null;
  const listLen = isCmd ? filteredCmds.length : filteredFiles.length;

  return (
    <div className="overlay" onClick={() => setPalette(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Type file name or > command…"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
          }}
        />
        <div className="palette-list">
          {isCmd
            ? filteredCmds.map((c, i) => (
                <button
                  key={c.id}
                  className={`palette-item ${i === sel % Math.max(1, listLen) ? "sel" : ""}`}
                  onClick={() => runCommand(c.id)}
                >
                  <TerminalSquare size={14} /> {c.label} <small>{c.hint}</small>
                </button>
              ))
            : filteredFiles.map((f, i) => (
                <button
                  key={f.path}
                  className={`palette-item ${i === sel % Math.max(1, listLen) ? "sel" : ""}`}
                  onClick={() => {
                    openFile(f.path, f.name);
                    setPalette(false);
                  }}
                >
                  <LanguageIcon path={f.name} size={20} /> {f.name} <small>{f.path}</small>
                </button>
              ))}
          {listLen === 0 && (
            <div className="ph">No matches. Try “&gt;” for commands.</div>
          )}
        </div>
      </div>
    </div>
  );
}
