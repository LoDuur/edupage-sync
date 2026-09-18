// Single Monaco instance; one model per workspace file so undo history survives switching.
import { setupMonaco, monaco } from "./monaco.js";
import { LANGUAGES, loadDraft } from "./languages.js";
import { saveDraft, useStore } from "../store.js";

let editor = null, container = null;
const models = {}, extraModels = {};
const listeners = new Set();
export const onEditor = f => { listeners.add(f); if (editor) f(editor); return () => listeners.delete(f); };

export function mountEditor(el, opts) {
  setupMonaco();
  if (editor) { if (container !== el) { el.appendChild(container); editor.layout(); } return editor; }
  container = document.createElement("div"); container.style.cssText = "position:absolute;inset:0"; el.appendChild(container);
  editor = monaco.editor.create(container, {
    theme: "obsidian", fontFamily: '"JetBrains Mono","Fira Code",Menlo,monospace', fontSize: opts.fontSize, lineHeight: 22, fontLigatures: true, automaticLayout: true,
    minimap: { enabled: opts.minimap, renderCharacters: false }, scrollBeyondLastLine: false, renderLineHighlight: "line", cursorBlinking: "smooth", cursorSmoothCaretAnimation: "on", smoothScrolling: true,
    padding: { top: 14, bottom: 80 }, wordWrap: opts.wrap ? "on" : "off", bracketPairColorization: { enabled: true }, tabSize: 4, insertSpaces: true, guides: { indentation: true, bracketPairs: false },
    suggest: { showWords: true, preview: true }, quickSuggestions: { other: true, comments: false, strings: false }, roundedSelection: true, scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
    lineNumbersMinChars: 4, glyphMargin: false, folding: true, renderWhitespace: "none", overviewRulerBorder: false, hideCursorInOverviewRuler: true, stickyScroll: { enabled: false },
  });
  editor.onDidChangeModelContent(() => { const s = useStore.getState(); const t = s.tabs.find(x => x.id === s.activeTab); if (t && t.kind === "file") saveDraft(t.lang, editor.getValue()); });
  for (const f of listeners) f(editor);
  return editor;
}
export const getEditor = () => editor;
export function fileModel(lang) {
  if (!models[lang]) { const d = LANGUAGES[lang]; models[lang] = monaco.editor.createModel(loadDraft(lang), d.monaco, monaco.Uri.parse(`inmemory://28teh/${d.file}`)); models[lang].updateOptions({ tabSize: d.indent, insertSpaces: true }); }
  return models[lang];
}
export function extraModel(id, code, lang) { if (!extraModels[id]) extraModels[id] = monaco.editor.createModel(code, LANGUAGES[lang].monaco); return extraModels[id]; }
export function disposeExtra(id) { if (extraModels[id]) { extraModels[id].dispose(); delete extraModels[id]; } }
export function setMarkers(items) {
  const model = editor?.getModel(); if (!model) return;
  const Sv = monaco.MarkerSeverity;
  monaco.editor.setModelMarkers(model, "run", items.filter(i => i.line).map(i => { const ln = Math.min(i.line, model.getLineCount()); const text = model.getLineContent(ln); const sc = i.col || (text.match(/^\s*/)[0].length + 1); return { startLineNumber: ln, endLineNumber: ln, startColumn: sc, endColumn: Math.max(sc + 1, text.length + 1), message: i.msg + (i.hint ? "\n" + i.hint : ""), severity: i.kind === "warning" ? Sv.Warning : Sv.Error, source: i.kind === "runtime" ? "runtime" : "compiler" }; }));
}
export function revealLine(line, col) { if (!editor) return; editor.revealLineInCenter(line); editor.setPosition({ lineNumber: line, column: col || 1 }); editor.focus(); }
export { monaco };
