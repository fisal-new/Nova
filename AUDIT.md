# Nova IDE — Code Audit Report (v0.8.1, chronological)

External reviews received 2026-09-18/19. Every finding verified against the
source, then fixed. Status per item below. Sections are ordered oldest→newest.

## Status ledger (claims later reversed by owner decisions)

- Sandbox + allowlist + arg filter (Rounds 1/4/7) → **REMOVED v0.7.0**.
  Device is trusted-local, like a desktop. `set_sandbox` kept as no-op.
- Auto-approve default: ON → ASK (round 7) → **ON again (owner demand)**.
  Toggle + denials stay visible; delete is never exposed to AI.
- API key: embedded → removed (round 7) → **re-embedded scattered +
  proxy support (owner demand)**. Current key is burned — rotate it.
- Theme default: violet/cyan → **Mono + neutral UI (v0.7.0)**.

## Codebase size (measured)

| Area | LOC |
|---|---|
| TypeScript/TSX (`src/`) | ~2,900 |
| Rust (`src-tauri/src/`) | ~630 |
| CSS (`styles/`) | ~950 |
| **Total** | **~4,500** |

## 🔴 Security — FIXED (mostly removed in v0.7.0, see ledger)

1. **`run_command` arg injection** — FIXED: denylist for inline-eval flags
   (`python -c`, `node -e/--eval/-p`, `git -c/--upload-pack`). Running files
   by path still works.
2. **No path sandboxing** — FIXED: new `set_sandbox` command, called by the
   frontend on every `setRoot`. All file commands (`list/read/write/create/
   delete/rename/search`) and all git commands reject paths outside the open
   workspace (canonicalized, `..`-safe).
3. **`csp: null`** — FIXED: strict CSP in `tauri.conf.json`
   (`script-src 'self'`, blob workers for Monaco, `ipc:` for Tauri).
4. **Capabilities bypass** — ACKNOWLEDGED, mitigated: custom commands can't
   be covered by plugin ACLs, so the sandbox + arg filter above are the
   enforcement layer. Documented here instead of implied by capabilities.
5. **No timeout/kill** — FIXED: 120s watchdog on every spawned process
   (poll + kill, std-only). Hung `npm run dev` / infinite loops are reaped.

## 🐛 Dead-wired features — FIXED

- Symbol jump, search-result jump, Problems-click jump all call `revealLine()`.
- Titlebar **Run** now runs the active file (`runActive`), not a hint string.
- Debugger now prints a backtrace (`bt`) at every breakpoint stop; panel copy
  no longer claims interactivity (DAP stepping is roadmap).

## ⚠️ Logic bugs — FIXED

- `outlineSymbols` 60-cap now works (`for` + `break`).
- Search has 350ms debounce + sequence guard against stale results.
- Commit-via-Enter respects the same `canCommit` rule as the button.
- `git diff` uses `--cached` for staged files.
- `closeTab` confirms on unsaved changes; `beforeunload` guard added.
- StatusBar: real `errors`/`warnings` counts, `.sev.error` style,
  dirty dot turns orange, git counter includes staged.
- `renameEntry(path)` — single-param signature.
- Real syntax diagnostics classified `error`, not `warning`.

## 🐢 Performance — FIXED

- Monaco no longer remounts per tab (multi-model via `path`); theme-only key.
- Buffer-word completion cached per model version (1s TTL, 300KB cap).
- `list_dir` skips `node_modules/target/dist/.git/...`, capped at 3000 nodes.
- Minimap follows window size via `matchMedia` listener.

## 🧩 Dead code — REMOVED

- `@xterm/xterm`, `@tauri-apps/plugin-fs`, `@tauri-apps/plugin-shell` (JS)
  uninstalled. Rust plugin registrations kept (capabilities resolve through
  them). `ignore` crate removed. `ErrorBoundary` backup-write removed.
- `intellisense.ts` redundant expression simplified.

## 🤏 Consistency — FIXED

- Version `0.4.0` everywhere (package.json, Cargo.toml, tauri.conf.json,
  titlebar, README).
- `index.html`: `lang="en"`, zoomable viewport.
- Middle-click close uses `preventDefault()`.
- MobileBar: explicit **A+** / **A-** buttons; Save = tap, Save-all = long-press.
- Palette keyboard listener has a proper dep array.
- Vite target `chrome105` on all platforms (all Tauri webviews are Chromium
  except Linux WebKitGTK 4.1+, which handles it).
