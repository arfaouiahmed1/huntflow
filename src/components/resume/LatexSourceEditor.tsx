"use client";

/**
 * Overleaf-style LaTeX source editor (Monaco).
 *
 * Genuine editor, not a mock: line numbers, built-in find (Ctrl+F),
 * bracket matching, word wrap, LaTeX Monarch highlighting, command
 * completions, error markers from real compiler logs, Ctrl+S save,
 * cursor/selection reporting for SyncTeX + Copilot wiring.
 *
 * Loaded with `ssr: false` via next/dynamic by the parent — Monaco needs
 * `window`/`document` and the default loader fetches its worker bundle
 * from a CDN at runtime (offline shows an honest loading failure, never
 * a fake editor).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import type { BeforeMount, OnMount } from "@monaco-editor/react";
import type { editor, Position } from "monaco-editor";
import type { LatexError } from "@/lib/latexErrors";

const LATEX_SNIPPETS: { label: string; insert: string; detail: string }[] = [
  { label: "begin", insert: "\\begin{$1}\n\t$0\n\\end{$1}", detail: "environment" },
  { label: "section", insert: "\\section{$1}$0", detail: "section" },
  { label: "subsection", insert: "\\subsection{$1}$0", detail: "subsection" },
  { label: "item", insert: "\\item $0", detail: "list item" },
  { label: "textbf", insert: "\\textbf{$1}$0", detail: "bold" },
  { label: "textit", insert: "\\textit{$1}$0", detail: "italic" },
  { label: "emph", insert: "\\emph{$1}$0", detail: "emphasis" },
  { label: "usepackage", insert: "\\usepackage{$1}$0", detail: "package" },
  { label: "documentclass", insert: "\\documentclass[$1]{$2}$0", detail: "class" },
  { label: "hfill", insert: "\\hfill ", detail: "spacing" },
  { label: "vspace", insert: "\\vspace{$1}$0", detail: "spacing" },
  { label: "href", insert: "\\href{$1}{$2}$0", detail: "link" },
  { label: "label", insert: "\\label{$1}$0", detail: "cross-ref" },
  { label: "ref", insert: "\\ref{$1}$0", detail: "cross-ref" },
  { label: "includegraphics", insert: "\\includegraphics[$1]{$2}$0", detail: "graphics" },
];

const setupLatex: BeforeMount = (monaco) => {
  monaco.languages.register({ id: "huntflow-latex" });
  monaco.languages.setMonarchTokensProvider("huntflow-latex", {
    tokenizer: {
      root: [
        [/%.*$/, "comment"],
        [/\\[a-zA-Z@]+/, "keyword"],
        [/\\[^a-zA-Z\s]/, "keyword"],
        [/\$[^$]*\$/, "string"],
        [/[{}]/, "delimiter.bracket"],
        [/[[\]]/, "delimiter.square"],
        [/\b\d+(\.\d+)?(pt|em|in|cm|mm|ex)?\b/, "number"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("huntflow-latex", {
    comments: { lineComment: "%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$", notIn: ["string"] },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
    ],
  });
  monaco.languages.registerCompletionItemProvider("huntflow-latex", {
    provideCompletionItems: (model: editor.ITextModel, position: Position) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      return {
        suggestions: LATEX_SNIPPETS.map((s) => ({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.insert,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: s.detail,
          range,
        })),
      };
    },
  });
  monaco.editor.defineTheme("huntflow-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6b7280", fontStyle: "italic" },
      { token: "keyword", foreground: "b9ed57", fontStyle: "bold" },
      { token: "string", foreground: "7dd3fc" },
      { token: "number", foreground: "fbbf24" },
      { token: "delimiter.bracket", foreground: "e7e5e4" },
    ],
    colors: {
      "editor.background": "#0b0e0b",
      "editor.lineHighlightBackground": "#b9ed5712",
      "editorLineNumber.foreground": "#525252",
      "editorLineNumber.activeForeground": "#b9ed57",
      "editorCursor.foreground": "#b9ed57",
      "editor.selectionBackground": "#b9ed5733",
      "editorWidget.background": "#131711",
      "editorWidget.border": "#2a3325",
    },
  });
};

interface LatexSourceEditorProps {
  value: string;
  onChange: (next: string) => void;
  errors: LatexError[];
  onCursorChange?: (line: number, column: number) => void;
  onSelectionText?: (text: string) => void;
  onSaveRequest?: () => void;
  /** Reveal a source line (SyncTeX reverse / log-click). Bump nonce to re-trigger. */
  revealLine?: { line: number; nonce: number } | null;
}

const LOAD_TIMEOUT_MS = 25_000;

export default function LatexSourceEditor({
  value,
  onChange,
  errors,
  onCursorChange,
  onSelectionText,
  onSaveRequest,
  revealLine,
}: LatexSourceEditorProps) {
  const [loadFailed, setLoadFailed] = useState(false);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const monacoRef = useRef<Parameters<OnMount>[1] | null>(null);
  const saveRef = useRef(onSaveRequest);
  const selectionRef = useRef(onSelectionText);
  const cursorRef = useRef(onCursorChange);
  useEffect(() => {
    saveRef.current = onSaveRequest;
    selectionRef.current = onSelectionText;
    cursorRef.current = onCursorChange;
  });
  useEffect(() => {
    const t = setTimeout(() => {
      if (!editorRef.current) setLoadFailed(true);
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current?.();
    });
    editor.onDidChangeCursorPosition((e) => {
      cursorRef.current?.(e.position.lineNumber, e.position.column);
    });
    editor.onDidChangeCursorSelection((e) => {
      const text = editor.getModel()?.getValueInRange(e.selection) ?? "";
      if (text.trim().length >= 3) selectionRef.current?.(text);
    });
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      "latex-compile",
      errors.map((e) => ({
        severity: monaco.MarkerSeverity.Error,
        message: e.message,
        startLineNumber: e.line,
        startColumn: e.column,
        endLineNumber: e.line,
        endColumn: e.column + 1,
      }))
    );
  }, [errors]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !revealLine) return;
    editor.revealLineInCenter(revealLine.line);
    editor.setPosition({ lineNumber: revealLine.line, column: 1 });
    editor.focus();
  }, [revealLine]);

  if (loadFailed) {
    return (
      <div
        data-testid="editor-load-failed"
        className="grid h-full min-h-[240px] place-items-center rounded-xl border border-amber-300/30 bg-amber-400/10 p-6 text-center"
      >
        <p className="max-w-sm text-xs leading-relaxed text-amber-200">
          <strong>Source editor unavailable offline.</strong> The editor runtime loads from a CDN on first use —
          check your connection and reload. Your last compiled PDF (if any) stays visible.
        </p>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      language="huntflow-latex"
      theme="huntflow-dark"
      value={value}
      onChange={(v) => onChange(v ?? "")}
      beforeMount={setupLatex}
      onMount={handleMount}
      loading={
        <div data-testid="editor-loading" className="grid h-full min-h-[240px] place-items-center text-xs text-dim">
          Loading LaTeX editor…
        </div>
      }
      options={{
        minimap: { enabled: false },
        lineNumbers: "on",
        folding: true,
        wordWrap: "on",
        bracketPairColorization: { enabled: true },
        autoClosingBrackets: "always",
        tabSize: 2,
        fontSize: 13,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        scrollBeyondLastLine: false,
        padding: { top: 8 },
        automaticLayout: true,
        find: { addExtraSpaceOnTop: false },
        renderLineHighlight: "line",
        scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      }}
    />
  );
}
