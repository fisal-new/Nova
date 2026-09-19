import {
  ChevronDown,
  ChevronRight,
  FilePlus2,
  FolderPlus,
  Folder,
  FolderOpen,
  RefreshCw,
  FileText,
  FileCode2,
  FileJson,
  Image as ImageIcon,
  MoreHorizontal,
  Trash2,
  Pencil,
} from "lucide-react";
import { useState } from "react";
import { apiListDir, friendlyErr, languageForPath } from "../lib/tauri";
import { checkStorage, storageReady } from "../lib/permissions";
import { useIDE } from "../store/useIDE";
import type { FileEntry } from "../lib/tauri";
import LanguageIcon from "./LanguageIcon";
import StorageBanner from "./StorageBanner";

function iconFor(name: string, isDir: boolean, open: boolean) {
  if (isDir) return open ? <FolderOpen size={15} color="#a8adbd" /> : <Folder size={15} color="#a8adbd" />;
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "json" || ext === "toml") return <FileJson size={15} color="#9aa0b4" />;
  if (["png", "jpg", "svg", "ico"].includes(ext ?? "")) return <ImageIcon size={15} color="#9aa0b4" />;
  if (["rs", "ts", "tsx", "js", "py"].includes(ext ?? "")) return <FileCode2 size={15} color="#b9bdc9" />;
  return <FileText size={15} color="#8b93a9" />;
}

function Node({ entry, depth }: { entry: FileEntry; depth: number }) {
  const { openFile, activePath, rootPath, newFile, newFolder, deleteEntry, renameEntry } = useIDE();
  const [open, setOpen] = useState(depth < 1);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const isActive = activePath === entry.path;
  const dirOf = entry.is_dir ? entry.path : entry.path.split("/").slice(0, -1).join("/") || rootPath;

  const ctx = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div className="tree-node">
      <button
        className={`tree-row ${isActive ? "active" : ""}`}
        style={{ paddingLeft: 8 + depth * 12 + (entry.is_dir ? 0 : 13) }}
        onClick={() => (entry.is_dir ? setOpen(!open) : openFile(entry.path, entry.name))}
        onContextMenu={ctx}
      >
        {entry.is_dir && (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />)}
        {!entry.is_dir && <LanguageIcon path={entry.name} size={19} />}
        {entry.is_dir && (
          <span className="file-icon">{iconFor(entry.name, true, open)}</span>
        )}
        <span className="fname">{entry.name}</span>
        {/* touch affordance: long-press/contextmenu doesn't exist on phones */}
        <span
          className="row-more"
          role="button"
          tabIndex={0}
          aria-label={`Actions for ${entry.name}`}
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: Math.max(8, window.innerWidth - 208), y: r.bottom + 4 });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.currentTarget as HTMLElement).click();
          }}
        >
          <MoreHorizontal size={15} />
        </span>
      </button>
      {menu && (
        <>
          <div className="ctx-bg" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null); }} />
          <div className="ctx" style={{ left: Math.min(menu.x, window.innerWidth - 200), top: Math.min(menu.y, window.innerHeight - 220) }}>
            <button onClick={() => { setMenu(null); newFile(dirOf); }}>
              <FilePlus2 size={13} /> New file here
            </button>
            <button onClick={() => { setMenu(null); newFolder(dirOf); }}>
              <FolderPlus size={13} /> New folder here
            </button>
            <button onClick={() => { setMenu(null); renameEntry(entry.path); }}>
              <Pencil size={13} /> Rename
            </button>
            <button className="danger" onClick={() => { setMenu(null); deleteEntry(entry.path); }}>
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </>
      )}
      {open &&
        entry.is_dir &&
        entry.children?.map((c) => <Node key={c.path} entry={c} depth={depth + 1} />)}
    </div>
  );
}

