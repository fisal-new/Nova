import type { Monaco } from "@monaco-editor/react";
import { LANGUAGES } from "./tauri";

// Keyword / snippet packs per language family — lightweight built-in LSP.
const PACKS: Record<string, { kw: string[]; snip: { label: string; body: string; doc: string }[] }> = {
  python: {
    kw: ["def", "class", "return", "import", "from", "as", "if", "elif", "else", "for", "while", "try", "except", "finally", "with", "lambda", "yield", "raise", "assert", "pass", "None", "True", "False", "self", "async", "await", "print", "len", "range", "str", "int", "list", "dict", "set"],
    snip: [
      { label: "def", body: "def ${1:name}(${2:args}):\n\t${0:pass}", doc: "Function definition" },
      { label: "class", body: "class ${1:Name}:\n\tdef __init__(self${2:, args}):\n\t\t${0:pass}", doc: "Class definition" },
      { label: "for", body: "for ${1:i} in ${2:range(10)}:\n\t${0:pass}", doc: "For loop" },
      { label: "try", body: "try:\n\t${1:pass}\nexcept ${2:Exception} as e:\n\t${0:pass}", doc: "Try/except" },
    ],
  },
  typescript: {
    kw: ["const", "let", "var", "function", "return", "import", "from", "export", "default", "class", "extends", "interface", "type", "enum", "if", "else", "for", "while", "try", "catch", "finally", "throw", "new", "typeof", "instanceof", "async", "await", "console", "string", "number", "boolean", "null", "undefined"],
    snip: [
      { label: "fn", body: "function ${1:name}(${2:args}) {\n\t${0}\n}", doc: "Function" },
      { label: "arrow", body: "const ${1:name} = (${2:args}) => {\n\t${0}\n}", doc: "Arrow function" },
      { label: "for", body: "for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}", doc: "For loop" },
    ],
  },
  rust: {
    kw: ["fn", "let", "mut", "const", "struct", "enum", "impl", "trait", "pub", "use", "mod", "return", "if", "else", "for", "while", "loop", "match", "in", "where", "Self", "self", "Some", "None", "Ok", "Err", "Result", "Option", "String", "Vec", "println", "vec"],
    snip: [
      { label: "fn", body: "fn ${1:name}(${2:args}) -> ${3:()} {\n\t${0}\n}", doc: "Function" },
      { label: "struct", body: "struct ${1:Name} {\n\t${0}\n}", doc: "Struct" },
      { label: "match", body: "match ${1:x} {\n\t${2:_} => ${0}\n}", doc: "Match" },
    ],
  },
  go: {
    kw: ["func", "package", "import", "return", "if", "else", "for", "range", "switch", "case", "default", "struct", "interface", "type", "var", "const", "go", "chan", "map", "nil", "true", "false", "fmt", "Println"],
    snip: [{ label: "func", body: "func ${1:name}(${2:args}) {\n\t${0}\n}", doc: "Function" }],
  },
  javascript: {
    kw: ["const", "let", "var", "function", "return", "import", "from", "export", "default", "class", "extends", "if", "else", "for", "while", "try", "catch", "finally", "throw", "new", "typeof", "instanceof", "async", "await", "console", "log", "null", "undefined", "true", "false", "this"],
    snip: [
      { label: "fn", body: "function ${1:name}(${2:args}) {\n\t${0}\n}", doc: "Function" },
      { label: "log", body: "console.log(${1:x});", doc: "Log to console" },
      { label: "for", body: "for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${0}\n}", doc: "For loop" },
    ],
  },
  java: {
    kw: ["public", "private", "protected", "static", "void", "class", "interface", "extends", "implements", "new", "return", "if", "else", "for", "while", "try", "catch", "finally", "throw", "throws", "import", "package", "this", "super", "int", "long", "double", "boolean", "String", "null", "true", "false"],
    snip: [{ label: "sout", body: "System.out.println(${1:x});", doc: "Print line" }],
  },
  html: {
    kw: ["div", "span", "p", "a", "img", "ul", "li", "table", "form", "input", "button", "head", "body", "html", "script", "style", "link", "meta", "title", "h1", "h2", "h3", "section", "article", "header", "footer", "nav", "main"],
    snip: [{ label: "html5", body: "<!DOCTYPE html>\n<html>\n<head>\n\t<meta charset=\"UTF-8\">\n\t<title>${1:title}</title>\n</head>\n<body>\n\t${0}\n</body>\n</html>", doc: "HTML5 boilerplate" }],
  },
  css: {
    kw: ["color", "background", "margin", "padding", "display", "flex", "grid", "position", "width", "height", "font-size", "border", "border-radius", "box-shadow", "transition", "animation", "absolute", "relative", "center", "none", "block", "inline", "column", "row", "gap"],
    snip: [],
  },
  json: {
    kw: ["true", "false", "null"],
    snip: [],
  },
  sql: {
    kw: ["SELECT", "FROM", "WHERE", "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "CREATE", "TABLE", "JOIN", "LEFT", "RIGHT", "INNER", "ON", "GROUP", "BY", "ORDER", "LIMIT", "AND", "OR", "NOT", "NULL", "PRIMARY", "KEY"],
    snip: [{ label: "select", body: "SELECT ${1:*} FROM ${2:table} WHERE ${3:cond};", doc: "Select query" }],
  },
  shell: {
    kw: ["echo", "cd", "ls", "if", "then", "else", "fi", "for", "in", "do", "done", "while", "function", "return", "export", "local", "exit", "cat", "grep", "awk", "sed", "mkdir", "rm", "cp", "mv"],
    snip: [{ label: "if", body: "if [ ${1:cond} ]; then\n\t${0}\nfi", doc: "If block" }],
  },
};

const GENERIC_KW = ["if", "else", "for", "while", "return", "function", "class", "import", "true", "false", "null"];

let registered = false;

// Cache of buffer words per model: rebuilt at most once per second per file,
// so completion doesn't re-scan the whole document on every keystroke.
const wordCache = new Map<string, { version: number; at: number; words: string[] }>();

function bufferWords(model: import("monaco-editor").editor.ITextModel): string[] {
  const key = model.uri.toString();
  const now = Date.now();
  const hit = wordCache.get(key);
  if (hit && hit.version === model.getVersionId() && now - hit.at < 1000) {
    return hit.words;
  }
  const words: string[] = [];
  const seen = new Set<string>();
  const text = model.getValue();
  if (text.length > 300_000) {
    wordCache.set(key, { version: model.getVersionId(), at: now, words });
    return words; // too big — skip buffer words entirely
  }
  for (const m of text.matchAll(/\b[A-Za-z_]\w{3,}\b/g)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      words.push(m[0]);
      if (words.length >= 200) break;
    }
  }
  wordCache.set(key, { version: model.getVersionId(), at: now, words });
  if (wordCache.size > 20) {
    const first = wordCache.keys().next().value;
    if (first) wordCache.delete(first);
  }
  return words;
}

