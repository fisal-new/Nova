import Editor, { type OnMount } from "@monaco-editor/react";
import { Bug, Play, Plus, Search, TerminalSquare, Rocket, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { LANGUAGES, languageForPath, outlineSymbols } from "../lib/tauri";
import { registerIntellisense } from "../lib/intellisense";
import { revealLine, setEditorRef, copySelection, cutSelection, pasteClipboard, selectAllText } from "../lib/editorRef";
import { useIDE, resolvedTheme } from "../store/useIDE";
import LanguageIcon from "./LanguageIcon";

const CARDS = [
  { icon: <Plus size={17} />, title: "New file", desc: "Template per language", k: "Ctrl+N", act: "new" },
  { icon: <Play size={17} />, title: "Run file", desc: "Direct run, any language", k: "F5", act: "run" },
  { icon: <Bug size={17} />, title: "Debug Python", desc: "Breakpoints + pdb", k: "Ctrl+F5", act: "debug" },
  { icon: <Search size={17} />, title: "Quick open", desc: "Jump to any file", k: "Ctrl+P", act: "palette" },
  { icon: <TerminalSquare size={17} />, title: "Terminal", desc: "Run & build", k: "Ctrl+`", act: "terminal" },
  { icon: <Rocket size={17} />, title: "Git commit", desc: "Ship it", k: "> git", act: "git" },
];

export default function EditorArea() {
  const {
    tabs, activePath, setActive, closeTab, editActive,
    saveActive, setPalette, setPanel, setSidebar, rootPath,
    settings, newFile, setTabLanguage, runActive, debugActive,
    toggleBreakpoint, breakpoints, recent, openFile, clearRecent, notify,
  } = useIDE();
  const editorRef = useRef<import("monaco-editor").editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<import("@monaco-editor/react").Monaco | null>(null);
  const decoRef = useRef<string[]>([]);
  // WhatsApp-style touch menu: long-press a word → select it + popup actions
  const [touchMenu, setTouchMenu] = useState<{ x: number; y: number } | null>(null);
  const touchStart = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  // show the loader only on the very first mount, never on re-renders
  const [booted, setBooted] = useState(false);
  const active = tabs.find((t) => t.path === activePath);
  const isLight = resolvedTheme(settings) === "light";
  // coarse pointers = phones: cheap cursor + no smooth scrolling (GPU/battery)
  const isCoarse =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: coarse)").matches;
  const langInfo = active ? languageForPath(active.path) : null;
  const symbols = useMemo(
    () => (active ? outlineSymbols(active.content, active.language) : []),
    [active?.content, active?.language, active?.path],
  );
  const activeBps = active ? (breakpoints[active.path] ?? []) : [];

  // dismiss the touch menu whenever the file changes
  useEffect(() => {
    setTouchMenu(null);
  }, [activePath]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setEditorRef(editor, monaco);
    setBooted(true);
    monaco.editor.defineTheme("nova-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0d1119",
        "editor.lineHighlightBackground": "#151b2a88",
        "editorLineNumber.foreground": "#4b5266",
        "editorLineNumber.activeForeground": "#aeb7cf",
        "editor.selectionBackground": "#3a4152",
        "editor.inactiveSelectionBackground": "#2a3040",
      },
    });
    monaco.editor.defineTheme("nova-light", {
      base: "vs",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#f6f7fb",
        "editor.lineHighlightBackground": "#e8ebf5",
        "editor.selectionBackground": "#d3d8e4",
        "editor.inactiveSelectionBackground": "#e2e6f0",
      },
    });
    monaco.editor.setTheme(isLight ? "nova-light" : "nova-dark");
    registerIntellisense(monaco);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => saveActive());
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyP, () => setPalette(true));
    // click gutter → toggle breakpoint (like VS Code)
    editor.onMouseDown((e) => {
      const t = e.target as unknown as { type: number; position?: { lineNumber: number } };
      if (
        t.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN &&
        t.position
      ) {
        const path = useIDE.getState().activePath;
        if (path) useIDE.getState().toggleBreakpoint(path, t.position.lineNumber);
      }
    });
    // keep breakpoint dots glued to their lines when text above them edits:
    // decorations track automatically — read the shifted lines back into state
    editor.onDidChangeModelContent(() => {
      const st = useIDE.getState();
      const path = st.activePath;
      if (!path) return;
      const model = editor.getModel();
      if (!model) return;
      const cur = st.breakpoints[path] ?? [];
      if (cur.length === 0 || decoRef.current.length !== cur.length) return;
      const shifted = decoRef.current.map(
        (id) => model.getDecorationRange(id)?.startLineNumber ?? -1,
      );
      if (shifted.includes(-1)) return;
      const want = [...shifted].sort((a, b) => a - b).join(",");
      const have = [...cur].sort((a, b) => a - b).join(",");
      if (want !== have) {
        useIDE.setState((s) => ({
          breakpoints: { ...s.breakpoints, [path]: [...shifted].sort((a, b) => a - b) },
        }));
      }
    });
    // long-press word selection for touch (native callout is suppressed):
    // hold >450ms without scrolling → select the word + show action popup
    const dom = editor.getDomNode();
    const onTouchStart = (e: TouchEvent) => {
      setTouchMenu(null);
      if (e.touches.length === 1) {
        const t = e.touches[0];
        touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now(), id: t.identifier };
      } else {
        touchStart.current = null;
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      const s = touchStart.current;
      if (!s) return;
      const t = [...e.touches].find((x) => x.identifier === s.id) ?? e.touches[0];
      if (!t) return;
      if (Math.hypot(t.clientX - s.x, t.clientY - s.y) > 12) touchStart.current = null;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const s = touchStart.current;
      touchStart.current = null;
      if (!s || e.touches.length > 0) return;
      if (Date.now() - s.t < 450) return;
      const target = editor.getTargetAtClientPoint(s.x, s.y) as unknown as {
        position?: { lineNumber: number; column: number };
      } | null;
      const pos = target?.position;
      const model = editor.getModel();
      if (!pos || !model) return;
      const word = model.getWordAtPosition(pos);
      if (word) {
        editor.setSelection({
          startLineNumber: pos.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: pos.lineNumber,
          endColumn: word.endColumn,
        });
        editor.focus();
        setTouchMenu({
          x: Math.max(8, Math.min(s.x, window.innerWidth - 200)),
          y: s.y,
        });
      } else {
        editor.setPosition(pos);
      }
    };
    dom?.addEventListener("touchstart", onTouchStart, { passive: true });
    dom?.addEventListener("touchmove", onTouchMove, { passive: true });
    dom?.addEventListener("touchend", onTouchEnd);
    editor.onDidScrollChange(() => setTouchMenu(null));
    editor.focus();
  };

  // apply theme switches without remounting (keeps undo/scroll/models)
  useEffect(() => {
    monacoRef.current?.editor.setTheme(isLight ? "nova-light" : "nova-dark");
  }, [isLight]);

  // keep minimap in sync with window size, with proper listener cleanup
  useEffect(() => {
    const ed = editorRef.current;
    if (!ed) return;
    const mq = window.matchMedia("(min-width: 900px)");
    const syncMap = () =>
      ed.updateOptions({
        minimap: { enabled: useIDE.getState().settings.minimap && mq.matches },
      });
    mq.addEventListener("change", syncMap);
    syncMap();
    return () => mq.removeEventListener("change", syncMap);
  }, [activePath, settings.minimap]);
  // paint breakpoint dots
  useEffect(() => {    const ed = editorRef.current;
    const mo = monacoRef.current;
    if (!ed || !mo || !active) return;
    decoRef.current = ed.deltaDecorations(decoRef.current, [
      ...activeBps.map((ln) => ({
        range: new mo.Range(ln, 1, ln, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: "bp-glyph",
          glyphMarginHoverMessage: { value: `Breakpoint — line ${ln} (click to remove)` },
          stickiness: mo.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBps.join(","), activePath]);

  if (!active) {
    return (
      <div className="editor-wrap">
        <div className="welcome">
          <div className="welcome-inner">
            <div className="logo-big">⚡</div>
            <h1>Nova IDE — run, debug, ship</h1>
            <p>
              35 لغة بأيقوناتها وقوالبها • تشغيل مباشر بزر واحد •
              تنقيح Python بنقاط توقف • إكمال ذكي وفحص syntax حقيقي.
              اضغط على أرقام الأسطر لوضع breakpoint.
            </p>
            <div className="cards">
              {CARDS.map((c) => (
                <div
                  key={c.title}
                  className="card"
                  onClick={() => {
                    if (c.act === "palette") setPalette(true);
                    if (c.act === "terminal") setPanel(true, "terminal");
                    if (c.act === "run") runActive();
                    if (c.act === "debug") {
                      setSidebar("debug");
                      debugActive();
                    }
                    if (c.act === "new") newFile(rootPath);
                    if (c.act === "git") setSidebar("git");
                  }}
                >
                  {c.icon}
                  <h4>{c.title}</h4>
                  <p>{c.desc}</p>
                  <span className="k">{c.k}</span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 18, fontSize: 12 }}>
              Root: <code>{rootPath}</code> • {tabs.length} tabs open • {settings.theme} theme
            </p>
            {recent.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div className="grp" style={{ marginLeft: 0 }}>
                  recent
                  <button className="icon-btn" title="Clear" onClick={clearRecent} style={{ marginLeft: "auto", width: 26, height: 26 }}>
                    <X size={12} />
                  </button>
                </div>
                {recent.slice(0, 6).map((r) => (
                  <button key={r.path} className="hit" style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }} onClick={() => openFile(r.path, r.name)}>
                    <LanguageIcon path={r.name} size={22} />
                    <span>
                      <span className="hp" style={{ display: "block" }}>{r.name}</span>
                      <span className="hl">{r.path}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="editor-wrap" style={{ display: "flex", flexDirection: "column" }}>
      <div className="tabs">
        {tabs.map((t) => (
          <div
            key={t.path}
            className={`tab ${t.path === activePath ? "active" : ""}`}
            onClick={() => setActive(t.path)}
            onMouseDown={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                closeTab(t.path);
              }
            }}
          >
            <LanguageIcon lang={t.language} size={18} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.content !== t.savedContent ? "● " : ""}{t.name}
            </span>
            <span
              className="x"
              onClick={(e) => { e.stopPropagation(); closeTab(t.path); }}
            >
              <X size={13} />
            </span>
          </div>
        ))}
        <button className="icon-btn" title="Run file (F5)" onClick={runActive} style={{ marginLeft: 6 }}>
          <Play size={15} color="#3dd68c" />
        </button>
        <button className="icon-btn" title="Debug (Ctrl+F5)" onClick={debugActive}>
          <Bug size={15} color="#ff6369" />
        </button>
      </div>
      <div className="crumbs">
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
          {active.path.split("/").filter(Boolean).join(" › ")}
        </span>
        {symbols.length > 0 && (
          <select
            title="Jump to symbol"
            onChange={(e) => {
              const target = e.target.value;
              e.target.value = "";
              if (!target) return;
              const ln = Number(target.split(":")[0]);
              if (ln > 0) revealLine(ln);
            }}
            defaultValue=""
          >
            <option value="" disabled>◇ {symbols.length} symbols</option>
            {symbols.map((s) => (
              <option key={s} value={s.split(":")[0]}>{s}</option>
            ))}
          </select>
        )}
        <LanguageIcon lang={active.language} size={18} />
        <select
          title="Language mode"
          value={active.language}
          onChange={(e) => setTabLanguage(active.path, e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <div className="monaco-host" style={{ position: "relative", flex: 1 }}>
        <Editor
          path={active.path}
          language={active.language}
          value={active.content}
          onChange={(v) => editActive(v ?? "")}
          onMount={handleMount}
          key="nova-editor"
          options={{
            automaticLayout: true,
            fontSize: settings.fontSize,
            fontLigatures: settings.fontLigatures,
            glyphMargin: true,
            lineNumbers: settings.lineNumbers,
            cursorStyle: settings.cursorStyle,
            renderWhitespace: settings.renderWhitespace,
            tabSize: settings.tabSize,
            insertSpaces: true,
            minimap: { enabled: settings.minimap && window.innerWidth > 900 },
            padding: { top: settings.paddingTop },
            smoothScrolling: isCoarse ? false : settings.smoothScrolling,
            mouseWheelZoom: settings.mouseWheelZoom,
            stickyScroll: { enabled: settings.stickyScroll },
            cursorSmoothCaretAnimation: settings.reduceMotion || isCoarse ? "off" : "on",
            cursorBlinking: isCoarse ? "solid" : "smooth",
            renderLineHighlight: "all",
            scrollBeyondLastLine: false,
            wordWrap: settings.wordWrap ? "on" : "off",
            bracketPairColorization: { enabled: settings.bracketColors },
            guides: { bracketPairs: settings.bracketColors },
            scrollbar: { verticalScrollbarSize: 9, horizontalScrollbarSize: 9 },
            quickSuggestions: true,
            contextmenu: true,
            suggestOnTriggerCharacters: true,
            tabCompletion: "on",
          }}
          theme={isLight ? "nova-light" : "nova-dark"}
          loading={
            booted ? null : (
              <div className="ph" style={{ height: "100%" }}>
                <div className="sk" style={{ height: 18, width: "42%", margin: "14px 14px 10px" }} />
                <div className="sk" style={{ height: 14, width: "88%", margin: "0 14px 8px" }} />
                <div className="sk" style={{ height: 14, width: "76%", margin: "0 14px 8px" }} />
                <div className="sk" style={{ height: 14, width: "82%", margin: "0 14px 8px" }} />
                <div className="sk" style={{ height: 14, width: "60%", margin: "0 14px 8px" }} />
              </div>
            )
          }
        />
      </div>
      {touchMenu && (
        <>
          <div
            style={{ position: "fixed", inset: 0, zIndex: 79 }}
            onTouchStart={() => setTouchMenu(null)}
            onMouseDown={() => setTouchMenu(null)}
          />
          <div
            className="touch-menu"
            style={{
              left: touchMenu.x,
              top: touchMenu.y < 130 ? touchMenu.y + 34 : touchMenu.y - 58,
            }}
            role="menu"
            aria-label="Text actions"
          >
            <button
              onClick={async () => {
                if (!(await copySelection())) notify("info", "Nothing selected.");
              }}
            >
              نسخ
            </button>
            <button
              onClick={async () => {
                if (!(await cutSelection())) notify("info", "Nothing selected.");
                else setTouchMenu(null);
              }}
            >
              قص
            </button>
            <button
              onClick={async () => {
                if (!(await pasteClipboard())) notify("error", "Paste failed — allow clipboard access.");
                setTouchMenu(null);
              }}
            >
              لصق
            </button>
            <button
              onClick={() => {
                selectAllText();
              }}
            >
              الكل
            </button>
          </div>
        </>
      )}
    </div>
  );
}
