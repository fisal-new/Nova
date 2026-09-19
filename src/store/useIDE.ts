import { create } from "zustand";
import { reportError, setSnapshotProvider } from "../lib/reporter";
import {
  apiAnalyze,
  apiCreateDir,
  apiCreateFile,
  apiDelete,
  apiGitBranches,
  apiGitCheckout,
  apiGitCommit,
  apiGitDiff,
  apiGitLog,
  apiGitStatus,
  apiListDir,
  apiReadFile,
  apiRename,
  apiRun,
  apiSearch,
  apiSetSandbox,
  apiSyntaxCheck,
  apiWriteFile,
  detectLanguage,
  friendlyErr,
  languageForPath,
  LANGUAGES,
  type Diagnostic,
  type FileEntry,
  type GitCommit,
  type GitStatus,
  type SearchHit,
} from "../lib/tauri";

export interface OpenTab {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  language: string;
}

export type Accent = "mono" | "violet" | "cyan" | "green" | "orange" | "pink";

export const ACCENTS: Record<Accent, { a: string; b: string; name: string }> = {
  mono: { a: "#e8eaf0", b: "#8b8f9e", name: "Mono" },
  violet: { a: "#7c5cff", b: "#00d4ff", name: "Violet" },
  cyan: { a: "#00d4ff", b: "#3dd68c", name: "Cyan" },
  green: { a: "#3dd68c", b: "#a3e635", name: "Green" },
  orange: { a: "#ff9a3c", b: "#ff6369", name: "Sunset" },
  pink: { a: "#ff7ab8", b: "#9a7bff", name: "Pink" },
};

export interface Settings {
  theme: "dark" | "light" | "auto";
  accent: Accent;
  fontSize: number;
  tabSize: number;
  minimap: boolean;
  wordWrap: boolean;
  autoSave: boolean;
  autoSaveDelay: number;
  lineNumbers: "on" | "off" | "relative";
  cursorStyle: "line" | "block" | "underline";
  renderWhitespace: "none" | "boundary" | "all";
  bracketColors: boolean;
  smoothScrolling: boolean;
  fontLigatures: boolean;
  stickyScroll: boolean;
  mouseWheelZoom: boolean;
  paddingTop: number;
  terminalFontSize: number;
  reduceMotion: boolean;
  confirmDelete: boolean;
  openrouterKey: string;
  /** Custom AI endpoint (proxy). Empty = OpenRouter directly. */
  aiEndpoint: string;
  /** Shared secret sent as X-App-Secret (checked only if the proxy sets it). */
  appSecret: string;
  /** Where error reports are POSTed. Empty = queue locally only. */
  errorEndpoint: string;
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem("nova-settings");
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      // drop unknown/stale keys so future shape changes can't break us
      const clean: Record<string, unknown> = {};
      for (const k of Object.keys(defaults)) {
        if (k in parsed) clean[k] = parsed[k];
      }
      return { ...defaults, ...clean };
    }
  } catch { /* ignore */ }
  return defaults;
}

const defaults: Settings = {
  theme: "dark",
  accent: "mono",
  fontSize: 13.5,
  tabSize: 2,
  minimap: true,
  wordWrap: true,
  autoSave: false,
  autoSaveDelay: 1000,
  lineNumbers: "on",
  cursorStyle: "line",
  renderWhitespace: "none",
  bracketColors: true,
  smoothScrolling: true,
  fontLigatures: true,
  stickyScroll: true,
  mouseWheelZoom: true,
  paddingTop: 14,
  terminalFontSize: 12.5,
  reduceMotion: false,
  confirmDelete: true,
  // No bundled API key: every user brings their own (Settings → AI).
  // A client-side secret can't be hidden from its own bundle, so shipping
  // one would share it with the whole world.
  openrouterKey: "",
  aiEndpoint: "",
  appSecret: "",
  errorEndpoint: "",
};

