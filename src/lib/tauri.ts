import { invoke } from "@tauri-apps/api/core";

export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  children?: FileEntry[] | null;
}

export interface DirListing {
  entries: FileEntry[];
  truncated: boolean;
}

export interface SearchHit {
  path: string;
  line: number;
  preview: string;
}

// ---------- Demo workspace (browser mode without Tauri) ----------
const DEMO_FILES: Record<string, string> = {
  "/demo/README.md": `# Nova IDE\n\nMobile-first IDE built with **Tauri + Rust + Monaco**.\n\n- Explorer on the left\n- Open files into tabs\n- Ctrl+P command palette\n- Terminal at the bottom\n\nOpen \`src/App.tsx\` to start hacking.\n`,
  "/demo/src/App.tsx": `export default function App() {\n  return <h1>Hello Nova IDE ⚡</h1>\n}\n`,
  "/demo/src/main.rs": `fn main() {\n    println!("Hello from Rust 🦀");\n}\n`,
  "/demo/src/styles.css": `:root {\n  --nova-accent: #7c5cff;\n}\n\nbody {\n  background: #0b0e14;\n  color: #e6e9f0;\n}\n`,
  "/demo/package.json": `{\n  "name": "demo",\n  "version": "0.1.0"\n}\n`,
  "/demo/Cargo.toml": `[package]\nname = "demo"\nversion = "0.1.0"\n`,
};

function demoTree(): FileEntry[] {
  const root: FileEntry = {
    name: "demo",
    path: "/demo",
    is_dir: true,
    size: 0,
    children: [],
  };
  const dirs = new Map<string, FileEntry>([["/demo", root]]);
  const ensureDir = (p: string) => {
    if (dirs.has(p)) return dirs.get(p)!;
    const name = p.split("/").pop() || p;
    const e: FileEntry = { name, path: p, is_dir: true, size: 0, children: [] };
    dirs.set(p, e);
    const parent = p.split("/").slice(0, -1).join("/") || "/";
    ensureDir(parent).children!.push(e);
    return e;
  };
  Object.keys(DEMO_FILES).forEach((fp) => {
    const parts = fp.split("/");
    const name = parts.pop()!;
    const dir = parts.join("/") || "/";
    const d = ensureDir(dir);
    d.children!.push({
      name,
      path: fp,
      is_dir: false,
      size: DEMO_FILES[fp].length,
    });
  });
  const sort = (e: FileEntry) => {
    e.children?.sort((a, b) =>
      a.is_dir === b.is_dir
        ? a.name.localeCompare(b.name)
        : a.is_dir
          ? -1
          : 1,
    );
    e.children?.forEach(sort);
  };
  sort(root);
  return [root];
}

// ---------- Unified API (Tauri or demo fallback) ----------

/**
 * Safety net: backend errors can still leak raw OS text from paths we
 * don't control (plugins, WebView, future commands). Translate the common
 * ones into actionable messages so users never stare at "os error 13".
 */
export function friendlyErr(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/os error 13|EACCES|permission denied|permission-denied/i.test(raw)) {
    return (
      "Permission denied — Android only lets the app touch its own workspace folder. " +
      "Open the in-app workspace, or tap Grant in the Explorer storage banner.\n" +
      "مرفوض الصلاحية: استخدم مجلد العمل الداخلي أو زر Grant بأعلى الملفات.\n" +
      `Details: ${raw.slice(0, 140)}`
    );
  }
  if (/os error 2|ENOENT|not found|No such file/i.test(raw)) {
    return `Not found — the file or folder moved or was deleted.\nغير موجود — ربما نُقل أو حُذف.\nDetails: ${raw.slice(0, 140)}`;
  }
  if (/timed out|timedout/i.test(raw)) {
    return `Timed out — the process was killed after 120s.\nانتهت المهلة.\nDetails: ${raw.slice(0, 140)}`;
  }
  return raw || "Unknown error";
}

/** Tell the Rust backend which folder is open (tracking only since v0.7.0 —
 *  filtering was removed: this device is trusted-local, like a desktop). */
export async function apiSetSandbox(root: string): Promise<void> {
  if (!isTauri) return;
  await invoke("set_sandbox", { root });
}

