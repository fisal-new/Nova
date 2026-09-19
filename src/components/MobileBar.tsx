import {
  Bug,
  CaseSensitive,
  ChevronUp,
  ClipboardPaste,
  Copy,
  ListOrdered,
  PanelBottom,
  Play,
  Save,
  Scissors,
  Search,
  TextSelect,
  WrapText,
} from "lucide-react";
import { useState } from "react";
import { copySelection, cutSelection, pasteClipboard, revealLine, selectAllText, triggerAction } from "../lib/editorRef";
import { useIDE } from "../store/useIDE";

/**
 * Bottom touch bar for phones — every IDE action without a keyboard.
 * Visible only on coarse pointers / narrow screens (see CSS).
 */
export default function MobileBar() {
  const {
    runActive, debugActive, saveActive, saveAll, setPalette, setPanel,
    panelOpen, updateSettings, settings, tabs, activePath, notify,
  } = useIDE();
  const [goOpen, setGoOpen] = useState(false);
  const [goVal, setGoVal] = useState("");
  const active = tabs.find((t) => t.path === activePath);

  const btn = "mbtn";

  return (
    <>
      {goOpen && (
        <div className="go-bg" onClick={() => setGoOpen(false)} aria-hidden="true" />
      )}
      {goOpen && (
        <div className="go-pop">
          <ListOrdered size={15} />
          <input
            autoFocus
            inputMode="numeric"
            placeholder="Line…"
            value={goVal}
            onChange={(e) => setGoVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                revealLine(Number(goVal));
                setGoOpen(false);
                setGoVal("");
              }
              if (e.key === "Escape") setGoOpen(false);
            }}
          />
          <button
            className="btn btn-primary"
            onClick={() => {
              revealLine(Number(goVal));
              setGoOpen(false);
              setGoVal("");
            }}
          >
            Go
          </button>
        </div>
      )}
      <nav className="mobilebar" aria-label="Quick actions">
        <button className={`${btn} primary`} onClick={runActive} title="Run file">
          <Play size={19} />
          <span>Run</span>
        </button>
        <button className={btn} onClick={debugActive} title="Debug">
          <Bug size={19} />
          <span>Debug</span>
        </button>
        <button
          className={btn}
          title="Save (long-press = save all)"
          onClick={saveActive}
          onContextMenu={(e) => {
            e.preventDefault();
            saveAll();
          }}
        >
          <Save size={19} />
          <span>Save</span>
        </button>
        <button className={btn} onClick={() => triggerAction("actions.find")} title="Find in file">
          <Search size={19} />
          <span>Find</span>
        </button>
        <button className={btn} onClick={async () => { if (!(await copySelection())) notify("info", "Open a file and select text first."); }} title="Copy selection">
          <Copy size={19} />
          <span>Copy</span>
        </button>
        <button className={btn} onClick={async () => { if (!(await pasteClipboard())) notify("error", "Paste failed — allow clipboard access or copy inside the editor first."); }} title="Paste">
          <ClipboardPaste size={19} />
          <span>Paste</span>
        </button>
        <button className={btn} onClick={async () => { if (!(await cutSelection())) notify("info", "Open a file and select text first."); }} title="Cut selection">
          <Scissors size={19} />
          <span>Cut</span>
        </button>
        <button className={btn} onClick={() => { if (!selectAllText()) notify("info", "Open a file first."); }} title="Select all">
          <TextSelect size={19} />
          <span>All</span>
        </button>
        <button className={btn} onClick={() => setGoOpen((v) => !v)} title="Go to line">
          <ListOrdered size={19} />
          <span>Line</span>
        </button>
        <button
          className={`${btn} ${settings.wordWrap ? "on" : ""}`}
          title="Word wrap"
          onClick={() => updateSettings({ wordWrap: !settings.wordWrap })}
        >
          <WrapText size={19} />
          <span>Wrap</span>
        </button>
        <button
          className={btn}
          title="Bigger font"
          onClick={() =>
            updateSettings({ fontSize: Math.min(24, +(settings.fontSize + 1).toFixed(1)) })
          }
        >
          <CaseSensitive size={19} />
          <span>A+</span>
        </button>
        <button
          className={btn}
          title="Smaller font"
          onClick={() =>
            updateSettings({ fontSize: Math.max(10, +(settings.fontSize - 1).toFixed(1)) })
          }
        >
          <CaseSensitive size={15} />
          <span>A-</span>
        </button>
        <button className={btn} onClick={() => setPalette(true)} title="Commands">
          <ChevronUp size={19} />
          <span>Cmd</span>
        </button>
        <button
          className={`${btn} ${panelOpen ? "on" : ""}`}
          onClick={() => setPanel(!panelOpen, "terminal")}
          title="Terminal"
        >
          <PanelBottom size={19} />
          <span>Term</span>
        </button>
      </nav>
      {active && active.content !== active.savedContent && <span className="mdirty">●</span>}
    </>
  );
}