export function resolvedTheme(s: Settings): "dark" | "light" {  if (s.theme !== "auto") return s.theme;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches)
    return "light";
  return "dark";
}
export function applySettingsToDom(s: Settings) {
  const root = document.documentElement;
  const light = resolvedTheme(s) === "light";
  root.dataset.theme = light ? "light" : "dark";
  const ac = ACCENTS[s.accent] ?? ACCENTS.mono;
  root.dataset.accent = s.accent;
  root.style.setProperty("--accent-1", ac.a);
  // cyan-on-white is unreadable — darken accent-2 in light mode everywhere
  // (status chips, links, badges, terminal prompt) via the same variable
  root.style.setProperty("--accent-2", light ? shade(ac.b, -45) : ac.b);
  root.style.setProperty("--accent-grad", `linear-gradient(135deg, ${ac.a} 0%, ${light ? shade(ac.b, -45) : ac.b} 100%)`);
  root.style.setProperty("--radius", "18px");
  if (s.reduceMotion) root.dataset.motion = "reduced";
  else delete root.dataset.motion;
}

/** Darken (negative pct) or lighten a #rrggbb hex color. */
export function shade(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const t = pct < 0 ? 0 : 255;
  const p = Math.abs(pct) / 100;
  const r = Math.round(((n >> 16) & 255) * (1 - p) + t * p);
  const g = Math.round(((n >> 8) & 255) * (1 - p) + t * p);
  const b = Math.round((n & 255) * (1 - p) + t * p);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

interface IDEState {
  rootPath: string;
  tree: FileEntry[];
  tabs: OpenTab[];
  activePath: string | null;
  sidebarView: "explorer" | "search" | "git" | "extensions" | "settings" | "debug" | "ai";
  sidebarOpen: boolean;
  panelOpen: boolean;
  panelTab: "terminal" | "problems" | "output" | "debug";
  paletteOpen: boolean;
  searchQuery: string;
  searchResults: SearchHit[];
  searching: boolean;
  terminalLines: string[];
  terminalCwd: string;
  status: string;
  loading: boolean;
  settings: Settings;
  git: GitStatus | null;
  gitDiff: string;
  gitCommits: GitCommit[];
  gitBranches: string[];
  diagnostics: Diagnostic[];
  outputLines: string[];
  debugLines: string[];
  debugging: boolean;
  breakpoints: Record<string, number[]>;
  recent: { path: string; name: string }[];
  toasts: { id: number; kind: "error" | "info" | "success"; msg: string }[];
  modal: {
    kind: "prompt" | "confirm";
    title: string;
    initial?: string;
    danger?: boolean;
  } | null;

  setRoot: (p: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string, name: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string | null) => void;
  editActive: (content: string) => void;
  saveActive: () => Promise<void>;
  saveAll: () => Promise<void>;
  newFile: (dir: string) => Promise<void>;
  newFolder: (dir: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  renameEntry: (path: string) => Promise<void>;
  setSidebar: (v: IDEState["sidebarView"]) => void;
  toggleSidebar: () => void;
  setPanel: (open: boolean, tab?: IDEState["panelTab"]) => void;
  setPalette: (open: boolean) => void;
  runSearch: (q: string) => Promise<void>;
  pushTerminal: (line: string) => void;
  clearTerminal: () => void;
  runTerminal: (raw: string) => Promise<void>;
  updateSettings: (p: Partial<Settings>) => void;
  refreshGit: () => Promise<void>;
  commitGit: (msg: string) => Promise<void>;
  checkoutBranch: (branch: string) => Promise<void>;
  loadDiff: (path?: string, staged?: boolean) => Promise<void>;
  refreshDiagnostics: () => Promise<void>;
  log: (line: string) => void;
  setTabLanguage: (path: string, langId: string) => void;
  runActive: () => Promise<void>;
  toggleBreakpoint: (path: string, line: number) => void;
  clearBreakpoints: (path?: string) => void;
  debugActive: () => Promise<void>;
  clearRecent: () => void;
  notify: (kind: "error" | "info" | "success", msg: string) => void;
  dismissToast: (id: number) => void;
  askPrompt: (title: string, initial?: string) => Promise<string | null>;
  askConfirm: (title: string, danger?: boolean) => Promise<boolean>;
  resolveModal: (value: string | boolean | null) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let diagTimer: ReturnType<typeof setTimeout> | null = null;
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let searchSeq = 0;
let toastSeq = 0;
let modalResolve: ((v: string | boolean | null) => void) | null = null;

function loadRecent(): { path: string; name: string }[] {
  try {
    const raw = localStorage.getItem("nova-recent");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

/** Quote-aware splitter: `echo "a b" 'c d'` → ["echo", "a b", "c d"]. */
export function splitArgs(cmd: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && i + 1 < cmd.length && (cmd[i + 1] === quote || cmd[i + 1] === "\\")) cur += cmd[++i];
      else cur += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (/\s/.test(c)) {
      if (cur) {
        out.push(cur);
        cur = "";
      }
    } else {
      cur += c;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export const useIDE = create<IDEState>((set, get) => ({
  rootPath: "/demo",
  tree: [],
  tabs: [],
  activePath: null,
  sidebarView: "explorer",
  sidebarOpen: true,
  panelOpen: true,
  panelTab: "terminal",
  paletteOpen: false,
  searchQuery: "",
  searchResults: [],
  searching: false,
  terminalLines: [
    "Nova IDE v0.4 — type `help` for commands",
    "Commands: help • ls • git status • clear • cd [dir]",
  ],
  terminalCwd: "",
  status: "ready",
  loading: false,
  settings: typeof localStorage !== "undefined" ? loadSettings() : defaults,
  git: null,
  gitDiff: "",
  gitCommits: [],
  gitBranches: [],
  diagnostics: [],
  outputLines: ["[nova] backend ready • Monaco loaded • Git + diagnostics active"],
  debugLines: ["Debug console — set breakpoints (click gutter) then Start Debugging (F5 on Python)."],
  debugging: false,
  breakpoints: {},
  recent: typeof localStorage !== "undefined" ? loadRecent() : [],
  toasts: [],
  modal: null,

  setRoot: async (p) => {
    try {
      await apiSetSandbox(p);
    } catch (e) {
      // sandbox unset → backend stays permissive (old behavior), but say so
      get().notify("error", `Workspace guard couldn't lock this folder: ${friendlyErr(e)}`);
    }
    set({ rootPath: p, terminalCwd: p });
    get().refreshTree();
    get().refreshGit();
  },

  refreshTree: async () => {
    const { rootPath } = get();
    set({ loading: true });
    try {
      const listing = await apiListDir(rootPath);
      set({
        tree: listing.entries,
        status: listing.truncated
          ? "list truncated at 3000 items — open subfolders directly"
          : "ready",
      });
    } catch (e) {
      set({ status: friendlyErr(e) });
    } finally {
      set({ loading: false });
    }
  },

  openFile: async (path, name) => {
    const { tabs } = get();
    // track recent (max 12, persisted)
    const recent = [{ path, name }, ...get().recent.filter((r) => r.path !== path)].slice(0, 12);
    set({ recent });
    try {
      localStorage.setItem("nova-recent", JSON.stringify(recent));
    } catch { /* ignore */ }
    if (tabs.find((t) => t.path === path)) {
      set({ activePath: path });
      get().refreshDiagnostics();
      return;
    }
    set({ status: `opening ${name}…` });
    try {
      const content = await apiReadFile(path);
      const tab: OpenTab = {
        path,
        name,
        content,
        savedContent: content,
        language: detectLanguage(path),
      };
      set({ tabs: [...get().tabs, tab], activePath: path, status: "ready" });
      get().refreshDiagnostics();
    } catch (e) {
      set({ status: friendlyErr(e) });
    }
  },

  closeTab: (path) => {
    const { tabs } = get();
    const idx = tabs.findIndex((t) => t.path === path);
    if (idx === -1) return;
    const tab = tabs[idx];
    const doClose = () => {
      // free the Monaco model for long sessions
      import("../lib/editorRef").then((m) => m.disposeModel(path)).catch(() => {});
      const next = get().tabs.filter((t) => t.path !== path);
      let nextActive = get().activePath;
      if (get().activePath === path) {
        nextActive = next[idx]?.path ?? next[idx - 1]?.path ?? null;
      }
      set({ tabs: next, activePath: nextActive });
      get().refreshDiagnostics();
    };
    if (tab.content !== tab.savedContent) {
      get().askConfirm(`Discard unsaved changes in "${tab.name}"?`, true).then((keep) => {
        if (keep) doClose();
      });
      return;
    }
    doClose();
  },

  setActive: (p) => {
    set({ activePath: p });
    get().refreshDiagnostics();
  },

  editActive: (content) => {
    const { tabs, activePath, settings } = get();
    if (!activePath) return;
    set({
      tabs: tabs.map((t) => (t.path === activePath ? { ...t, content } : t)),
    });
    if (settings.autoSave) {
      if (saveTimer) clearTimeout(saveTimer);
      const path = activePath;
      saveTimer = setTimeout(() => {
        const tab = get().tabs.find((t) => t.path === path);
        if (tab && tab.content !== tab.savedContent) {
          apiWriteFile(tab.path, tab.content).then(() => {
            set({
              tabs: get().tabs.map((t) =>
                t.path === path ? { ...t, savedContent: t.content } : t,
              ),
            });
            get().refreshDiagnostics();
            get().refreshGit();
          }).catch((e) => get().notify("error", `Auto-save failed: ${friendlyErr(e)}`));
        }
      }, Math.max(300, settings.autoSaveDelay));
    }
    // debounce diagnostics: don't hammer the Rust backend per keystroke
    if (diagTimer) clearTimeout(diagTimer);
    diagTimer = setTimeout(() => get().refreshDiagnostics(), 600);
  },

  saveActive: async () => {
    const { tabs, activePath } = get();
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab) return;
    set({ status: `saving ${tab.name}…` });
    try {
      await apiWriteFile(tab.path, tab.content);
    } catch (e) {
      const msg = `Save failed: ${friendlyErr(e)}`;
      set({ status: msg });
      get().notify("error", msg);
      return;
    }
    set({
      tabs: get().tabs.map((t) =>
        t.path === tab.path ? { ...t, savedContent: t.content } : t,
      ),
      status: `saved ${tab.name}`,
    });
    get().refreshDiagnostics();
    get().refreshGit();
  },

  saveAll: async () => {
    try {
      for (const t of get().tabs) {
        if (t.content !== t.savedContent) await apiWriteFile(t.path, t.content);
      }
    } catch (e) {
      get().notify("error", `Save all failed: ${friendlyErr(e)}`);
      return;
    }
    set({
      tabs: get().tabs.map((t) => ({ ...t, savedContent: t.content })),
      status: "all files saved",
    });
    get().refreshGit();
  },

  newFile: async (dir) => {
    const name = await get().askPrompt("New file name (extension picks language + template):", "main.py");
    if (!name) return;
    const full = `${dir.replace(/\/$/, "")}/${name}`;
    try {
      await apiCreateFile(full);
      // prefill starter template for the detected language
      try {
        const info = languageForPath(full);
        if (info.template) await apiWriteFile(full, info.template);
      } catch { /* keep empty */ }
      await get().refreshTree();
      await get().openFile(full, name);
    } catch (e) {
      get().notify("error", `Couldn't create file: ${friendlyErr(e)}`);
    }
  },

  newFolder: async (dir) => {
    const name = await get().askPrompt("New folder name:", "new-folder");
    if (!name) return;
    try {
      await apiCreateDir(`${dir.replace(/\/$/, "")}/${name}`);
      await get().refreshTree();
    } catch (e) {
      get().notify("error", `Couldn't create folder: ${friendlyErr(e)}`);
    }
  },

  deleteEntry: async (path) => {
    if (get().settings.confirmDelete) {
      const ok = await get().askConfirm(`Delete ${path}?`, true);
      if (!ok) return;
    }
    try {
      await apiDelete(path);
    } catch (e) {
      get().notify("error", `Delete failed: ${friendlyErr(e)}`);
      return;
    }
    // close the tab itself AND any tabs inside a deleted folder
    const gone = get().tabs.filter((t) => t.path === path || t.path.startsWith(path + "/"));
    if (gone.length > 0) {
      import("../lib/editorRef")
        .then((m) => gone.forEach((t) => m.disposeModel(t.path)))
        .catch(() => {});
    }
    const goneSet = new Set(gone.map((t) => t.path));
    const next = get().tabs.filter((t) => !goneSet.has(t.path));
    set({
      tabs: next,
      activePath: goneSet.has(get().activePath ?? "") ? (next[0]?.path ?? null) : get().activePath,
    });
    await get().refreshTree();
    get().refreshGit();
  },

  renameEntry: async (path) => {
    const current = path.split("/").pop() ?? path;
    const name = await get().askPrompt("Rename to:", current);
    if (!name || name === current) return;
    const dir = path.split("/").slice(0, -1).join("/");
    const dest = `${dir}/${name}`;
    try {
      await apiRename(path, dest);
    } catch (e) {
      get().notify("error", `Rename failed: ${friendlyErr(e)}`);
      return;
    }
    // remap the tab itself AND any tabs inside a renamed folder
    const prefix = path + "/";
    set({
      tabs: get().tabs.map((t) => {
        if (t.path === path) return { ...t, path: dest, name };
        if (t.path.startsWith(prefix)) {
          const rest = t.path.slice(prefix.length);
          return { ...t, path: `${dest}/${rest}` };
        }
        return t;
      }),
      activePath: (() => {
        const a = get().activePath;
        if (a === path) return dest;
        if (a && a.startsWith(prefix)) return `${dest}/${a.slice(prefix.length)}`;
        return a;
      })(),
    });
    await get().refreshTree();
  },

  setSidebar: (v) => set({ sidebarView: v, sidebarOpen: true }),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  setPanel: (open, tab) =>
    set((s) => ({ panelOpen: open, panelTab: tab ?? s.panelTab })),
  setPalette: (open) => set({ paletteOpen: open }),

  runSearch: async (q) => {
    set({ searchQuery: q });
    if (searchTimer) clearTimeout(searchTimer);
    if (!q.trim()) {
      set({ searchResults: [], searching: false });
      return;
    }
    set({ searching: true });
    const seq = ++searchSeq;
    searchTimer = setTimeout(async () => {
      try {
        const r = await apiSearch(get().rootPath, q);
        // drop stale results if the user already typed something newer
        if (seq === searchSeq) set({ searchResults: r });
      } finally {
        if (seq === searchSeq) set({ searching: false });
      }
    }, 350);
  },

  pushTerminal: (line) =>
    set((s) => ({ terminalLines: [...s.terminalLines, line].slice(-600) })),
  clearTerminal: () => set({ terminalLines: [] }),

  runTerminal: async (raw) => {
    const cmd = raw.trim();
    const { pushTerminal, rootPath, terminalCwd } = get();
    if (!cmd) return;
    pushTerminal(`$ ${cmd}`);
    const cwd = terminalCwd || rootPath;
    if (cmd === "clear") {
      set({ terminalLines: [] });
      return;
    }
    if (cmd === "help") {
      pushTerminal("built-ins: help • clear • cd [dir] • pwd");
      pushTerminal("tools: ls • cat • echo • git • npm/pnpm/yarn • node • cargo • python3 • go • java • ruby • php • dotnet");
      return;
    }
    if (cmd === "pwd") {
      pushTerminal(cwd);
      return;
    }
    if (cmd === "cd") {
      // bare cd → back to project root
      set({ terminalCwd: rootPath });
      pushTerminal(rootPath);
      return;
    }
    if (cmd.startsWith("cd ")) {
      const dest = cmd.slice(3).trim();
      const next = dest.startsWith("/") ? dest : `${cwd.replace(/\/$/, "")}/${dest}`;
      // validate before switching, or every later command fails confusingly
      try {
        await apiListDir(next);
        set({ terminalCwd: next });
        pushTerminal(next);
      } catch {
        pushTerminal(`cd: no such directory: ${dest}`);
      }
      return;
    }
    const [program, ...args] = splitArgs(cmd);
    try {
      const out = await apiRun(cwd, program, args);
      out.split("\n").forEach((l) => pushTerminal(l));
      if (program === "git") get().refreshGit();
    } catch (e) {
      pushTerminal(`error: ${friendlyErr(e)}`);
    }
  },

  updateSettings: (p) => {
    const next = { ...get().settings, ...p };
    set({ settings: next });
    try {
      localStorage.setItem("nova-settings", JSON.stringify(next));
    } catch { /* mobile private mode */ }
    applySettingsToDom(next);
  },

  refreshGit: async () => {
    try {
      const cwd = get().terminalCwd || get().rootPath;
      const [git, commits, branches] = await Promise.all([
        apiGitStatus(cwd),
        apiGitLog(cwd).catch(() => [] as GitCommit[]),
        apiGitBranches(cwd).catch(() => [] as string[]),
      ]);
      set({ git: git as GitStatus, gitCommits: commits, gitBranches: branches });
    } catch {
      set({ git: null });
    }
  },

  commitGit: async (msg) => {
    const cwd = get().terminalCwd || get().rootPath;
    set({ status: "committing…" });
    try {
      const out = await apiGitCommit(cwd, msg);
      get().log(out);
      set({ status: "committed" });
      await get().refreshGit();
      await get().loadDiff();
    } catch (e) {
      set({ status: friendlyErr(e) });
    }
  },

  checkoutBranch: async (branch) => {
    const cwd = get().terminalCwd || get().rootPath;
    set({ status: `switching to ${branch}…` });
    try {
      await apiGitCheckout(cwd, branch);
      set({ status: `on ${branch}` });
      await get().refreshGit();
      await get().loadDiff();
      await get().refreshTree();
    } catch (e) {
      set({ status: friendlyErr(e) });
    }
  },

  loadDiff: async (path, staged) => {
    try {
      const cwd = get().terminalCwd || get().rootPath;
      const d = await apiGitDiff(cwd, path, staged);
      set({ gitDiff: d });
    } catch {
      set({ gitDiff: "" });
    }
  },

  refreshDiagnostics: async () => {
    const { tabs, activePath } = get();
    const tab = tabs.find((t) => t.path === activePath);
    if (!tab) {
      set({ diagnostics: [] });
      return;
    }
    try {
      const d = await apiAnalyze(tab.path, tab.content);
      // real compiler check on saved files (python / javascript)
      if (tab.content === tab.savedContent && (tab.language === "python" || tab.language === "javascript")) {
        const real = await apiSyntaxCheck(tab.path, tab.language, get().rootPath);
        set({ diagnostics: [...real, ...d].slice(0, 200) });
      } else {
        set({ diagnostics: d });
      }
    } catch {
      set({ diagnostics: [] });
    }
  },

  log: (line) =>
    set((s) => ({ outputLines: [...s.outputLines, line].slice(-300) })),

  setTabLanguage: (path, langId) => {
    if (!LANGUAGES.some((l) => l.id === langId)) return;
    set({
      tabs: get().tabs.map((t) =>
        t.path === path ? { ...t, language: langId } : t,
      ),
    });
  },

  runActive: async () => {
    const { tabs, activePath, rootPath, terminalCwd } = get();
    const tab = tabs.find((t) => t.path === activePath);
    const cwd = terminalCwd || rootPath;
    set((s) => ({ panelOpen: true, panelTab: "terminal" as const }));
    if (!tab) {
      get().pushTerminal("$ run → open a file first");
      return;
    }
    // save before run so we execute fresh code (save failure aborts the run)
    if (tab.content !== tab.savedContent) {
      try {
        await apiWriteFile(tab.path, tab.content);
      } catch (e) {
        get().notify("error", `Save before run failed: ${friendlyErr(e)}`);
        return;
      }
      set({
        tabs: get().tabs.map((t) =>
          t.path === tab.path ? { ...t, savedContent: t.content } : t,
        ),
      });
    }
    const info = languageForPath(tab.path);
    get().pushTerminal(`$ run ${tab.name} [${info.name}]`);
    // Honest hints for languages without a direct runner (e.g. TypeScript
    // needs a compile step — node cannot execute .ts files).
    const NO_RUNNER_HINT: Record<string, string> = {
      typescript: "TypeScript can't run directly — try in the terminal: npx tsc file.ts && node file.js",
      dockerfile: "Dockerfiles build with: docker build -t app .",
      solidity: "Solidity compiles with: solc --bin file.sol",
    };
    if (!info.run && NO_RUNNER_HINT[info.id]) {
      get().pushTerminal(`○ ${NO_RUNNER_HINT[info.id]}`);
      return;
    }
    try {
      let program = "echo";
      let args: string[] = [`No runner configured for ${info.name} — see terminal hint above`];
      if (info.run) {
        program = info.run.program;
        args = info.run.useFile ? [...info.run.args, tab.path] : [...info.run.args];
        // cargo always builds the open project, not wherever the terminal cd'd
        if (program === "cargo") {
          args = ["run"];
        }
      } else if (tab.path.endsWith(".py")) {
        program = "python3";
        args = [tab.path];
      } else if (/\.(js|mjs|cjs)$/.test(tab.path)) {
        program = "node";
        args = [tab.path];
      } else if (tab.path.endsWith(".go")) {
        program = "go";
        args = ["run", tab.path];
      }
      const runCwd = program === "cargo" ? rootPath : cwd;
      const out = await apiRun(runCwd, program, args);
      out.split("\n").forEach((l) => get().pushTerminal(l));
    } catch (e) {
      get().pushTerminal(`error: ${String(e)}`);
    }
  },

  toggleBreakpoint: (path, line) => {
    const cur = get().breakpoints[path] ?? [];
    const next = cur.includes(line) ? cur.filter((l) => l !== line) : [...cur, line].sort((a, b) => a - b);
    set({ breakpoints: { ...get().breakpoints, [path]: next } });
  },

  clearBreakpoints: (path) => {
    if (!path) {
      set({ breakpoints: {} });
      return;
    }
    const next = { ...get().breakpoints };
    delete next[path];
    set({ breakpoints: next });
  },

  debugActive: async () => {
    const { tabs, activePath, rootPath, terminalCwd, breakpoints } = get();
    const tab = tabs.find((t) => t.path === activePath);
    set({ panelOpen: true, panelTab: "debug" as const });
    const push = (l: string) =>
      set((s) => ({ debugLines: [...s.debugLines, l].slice(-600) }));
    if (!tab) {
      push("○ open a file first");
      return;
    }
    if (tab.language !== "python") {
      push(`○ debugger supports Python now — running ${tab.name} normally instead:`);
      await get().runActive();
      return;
    }
    const bps = (breakpoints[tab.path] ?? []).filter((l) => l >= 1);
    if (tab.content !== tab.savedContent) {
      try {
        await apiWriteFile(tab.path, tab.content);
      } catch (e) {
        push(`save before debug failed: ${friendlyErr(e)}`);
        return;
      }
      set({
        tabs: get().tabs.map((t) =>
          t.path === tab.path ? { ...t, savedContent: t.content } : t,
        ),
      });
    }
    set({ debugging: true });
    // Scripted pdb session: set breakpoints, then at EVERY stop print a
    // backtrace before continuing, so the transcript shows where it
    // stopped and the call stack — then quit cleanly.
    const scriptParts: string[] = [...bps.map((l) => `b ${l}`)];
    for (let i = 0; i < bps.length; i++) {
      scriptParts.push("c", "bt");
    }
    scriptParts.push("c", "q");
    const script = scriptParts.join("\n") + "\n";
    push(`● debugging ${tab.name} — ${bps.length} breakpoint(s)`);
    try {
      const cwd = terminalCwd || rootPath;
      const out = await apiRun(cwd, "python3", ["-m", "pdb", tab.path], script);
      out.split("\n").forEach(push);
      push("● session ended");
    } catch (e) {
      push(`error: ${friendlyErr(e)}`);
    } finally {
      set({ debugging: false });
    }
  },

  clearRecent: () => {
    set({ recent: [] });
    try {
      localStorage.removeItem("nova-recent");
    } catch { /* ignore */ }
  },

  notify: (kind, msg) => {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, kind, msg }].slice(-4) }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4500);
    // every visible error also becomes a detailed report (queued + sent)
    if (kind === "error") {
      try {
        reportError("error", msg);
      } catch { /* reporting must never break the app */ }
    }
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  askPrompt: (title, initial) =>
    new Promise<string | null>((resolve) => {
      // never strand a previous waiter if dialogs overlap
      modalResolve?.(null);
      modalResolve = resolve as (v: string | boolean | null) => void;
      set({ modal: { kind: "prompt", title, initial } });
    }),

  askConfirm: (title, danger) =>
    new Promise<boolean>((resolve) => {
      modalResolve?.(false);
      modalResolve = resolve as (v: string | boolean | null) => void;
      set({ modal: { kind: "confirm", title, danger } });
    }),

  resolveModal: (value) => {
    set({ modal: null });
    modalResolve?.(value);
    modalResolve = null;
  },
}));

// Snapshot provider for error reports (registered once, no import cycles:
// reporter never imports the store).
setSnapshotProvider(() => {
  const s = useIDE.getState();
  const active = s.tabs.find((t) => t.path === s.activePath);
  return {
    rootPath: s.rootPath,
    activePath: s.activePath ?? "",
    language: active?.language ?? "",
    tabs: s.tabs.length,
    dirty: s.tabs.filter((t) => t.content !== t.savedContent).length,
    panel: s.panelOpen ? s.panelTab : "closed",
    sidebar: s.sidebarOpen ? s.sidebarView : "closed",
    theme: s.settings.theme,
    model: "",
    status: s.status,
    terminal: s.terminalLines.slice(-30),
    output: s.outputLines.slice(-20),
    debug: s.debugLines.slice(-20),
    diagCount: s.diagnostics.length,
    diagSample: s.diagnostics.slice(0, 5).map((d) => `L${d.line}: ${d.message}`),
  };
});