- Completion packs added for JavaScript, Java, HTML, CSS, JSON, SQL, shell
  (Python/TypeScript/Rust/Go existed).

## 💡 Roadmap (not done — tracked, not claimed)

Stop/kill button for running processes, full ANSI colors (codes are stripped
today), git stash, folder virtualization, interactive DAP debugger,
extension marketplace, real LSP servers per language.

---

# Round 2 — second external review (v0.4.0, fixed same day)

## Corrections to the review (reviewer was wrong)

- **"2MB cap missing"** — wrong: `read_file` and `write_file` both enforce
  a 2MB cap in Rust (`lib.rs`). Verified by grep.
- **`encoding_rs` unused** — wrong: used for UTF-8 decoding in `read_file`.

## Fixed in round 2

- **README rewritten**: single feature list, honest roadmap, correct layout
  name, APK documented as locally-generated (excluded from zips).
- **TypeScript runner removed** (was `node` with no file — broken); Run now
  shows the exact `tsc` command to use instead.
- **Java runner fixed**: `java <file>` (single-file launch works on JDK 11+).
- **`cd` validates** the target via the sandboxed file API before switching.
- **Git ahead/behind computed** (`rev-list --left-right --count`), shown in
  the status bar.
- **`apiSyntaxCheck` runs in the project root**, not an empty cwd.
- **`analyze_file` is sandbox-checked** like every other file command.
- **Theme applies instantly** (Editor key follows the resolved theme).
- **Breakpoints track edits** (decoration ranges read back into state).
- **Monaco models disposed** on tab close (no long-session leak).
- **Auto-save refreshes** diagnostics + git status after the debounced write.
- **Allowlist widened honestly**: pnpm, yarn, ruby, php, dotnet — with
  matching eval-flag blocks (`ruby -e`, `php -r`).
- **`git config` filtered**: only keys that redirect execution are blocked
  (sshCommand, pager, hooksPath…); normal config still works.
- **Custom Modal + Toasts**: zero `prompt()`/`confirm()` left (they're broken
  in Android WebViews). Deletes/renames/unsaved-close use the in-app dialog;
  real errors surface as toasts, not just status text.
- **Settings version-proofed**: unknown stored keys are dropped on load.
- **Effects cleaned**: mount init via `getState()`, palette listener has deps,
  stray `eslint-disable` comments removed; `e.metaKey` used directly.
- **Formatting**: double-space typos fixed.
- **AI placeholder button now opens the command palette** (no dead UI).
- **CSS split** into `styles/base.css`, `styles/components.css`,
  `styles/theme.css` (same cascade order, verified by identical build output).
- **MobileBar**: explicit A+/A− buttons; Save-all moved to long-press
  (double-tap is unreliable on touch).

## Accepted limitations (documented, not hidden)

- Search has debounce + stale-guard; in-flight Tauri invokes can't be
  aborted (no cancel API) — noted, not fixed.
- Welcome-screen restore after deleting the open file is abrupt —
  cosmetic, deferred.
- `list_dir` depth cap stays (mobile guard); lazy-expand is roadmap.
- Mixed Arabic/English strings stay until a real i18n pass (roadmap).
- `run_command` tools (`git`, `npm`, `cargo`) run with user privileges by
  design — the sandbox covers the file API, not child processes.
- No unit tests yet (roadmap).

---

# Round 3 — legendary micro-review (v0.4.0, 20 items fixed)

## P0 — real bugs fixed

1. Deleting/renaming a **folder** orphaned open tabs (ghost edits could
   resurrect deleted files). Child tabs now close / remap by prefix.
2. `runActive`/`debugActive` saved without `try/catch` — unhandled rejection
   + running stale code. Now aborts with a toast/debug message.
3. `disposeModel` suffix-match could dispose a sibling file's model.
   Exact URI match only.
4. Internal `git()` calls had **no timeout** (GPG/credential prompts hang
   forever). Now `git_timeout(30s)` with kill.
5. Overlapping Modals stranded a promise forever. New requests now settle
   the previous one first.
