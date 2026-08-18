/**
 * Converts LLM-generated markdown/plain text into safe LaTeX.
 * Escapes special characters and maps markdown constructs to LaTeX commands
 * so any text (fallback or LLM output) compiles without errors.
 */

export function escapeLatex(text: string): string {
  return text
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/&/g, "\\&")
    .replace(/%/g, "\\%")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/_/g, "\\_")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Convert a single line: markdown inline syntax + emphasis → LaTeX. */
function inlineToLatex(line: string): string {
  let out = escapeLatex(line.trim());
  // **bold** (must survive the escape pass: * is not escaped, so pattern still matches)
  out = out.replace(/\*\*(.+?)\*\*/g, "\\textbf{$1}");
  // *italic*
  out = out.replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1\\textit{$2}");
  // `code`
  out = out.replace(/`([^`]+)`/g, "\\texttt{$1}");
  return out;
}

/**
 * Convert a markdown/plain block into a LaTeX body fragment using the given
 * block macro for paragraphs, `item` macro for list items (must already be
 * inside an itemize-like environment).
 */
export function mdToLatex(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push("\\end{itemize}");
      inList = false;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    // Headings
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      closeList();
      const level = Math.min(h[1].length, 3);
      const size = level === 1 ? "\\Large" : level === 2 ? "\\large" : "\\normalsize";
      out.push(`${size}\\textbf{${inlineToLatex(h[2])}}`);
      continue;
    }

    // Bullet list
    const bullet = line.match(/^\s*[-•*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        out.push("\\begin{itemize}");
        inList = true;
      }
      out.push(`  \\item ${inlineToLatex(bullet[1])}`);
      continue;
    }

    // Numbered list
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      if (!inList) {
        out.push("\\begin{enumerate}");
        inList = true;
      }
      out.push(`  \\item ${inlineToLatex(numbered[1])}`);
      continue;
    }

    // Horizontal rule
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      closeList();
      out.push("\\noindent\\rule{\\textwidth}{0.4pt}");
      continue;
    }

    // Plain paragraph
    closeList();
    out.push(inlineToLatex(line) + "\\par");
  }

  closeList();
  return out.join("\n");
}

/** Render contact info as a compact centered line, skipping empty fields. */
export function contactLine(fields: (string | undefined | null)[]): string {
  const parts = fields.filter((f): f is string => !!f && f.trim().length > 0).map(escapeLatex);
  return parts.join(" \\textbullet{} ");
}

/**
 * Drop \newcommand/\renewcommand definitions (name, optional args, body).
 */
function stripDefinitions(tex: string): string {
  const skipBraced = (start: number): number => {
    let depth = 0;
    let j = start;
    for (; j < tex.length; j++) {
      if (tex[j] === "{") depth++;
      else if (tex[j] === "}") {
        depth--;
        if (depth === 0) return j + 1;
      }
    }
    return j;
  };
  const skipOne = (i: number, keyword: string): number => {
    i += keyword.length;
    if (tex[i] === "*") i++;
    if (tex[i] === "{") i = skipBraced(i);
    if (tex[i] === "[") i = tex.indexOf("]", i) + 1;
    if (tex[i] === "{") i = skipBraced(i);
    return i;
  };
  let out = "";
  let i = 0;
  while (i < tex.length) {
    if (tex.startsWith("\\newcommand", i)) {
      i = skipOne(i, "\\newcommand");
      out += " ";
    } else if (tex.startsWith("\\renewcommand", i)) {
      i = skipOne(i, "\\renewcommand");
      out += " ";
    } else {
      out += tex[i];
      i++;
    }
  }
  return out;
}

/** Convert LaTeX text to clean plain text for ATS inspection. */
export function texToText(tex: string): string {
  if (!tex) return "";
  return stripDefinitions(tex)
    .replace(/\\item\s*/g, "- ")
    .replace(/\\[&%$#_{}~^]/g, (m) => ({ "\\&": "&", "\\%": "%", "\\$": "$", "\\#": "#", "\\_": "_", "\\{": "{", "\\}": "}", "\\~": "~", "\\^": "^" })[m] ?? " ")
    .replace(/^[ \t]*%[^\n]*/gm, " ")
    .replace(/\\begin\{[a-zA-Z*]+\}|\\end\{[a-zA-Z*]+\}/g, " ")
    .replace(/\\textbullet\{\}/g, " · ")
    .replace(/\\\[[^\]]*\]/g, " ")
    .replace(/\\\\/g, " ")
    .replace(/\\(?:hspace|vspace|hrule|rule|vfill)(?:\{[^}]*\})?/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?=[\s{}\\\[\]])/g, " ")
    .replace(/[{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


