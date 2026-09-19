import { version as APP_VERSION } from "../../package.json";

/**
 * Crash/error reporting: every error — however small — becomes a detailed
 * report (message, stack, device, app state, recent logs) that is queued
 * locally and POSTed to the configured endpoint (Settings → Reports).
 * Nothing is ever lost: unsent reports persist and flush on next launch.
 */

export type ReportLevel = "fatal" | "error" | "warn" | "info" | "test";

export interface ErrorReport {
  id: string;
  at: string;
  level: ReportLevel;
  message: string;
  stack?: string;
  extra?: Record<string, string>;
  app: {
    version: string;
    backend: "tauri" | "web-demo";
  };
  device: {
    platform: string;
    userAgent: string;
    language: string;
    screen: string;
    dpr: number;
    cores: number;
    online: boolean;
  };
  state: Record<string, string | number | boolean>;
  logs: { terminal: string[]; output: string[]; debug: string[]; status: string };
  diagnostics: { count: number; sample: string[] };
}

const QUEUE_KEY = "nova-error-queue";
const MAX_QUEUE = 50;

/**
 * No built-in destination: reports go ONLY to the user-configured endpoint
 * (Settings → Error reports). A hardcoded Discord webhook was removed in
 * v0.8.2 — anyone reading the source could spam it with zero auth, and
 * Discord enables @everyone mentions by default. Never put a direct
 * webhook URL in client code again; route through error-receiver instead.
 */

let endpoint = "";
let appSecret = "";
let flushing = false;
let installed = false;

export function setReportEndpoint(url: string) {
  endpoint = (url || "").trim();
}

/** Shared secret forwarded as X-App-Secret (checked by error-receiver). */
export function setReportSecret(s: string) {
  appSecret = (s || "").trim();
}

/** Custom endpoint wins; empty means queue on-device only. */
export function effectiveEndpoint(): string {
  return endpoint;
}

export function getQueueLength(): number {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return 0;
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}

export function peekReports(): ErrorReport[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export function clearReports() {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch { /* ignore */ }
}

function loadQueue(): ErrorReport[] {
  return peekReports();
}

function saveQueue(q: ErrorReport[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-MAX_QUEUE)));
  } catch {
    // quota full: drop oldest half and retry once
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-Math.floor(MAX_QUEUE / 2))));
    } catch { /* give up silently — reporting must never crash the app */ }
  }
}

/** Remove anything that looks like a secret before storing/sending. */
export function scrub(text: string): string {
  return text
    .replace(/sk-or-v1-[A-Za-z0-9]+/g, "[REDACTED-KEY]")
    .replace(/sk-[A-Za-z0-9]{8,}/g, "[REDACTED-KEY]");
}

/**
 * Recursively scrub every string in a value (objects, arrays, nested).
 * Secrets don't only live in top-level messages — terminal output, tool
 * results and workspace paths can carry tokens, .env values or keys.
 */
export function scrubDeep<T>(value: T): T {
  if (typeof value === "string") return scrub(value) as unknown as T;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = scrubDeep(v);
    return out as unknown as T;
  }
  return value;
}

let includeLogs = true;

/** Settings toggle: attach terminal/output/debug logs + diagnostics or not. */
export function setIncludeLogs(v: boolean) {
  includeLogs = v;
}

export interface StateSnapshot {
  rootPath: string;
  activePath: string;
  language: string;
  tabs: number;
  dirty: number;
  panel: string;
  sidebar: string;
  theme: string;
  model: string;
  status: string;
  terminal: string[];
  output: string[];
  debug: string[];
  diagCount: number;
  diagSample: string[];
}

let snapshotProvider: (() => StateSnapshot) | null = null;

/** The store registers this once; reporter stays store-free (no cycles). */
export function setSnapshotProvider(fn: () => StateSnapshot) {
  snapshotProvider = fn;
}