6. `git checkout -x` flag injection. Leading `-` rejected.
7. Bare `cd` errored confusingly. Now returns to project root.
8. Terminal split quoted args (`echo "a b"`). Now quote-aware `splitArgs`.
9. `strip_ansi` swallowed output after BEL-less OSC sequences. `ESC \` (ST)
   now terminates too.

## P1 — production polish

10. Theme switches via `setTheme` effect — no editor remount, undo kept.
11. `matchMedia` listener moved to an effect with cleanup.
12. `auto` theme follows OS changes live.
13. Touch-only `⋯` per file row (context menus don't exist on phones).
14. Search autofocus only on fine pointers (no forced mobile keyboard).
15. Shell scripts run for real (`sh` allowlisted, `-c` blocked).
16. Modal Escape cancels confirms too.
17. StatusBar bell is live (notification count + recap/summary toast).
18. `help` text lists the real toolchain set.
19. `cargo run` always executes at the project root.
20. `npm run check` (`tsc --noEmit`) added.

Also: `npm run check` green, `vite build` green, `cargo check` green.

---

# Round 4 — Nova AI (OpenRouter, v0.4.0)

- In-app AI panel (✨ sidebar): 25 live free models (+ refresh), thinking
  toggle with effort (fast/balanced/deep), file-context attach.
- Agentic tools through the existing guarded bridge: list/read/write files,
  run toolchains, search, Problems — sandbox + allowlist still enforced.
  No delete tool exposed.
- Streaming SSE responses, reasoning shown collapsible, stop button,
  code blocks with Copy / Insert-at-cursor / Replace-file (confirm).
- API key in Settings → AI, device-local only (single prefilled key,
  editable). CSP extended with `https://openrouter.ai`.
- Verified live: key OK, 25 free models, chat + reasoning + tool_calls
  round-trip on `deepseek-v4-flash-0731:free`.

---

# Round 5 — Nova AI superpowers (v0.4.0)

Lab-tested all 25 free models (chat + tools + thinking, 2026-09-18):

- **Tier S** (chat ✓ tools ✓ reasoning ✓, stable): `deepseek-v4-flash`
  (default), `nex-n2.5-pro/mini`, `openrouter/free`, `north-mini-code`.
- **Tier A** (works, quirks): `qwen3.8` (chat only — tools error),
  `ling-flash` family, `lfm-2.5`, `dots-3`, nemotron family (chatty /
  rate-limited), `content-safety`.
- **Dead**: `inkling`×2 (agentic-harness-only), `laguna`×2, `glm-5.2`,
  `gemma-4`×2, `lyria`×2 (music models). Thinking `low/medium/high`
  verified on DeepSeek (reasoning lengths differ per effort).
- Picker auto-orders lab-verified first; free list auto-refreshes daily
  (manual refresh button too); offline fallback list kept current.
- New agentic tools: `build_android_apk` (background thread + log file +
  SDK discovery) and `poll_build` (running/exit/APK-path/log tail).
  Honest guard: phones without an SDK get a clear error, not a hang.
- Token usage shown per reply (`stream_options.include_usage`, always $0
  on :free). One-tap prompt chips: fix errors, run+verify, write+run
  tests, build APK, explain file.

---

# Round 6 — reasoning modes, dead-model causes, 30-min refresh (v0.4.0)

Docs (official): effort levels are `max/xhigh/high/medium/low/minimal/
none`; each model advertises `reasoning.supported_efforts`,
`default_effort`, `mandatory` via GET /models.

- Effort picker is now **dynamic per model** (advertised list, else full
  gateway set). Verified live: low ✓ medium ✓ high ✓ **xhigh** ✓.
- Non-text models (lyria music generators) auto-excluded via
  `output_modalities`. Capability badges: agentic vs chat-only (from
  `supported_parameters`), context size, mandatory-🧠 marker.
- Dead causes confirmed: inkling = harness-gated by provider; laguna/glm/
  gemma = free-tier provider errors; qwen = chat OK, tools fail provider-side.
- Reasoning blocks travel with tool_calls (docs requirement); `summary`
  details parsed too; legacy `include_reasoning` dropped.
- Chat history sliding window (24 msgs / 60k chars) + auto-trim retry hint
  on context overflow.
- Agentic loop raised to 15 turns with 10s pre-poll delay (APK builds).
- Approval toggle (default auto; delete never exposed; denials visible).
- Model list TTL 30 min + age label; offline fallback kept current.
- APK build now discovers the project root (exe-dir + cwd upward search
  for `tauri.conf.json`) instead of trusting cwd.