export async function apiListDir(path: string): Promise<DirListing> {
  if (!isTauri) {
    if (!path || path === "/demo") return { entries: demoTree(), truncated: false };
    // find subtree
    const find = (nodes: FileEntry[]): FileEntry[] => {
      for (const n of nodes) {
        if (n.path === path) return n.children ?? [];
        if (n.children) {
          const r = find(n.children);
          if (r.length || n.path === path) return r;
        }
      }
      return [];
    };
    return { entries: find(demoTree()), truncated: false };
  }
  return invoke<DirListing>("list_dir", { path, depth: 3 });
}

export async function apiReadFile(path: string): Promise<string> {
  if (!isTauri) return DEMO_FILES[path] ?? "";
  return invoke<string>("read_file", { path });
}

export async function apiWriteFile(path: string, content: string): Promise<void> {
  if (!isTauri) {
    DEMO_FILES[path] = content;
    return;
  }
  await invoke("write_file", { path, content });
}

export async function apiSearch(
  root: string,
  query: string,
): Promise<SearchHit[]> {
  if (!isTauri) {
    const out: SearchHit[] = [];
    Object.entries(DEMO_FILES).forEach(([p, c]) => {
      c.split("\n").forEach((line, i) => {
        if (line.includes(query))
          out.push({ path: p, line: i + 1, preview: line.trim().slice(0, 140) });
      });
    });
    return out.slice(0, 100);
  }
  return invoke<SearchHit[]>("search_in_files", {
    root,
    query,
    maxResults: 100,
  });
}

export async function apiRun(
  cwd: string,
  program: string,
  args: string[],
  stdinData?: string,
): Promise<string> {
  if (!isTauri) return `$ ${program} ${args.join(" ")}\n(demo mode — run in Tauri for real output)`;
  return invoke<string>("run_command", { cwd, program, args, stdinData: stdinData ?? null });
}

/** Real syntax check for saved files. Returns diagnostics (empty = clean). */
export async function apiSyntaxCheck(path: string, langId: string, cwd: string): Promise<Diagnostic[]> {
  if (!isTauri) return [];
  const out: Diagnostic[] = [];
  try {
    if (langId === "python") {
      const r = await apiRun(cwd, "python3", ["-m", "py_compile", path]);
      const m = r.match(/line (\d+)/i);
      if (/Error|error/i.test(r) && !r.includes("(exit 0)")) {
        out.push({
          line: m ? Number(m[1]) : 1,
          col: 1,
          severity: "error",
          message: r.split("\n").filter((l) => /Error/i.test(l)).slice(-1)[0]?.trim() || "Python syntax error",
        });
      }
    } else if (langId === "javascript") {
      const r = await apiRun(cwd, "node", ["--check", path]);
      const m = r.match(/:(\d+)/);
      if (/Error/i.test(r)) {
        out.push({ line: m ? Number(m[1]) : 1, col: 1, severity: "error", message: "JS syntax error — see terminal" });
      }
    }
  } catch { /* toolchain missing → skip silently */ }
  return out;
}

export async function apiCreateFile(path: string): Promise<void> {
  if (!isTauri) {
    DEMO_FILES[path] = "";
    return;
  }
  await invoke("create_file", { path });
}

export async function apiCreateDir(path: string): Promise<void> {
  if (!isTauri) return;
  await invoke("create_dir", { path });
}

export async function apiDelete(path: string): Promise<void> {
  if (!isTauri) {
    delete DEMO_FILES[path];
    return;
  }
  await invoke("delete_path", { path });
}

export async function apiRename(from: string, to: string): Promise<void> {
  if (!isTauri) {
    if (DEMO_FILES[from] !== undefined) {
      DEMO_FILES[to] = DEMO_FILES[from];
      delete DEMO_FILES[from];
    }
    return;
  }
  await invoke("rename_path", { from, to });
}

export interface GitStatus {
  branch: string;
  modified: string[];
  untracked: string[];
  staged: string[];
  ahead: number;
  behind: number;
  is_repo: boolean;
}

export interface GitCommit {
  hash: string;
  author: string;
  date: string;
  message: string;
}

export interface Diagnostic {
  line: number;
  col: number;
  severity: string;
  message: string;
}

