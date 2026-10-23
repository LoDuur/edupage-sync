import { settings, onSettings, resolvedTheme } from "./settings.js";
import { LANGUAGE_META, registerLanguages } from "./languages.js";

let monaco = null;

export function loadMonaco() {
  if (monaco) return Promise.resolve(monaco);
  return new Promise((resolve, reject) => {
    window.require.config({ paths: { vs: "/vendor/monaco" } });
    window.require(["vs/editor/editor.main"], () => { monaco = window.monaco; defineThemes(); registerLanguages(monaco); resolve(monaco); }, reject);
  });
}

function defineThemes() {
  const shared = [
    { token: "comment", fontStyle: "italic" },
  ];
  monaco.editor.defineTheme("28teh-dark", {
    base: "vs-dark", inherit: true,
    rules: [...shared,
      { token: "comment", foreground: "6b6d76" }, { token: "keyword", foreground: "c4a7f5" }, { token: "string", foreground: "9ccf9a" }, { token: "number", foreground: "e6b673" },
      { token: "type", foreground: "86b4f0" }, { token: "type.identifier", foreground: "86b4f0" }, { token: "delimiter", foreground: "8c8e97" }, { token: "operator", foreground: "a9abb3" },
      { token: "identifier", foreground: "e4e4e7" }, { token: "variable.predefined", foreground: "86b4f0" }, { token: "annotation", foreground: "e6b673" }, { token: "tag", foreground: "e6b673" }],
    colors: {
      "editor.background": "#121316", "editor.foreground": "#e4e4e7", "editorLineNumber.foreground": "#4a4c54", "editorLineNumber.activeForeground": "#a1a3ab",
      "editor.lineHighlightBackground": "#17181c", "editor.lineHighlightBorder": "#17181c", "editor.selectionBackground": "#3a4a6b80", "editor.inactiveSelectionBackground": "#3a4a6b40",
      "editorCursor.foreground": "#e4e4e7", "editorIndentGuide.background1": "#22232a", "editorIndentGuide.activeBackground1": "#3a3c45",
      "editorWidget.background": "#1a1b20", "editorWidget.border": "#2c2d34", "editorSuggestWidget.background": "#1a1b20", "editorSuggestWidget.border": "#2c2d34", "editorSuggestWidget.selectedBackground": "#2a2c35",
      "editorHoverWidget.background": "#1a1b20", "editorHoverWidget.border": "#2c2d34", "input.background": "#121316", "input.border": "#2c2d34", "focusBorder": "#6e8fd6",
      "scrollbarSlider.background": "#ffffff12", "scrollbarSlider.hoverBackground": "#ffffff22", "scrollbarSlider.activeBackground": "#ffffff2e",
      "editorGutter.background": "#121316", "editorOverviewRuler.border": "#121316", "minimap.background": "#121316",
      "editorBracketMatch.background": "#6e8fd626", "editorBracketMatch.border": "#6e8fd680", "editorError.foreground": "#ef6b67", "editorWarning.foreground": "#e8b24a",
    },
  });
  monaco.editor.defineTheme("28teh-light", {
    base: "vs", inherit: true,
    rules: [...shared,
      { token: "comment", foreground: "8b8d96" }, { token: "keyword", foreground: "7246c9" }, { token: "string", foreground: "2f7d3b" }, { token: "number", foreground: "a65e00" },
      { token: "type", foreground: "2659b8" }, { token: "type.identifier", foreground: "2659b8" }, { token: "delimiter", foreground: "6b6d76" }, { token: "identifier", foreground: "1c1d21" },
      { token: "variable.predefined", foreground: "2659b8" }, { token: "annotation", foreground: "a65e00" }, { token: "tag", foreground: "a65e00" }],
    colors: {
      "editor.background": "#ffffff", "editor.foreground": "#1c1d21", "editorLineNumber.foreground": "#b4b6bd", "editorLineNumber.activeForeground": "#55575e",
      "editor.lineHighlightBackground": "#f6f6f5", "editor.lineHighlightBorder": "#f6f6f5", "editor.selectionBackground": "#c9d7f5", "editorIndentGuide.background1": "#ececea",
      "editorWidget.background": "#ffffff", "editorWidget.border": "#e2e2df", "editorSuggestWidget.selectedBackground": "#eef1f8", "focusBorder": "#3d6fd6",
      "editorGutter.background": "#ffffff", "editorOverviewRuler.border": "#ffffff", "minimap.background": "#ffffff",
    },
  });
}