---

# Round 7 — external review fixes (v0.5.0)

- **Bundled API key removed.** The OpenRouter key no longer ships in source
  or APKs — every install starts empty and nudges to Settings → AI.
  (Client-side encryption was rejected as theater: the decryptor ships
  in the same bundle.) Existing installs keep their own saved key.
  localStorage plaintext is inherent to client storage — documented.
- **Arg-filter bypass closed.** `blocked_arg` was exact-match and bypassable
  (`python3 -cimport os`, `node --eval=…`). Now prefix-based via
  `glued_short` (single-dash gluing blocked, `--long` namespace untouched):
  python `-c*`, node `-e*/-p*/-r*` + `--eval/--print/--require/--import`,
  ruby `-e*`, php `-r*`, sh `-c*`. Plus: git `-C` (cwd escape), git
  `--config-env` (redirect), npm/pnpm/yarn `--prefix` (cwd escape),
  cat/ls absolute paths + `..`.
- **Auto-approve now defaults to ASK** (was ON) + system prompt carries an
  explicit anti prompt-injection clause (tool output/files = data).
- README version unified to 0.5.0; MIT LICENSE added.

---

# Round 8 — shared key done right + AI robustness (v0.5.0)

Key architecture (user-approved: proxy + weak embedded fallback):
- `ai-proxy/worker.js`: 60-line Cloudflare Worker holding the key
  server-side; proxies only `/v1/models` + `/v1/chat/completions`,
  strips secrets, CORS-locked. Deploy steps in the file header.
- App: `aiEndpoint` setting (empty = OpenRouter direct). Resolution:
  user key → embedded fallback → nudge to Settings. Proxy mode needs
  no key at all. CSP `connect-src` widened to `https:` (documented:
  required for user-chosen proxy hosts).
- Embedded key scattered as chunks (labeled WEAK in code — slows grep
  only). Current key is burned (old zips/APKs + chat logs): ROTATE it.
- Fixes: session controls locked during streaming; stop cancels pending
  tools + approval modal; tolerant SSE parser (`\n` and `\n\n` verified
  against live wire format); empty-reply fallback; quick-chips append;
  delete-chat confirm; session schema validation; auto-scroll (sticks
  only near bottom); timestamps; dead-model ⚠ badges; Plus/History
  merged; approval modal Escape.

---

# Round 9 — AI web + downloads + wider shell (v0.5.0)

Yes, it can now: `web_search` (DuckDuckGo lite, titles+URLs, lab-verified),
`fetch_url` (page → clean text, SSRF-guarded to public http(s) only),
`download_file` (text ≤500KB into workspace, content-type checked,
approval-gated). Shell widened: `sh script.sh` runs real scripts,
plus `curl/tar/unzip/zip` where installed. System prompt advertises all
of it. CORS may block some sites in-webview — tools degrade to knowledge
with an explicit message instead of hanging.

---

# Round 10 — device-truth round (v0.6.2, verified by TESTS not eyes)

User on device still saw raw "os error 13" + slow loader + broken light
theme. Fixes, each backed by an automated test or a build artifact:

- `friendlyErr()` safety net (Arabic + English + raw detail) applied to
  EVERY user-visible error surface (status, toasts, terminal, debug).
  Even unknown future leaks render actionable.
- Light theme audited rule-by-rule (~35 overrides): all hardcoded dark
  surfaces, cyan-on-white via darkened `--accent-2`, `color-scheme`,
  native select menus, switch rings.
- Editor loader is a skeleton, shown once per boot only.
- Extensions panel renamed honestly (no fake "Rust Analyzer").
- Workspace root itself can't be deleted/renamed (Rust guard).
- NEW: `cargo test` — 6 tests (arg-bypass class, git-config rules,
  ANSI incl. ST terminator, real-tempdir sandbox, skip list).
- NEW: `npm test` — 28 assertions against the real esbuild-bundled
  source (outline cap, languages, quoting, SSRF guard, page scrub,
  shade helper).
- Release APK v0.6.2 arm64, 18MB, signed.

---

# Round 11 — error reporting + missing-toolchain truth (v0.6.2)

User still saw raw "os error": root cause found — phones have NO
python3/node/git/npm binaries, so every Run/terminal attempt died in
`Command::spawn` with raw "No such file or directory (os error 2)".
Fixed with `spawn_err()`: "`X` is not installed on this device — run it
on desktop, or use the in-app tools."