/** Register once: completion + hover + go-to-definition for every language. */
export function registerIntellisense(monaco: Monaco) {
  if (registered) return;
  registered = true;

  const ids = new Set(LANGUAGES.map((l) => l.id));

  for (const id of ids) {
    const pack = PACKS[id] ?? null;
    const kws = pack?.kw ?? GENERIC_KW;
    const snips = pack?.snip ?? [];

    monaco.languages.registerCompletionItemProvider(id, {
      triggerCharacters: [".", ":"],
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const suggestions: import("monaco-editor").languages.CompletionItem[] = [
          ...kws.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: k,
            range,
          })),
          ...snips.map((s) => ({
            label: { label: s.label, description: "snippet" },
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            insertText: s.body,
            documentation: s.doc,
            range,
          })),
        ];
        // word-based suggestions from the open file (cached, not re-scanned per keystroke)
        const seen = new Set([...kws, ...snips.map((s) => s.label)]);
        for (const w of bufferWords(model)) {
          if (!seen.has(w) && suggestions.length < 120) {
            seen.add(w);
            suggestions.push({
              label: w,
              kind: monaco.languages.CompletionItemKind.Text,
              insertText: w,
              range,
            });
          }
        }
        return { suggestions };
      },
    });

    monaco.languages.registerHoverProvider(id, {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const re = new RegExp(`^\\s*(?:export\\s+)?(?:async\\s+)?(?:function\\s+${word.word}|(?:const|let|var)\\s+${word.word}|(?:def|class|fn|func)\\s+${word.word})`, "m");
        const found = model.findMatches(re.source, false, true, false, null, false);
        if (found.length > 0) {
          return {
            contents: [{ value: `**${word.word}** — defined at line ${found[0].range.startLineNumber}` }],
          };
        }
        return null;
      },
    });

    monaco.languages.registerDefinitionProvider(id, {
      provideDefinition: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;
        const patterns = [
          `(?:function|def|fn|func|class)\\s+${word.word}\\b`,
          `(?:const|let|var)\\s+${word.word}\\s*=`,
        ];
        for (const p of patterns) {
          const found = model.findMatches(p, false, true, false, null, false);
          if (found.length > 0) {
            return {
              uri: model.uri,
              range: found[0].range,
            };
          }
        }
        return null;
      },
    });
  }
}
