import { ArrowDownToLine, ArrowUpFromLine, GitBranch, GitCommitHorizontal, History, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useIDE } from "../store/useIDE";

export default function GitPanel() {
  const {
    git, gitCommits, gitBranches, gitDiff, refreshGit, commitGit,
    loadDiff, rootPath, runTerminal, checkoutBranch,
  } = useIDE();
  const [msg, setMsg] = useState("");
  useEffect(() => {
    useIDE.getState().refreshGit();
    useIDE.getState().loadDiff();
  }, [rootPath]);

  if (!git || !git.is_repo) {
    return (
      <div className="ph">
        <h4>Not a git repository</h4>
        Open a folder with <code>.git</code> to enable source control.
        <br />
        <br />
        <code>cd {rootPath} && git init</code>
        <br />
        <br />
        <button className="btn" onClick={refreshGit}>
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const total = git.modified.length + git.untracked.length + git.staged.length;
  const canCommit = msg.trim().length > 0 && total > 0;
  const doCommit = () => {
    if (!canCommit) return;
    commitGit(msg.trim());
    setMsg("");
  };

  return (
    <div style={{ padding: "0 4px" }}>
      <div className="root-row">
        <GitBranch size={14} />
        <span style={{ flex: 1 }}>{git.branch}</span>
        <button
          className="icon-btn"
          title="Push to remote"
          onClick={() => runTerminal("git push")}
        >
          <ArrowUpFromLine size={14} />
        </button>
        <button
          className="icon-btn"
          title="Pull from remote"
          onClick={() => runTerminal("git pull")}
        >
          <ArrowDownToLine size={14} />
        </button>
        <button className="icon-btn" onClick={() => { refreshGit(); loadDiff(); }} title="Refresh">
          <RefreshCw size={14} />
        </button>
      </div>

      <div className="commit-box">
        <input
          placeholder="Commit message…"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") doCommit();
          }}
        />
        <button
          className="btn btn-primary"
          disabled={!canCommit}
          onClick={doCommit}
        >
          <GitCommitHorizontal size={14} /> Commit ({total})
        </button>
      </div>

      {["staged", "modified", "untracked"].map((k) => {
        const list = git[k as keyof typeof git] as string[];
        if (!Array.isArray(list) || list.length === 0) return null;
        return (
          <div key={k} style={{ marginTop: 10 }}>
            <div className="grp">{k} • {list.length}</div>
            {list.slice(0, 30).map((f) => (
              <button
                key={k + f}
                className="tree-row"
                title={k === "staged" ? "Show staged diff" : "Show diff"}
                onClick={() => loadDiff(f, k === "staged")}
              >
                <span className={`badge ${k}`} />
                <span className="fname">{f}</span>
              </button>
            ))}
          </div>
        );
      })}

      {gitDiff && (
        <div style={{ marginTop: 12 }}>
          <div className="grp">diff</div>
          <pre className="diff">{gitDiff.slice(0, 6000)}</pre>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="grp"><History size={12} /> history</div>
        {gitCommits.slice(0, 15).map((c) => (
          <div key={c.hash} className="hit">
            <div className="hp">{c.message}</div>
            <div className="hl">{c.hash} • {c.author} • {c.date}</div>
          </div>
        ))}
        {gitCommits.length === 0 && <div className="ph">No commits yet.</div>}
      </div>

      {gitBranches.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="grp">branches — click to switch</div>
          {gitBranches.map((b) => (
            <button
              key={b}
              className={`tree-row ${b === git.branch ? "active" : ""}`}
              onClick={() => {
                if (b !== git.branch) checkoutBranch(b);
              }}
              title={b === git.branch ? "Current branch" : `Switch to ${b}`}
            >
              <GitBranch size={13} /> <span className="fname">{b}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