export async function apiGitStatus(cwd: string): Promise<GitStatus> {
  if (!isTauri)
    return { branch: "main", modified: [], untracked: [], staged: [], ahead: 0, behind: 0, is_repo: false };
  return invoke<GitStatus>("git_status", { cwd });
}

export async function apiGitDiff(cwd: string, path?: string, staged?: boolean): Promise<string> {
  if (!isTauri) return "(demo mode — diff appears in Tauri)";
  return invoke<string>("git_diff", { cwd, path: path ?? null, staged: staged ?? false });
}

export async function apiGitCommit(cwd: string, message: string): Promise<string> {
  if (!isTauri) return "demo: commit simulated";
  return invoke<string>("git_commit", { cwd, message, addAll: true });
}

export async function apiGitCheckout(cwd: string, branch: string): Promise<string> {
  if (!isTauri) return "demo: checkout simulated";
  return invoke<string>("git_checkout", { cwd, branch });
}

export interface BuildStatus {
  running: boolean;
  started_at: string;
  exit_code: number | null;
  apk_path: string | null;
  tail: string[];
}

/** Start a background Android debug APK build (needs SDK on this machine). */
export async function apiStartBuild(target?: string): Promise<string> {
  if (!isTauri) return "demo mode — APK builds run on a dev machine with the Android SDK";
  return invoke<string>("start_android_build", { target: target ?? null });
}

export async function apiPollBuild(): Promise<BuildStatus> {
  if (!isTauri)
    return { running: false, started_at: "", exit_code: null, apk_path: null, tail: ["demo mode"] };
  return invoke<BuildStatus>("poll_android_build");
}

export async function apiCancelBuild(): Promise<string> {
  if (!isTauri) return "demo mode";
  return invoke<string>("cancel_android_build");
}

export async function apiGitBranches(cwd: string): Promise<string[]> {
  if (!isTauri) return ["main"];
  return invoke<string[]>("git_branches", { cwd });
}

export async function apiGitLog(cwd: string): Promise<GitCommit[]> {
  if (!isTauri) return [];
  return invoke<GitCommit[]>("git_log", { cwd, limit: 30 });
}

export async function apiAnalyze(path: string, content: string): Promise<Diagnostic[]> {
  if (!isTauri) {
    const out: Diagnostic[] = [];
    content.split("\n").forEach((line, i) => {
      if (line.length > 200)
        out.push({ line: i + 1, col: 201, severity: "warning", message: `Line too long (${line.length})` });
      if (line.includes("TODO"))
        out.push({ line: i + 1, col: line.indexOf("TODO") + 1, severity: "info", message: "TODO marker" });
    });
    return out;
  }
  return invoke<Diagnostic[]>("analyze_file", { path, content });
}

export interface LanguageInfo {
  id: string; // monaco language id
  name: string;
  extensions: string[];
  color: string;
  template: string;
  run?: { program: string; args: string[]; useFile: boolean };
}

