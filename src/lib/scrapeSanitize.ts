import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

/** Elements that never carry human-readable job copy (also stripped up front). */
const NON_CONTENT_TAGS: Record<string, true> = {
  script: true,
  style: true,
  noscript: true,
  template: true,
};

/** Block containers rendered as Markdown paragraphs (blank-line separated). */
const PARAGRAPH_TAGS: Record<string, true> = {
  address: true,
  article: true,
  aside: true,
  blockquote: true,
  dd: true,
  details: true,
  div: true,
  dl: true,
  dt: true,
  fieldset: true,
  figcaption: true,
  figure: true,
  footer: true,
  form: true,
  header: true,
  main: true,
  nav: true,
  p: true,
  pre: true,
  section: true,
  summary: true,
};

type DomNode = {
  nodeType?: number;
  data?: unknown;
  tagName?: unknown;
  attribs?: Record<string, string>;
  children?: DomNode[];
};

function nodeTag(node: DomNode): string {
  return typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
}

function renderChildren(node: DomNode): string {
  if (!Array.isArray(node.children)) return '';
  return node.children.map((child) => renderNode(child)).join('');
}

/**
 * Inline Markdown for an element's content: nested blocks collapse to spaces
 * so headings, links, and table cells stay on one readable line.
 */
function renderInline(node: DomNode): string {
  return renderChildren(node).replace(/\s+/g, ' ').trim();
}

function wrapInline(node: DomNode, before: string, after: string): string {
  const inner = renderInline(node);
  return inner ? `${before}${inner}${after}` : '';
}

/** Render one `<li>` — first line takes the marker, continuations indent. */
function renderListItem(li: DomNode, marker: string): string {
  const lines = renderChildren(li)
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return '';
  const [first, ...rest] = lines;
  return [`${marker} ${first}`, ...rest.map((line) => `  ${line}`)].join('\n');
}

function renderList(node: DomNode, ordered: boolean): string {
  if (!Array.isArray(node.children)) return '';
  const items = node.children
    .filter((child) => nodeTag(child) === 'li')
    .map((li, index) => renderListItem(li, ordered ? `${index + 1}.` : '-'))
    .filter((item) => item !== '');
  return items.length > 0 ? `\n${items.join('\n')}\n` : '';
}

function collectTableRows(table: DomNode): DomNode[][] {
  const rows: DomNode[][] = [];
  const walk = (node: DomNode): void => {
    if (!Array.isArray(node.children)) return;
    for (const child of node.children) {
      const tag = nodeTag(child);
      if (tag === 'tr') {
        const cells = (child.children ?? []).filter((cell) => {
          const cellTag = nodeTag(cell);
          return cellTag === 'th' || cellTag === 'td';
        });
        rows.push(cells);
      } else if (tag !== 'table') {
        walk(child);
      }
    }
  };
  walk(table);
  return rows;
}

function renderTable(node: DomNode): string {
  const rows = collectTableRows(node)
    .map((cells) => cells.map((cell) => renderInline(cell)))
    .filter((cells) => cells.some((cell) => cell !== ''));
  if (rows.length === 0) return renderInline(node);
  const toRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;
  const separator = `| ${rows[0].map(() => '---').join(' | ')} |`;
  return `\n${[toRow(rows[0]), separator, ...rows.slice(1).map(toRow)].join('\n')}\n`;
}

/**
 * Walk the raw (already script-stripped) node tree, emitting clean Markdown:
 * headings, paragraphs, `- ` bullets / `1. ` steps, `**bold**`, tables.
 * Unknown tags fall through to their children so no copy is lost. Plain
 * `.text()` glues adjacent block tags together ("para onePara two"); the
 * explicit blank lines here keep them readable without further DOM machinery.
 * domhandler nodeType: 3 = text — other leaf node kinds are ignored.
 */
