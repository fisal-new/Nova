/* OpenRouter client: free models, streaming chat, thinking (reasoning). */

export const DEFAULT_BASE = "https://openrouter.ai/api/v1";

export function normalizeBase(u: string): string {
  const t = (u || "").trim().replace(/\/+$/, "");
  return t || DEFAULT_BASE;
}

/**
 * Fallback shared key, deliberately scattered: slows casual grep/skimming
 * only. Anyone with the APK/source can still reassemble it in minutes —
 * real secrecy requires the proxy (see ai-proxy/worker.js). This exists
 * so the app works out-of-the-box; rotate it if it ever leaks publicly.
 * Resolution order: user key (Settings) → proxy (no key needed) → this.
 */
const K_PARTS = [
  "sk-or-v1-32ab",
  "c8316a3fd17a",
  "a5c8031ea540",
  "aae73b704d4e",
  "b32cc8347766",
  "2b878726708c",
];

export function embeddedKey(): string {
  try {
    return K_PARTS.join("");
  } catch {
    return "";
  }
}

/** Final key choice: explicit user key wins, then embedded fallback. */
export function resolveApiKey(userKey: string): string {
  const u = (userKey || "").trim();
  if (u.length > 10) return u;
  const e = embeddedKey();
  return e.length > 10 ? e : "";
}

export interface FreeModel {
  id: string;
  name: string;
  context: number;
  /** Per-model reasoning metadata from GET /models (absent = unknown). */
  reasoning?: {
    supported_efforts?: string[] | null;
    default_effort?: string;
    mandatory?: boolean;
  };
  /** False when the provider doesn't list tool calling (chat-only model). */
  supportsTools: boolean;
}

/** All gateway effort levels (docs): filtered per model when advertised. */
export const ALL_EFFORTS = ["max", "xhigh", "high", "medium", "low", "minimal"];

/** Effort options for a model: advertised list, else the full gateway set. */
export function effortsFor(m?: FreeModel): string[] {
  const adv = m?.reasoning?.supported_efforts;
  if (Array.isArray(adv) && adv.length > 0) {
    const known = adv.filter((e) => ALL_EFFORTS.includes(e));
    return known.length > 0 ? known : [...ALL_EFFORTS];
  }
  return [...ALL_EFFORTS];
}

/** Curated fallback if the live model list can't load (verified free 2026). */
export const FALLBACK_FREE_MODELS: FreeModel[] = [
  { id: "deepseek/deepseek-v4-flash-0731:free", name: "DeepSeek V4 Flash (free)", context: 128000, supportsTools: true },
  { id: "qwen/qwen3.8-27b:free", name: "Qwen 3.8 27B (free)", context: 32000, supportsTools: false },
  { id: "google/gemma-4-26b-a4b-it:free", name: "Gemma 4 26B (free)", context: 128000, supportsTools: true },
  { id: "cohere/north-mini-code:free", name: "North Mini Code (free)", context: 64000, supportsTools: true },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "Nemotron 3 Nano (free)", context: 128000, supportsTools: true },
];

/**
 * Lab-tested 2026-09-18: chat ✓ tools ✓ reasoning ✓ on all of these.
 * Shown first in the picker; RECOMMENDED_MODEL is the default.
 */
export const RECOMMENDED_IDS = [
  "deepseek/deepseek-v4-flash-0731:free",
  "nex-agi/nex-n2.5-pro:free",
  "nex-agi/nex-n2.5-mini:free",
  "openrouter/free",
  "cohere/north-mini-code:free",
];

export const RECOMMENDED_MODEL = RECOMMENDED_IDS[0];

/** Order models: lab-verified first, then alphabetical. */
export function orderModels(list: FreeModel[]): FreeModel[] {
  const rank = new Map(RECOMMENDED_IDS.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const ra = rank.has(a.id) ? rank.get(a.id)! : 1000;
    const rb = rank.has(b.id) ? rank.get(b.id)! : 1000;
    return ra - rb || a.id.localeCompare(b.id);
  });
}

function headers(key: string, appSecret = "") {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://nova-ide.local",
    "X-Title": "Nova IDE",
  };
  // /models is public — don't send an empty/burned bearer that could 401
  if (key) h.Authorization = `Bearer ${key}`;
  // proxy shared secret (worker checks it only when APP_SECRET is set there)
  if (appSecret) h["X-App-Secret"] = appSecret;
  return h;
}