export const LANGUAGES: LanguageInfo[] = [
  { id: "typescript", name: "TypeScript", extensions: ["ts", "tsx", "mts", "cts"], color: "#4b9fff", template: `// Nova IDE — TypeScript\nconst greet = (name: string): string => \`Hello, \${name}!\`;\n\nconsole.log(greet("Nova"));\n`, },
  { id: "javascript", name: "JavaScript", extensions: ["js", "jsx", "mjs", "cjs"], color: "#ffd94b", template: `// Nova IDE — JavaScript\nconst greet = (name) => \`Hello, \${name}!\`;\n\nconsole.log(greet("Nova"));\n`, run: { program: "node", args: [], useFile: true } },
  { id: "python", name: "Python", extensions: ["py", "pyw"], color: "#3dd68c", template: `# Nova IDE — Python\ndef greet(name: str) -> str:\n    return f"Hello, {name}!"\n\nprint(greet("Nova"))\n`, run: { program: "python3", args: [], useFile: true } },
  { id: "rust", name: "Rust", extensions: ["rs"], color: "#ff8a5c", template: `// Nova IDE — Rust\nfn greet(name: &str) -> String {\n    format!("Hello, {}!", name)\n}\n\nfn main() {\n    println!("{}", greet("Nova"));\n}\n`, run: { program: "cargo", args: ["run"], useFile: false } },
  { id: "go", name: "Go", extensions: ["go"], color: "#00d4ff", template: `// Nova IDE — Go\npackage main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, Nova!")\n}\n`, run: { program: "go", args: ["run"], useFile: true } },
  { id: "java", name: "Java", extensions: ["java"], color: "#ff6369", template: `// Nova IDE — Java\npublic class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, Nova!");\n    }\n}\n`, run: { program: "java", args: [], useFile: true } },
  { id: "kotlin", name: "Kotlin", extensions: ["kt", "kts"], color: "#b9a8ff", template: `// Nova IDE — Kotlin\nfun main() {\n    println("Hello, Nova!")\n}\n` },
  { id: "swift", name: "Swift", extensions: ["swift"], color: "#ff6b4a", template: `// Nova IDE — Swift\nprint("Hello, Nova!")\n` },
  { id: "dart", name: "Dart", extensions: ["dart"], color: "#00d4ff", template: `// Nova IDE — Dart\nvoid main() {\n  print('Hello, Nova!');\n}\n` },
  { id: "cpp", name: "C++", extensions: ["cpp", "cc", "cxx", "hpp", "h"], color: "#7c9aff", template: `// Nova IDE — C++\n#include <iostream>\n\nint main() {\n    std::cout << "Hello, Nova!" << std::endl;\n}\n` },
  { id: "c", name: "C", extensions: ["c"], color: "#8b93a9", template: `// Nova IDE — C\n#include <stdio.h>\n\nint main(void) {\n    printf("Hello, Nova!\\n");\n    return 0;\n}\n` },
  { id: "csharp", name: "C#", extensions: ["cs"], color: "#9a7bff", template: `// Nova IDE — C#\nConsole.WriteLine("Hello, Nova!");\n` },
  { id: "php", name: "PHP", extensions: ["php"], color: "#8b9bff", template: `<?php\n// Nova IDE — PHP\necho "Hello, Nova!\\n";\n` },
  { id: "ruby", name: "Ruby", extensions: ["rb"], color: "#ff5c5c", template: `# Nova IDE — Ruby\nputs "Hello, Nova!"\n` },
  { id: "html", name: "HTML", extensions: ["html", "htm"], color: "#ff8a5c", template: `<!DOCTYPE html>\n<html>\n<head><title>Nova</title></head>\n<body>\n  <h1>Hello, Nova!</h1>\n</body>\n</html>\n` },
  { id: "css", name: "CSS", extensions: ["css"], color: "#4b9fff", template: `/* Nova IDE — CSS */\nbody {\n  background: #0b0e14;\n  color: #fff;\n}\n` },
  { id: "scss", name: "SCSS", extensions: ["scss"], color: "#ff7ab8", template: `// Nova IDE — SCSS\n$accent: #7c5cff;\nbody { color: $accent; }\n` },
  { id: "json", name: "JSON", extensions: ["json", "jsonc"], color: "#ffb224", template: `{\n  "name": "nova",\n  "version": "0.1.0"\n}\n` },
  { id: "markdown", name: "Markdown", extensions: ["md", "markdown"], color: "#c3cad9", template: `# Nova\n\nHello from **Nova IDE**.\n` },
  { id: "yaml", name: "YAML", extensions: ["yaml", "yml"], color: "#ff6369", template: `# Nova IDE — YAML\napp: nova\nversion: 0.2.0\n` },
  { id: "xml", name: "XML", extensions: ["xml", "svg"], color: "#3dd68c", template: `<!-- Nova IDE — XML -->\n<app name="nova"/>\n` },
  { id: "sql", name: "SQL", extensions: ["sql"], color: "#00d4ff", template: `-- Nova IDE — SQL\nSELECT 'Hello, Nova!';\n` },
  { id: "shell", name: "Shell", extensions: ["sh", "bash", "zsh"], color: "#3dd68c", template: `#!/bin/bash\n# Nova IDE — Shell\necho "Hello, Nova!"\n`, run: { program: "sh", args: [], useFile: true } },
  { id: "powershell", name: "PowerShell", extensions: ["ps1"], color: "#4b9fff", template: `# Nova IDE — PowerShell\nWrite-Host "Hello, Nova!"\n` },
  { id: "lua", name: "Lua", extensions: ["lua"], color: "#4b6fff", template: `-- Nova IDE — Lua\nprint("Hello, Nova!")\n` },
  { id: "r", name: "R", extensions: ["r"], color: "#4b9fff", template: `# Nova IDE — R\nprint("Hello, Nova!")\n` },
  { id: "scala", name: "Scala", extensions: ["scala"], color: "#ff5c5c", template: `// Nova IDE — Scala\n@main def hello = println("Hello, Nova!")\n` },
  { id: "perl", name: "Perl", extensions: ["pl", "pm"], color: "#8b93a9", template: `# Nova IDE — Perl\nprint "Hello, Nova!\\n";\n` },
  { id: "dockerfile", name: "Docker", extensions: ["dockerfile"], color: "#00d4ff", template: `# Nova IDE — Docker\nFROM node:20\nWORKDIR /app\n` },
  { id: "graphql", name: "GraphQL", extensions: ["graphql", "gql"], color: "#ff7ab8", template: `# Nova IDE — GraphQL\ntype Query {\n  hello: String\n}\n` },
  { id: "svelte", name: "Svelte", extensions: ["svelte"], color: "#ff5c2e", template: `<!-- Nova IDE — Svelte -->\n<h1>Hello, Nova!</h1>\n` },
  { id: "vue", name: "Vue", extensions: ["vue"], color: "#3dd68c", template: `<!-- Nova IDE — Vue -->\n<template>\n  <h1>Hello, Nova!</h1>\n</template>\n` },
  { id: "ini", name: "Config", extensions: ["ini", "toml", "cfg", "env"], color: "#8b93a9", template: `# Nova IDE — Config\n[app]\nname = "nova"\n` },
  { id: "solidity", name: "Solidity", extensions: ["sol"], color: "#8b93a9", template: `// Nova IDE — Solidity\ncontract Hello {\n    string public greet = "Nova";\n}\n` },
  { id: "plaintext", name: "Text", extensions: ["txt", "log"], color: "#8b93a9", template: `Hello, Nova!\n` },
];

