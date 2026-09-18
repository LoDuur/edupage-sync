import "monaco-editor/esm/vs/editor/edcore.main.js";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution.js";
import "monaco-editor/esm/vs/basic-languages/java/java.contribution.js";
import "monaco-editor/esm/vs/basic-languages/cpp/cpp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/csharp/csharp.contribution.js";
import "monaco-editor/esm/vs/basic-languages/lua/lua.contribution.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api.js";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { LANGUAGES, ORDER, PIL } from "./languages.js";

self.MonacoEnvironment = { getWorker: () => new editorWorker() };
let ready = false;
export function setupMonaco() {
  if (ready) return monaco; ready = true;
  monaco.editor.defineTheme("obsidian", {
    base: "vs-dark", inherit: true,
    rules: [
      { token: "comment", foreground: "5c5f6a", fontStyle: "italic" }, { token: "keyword", foreground: "b4a0ff" }, { token: "keyword.control", foreground: "d0a8ff" },
      { token: "string", foreground: "a8c98a" }, { token: "number", foreground: "f2b28c" }, { token: "type", foreground: "7fd1c7" }, { token: "type.identifier", foreground: "7fd1c7" },
      { token: "delimiter", foreground: "9a9ca8" }, { token: "operator", foreground: "9a9ca8" }, { token: "variable", foreground: "e6e6e6" }, { token: "variable.predefined", foreground: "8fb6ff" },
      { token: "identifier", foreground: "e0e0e0" }, { token: "annotation", foreground: "e3b56f" }, { token: "builtin", foreground: "82aaff" }, { token: "label", foreground: "e3b56f" },
    ],
    colors: {
      "editor.background": "#121212", "editor.foreground": "#e0e0e0", "editorLineNumber.foreground": "#3f3f46", "editorLineNumber.activeForeground": "#a1a1aa",
      "editor.lineHighlightBackground": "#171717", "editor.lineHighlightBorder": "#171717", "editor.selectionBackground": "#2b3050", "editor.inactiveSelectionBackground": "#232536",
      "editorCursor.foreground": "#c7c9ff", "editorIndentGuide.background1": "#232323", "editorIndentGuide.activeBackground1": "#3a3a3a",
      "editorWidget.background": "#171717", "editorWidget.border": "#2a2a2a", "editorSuggestWidget.background": "#171717", "editorSuggestWidget.border": "#2a2a2a", "editorSuggestWidget.selectedBackground": "#2b3050", "editorHoverWidget.background": "#171717", "editorHoverWidget.border": "#2a2a2a",
      "scrollbarSlider.background": "#ffffff14", "scrollbarSlider.hoverBackground": "#ffffff26", "scrollbarSlider.activeBackground": "#ffffff33", "editorError.foreground": "#ff6b6b", "editorWarning.foreground": "#f5b74f",
      "editorGutter.background": "#121212", "editorOverviewRuler.border": "#121212", "focusBorder": "#6e7cff", "editorBracketMatch.background": "#2b305066", "editorBracketMatch.border": "#6e7cff88",
      "editorBracketHighlight.foreground1": "#c7c9ff", "editorBracketHighlight.foreground2": "#7fd1c7", "editorBracketHighlight.foreground3": "#f2b28c", "minimap.background": "#121212",
    },
  });
  monaco.languages.register({ id: "pil" });
  monaco.languages.setLanguageConfiguration("pil", { comments: { lineComment: ";" }, brackets: [["(", ")"], ["[", "]"]], autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: '"', close: '"' }, { open: "'", close: "'" }] });
  monaco.languages.setMonarchTokensProvider("pil", { builtins: [...PIL.BUILTIN_SET], tokenizer: { root: [
    [/;.*$/, "comment"], [/"(?:[^"\\]|\\.)*"/, "string"], [/'(?:[^'\\]|\\.)*'/, "string"], [/R?\$\d+/, "variable.predefined"], [/@[\w-]+/, "annotation"], [/\.\.\./, "keyword"],
    [/^\s*[A-Za-z_][\w-]*(?=\s*\()/, "type.identifier"], [/^\s*[A-Za-z_][\w-]*(?=\s*:)/, "label"], [/\b(let|const)\b/, "keyword"], [/-?\d+(\.\d+)?([eE][-+]?\d+)?/, "number"],
    [/^\s*[A-Za-z_][\w-]*/, { cases: { "@builtins": "builtin", "@default": "type.identifier" } }], [/[A-Za-z_][\w-]*/, "identifier"], [/[()\[\],:]/, "delimiter"],
  ] } });
  const snippetText = s => { if (typeof s.cur === "number") { const i = s.text.length + s.cur; return s.text.slice(0, i) + "$0" + s.text.slice(i); } const lines = s.text.split("\n"); if (s.cur && typeof s.cur.line === "number") lines[s.cur.line] += "$0"; return lines.join("\n"); };
  for (const id of ORDER) {
    const d = LANGUAGES[id];
    monaco.languages.registerCompletionItemProvider(d.monaco, { provideCompletionItems(model, position) {
      const w = model.getWordUntilPosition(position), range = { startLineNumber: position.lineNumber, endLineNumber: position.lineNumber, startColumn: w.startColumn, endColumn: w.endColumn }, K = monaco.languages.CompletionItemKind, out = [];
      for (const [name, s] of Object.entries(d.snippets || {})) out.push({ label: name, kind: K.Snippet, detail: s.k, insertText: snippetText(s), insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, range, sortText: "0" + name });
      if (id === "pil") { for (const b of PIL.BUILTINS) out.push({ label: b.n, kind: K.Function, detail: b.sig, insertText: b.n + " ", range }); for (const dd of PIL.DIRECTIVES) out.push({ label: dd, kind: K.Keyword, insertText: dd + " ", range }); }
      else for (const kw of d.keywords || []) out.push({ label: kw, kind: kw.includes(".") ? K.Method : K.Keyword, insertText: kw, range });
      return { suggestions: out };
    } });
  }
  return monaco;
}
export { monaco };