const tabSizeFor = language => settings.tabSize || LANGUAGE_META[language]?.tab || 4;

export function createEditor(element) {
  const editor = monaco.editor.create(element, {
    model: null, theme: `28teh-${resolvedTheme()}`, automaticLayout: true,
    fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: settings.fontSize, lineHeight: Math.round(settings.fontSize * 1.6),
    minimap: { enabled: settings.minimap }, wordWrap: settings.wordWrap ? "on" : "off",
    scrollBeyondLastLine: false, padding: { top: 12, bottom: 48 }, folding: true, showFoldingControls: "mouseover",
    matchBrackets: "always", autoIndent: "full", autoClosingBrackets: "languageDefined", formatOnPaste: false,
    bracketPairColorization: { enabled: true }, guides: { indentation: true, bracketPairs: "active" },
    renderLineHighlight: "line", cursorBlinking: "smooth", cursorSmoothCaretAnimation: "off", smoothScrolling: true,
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false }, overviewRulerBorder: false,
    lineNumbersMinChars: 3, stickyScroll: { enabled: false }, fixedOverflowWidgets: true, tabSize: 4, insertSpaces: true, detectIndentation: false,
  });
  const apply = () => {
    monaco.editor.setTheme(`28teh-${resolvedTheme()}`);
    editor.updateOptions({ fontSize: settings.fontSize, lineHeight: Math.round(settings.fontSize * 1.6), minimap: { enabled: settings.minimap }, wordWrap: settings.wordWrap ? "on" : "off" });
    const model = editor.getModel();
    if (model) model.updateOptions({ tabSize: tabSizeFor(languageIdOf(model)), insertSpaces: true });
  };
  onSettings(apply);
  matchMedia("(prefers-color-scheme: light)").addEventListener("change", () => settings.theme === "system" && apply());
  return editor;
}

const languageOfModel = new WeakMap();
const languageIdOf = model => languageOfModel.get(model) || "python";

export function createModel(code, language) {
  const model = monaco.editor.createModel(code, LANGUAGE_META[language]?.monaco || "plaintext");
  languageOfModel.set(model, language);
  model.updateOptions({ tabSize: tabSizeFor(language), insertSpaces: true });
  return model;
}

export function setModelLanguage(model, language) {
  languageOfModel.set(model, language);
  monaco.editor.setModelLanguage(model, LANGUAGE_META[language]?.monaco || "plaintext");
  model.updateOptions({ tabSize: tabSizeFor(language) });
}

export function setProblems(model, problems) {
  if (!model || model.isDisposed()) return;
  const severity = { error: monaco.MarkerSeverity.Error, runtime: monaco.MarkerSeverity.Error, warning: monaco.MarkerSeverity.Warning };
  monaco.editor.setModelMarkers(model, "run", problems.filter(p => p.line > 0 && p.line <= model.getLineCount()).map(p => ({
    severity: severity[p.kind] || monaco.MarkerSeverity.Error,
    message: p.hint ? `${p.message}\n${p.hint}` : p.message,
    startLineNumber: p.line, endLineNumber: p.line,
    startColumn: p.column || model.getLineFirstNonWhitespaceColumn(p.line) || 1, endColumn: model.getLineMaxColumn(p.line),
  })));
}

export function revealLine(editor, line, column = 1) {
  if (!line) return;
  editor.revealLineInCenter(line);
  editor.setPosition({ lineNumber: line, column: column || 1 });
  editor.focus();
}

export const getMonaco = () => monaco;
