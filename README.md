# ⚡ Nova IDE — v0.8.7

Mobile-first IDE built with **Tauri v2 + Rust + React + Monaco Editor**.
Same editor engine as VS Code, with a native Rust backend for files,
search, git, diagnostics and running code.

## Features

- 📁 Explorer with full CRUD (new/rename/delete), right-click menu, recent files
- 📝 Monaco editor: tabs, multi-model (no remount flicker), 35 language modes
  with real colored logos, per-language starter templates, symbol jump
- 🧠 Built-in language smarts: snippet completion, hover, go-to-definition,
  real `py_compile` / `node --check` diagnostics
- ▶️ One-tap Run per language (Python, JS, Go, Java, Rust via cargo…)
  with honest hints where a compile step is needed (TypeScript…)
- 🐞 Python debugger: gutter breakpoints that track edits + scripted `pdb`
  session with backtraces
- 🌿 Git: status (incl. ahead/behind), staged + unstaged diff, commit,
  branch switch, push/pull shortcuts, history
- 🔍 Debounced project search with result-line jumping
- 💻 Terminal (120s watchdog, ANSI stripped) + Problems/Output/Debug panels
- ⌨️ Command palette for files and `> commands`
- 📱 Mobile-first: touch bar (Run/Debug/Save/Find/Line/Wrap/Font/Terminal),
  in-app dialogs (no native prompt), safe-area insets, 20 persisted settings
- 🛡️ Hardened runtime: 120s process watchdog (whole-tree kill), strict CSP,
  secret scrubbing, error reporting with consent gate (details below)

## Threat model (read this before shipping anywhere)

Nova IDE is a **trusted single-user local tool** — like a desktop terminal
that happens to run on a phone. It is NOT sandboxed and must not be
described as such:

- The Rust backend reads/writes/deletes any path the OS user can touch and
  runs any program (`run_command` has no allowlist since v0.7.0, owner
  decision). Do not open untrusted projects, paste untrusted prompts into
  the AI with auto-approve on, or share the device while it runs.
- Past protections (workspace sandbox, eval-flag denylist) were **removed
  on purpose** — see AUDIT.md status ledger. What remains: timeouts that
  kill whole process trees, output caps, secret scrubbing, and explicit
  user confirms for destructive UI actions.
- Error reports (opted via Terms) contain device info, app state and
  recent logs — scrubbed of keys, but never point the endpoint at a
  channel you don't control.
- Android extras: `MANAGE_EXTERNAL_STORAGE` needs a Play declaration
  form; the app works fully inside its own workspace with zero extra
  permissions.

## Project layout

```
nova-ide (folder: mobile-ide/)
  src/                    # React frontend
    components/           # panels, dialogs, bars
    styles/               # base.css / components.css / theme.css
    store/useIDE.ts       # zustand state (tabs, git, debug, settings…)
    lib/                  # tauri bridge, intellisense, editor ref
    assets/logos/         # 33 official language logos (offline)
  src-tauri/              # Rust backend (files, search, git, run, analyze)
  AUDIT.md                # security/quality audit log
```

## Run

```bash
npm install
npm run dev          # web demo (/demo workspace, no Tauri needed)
npm run tauri dev    # full desktop app
```

## Android APK

Generated locally (excluded from source zips — it's 150MB+):

```bash
export ANDROID_HOME=$HOME/android-sdk NDK_HOME=$HOME/android-sdk/ndk/26.3.11579264
npx tauri android build --debug --apk -t aarch64
# → src-tauri/gen/android/app/build/outputs/apk/universal/debug/
```

## Roadmap (honest — not claimed as done)

Interactive DAP debugger, real LSP servers, extension marketplace,
git stash, folder virtualization, desktop PTY, full i18n.
