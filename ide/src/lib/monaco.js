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
      { token: "comment", foreground: "6b6b70", fontStyle: "italic" }, { token: "keyword", foreground: "c792ea" }, { token: "keyword.control", foreground: "c792ea" },
      { token: "string", foreground: "a3e6a3" }, { token: "number", foreground: "f0c674" }, { token: "type", foreground: "82aaff" }, { token: "type.identifier", foreground: "82aaff" },
      { token: "delimiter", foreground: "a0a0a6" }, { token: "operator", foreground: "a0a0a6" }, { token: "variable", foreground: "ededed" }, { token: "variable.predefined", foreground: "82aaff" },
      { token: "identifier", foreground: "ededed" }, { token: "annotation", foreground: "f0c674" }, { token: "builtin", foreground: "82aaff" }, { token: "label", foreground: "f0c674" },
    ],
    colors: {
      "editor.background": "#0a0a0a", "editor.foreground": "#ededed", "editorLineNumber.foreground": "#6b6b70", "editorLineNumber.activeForeground": "#a0a0a6",
      "editor.lineHighlightBackground": "#111113", "editor.lineHighlightBorder": "#111113", "editor.selectionBackground": "#3291ff1f", "editor.inactiveSelectionBackground": "#3291ff14",
      "editorCursor.foreground": "#ededed", "editorIndentGuide.background1": "#232326", "editorIndentGuide.activeBackground1": "#3f3f46",
      "editorWidget.background": "#18181b", "editorWidget.border": "#2e2e32", "editorSuggestWidget.background": "#18181b", "editorSuggestWidget.border": "#2e2e32", "editorSuggestWidget.selectedBackground": "#3291ff1f", "editorHoverWidget.background": "#18181b", "editorHoverWidget.border": "#2e2e32",
      "scrollbarSlider.background": "#ffffff14", "scrollbarSlider.hoverBackground": "#ffffff26", "scrollbarSlider.activeBackground": "#ffffff33", "editorError.foreground": "#f85149", "editorWarning.foreground": "#e3a008",
      "editorGutter.background": "#0a0a0a", "editorOverviewRuler.border": "#0a0a0a", "focusBorder": "#3291ff", "editorBracketMatch.background": "#3291ff1f", "editorBracketMatch.border": "#3291ff66",
      "editorBracketHighlight.foreground1": "#a0a0a6", "editorBracketHighlight.foreground2": "#82aaff", "editorBracketHighlight.foreground3": "#c792ea", "minimap.background": "#0a0a0a",
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