- New `src/lib/reporter.ts`: every error (toast errors, uncaught
  exceptions, unhandled rejections, ErrorBoundary crashes) becomes a
  detailed report — message, stack, app version, backend type, device
  (screen/DPR/cores/online), full app-state snapshot, last terminal/
  output/debug lines, status, diagnostics sample. Secrets scrubbed
  (`sk-or-v1-*` → [REDACTED]).
- Local queue (50, survives reboot) + POST to configurable endpoint
  (Settings → Error reports) with Discord-webhook auto-format.
  Flush on boot + on settings change; failures stay queued silently.
- Reporting can never crash the app (every path guarded) and never
  loops (sender errors are not reported).
- `error-receiver/worker.js`: 2-minute Cloudflare receiver (optional
  Discord forward) so "send me the full error" is one tap (Send test).
- Tests: reporter scrub/offline-build covered in smoke (now 32 asserts).

---

# Round 12 — mandatory reports, terms gate (v0.6.3)

- Built-in Discord channel is now the default destination: custom URL
  wins, otherwise reports go to the hardcoded channel. (Channel is
  public by nature — secrets are scrubbed before storing/sending.)
- Terms & Conditions gate on launch (Arabic + English summary, scroll-to-
  accept, versioned — re-shown on bump). Discloses auto-reporting plainly.
- Fixed a hooks-ordering trap while gating (conditional return placed
  after ALL hooks).

---

# Round 13 — the "worse than everything" plugin bypass (v0.6.4, verified)

Verified against vendored sources (`tauri-2.11.5/src/scope/fs.rs`,
`tauri-plugin-fs-2.5.2`, `tauri-plugin-shell`): `is_allowed` returns
false for paths "neither allowed nor forbidden", and shell `execute`
needs configured scope entries. Our config has ZERO scopes — so the
plugin channels existed but default-denied. The report's mechanism was
right, its exploitability rating was overstated for THIS build.

Still removed (defense in depth, free): `fs:*` + `shell:*` gone from
`capabilities/main.json`, `tauri-plugin-fs/shell` unregistered from
Cargo.toml + `run()`. Only `dialog:*` remains (actually used by the
folder picker). JS packages were already gone; now the Rust side and
the IPC surface are gone too.

Also fixed this round:
- APK build permanent lock → worker thread with 30-min timeout, live
  log streaming (no pipe deadlock), `cancel_android_build` command +
  AI tool, no `.unwrap()` on hot paths.
- `read_file` refuses >2MB by metadata BEFORE loading (tested).
- `git_commit` capped at 2000 chars; git-auth hangs get an explicit
  credential-helper hint instead of a bare timeout.
- `pickFolder` rejects `content://` loudly; `set_sandbox` errors now
  surface via notify instead of failing silently.
- `list_dir` returns `{entries, truncated}` — the UI says when the
  3000-node budget cuts the tree.
- README unified to 0.6.4, LICENSE exists, CI workflow added
  (`tsc` + `npm test` + `cargo check` + `cargo test`).
- Stale claims corrected: `blocked_arg` is starts_with-based + tested,
  tests + LICENSE exist, key/autoApprove/sh retentions are explicit
  user demands, documented in Terms.
- Tests: `cargo test` 7/7, `npm test` 32/32, `tsc` + `vite build` green.

---

# Round 14 — user-demanded power + calm UI + proven delivery (v0.7.0)

- **Filter system fully removed** (user order): allowlist, arg filter,
  git-config filter, sandbox enforcement, root guard — device is
  trusted-local like a desktop. `set_sandbox` kept as a no-op for API
  compat. Tests rewritten (open-filesystem roundtrip instead).
- **Mobile clipboard**: Copy/Cut/Paste/Select-All touch buttons driving
  Monaco actions + system clipboard with fallback; `contextmenu: true`.
- **Calm theme by default**: new Mono accent (white/gray), neutral
  gradients/orbs/hovers, gray file icons + gray editor selection,
  full light-theme completion, `data-accent` contrast guards.
- **Delivery PROVEN, not assumed**: `npm test` now spins a real local
  HTTP server — asserts POST arrival, secret scrubbing in transit,
  queue-drain, and dead-endpoint retention (38 asserts). This caught a
  real test-ordering bug (auto-flush racing the assertion) — fixed by
  test design, app code was correct.