export default function Explorer() {
  const { tree, rootPath, setRoot, refreshTree, loading, newFile, newFolder } = useIDE();

  const pickFolder = async () => {
    // Same gate as the "Shared storage" button: never open the picker when
    // we know the OS will refuse the result with a raw os error 13.
    // (Desktop/web report sdk 0 = no runtime gate, so this is a no-op there.)
    try {
      const st = await checkStorage();
      if (st.sdk > 0 && !storageReady(st)) {
        useIDE.getState().notify(
          "error",
          "امنح صلاحية الملفات أولاً من الشريط الجانبي (Shared storage ← Grant) قبل اختيار مجلد.",
        );
        return;
      }
    } catch { /* check unavailable — proceed, backend errors stay friendly */ }
    try {
      const mod = await import("@tauri-apps/plugin-dialog").catch(() => null as unknown as { open: (o: unknown) => Promise<string | null> });
      const dlg = mod as unknown as { open?: (o: unknown) => Promise<string | null> };
      if (dlg?.open) {
        const sel = await dlg.open({ directory: true });
        if (typeof sel === "string") {
          // Android SAF returns content:// URIs, not real paths — std::fs
          // can't touch those, so refuse loudly instead of failing later
          // with a cryptic error deep in the terminal.
          if (sel.startsWith("content://")) {
            useIDE.getState().notify(
              "error",
              "That folder type isn't supported on Android (system picker). Use the in-app workspace instead.",
            );
            return;
          }
          // Android/data + Android/obb are blocked by Google even WITH
          // all-files access — say so now, not after a raw os error 13.
          if (/\/Android\/(data|obb)(\/|$)/.test(sel)) {
            useIDE.getState().notify(
              "error",
              "Android blocks this folder for ALL apps (even with full access). Pick another folder.",
            );
            return;
          }
          // Verify the folder is actually listable BEFORE switching the
          // whole UI to it — a dead root is worse than no switch at all.
          try {
            await apiListDir(sel);
          } catch (e) {
            useIDE.getState().notify("error", `Can't open this folder: ${friendlyErr(e)}`);
            return;
          }
          await setRoot(sel);
          return;
        }
      }
    } catch (e) {
      useIDE.getState().notify("error", `Folder picker failed: ${friendlyErr(e)}`);
    }
    const v = await useIDE.getState().askPrompt("Folder path (e.g. /demo):", rootPath);
    if (!v) return;
    if (/\/Android\/(data|obb)(\/|$)/.test(v)) {
      useIDE.getState().notify(
        "error",
        "Android blocks this folder for ALL apps (even with full access). Pick another folder.",
      );
      return;
    }
    try {
      await apiListDir(v);
    } catch (e) {
      useIDE.getState().notify("error", `Can't open this folder: ${friendlyErr(e)}`);
      return;
    }
    await setRoot(v);
  };

  return (
    <div>
      <StorageBanner />
      <div className="root-row">
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }} title={rootPath}>
          {rootPath.split("/").pop() || rootPath}
        </span>
        <button className="icon-btn" title="New file in root" onClick={() => newFile(rootPath)}>
          <FilePlus2 size={15} />
        </button>
        <button className="icon-btn" title="Open folder" onClick={pickFolder}>
          <FolderPlus size={15} />
        </button>
        <button className="icon-btn" title="New folder in root" onClick={() => newFolder(rootPath)}>
          <Folder size={15} />
        </button>
        <button className="icon-btn" title="Refresh" onClick={refreshTree}>
          <RefreshCw size={14} />
        </button>
      </div>
      <div style={{ padding: "0 4px" }}>
        {loading && <div className="ph">Loading…</div>}
        {!loading && tree.length === 0 && (
          <div className="ph">Empty folder.<br />Right-click anywhere for actions.</div>
        )}
        {tree.map((n) => (
          <Node key={n.path} entry={n} depth={0} />
        ))}
      </div>
      <div className="ph">Right-click any file for rename / delete.</div>
    </div>
  );
}
