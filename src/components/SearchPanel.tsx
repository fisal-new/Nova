import { Search } from "lucide-react";
import { revealLine } from "../lib/editorRef";
import { useIDE } from "../store/useIDE";

export default function SearchPanel() {
  const { searchQuery, runSearch, searchResults, searching, openFile } = useIDE();
  // popping the keyboard on phones the moment search opens is hostile —
  // autofocus only where a physical keyboard exists
  const canAutofocus =
    typeof window !== "undefined" &&
    window.matchMedia?.("(pointer: fine)").matches;
  return (
    <div>
      <div className="search-box">
        <Search size={15} />
        <input
          placeholder="Search in files…"
          value={searchQuery}
          onChange={(e) => runSearch(e.target.value)}
          autoFocus={canAutofocus}
        />
      </div>
      <div style={{ padding: "0 4px" }}>
        {searching && <div className="ph">Searching…</div>}
        {!searching && searchQuery && searchResults.length === 0 && (
          <div className="ph">No results for “{searchQuery}”</div>
        )}
        {searchResults.map((h, i) => (
          <div
            key={i}
            className="hit"
            onClick={async () => {
              const name = h.path.split("/").pop() || h.path;
              await openFile(h.path, name);
              // let Monaco swap models, then jump to the matched line
              requestAnimationFrame(() => setTimeout(() => revealLine(h.line), 60));
            }}
          >
            <div className="hp">{h.path}</div>
            <div className="hl">line {h.line}</div>
            <pre>{h.preview}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}