const EXT_MAP: Record<string, LanguageInfo> = {};
for (const l of LANGUAGES) {
  for (const e of l.extensions) EXT_MAP[e] = l;
}
// filename fallbacks (Dockerfile, Makefile…)
const FILE_MAP: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "shell",
};

export function detectLanguage(path: string): string {
  const base = path.split("/").pop() ?? path;
  const low = base.toLowerCase();
  if (FILE_MAP[low]) return FILE_MAP[low];
  const ext = low.split(".").pop() ?? "";
  return EXT_MAP[ext]?.id ?? "plaintext";
}

export function languageInfo(id: string): LanguageInfo | undefined {
  return LANGUAGES.find((l) => l.id === id);
}

export function languageForPath(path: string): LanguageInfo {
  const id = detectLanguage(path);
  return languageInfo(id) ?? LANGUAGES[LANGUAGES.length - 1];
}

/** Lightweight symbol outline for the breadcrumb jump list. */
export function outlineSymbols(content: string, lang: string): string[] {
  void lang;
  const lines = content.split("\n");
  const out: string[] = [];
  const patterns: RegExp[] = [
    /^\s*(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)/,
    /^\s*(export\s+)?(const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(\([^)]*\)|[\w$]+)\s*=>/,
    /^\s*(public|private|protected)?\s*(static\s+)?(class|interface|enum|struct|trait)\s+([A-Za-z_]\w*)/,
    /^\s*(fn|def)\s+([A-Za-z_]\w*)/,
    /^\s*func\s+([A-Za-z_]\w*)/,
    /^\s*#{1,6}\s+(.+)/,
  ];
  for (let i = 0; i < lines.length; i++) {
    if (out.length >= 60) break;
    const line = lines[i];
    for (const re of patterns) {
      const m = line.match(re);
      if (m) {
        out.push(`${i + 1}: ${m[m.length - 1].trim().slice(0, 60)}`);
        break;
      }
    }
  }
  return out;
}
