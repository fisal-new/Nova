import { Bot, Brain, Paperclip, Plus, RefreshCw, Send, ShieldCheck, Square, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { currentEditor } from "../lib/editorRef";
import { effortsFor } from "../lib/ai";
import { useAI, type UIMsg } from "../store/useAI";
import { useIDE } from "../store/useIDE";

/** Render assistant text: code fences get Copy / Insert / Replace actions. */
function RichText({ msg }: { msg: UIMsg }) {
  const { tabs, activePath, editActive } = useIDE();
  const active = tabs.find((t) => t.path === activePath);
  const parts = msg.content.split(/(```[\s\S]*?(?:```|$))/g);

  const copy = (code: string) => {
    try {
      navigator.clipboard?.writeText(code);
    } catch { /* clipboard unavailable */ }
  };
  const insertAtCursor = (code: string) => {
    const ed = currentEditor();
    if (!ed) return;
    const sel = ed.getSelection();
    const model = ed.getModel();
    if (!model) return;
    ed.executeEdits("nova-ai", [
      { range: sel ?? model.getFullModelRange(), text: code, forceMoveMarkers: true },
    ]);
    ed.focus();
  };
  const replaceFile = (code: string) => {
    if (!active) return;
    useIDE.getState()
      .askConfirm(`Replace entire ${active.name} with this code?`, true)
      .then((ok) => {
        if (ok) editActive(code.endsWith("\n") ? code : code + "\n");
      });
  };

  return (
    <div className="ai-body">
      {parts.map((p, i) => {
        const m = p.match(/^```(\w*)\n?([\s\S]*?)(?:```|$)$/);
        if (!m) {
          return (
            <p key={i}>
              {p.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((s, j) =>
                s.startsWith("**") && s.endsWith("**") ? (
                  <b key={j}>{s.slice(2, -2)}</b>
                ) : s.startsWith("`") && s.endsWith("`") ? (
                  <code key={j}>{s.slice(1, -1)}</code>
                ) : (
                  <span key={j}>{s}</span>
                ),
              )}
            </p>
          );
        }
        const code = m[2].replace(/\n$/, "");
        return (
          <div key={i} className="ai-code">
            <div className="ai-code-bar">
              <span>{m[1] || "code"}</span>
              <button onClick={() => copy(code)}>Copy</button>
              <button onClick={() => insertAtCursor(code + "\n")}>Insert</button>
              {active && <button onClick={() => replaceFile(code)}>Replace file</button>}
            </div>
            <pre>{code}</pre>
          </div>
        );
      })}
    </div>
  );
}