function renderNode(node: DomNode): string {
  if (typeof node !== 'object' || node === null) return '';
  if (node.nodeType === 3) {
    return typeof node.data === 'string' ? node.data : '';
  }
  if (!Array.isArray(node.children)) return '';
  const tag = nodeTag(node);
  if (tag !== '' && NON_CONTENT_TAGS[tag]) return '';
  if (tag === 'br') return '\n';
  if (tag === 'hr') return '\n\n---\n\n';
  const heading = tag.match(/^h([1-6])$/);
  if (heading) {
    const inner = renderInline(node);
    return inner ? `\n\n${'#'.repeat(Math.min(Number(heading[1]), 3))} ${inner}\n\n` : '';
  }
  if (tag === 'ul') return renderList(node, false);
  if (tag === 'ol') return renderList(node, true);
  if (tag === 'li') {
    const item = renderListItem(node, '-');
    return item ? `\n${item}\n` : '';
  }
  if (tag === 'table') return renderTable(node);
  if (tag === 'thead' || tag === 'tbody' || tag === 'tfoot') return renderChildren(node);
  if (tag === 'tr') {
    const inner = renderInline(node);
    return inner ? `\n\n${inner}\n\n` : '';
  }
  if (tag === 'th' || tag === 'td') return renderInline(node);
  if (tag === 'strong' || tag === 'b') return wrapInline(node, '**', '**');
  if (tag === 'em' || tag === 'i') return wrapInline(node, '*', '*');
  if (tag === 'code') return wrapInline(node, '`', '`');
  if (tag === 'img') {
    const alt = node.attribs?.alt?.trim() ?? '';
    return alt ? ` ${alt} ` : '';
  }
  if (tag === 'a') return renderInline(node);
  if (tag !== '' && PARAGRAPH_TAGS[tag]) {
    const inner = renderChildren(node).replace(/[ \t\u00a0]+/g, ' ');
    return inner.trim() ? `\n\n${inner.trim()}\n\n` : '';
  }
  return renderChildren(node);
}

/**
 * Final whitespace/entity cleanup for converted Markdown: decode leftover
 * entities (`&amp;`, `&nbsp;`, double-escaped JSON-LD copy), drop empty
 * bullets and empty bold markers, collapse 3+ newlines to a paragraph break.
 */
function cleanMarkdown(raw: string): string {
  const decoded = raw
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
  const withoutEmptyMarks = decoded.replace(/\*\*\*\*+/g, '').replace(/``/g, '');
  const lines = withoutEmptyMarks
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').replace(/\s+$/g, ''));
  const withoutEmptyBullets = lines.map((line) => (/^\s*(-|\d+\.)\s*$/.test(line) ? '' : line));
  return withoutEmptyBullets.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Fallback description used when extraction yields nothing usable — e.g. a
 * client-rendered shell whose HTML is mostly React Flight JS. Kept identical
 * to the route's historical default so the API response shape never changes.
 */
export const DEFAULT_SCRAPE_DESCRIPTION = 'Job description extracted from link.';

/** Cap mirroring the route's historical 4000-char truncation. */
export const MAX_SCRAPE_DESCRIPTION_LENGTH = 4000;

/** Elements that never carry human-readable job copy. */
export const NON_CONTENT_SELECTOR = 'script, style, noscript, template';

/**
 * Remove non-content elements from a loaded cheerio document, in place.
 * Call before any `.text()` extraction so inline bundles (e.g.
 * `self.__next_f.push(...)` payloads) can't leak into the visible copy.
 */
export function stripNonContent($: CheerioAPI): void {
  $(NON_CONTENT_SELECTOR).remove();
}

/**
 * Convert any HTML job description — JSON-LD descriptions with embedded tags,
 * cheerio extracts, or sidecar outputs — into clean human-readable Markdown:
 * paragraphs with spacing, `- ` / `1. ` list items, `#`..`###` headings,
 * `**bold**`, and `|` tables. Scripts, styles, attributes, and leftover
 * entities (`&amp;`, `&nbsp;`) are stripped/decoded; extra whitespace folds to
 * paragraph breaks. Plain text without tags passes through normalized.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== 'string') return '';
  if (!/<[a-zA-Z/!]/.test(html)) {
    return html.replace(/\u00a0/g, ' ').replace(/[ \t\f\v]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }
  const $snippet = cheerio.load(html);
  stripNonContent($snippet);
  $snippet('head').remove();
  return cleanMarkdown(renderChildren($snippet.root()[0] as unknown as DomNode));
}

/**
 * Historical name for {@link htmlToMarkdown} — kept so existing extraction
 * paths keep working. Returns clean Markdown, not single-line plain text.
 */
export function htmlToText(html: string): string {
  return htmlToMarkdown(html);
}

// Markers matched case-insensitively — Next.js can emit `__next_f`,
// `__NEXT_DATA__`, `_next/static` in mixed case depending on the source build.
const BUNDLE_SIGNATURES = ['__next_f', '__next_data__', '_next/static'] as const;
/** Below this length, density stats are too noisy — only literal signatures reject. */
const MIN_STATISTICAL_LENGTH = 100;
// Minified CSS/JSON blobs typically sit at 10%+ braces; ordinary job prose
// stays well under 8% even when it uses parentheticals and numbered lists.
const MAX_SYNTAX_DENSITY = 0.08;
const MIN_WORD_TOKENS = 10;
const MIN_WORD_RATIO = 0.3;

/**
 * Quality gate for extracted descriptions. Rejects text that looks like a JS
 * bundle / React Flight payload instead of human-readable job copy:
 * Next.js runtime markers, `_next/static` asset paths, high brace/paren
 * density, or a very low alphabetic-word ratio. Blank input is rejected
 * (nothing usable); short copy is accepted unless it is a neutral placeholder or CTA-only stub.
 */
export function isLowQualityDescription(value: string): boolean {
  if (!value || !value.trim()) return true;
  const lower = value.toLowerCase();
  if (BUNDLE_SIGNATURES.some((sig) => lower.includes(sig))) return true;
  const text = value.trim();
  if (text === DEFAULT_SCRAPE_DESCRIPTION) return true;
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 3) return true;
  if (text.length < MIN_STATISTICAL_LENGTH) return false;
  const syntaxChars = text.match(/[{}()[\]]/g)?.length ?? 0;
  if (syntaxChars / text.length > MAX_SYNTAX_DENSITY) return true;
  if (tokens.length >= MIN_WORD_TOKENS) {
    const wordTokens = tokens.filter((token) => /[A-Za-z]{2,}/.test(token)).length;
    if (wordTokens / tokens.length < MIN_WORD_RATIO) return true;
  }
  return false;
}