---

# Round 15 — Kotlin permissions plugin (v0.8.0, in the APK)

Owner order: native Android permission control to kill os error 13.
Built as a real Tauri v2 mobile plugin (`plugins/permissions`), NOT an
app rewrite — same TypeScript UI, same Rust backend, Kotlin only where
the OS demands native code:
- `PermissionsPlugin.kt`: `check_storage` (SDK level, legacy grant,
  all-files state, external root), `request_legacy_storage`
  (fire-and-forget + frontend Verify poll), `open_all_files_settings`
  (app-specific intent with global fallback). No permission-result
  callback dependency by design.
- Rust `mobile.rs`/`desktop.rs`/`commands.rs`/`models.rs`/`error.rs`,
  `build.rs` with COMMANDS, hand-written `permissions/default.toml`,
  `permissions:default` capability (minimal surface: 3 commands).
- Verified two ways: `cargo check` + release APK contains
  `com/nova/permissions/PermissionsPlugin` and all 3 commands in
  classes.dex. Release APK v0.8.0 arm64, 16MB, signed.
- Frontend: storage banner in Explorer (Grant/Verify/Open-shared-storage),
  friendlyErr os-13 text points at it. MANAGE_EXTERNAL_STORAGE +
  legacy storage permissions in manifest (sideload-appropriate).

---

# Round 16 — manifest-declared permissions + secret auth (v0.8.1)

External review nailed the one real blocker: the Kotlin logic was
correct but the plugin manifest declared ZERO permissions, so Android
silently denied everything and os error 13 survived. Fixed:
- `plugins/permissions/.../AndroidManifest.xml` now declares
  READ/WRITE_EXTERNAL_STORAGE (SDK-capped) + MANAGE_EXTERNAL_STORAGE.
- Verified the remaining `.unwrap()`s are test-only; hot paths use
  `map_err`/`if-let`/`unwrap_or`.
- `APP_SECRET` activated end-to-end: worker enforces it when set,
  app sends `X-App-Secret` from the new setting, 403s explain the fix.
- StorageBanner handles `opened:false` (exotic ROMs) with a manual path.
- `errorEndpoint` default restored (was dropped from defaults).
- Cleanup: plugin gradle artifacts (7.6MB) deleted + gitignored.
- Tests: `cargo test` 4/4, `npm test` 38/38, `tsc` + `vite build` green.
- Merger conflict fixed (plugin maxSdkVersion aligned with app manifest).
- PROVEN in the artifact: apkanalyzer lists READ/WRITE_EXTERNAL_STORAGE
  + MANAGE_EXTERNAL_STORAGE in the merged manifest of the shipped APK.
- Release APK v0.8.1 arm64, 16MB, signed.
- Play Store warning (from review, accepted): MANAGE_EXTERNAL_STORAGE
  needs a Permissions Declaration Form; an IDE may face review friction.
  Fallback documented: restrict Open-folder to appDataDir (zero extra
  permissions) and keep all-files access an advanced opt-in.

---

# Round 17 — webhook excised, picker gated, consent-timed reporting (v0.8.2)

- Hardcoded Discord webhook **deleted** (was one `strings` away from
  spam + @everyone pings). No built-in destination anymore: reports go
  ONLY to a user-configured endpoint, else stay queued on-device.
  `allowed_mentions: {parse: []}` added in BOTH `formatDiscord()` and
  `error-receiver/worker.js`; worker secret check activated (was
  commented out) with matching `X-App-Secret` support + 403 hint.
- `pickFolder` now checks `storageReady()` BEFORE opening the picker —
  same gate as "Shared storage", no more raw os-13 from the other path.
- Reporting starts only AFTER Terms acceptance (was boot-time).
- Housekeeping: plugin gradle artifacts gitignored (+7.6MB zip slimming),
  `useAI.ts` fused-lines fixed, Settings key warning reworded for the
  proxy-first reality, stale `.unwrap()`s confirmed test-only.
- Play Store note accepted: MANAGE_EXTERNAL_STORAGE needs a declaration
  form; appDataDir-only mode documented as the zero-permission fallback.
- Tests: `cargo test` 4/4, `npm test` 38/38, `tsc` + `vite build` green.
  Release APK v0.8.2 arm64, 16MB, signed (permissions re-verified with
  apkanalyzer in the merged manifest).