/** Live list of models whose prompt+completion pricing is $0. */
export async function fetchFreeModels(key: string, base = DEFAULT_BASE, appSecret = ""): Promise<FreeModel[]> {
  const res = await fetch(`${base}/models`, { headers: headers(key, appSecret) });
  if (!res.ok) throw new Error(`models: HTTP ${res.status}`);
  const data = await res.json();
  const list: FreeModel[] = (data?.data ?? [])
    .filter(
      (m: { pricing?: { prompt?: string; completion?: string } }) =>
        m?.pricing?.prompt === "0" && m?.pricing?.completion === "0",
    )
    .filter((m: { architecture?: { output_modalities?: string[] } }) => {
      // drop non-text models (music/image generators billed per artifact)
      const out = m?.architecture?.output_modalities;
      return !Array.isArray(out) || (out.length === 1 && out[0] === "text");
    })
    .map(
      (m: {
        id: string;
        name?: string;
        context_length?: number;
        supported_parameters?: string[];
        reasoning?: FreeModel["reasoning"];
      }) => ({
        id: m.id,
        name: m.name ?? m.id,
        context: m.context_length ?? 0,
        reasoning: m.reasoning,
        supportsTools: Array.isArray(m.supported_parameters)
          ? m.supported_parameters.includes("tools")
          : true,
      }),
    )
    .sort((a: FreeModel, b: FreeModel) => a.id.localeCompare(b.id));
  if (list.length === 0) throw new Error("no free models returned");
  return list;
}

export interface ToolDef {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ChatMsg {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  /** Preserved reasoning block (docs: required for tool-call continuity). */
  reasoning?: string;
  tool_calls?: {
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }[];
  tool_call_id?: string;
  name?: string;
}

export interface StreamEvents {
  onToken: (t: string) => void;
  onReasoning: (t: string) => void;
  onUsage?: (u: { prompt: number; completion: number; total: number }) => void;
  signal: AbortSignal;
}

/**
 * Streams one assistant turn. Resolves with the assembled message
 * (content + reasoning + accumulated tool_calls).
 */
export async function streamChat(opts: {
  key: string;
  base?: string;
  appSecret?: string;
  model: string;
  messages: ChatMsg[];
  tools?: ToolDef[];
  thinking: boolean;
  effort: string;
  ev: StreamEvents;
}): Promise<{ content: string; reasoning: string; tool_calls: ChatMsg["tool_calls"] }> {
  const { key, model, messages, tools, thinking, effort, ev } = opts;
  const base = opts.base || DEFAULT_BASE;
  const appSecret = opts.appSecret || "";
  const body: Record<string, unknown> = {
    model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  if (thinking) {
    body.reasoning = { effort };
  }
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: headers(key, appSecret),
    body: JSON.stringify(body),
    signal: ev.signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const hint =
      res.status === 403 && base !== DEFAULT_BASE
        ? " (proxy rejected the request — check Settings → AI → App secret)"
        : "";
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 300) || res.statusText}${hint}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("no stream body");
  const dec = new TextDecoder();
  let buf = "";
  let content = "";
  let reasoning = "";
  const tcAcc = new Map<
    number,
    { id: string; name: string; args: string }
  >();

  const pump = async (): Promise<void> => {
    const { done, value } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    // Tolerant framing: providers delimit events with blank lines (\n\n),
    // but single-\n streams are common too — handle line by line.
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    let pending: string[] = [];
    const flush = () => {
      if (pending.length === 0) return;
      handlePayload(pending.join("\n"));
      pending = [];
    };
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line.trim()) {
        flush();
        continue;
      }
      if (!line.trimStart().startsWith("data:")) continue;
      pending.push(line.trimStart().slice(5).trim());
    }
    // trailing under-terminated event still parses next chunk; but if the
    // stream uses single newlines, each data line is already complete —
    // flush when the next line starts a new event is implicit on blank.
    // To avoid waiting, flush single-line JSON payloads immediately:
    if (pending.length > 0 && buf === "") flush();
    return pump();
  };
  await pump();

  function handlePayload(payload: string) {
    if (payload === "[DONE]") return;
    try {
      const json = JSON.parse(payload);
      if (json?.usage && ev.onUsage) {
        ev.onUsage({
          prompt: json.usage.prompt_tokens ?? 0,
          completion: json.usage.completion_tokens ?? 0,
          total: json.usage.total_tokens ?? 0,
        });
      }
      const delta = json?.choices?.[0]?.delta;
      if (!delta) return;
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        ev.onToken(delta.content);
      }
      const r =
        delta.reasoning ??
        (Array.isArray(delta.reasoning_details)
          ? delta.reasoning_details
              .map((d: { text?: string; summary?: string }) => d.text ?? d.summary ?? "")
              .join("")
          : "");
      if (typeof r === "string" && r) {
        reasoning += r;
        ev.onReasoning(r);
      }
      const tcs = delta.tool_calls as
        | { index: number; id?: string; function?: { name?: string; arguments?: string } }[]
        | undefined;
      if (Array.isArray(tcs)) {
        for (const tc of tcs) {
          const cur = tcAcc.get(tc.index) ?? { id: "", name: "", args: "" };
          if (tc.id) cur.id = tc.id;
          if (tc.function?.name) cur.name = tc.function.name;
          if (tc.function?.arguments) cur.args += tc.function.arguments;
          tcAcc.set(tc.index, cur);
        }
      }
    } catch { /* keep-alive / partial chunk */ }
  }

  const tool_calls = [...tcAcc.values()]
    .filter((t) => t.name)
    .map((t) => ({
      id: t.id || `call_${Math.random().toString(36).slice(2)}`,
      type: "function" as const,
      function: { name: t.name, arguments: t.args || "{}" },
    }));
  return { content, reasoning, tool_calls: tool_calls.length ? tool_calls : undefined };
}