/**
 * Normalize + gate a cheerio-extracted candidate: fold horizontal whitespace
 * and 3+ newlines (Markdown paragraph breaks survive), fall back to the
 * default when the copy is empty or bundle-like, and enforce the 4000-char
 * cap.
 */
export function sanitizeDescription(candidate: string): string {
  const normalized = candidate
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (!normalized || isLowQualityDescription(normalized)) {
    return DEFAULT_SCRAPE_DESCRIPTION;
  }
  return normalized.slice(0, MAX_SCRAPE_DESCRIPTION_LENGTH);
}

/** Canonical scrape response shape served to the client. */
export interface ScrapePayload {
  title: string;
  company: string;
  location: string;
  salary: string;
  description: string;
  screenshot?: string;
  screenshotUrl?: string;
  cloudinary?: string;
  cloudinaryUrl?: string;
}

/** Defaults mirroring the inherited cheerio extractor's fallback fields. */
export const DEFAULT_SCRAPE_TITLE = 'Software Engineer';
export const DEFAULT_SCRAPE_COMPANY = 'Tech Company';
export const DEFAULT_SCRAPE_LOCATION = 'Remote / Flexible';
export const DEFAULT_SCRAPE_SALARY = 'Competitive Salary';

function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
}

/**
 * Harden an untrusted scrape payload from EITHER extraction path into the
 * canonical 5-key shape. The sidecar boundary can hand back partial or
 * malformed JSON — missing/blank/non-string fields are replaced with neutral
 * defaults, and a description that is blank or bundle-like (an SPA shell
 * whose copy is React Flight JS, `self.__next_f.push(...)`) is swapped for
 * the default so the modal never renders junk.
 */
export function sanitizeScrapeResponse(raw: Record<string, unknown>): ScrapePayload {
  const payload: ScrapePayload = {
    title: nonEmptyString(raw.title, DEFAULT_SCRAPE_TITLE),
    company: nonEmptyString(raw.company, DEFAULT_SCRAPE_COMPANY),
    location: nonEmptyString(raw.location, DEFAULT_SCRAPE_LOCATION),
    salary: nonEmptyString(raw.salary, DEFAULT_SCRAPE_SALARY),
    description: sanitizeDescription(nonEmptyString(raw.description, DEFAULT_SCRAPE_DESCRIPTION)),
  };
  if (typeof raw.screenshot === 'string' && raw.screenshot.trim() !== '') {
    payload.screenshot = raw.screenshot;
  }
  if (typeof raw.screenshotUrl === 'string' && raw.screenshotUrl.trim() !== '') {
    payload.screenshotUrl = raw.screenshotUrl;
  }
  if (typeof raw.cloudinary === 'string' && raw.cloudinary.trim() !== '') {
    payload.cloudinary = raw.cloudinary;
  }
  if (typeof raw.cloudinaryUrl === 'string' && raw.cloudinaryUrl.trim() !== '') {
    payload.cloudinaryUrl = raw.cloudinaryUrl;
  }
  return payload;
}
