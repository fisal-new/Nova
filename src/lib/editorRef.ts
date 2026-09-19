import type { Monaco } from "@monaco-editor/react";

type Ed = import("monaco-editor").editor.IStandaloneCodeEditor;

let editor: Ed | null = null;
let monaco: Monaco | null = null;

export function setEditorRef(e: Ed | null, m: Monaco | null) {
  editor = e;
  monaco = m;
}

/** Run any built-in Monaco action by id (find, go to line, fold…). Returns false if no editor. */
export function triggerAction(id: string): boolean {
  if (!editor) return false;
  const action = editor.getAction(id);
  if (!action) return false;
  action.run();
  return true;
}

export function revealLine(line: number, col = 1) {
  if (!editor || !monaco) return false;
  const count = editor.getModel()?.getLineCount() ?? 0;
  const ln = Math.max(1, Math.min(count, Math.floor(line) || 1));
  editor.revealLineInCenter(ln);
  editor.setPosition({ lineNumber: ln, column: Math.max(1, col) });
  editor.focus();
  return true;
}

export function currentEditor() {
  return editor;
}

/** Touch clipboard: Monaco's native menu/handles are unreliable in a
 *  mobile WebView, so the touch bar drives these actions explicitly. */
export async function copySelection(): Promise<boolean> {
  if (!editor) return false;
  editor.focus();
  const action = editor.getAction("editor.action.clipboardCopyAction");
  if (!action) return false;
  await action.run();
  return true;
}

export async function cutSelection(): Promise<boolean> {
  if (!editor) return false;
  editor.focus();
  const action = editor.getAction("editor.action.clipboardCutAction");
  if (!action) return false;
  await action.run();
  return true;
}

export async function pasteClipboard(): Promise<boolean> {
  if (!editor) return false;
  // system clipboard first (real cross-app paste), Monaco action as fallback
  try {
    const text = await navigator.clipboard?.readText();
    if (typeof text === "string" && text.length > 0) {
      const model = editor.getModel();
      if (!model) return false;
      const sel = editor.getSelection();
      editor.executeEdits("nova-paste", [
        { range: sel ?? model.getFullModelRange(), text, forceMoveMarkers: true },
      ]);
      editor.focus();
      return true;
    }
  } catch { /* permission denied → fallback below */ }
  const action = editor.getAction("editor.action.clipboardPasteAction");
  if (!action) return false;
  await action.run();
  return true;
}

export function selectAllText(): boolean {
  if (!editor) return false;
  editor.focus();
  return triggerAction("editor.action.selectAll");
}

/** Dispose the Monaco model for a closed path so long sessions don't leak.
 *  Exact URI match only — a suffix match could kill a sibling file's model. */
export function disposeModel(path: string) {
  if (!monaco) return;
  try {
    for (const m of monaco.editor.getModels()) {
      if (m.uri.path === path || m.uri.toString() === path) {
        m.dispose();
        break;
      }
    }
  } catch { /* never break tab-close on model cleanup */ }
}