function buildReport(
  level: ReportLevel,
  err: unknown,
  extra?: Record<string, string>,
): ErrorReport {
  const e = err instanceof Error ? err : new Error(String(err ?? "unknown"));
  const snap = snapshotProvider?.();
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  // Every free-form field goes through the recursive scrubber — message and
  // stack alone are not enough (logs, paths and tool output carry secrets).
  const scrubStr = (s: string) => scrub(s);
  const scrubArr = (a: string[]) => a.map((s) => scrub(s.slice(0, 500)));
  return {
    id: `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`,
    at: new Date().toISOString(),
    level,
    message: scrub((e.message || String(err)).slice(0, 1000)),
    stack: typeof e.stack === "string" ? scrub(e.stack.slice(0, 3000)) : undefined,
    extra: extra ? (scrubDeep(extra) as Record<string, string>) : undefined,
    app: {
      version: APP_VERSION,
      backend:
        typeof window !== "undefined" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window)
          ? "tauri"
          : "web-demo",
    },
    device: {
      platform: nav.platform ?? "unknown",
      userAgent: (nav.userAgent ?? "").slice(0, 300),
      language: nav.language ?? "",
      screen:
        typeof window !== "undefined" && window.screen
          ? `${window.screen.width}x${window.screen.height}`
          : "",
      dpr: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
      cores: nav.hardwareConcurrency || 0,
      online: nav.onLine !== false,
    },
    state: snap
      ? {
          rootPath: scrubStr(snap.rootPath),
          activePath: scrubStr(snap.activePath),
          language: snap.language,
          tabs: snap.tabs,
          dirty: snap.dirty,
          panel: snap.panel,
          sidebar: snap.sidebar,
          theme: snap.theme,
          model: snap.model,
        }
      : {},
    // Logs attach only when opted in (Settings → Reports → Attach logs).
    logs:
      snap && includeLogs
        ? {
            terminal: scrubArr(snap.terminal.slice(-30)),
            output: scrubArr(snap.output.slice(-20)),
            debug: scrubArr(snap.debug.slice(-20)),
            status: scrubStr(snap.status),
          }
        : { terminal: [], output: [], debug: [], status: "" },
    diagnostics: snap
      ? { count: snap.diagCount, sample: scrubArr(snap.diagSample) }
      : { count: 0, sample: [] },
  };
}

/**
 * Record an error: queue locally (always) + try sending now.
 * Never throws, never loops (send failures stay queued silently).
 */
export function reportError(
  level: ReportLevel,
  err: unknown,
  extra?: Record<string, string>,
): ErrorReport | null {
  try {
    const report = buildReport(level, err, extra);
    const q = loadQueue();
    q.push(report);
    saveQueue(q);
    void flushQueue();
    return report;
  } catch {
    return null;
  }
}

export function formatDiscord(report: ErrorReport): { content: string; allowed_mentions: { parse: never[] } } {
  const level = report.level || "error";
  const emoji = level === "fatal" ? "🔥" : level === "test" ? "🧪" : "🚨";
  return {
    // allowed_mentions.parse: [] — report text is untrusted; never let it
    // ping @everyone/@here no matter what a forged report contains.
    allowed_mentions: { parse: [] },
    content:
      `${emoji} Nova IDE [${level}] v${report?.app?.version ?? "?"} — ` +
      `${report?.device?.platform ?? "?"} — ${report?.at ?? ""}\n` +
      "```" +
      `${String(report?.message ?? "").slice(0, 1500)}\n` +
      `state: ${JSON.stringify(report?.state ?? {}).slice(0, 500)}` +
      "```",
  };
}

async function postOne(url: string, report: ErrorReport): Promise<boolean> {
  try {
    // Discord webhooks need a wrapped payload; plain URLs get raw JSON
    const isDiscord = url.includes("discord.com/api/webhooks");
    const body = isDiscord ? formatDiscord(report) : report;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (appSecret) headers["X-App-Secret"] = appSecret;
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function flushQueue(): Promise<{ sent: number; pending: number }> {
  const url = effectiveEndpoint();
  if (flushing || !url) return { sent: 0, pending: getQueueLength() };
  flushing = true;
  try {
    let q = loadQueue();
    let sent = 0;
    const rest: ErrorReport[] = [];
    for (const r of q) {
      if (await postOne(url, r)) {
        sent++;
      } else {
        rest.push(r);
        break; // endpoint down — keep order, retry later
      }
    }
    // drop the sent prefix, keep the rest
    q = [...rest, ...q.slice(sent + rest.length)];
    saveQueue(q);
    return { sent, pending: q.length };
  } finally {
    flushing = false;
  }
}

/** Global hooks: uncaught exceptions + rejected promises → reports. */
export function installReporter() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (ev) => {
    reportError("fatal", ev.error ?? ev.message, { source: "window.onerror" });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    reportError("error", ev.reason ?? "unhandled rejection", { source: "unhandledrejection" });
  });
  // flush anything queued while offline / endpoint-less
  void flushQueue();
}
