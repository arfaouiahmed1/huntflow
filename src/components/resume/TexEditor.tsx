"use client";

import { useEffect, useMemo, useRef } from "react";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { stex } from "@codemirror/legacy-modes/mode/stex";
import { tags } from "@lezer/highlight";
import { EditorView, Decoration, type DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateField, type Extension } from "@codemirror/state";
import { GutterMarker, gutter } from "@codemirror/view";
import { useAppearance } from "@/context/AppearanceContext";
import { cn } from "@/lib/utils";

export type TexEditorProps = {
  value: string;
  onChange: (v: string) => void;
  errorLines?: number[];
  revealLine?: number | null;
  className?: string;
};

function latexExtension(): Extension {
  try {
    if (stex) return StreamLanguage.define(stex);
    return [];
  } catch {
    return [];
  }
}

const errorLineDeco = Decoration.line({
  attributes: { class: "cm-tex-error-line" },
});

class TexErrorDot extends GutterMarker {
  override toDOM() {
    const dot = document.createElement("div");
    dot.className = "cm-tex-error-dot";
    dot.title = "LaTeX error on this line";
    return dot;
  }
}

// High-contrast syntax styles for light mode (clean GitHub/Overleaf light palette)
const texLightHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#59636e", fontStyle: "italic" },
  { tag: tags.keyword, color: "#0550ae", fontWeight: "600" },
  { tag: tags.atom, color: "#0969da" },
  { tag: tags.number, color: "#953800" },
  { tag: tags.string, color: "#116329" },
  { tag: tags.variableName, color: "#1f2328" },
  { tag: tags.bracket, color: "#24292f" },
  { tag: tags.punctuation, color: "#57606a" },
  { tag: tags.definition(tags.variableName), color: "#8250df", fontWeight: "600" },
  { tag: tags.heading, color: "#0550ae", fontWeight: "bold" },
  { tag: tags.content, color: "#1f2328" },
]);

// High-contrast syntax styles for dark mode (vibrant Overleaf dark palette)
const texDarkHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#768390", fontStyle: "italic" },
  { tag: tags.keyword, color: "#79c0ff", fontWeight: "600" },
  { tag: tags.atom, color: "#a5d6ff" },
  { tag: tags.number, color: "#ffab70" },
  { tag: tags.string, color: "#7ee787" },
  { tag: tags.variableName, color: "#e6edf3" },
  { tag: tags.bracket, color: "#adbac7" },
  { tag: tags.punctuation, color: "#8b949e" },
  { tag: tags.definition(tags.variableName), color: "#d2a8ff", fontWeight: "600" },
  { tag: tags.heading, color: "#58a6ff", fontWeight: "bold" },
  { tag: tags.content, color: "#f0f6fc" },
]);

function buildThemeExtension(isDark: boolean): Extension {
  return EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--ink-card)",
        color: "var(--paper)",
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
        height: "100%",
      },
      ".cm-content": {
        caretColor: "var(--paper)",
        padding: "8px 0",
      },
      ".cm-cursor": {
        borderLeftColor: "var(--paper)",
        borderLeftWidth: "2px",
      },
      ".cm-activeLine": {
        backgroundColor: "color-mix(in srgb, var(--paper) 5%, transparent)",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "color-mix(in srgb, var(--paper) 4%, transparent)",
        color: "var(--paper)",
      },
      ".cm-gutters": {
        backgroundColor: "var(--ink-card)",
        color: "var(--paper-dim)",
        borderRight: "1px solid var(--line)",
      },
      ".cm-lineNumbers .cm-gutterElement": {
        padding: "0 8px 0 12px",
      },
      ".cm-tex-error-line": {
        backgroundColor: "color-mix(in srgb, var(--coral) 18%, transparent)",
      },
      ".cm-tex-error-dot": {
        width: "8px",
        height: "8px",
        borderRadius: "9999px",
        backgroundColor: "var(--coral)",
        margin: "4px auto 0",
      },
      ".cm-tex-error-gutter-col .cm-gutterElement": {
        padding: "0 6px 0 2px",
        minWidth: "14px",
      },
      "&.cm-focused": {
        outline: "none",
      },
    },
    { dark: isDark },
  );
}

export default function TexEditor({
  value,
  onChange,
  errorLines = [],
  revealLine = null,
  className,
}: TexEditorProps) {
  const ref = useRef<ReactCodeMirrorRef>(null);
  const { resolvedTheme } = useAppearance();
  const isDark = resolvedTheme === "dark";

  const errorSetKey = useMemo(() => [...new Set(errorLines)].sort((a, b) => a - b).join(","), [errorLines]);

  const errorExtensions = useMemo<Extension[]>(() => {
    const nums = errorSetKey.length === 0 ? [] : errorSetKey.split(",").map(Number);
    const errorSet = new Set(nums.filter((n) => Number.isInteger(n) && n >= 1));

    const buildDeco = (doc: { lines: number; line: (n: number) => { from: number } }) => {
      const builder = new RangeSetBuilder<Decoration>();
      for (const n of errorSet) {
        if (n > doc.lines) continue;
        const line = doc.line(n);
        builder.add(line.from, line.from, errorLineDeco);
      }
      return builder.finish();
    };

    const errorField = StateField.define<DecorationSet>({
      create(state) {
        return buildDeco(state.doc);
      },
      update(deco, tr) {
        if (tr.docChanged) return buildDeco(tr.state.doc);
        return deco.map(tr.changes);
      },
      provide: (f) => EditorView.decorations.from(f),
    });

    const errorGutter = gutter({
      class: "cm-tex-error-gutter-col",
      markers: (view) => {
        const builder = new RangeSetBuilder<GutterMarker>();
        for (const n of errorSet) {
          if (n > view.state.doc.lines) continue;
          const line = view.state.doc.line(n);
          builder.add(line.from, line.from, new TexErrorDot());
        }
        return builder.finish();
      },
    });

    return [errorField, errorGutter];
  }, [errorSetKey]);

  const extensions = useMemo<Extension[]>(
    () => [
      latexExtension(),
      EditorView.lineWrapping,
      buildThemeExtension(isDark),
      syntaxHighlighting(isDark ? texDarkHighlight : texLightHighlight),
      ...errorExtensions,
    ],
    [isDark, errorExtensions],
  );

  useEffect(() => {
    if (revealLine == null) return;
    const view = ref.current?.view;
    if (!view) return;
    if (!Number.isInteger(revealLine) || revealLine < 1) return;
    if (revealLine > view.state.doc.lines) return;
    const line = view.state.doc.line(revealLine);
    view.dispatch({
      effects: EditorView.scrollIntoView(line.from, { y: "center" }),
    });
  }, [revealLine, value]);

  return (
    <div className={cn("h-full w-full overflow-hidden bg-[var(--ink-card)] text-[var(--paper)]", className)}>
      <CodeMirror
        ref={ref}
        value={value}
        height="100%"
        theme={isDark ? "dark" : "light"}
        basicSetup={{ lineNumbers: true, foldGutter: false }}
        extensions={extensions}
        onChange={onChange}
        className={cn("h-full")}
      />
    </div>
  );
}