export default function AIPanel() {
  const {
    models, modelsLoading, model, thinking, effort, attachFile,
    messages, sending, draft, lastUsage, modelsAge, autoApprove,
    sessions, sessionId, attachments,
    setModel, setThinking, setEffort, setAttach, setDraft, setAutoApprove,
    loadModels, send, stop,
    newChat, switchSession, deleteSession, addAttachments, removeAttachment,
  } = useAI();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meta = models.find((m) => m.id === model);
  const effortOptions = effortsFor(meta);
  const mandatoryThink = meta?.reasoning?.mandatory === true;

  const quick = (text: string) => {
    // append, never clobber what the user already typed
    const cur = useAI.getState().draft;
    setDraft(cur ? `${cur}\n${text}` : text);
    // send on next tick so the draft state lands first
    setTimeout(() => useAI.getState().send(), 50);
  };

  const confirmDelete = (id: string, title: string) => {
    useIDE.getState()
      .askConfirm(`Delete chat "${title}"?`, true)
      .then((ok) => {
        if (ok) deleteSession(id);
      });
  };

  // smooth auto-scroll as tokens stream in (only if already near bottom)
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const lastLen = useRef(0);
  const totalLen = messages.reduce((n, m) => n + m.content.length, 0);
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (nearBottom.current && totalLen !== lastLen.current) {
      lastLen.current = totalLen;
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [totalLen]);

  const fmtTime = (at?: number) =>
    at
      ? new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : "";

  return (
    <div className="ai-panel">
      <div className="ai-controls">
        <div className="ai-row">
          <button className="icon-btn" title="New chat" onClick={newChat}>
            <Plus size={15} />
          </button>
          <select
            title="Chat history"
            value={sessionId ?? ""}
            onChange={(e) => e.target.value && switchSession(e.target.value)}
          >
            <option value="" disabled>
              {sessions.length ? `${sessions.length} chats…` : "No history yet"}
            </option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} ({s.messages.length})
              </option>
            ))}
          </select>
          {sessionId && (
            <button
              className="icon-btn"
              title="Delete this chat"
              onClick={() => {
                const s = sessions.find((x) => x.id === sessionId);
                confirmDelete(sessionId, s?.title ?? "chat");
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        </div>
        <div className="ai-row">
          <select
            title="Free model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          >
            {models.length === 0 && <option value="">loading…</option>}
            {models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.reasoning?.mandatory ? " 🧠" : ""}
                {m.supportsTools === false ? " (chat)" : ""}
              </option>
            ))}
          </select>
          <button
            className="icon-btn"
            title={`Refresh free models${modelsAge ? ` (${modelsAge})` : ""}`}
            onClick={() => loadModels(true)}
          >
            <RefreshCw size={14} className={modelsLoading ? "spin" : ""} />
          </button>
        </div>
        <div className="ai-row">
          <button
            className={`chip ${thinking || mandatoryThink ? "on" : ""}`}
            title={
              mandatoryThink
                ? "This model always reasons (mandatory)"
                : "Thinking (reasoning) mode"
            }
            onClick={() => !mandatoryThink && setThinking(!thinking)}
          >
            <Brain size={13} /> Thinking
          </button>
          {(thinking || mandatoryThink) && (
            <select
              title="Reasoning effort (per-model options)"
              value={effortOptions.includes(effort) ? effort : effortOptions[0]}
              onChange={(e) => setEffort(e.target.value)}
            >
              {effortOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          )}
          <button
            className={`chip ${attachFile ? "on" : ""}`}
            title="Attach active file + problems as context"
            onClick={() => setAttach(!attachFile)}
          >
            <Paperclip size={13} /> File ctx
          </button>
        </div>
        <div className="ai-row">
          <button
            className={`chip ${autoApprove ? "on" : ""}`}
            title={
              autoApprove
                ? "AI writes & runs without asking (delete never exposed)"
                : "AI asks before every write/run"
            }
            onClick={() => setAutoApprove(!autoApprove)}
          >
            <ShieldCheck size={13} /> {autoApprove ? "Auto ✓" : "Ask me"}
          </button>
          {meta && (
            <span className="ai-cap" title="Lab-tested capabilities">
              <span className={`cap-dot ${meta.supportsTools === false ? "chat" : "agent"}`} />
              {meta.supportsTools === false ? "chat-only" : "agentic"}
              {meta.context > 0 && ` • ${Math.round(meta.context / 1000)}k ctx`}
            </span>
          )}
        </div>
      </div>

      <div
        className="ai-messages"
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        }}
      >
        {messages.length === 0 && (
          <>
            <div className="ph">
              <h4><Bot size={14} style={{ verticalAlign: -2 }} /> Nova AI</h4>
              Ask to write, run, test or debug code — I can read files, run
              toolchains, scaffold projects and build APKs, all inside your
              workspace. Written files open in the editor automatically.
              Key lives only on this device (Settings → AI).
            </div>
            <div className="ai-quick">
              {[
                ["🐞", "Fix the errors in the active file"],
                ["▶", "Run the active file and show me it works"],
                ["🧪", "Write a quick test for the active file and run it"],
                ["📦", "Build the Android debug APK now"],
                ["📖", "Explain what the active file does"],
              ].map(([e, t]) => (
                <button key={t} className="chip" onClick={() => quick(t as string)}>
                  {e} {(t as string).split(" ").slice(0, 3).join(" ")}…
                </button>
              ))}
            </div>
          </>
        )}
        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="ai-msg user">
              <span className="ai-who">you{fmtTime(m.at) && ` • ${fmtTime(m.at)}`}</span>
              {m.content}
            </div>
          ) : (
            <div key={m.id} className={`ai-msg bot${m.error ? " err" : ""}`}>
              <span className="ai-who">nova ★ {model.split("/").pop()?.split(":")[0]}{fmtTime(m.at) && ` • ${fmtTime(m.at)}`}</span>
              {m.reasoning && (
                <details className="ai-think">
                  <summary>💭 thinking</summary>
                  <pre>{m.reasoning}</pre>
                </details>
              )}
              {m.toolNote && <div className="ai-tool">{m.toolNote}</div>}
              {m.toolResults && m.toolResults.length > 0 && (
                <details className="ai-think">
                  <summary>🔧 {m.toolResults.length} action{m.toolResults.length > 1 ? "s" : ""} — tap to see results</summary>
                  {m.toolResults.map((r, i) => (
                    <pre key={i} style={{ marginTop: 6 }}>
                      <b>{r.name}</b>
                      {"\n" + r.result}
                    </pre>
                  ))}
                </details>
              )}
              {m.content ? (
                <RichText msg={m} />
              ) : (
                <span className="ai-typing">●●●</span>
              )}
            </div>
          ),
        )}
      </div>

      {attachments.length > 0 && (
        <div className="ai-attach">
          {attachments.map((a, i) => (
            <span key={i} className="chip on" title={`${a.content.length} chars will be sent`}>
              📎 {a.name}
              <X size={12} onClick={() => removeAttachment(i)} style={{ cursor: "pointer" }} />
            </span>
          ))}
        </div>
      )}

      <div className="ai-input">
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files?.length) addAttachments([...e.target.files]);
            e.target.value = "";
          }}
        />
        <button
          className="btn"
          title="Upload files to this chat (text, ≤120KB each)"
          onClick={() => fileRef.current?.click()}
        >
          <Upload size={14} />
        </button>
        <input
          placeholder="Ask Nova… (writes, runs & builds)"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) send();
          }}
        />
        {sending ? (
          <button className="btn btn-danger" onClick={stop} title="Stop">
            <Square size={14} />
          </button>
        ) : (
          <button className="btn btn-primary" onClick={send} title="Send">
            <Send size={14} />
          </button>
        )}
      </div>
      {(lastUsage || modelsAge) && (
        <div className="ai-foot">
          {lastUsage && (
            <span>
              {(lastUsage.total / 1000).toFixed(1)}k tokens
              (in {(lastUsage.prompt / 1000).toFixed(1)}k / out{" "}
              {(lastUsage.completion / 1000).toFixed(1)}k) • $0
            </span>
          )}
          {modelsAge && <span>{modelsAge}</span>}
        </div>
      )}
    </div>
  );
}
