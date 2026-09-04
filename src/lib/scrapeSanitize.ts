import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';

/** Block-level tags that separate tokens, so adjacent ones don't glue together. */
const BLOCK_TAGS: Record<string, true> = {
  address: true,
  article: true,
  aside: true,
  blockquote: true,
  br: true,
  caption: true,
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
  h1: true,
  h2: true,
  h3: true,
  h4: true,
  h5: true,
  h6: true,
  header: true,
  hr: true,
  legend: true,
  li: true,
  main: true,
  nav: true,
  ol: true,
  p: true,
  pre: true,
  section: true,
  summary: true,
  table: true,
  tbody: true,
  td: true,
  tfoot: true,
  th: true,
  thead: true,
  tr: true,
  ul: true,
};

/**
 * Walk the raw (already script-stripped) node tree, joining each element's
 * text with word boundaries at block-level tags. Plain `.text()` glues
 * adjacent block tags together ("para onePara two"); this keeps them readable
 * without importing further DOM-type machinery. domhandler nodeType: 3 =
 * text, 1 = element, 9 = document — other node kinds are ignored.
 */
function collectText(node: unknown): string {
  if (typeof node !== 'object' || node === null) return '';
  if ('nodeType' in node && node.nodeType === 3 && 'data' in node) {
    return typeof node.data === 'string' ? node.data : '';
  }
  if (!('children' in node) || !Array.isArray(node.children)) return '';
  const tag = 'tagName' in node && typeof node.tagName === 'string' ? node.tagName : '';
  const inner = node.children.map(collectText).join('');
  return tag !== '' && BLOCK_TAGS[tag.toLowerCase()] ? ` ${inner} ` : inner;
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
 * Extract readable text from an HTML snippet — e.g. a JSON-LD JobPosting
 * description with embedded tags. Strips non-content elements first so
 * `<script>` payloads never surface as visible copy.
 */
export function htmlToText(html: string): string {
  if (!html) return '';
  const $snippet = cheerio.load(html);
  stripNonContent($snippet);
  return collectText($snippet.root()[0]).replace(/\s+/g, ' ').trim();
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
 * Normalize + gate a cheerio-extracted candidate: collapse whitespace,
 * fall back to the default when the copy is empty or bundle-like, and
 * enforce the 4000-char cap.
 */
export function sanitizeDescription(candidate: string): string {
  const normalized = candidate.replace(/\s+/g, ' ').trim();
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
  return {
    title: nonEmptyString(raw.title, DEFAULT_SCRAPE_TITLE),
    company: nonEmptyString(raw.company, DEFAULT_SCRAPE_COMPANY),
    location: nonEmptyString(raw.location, DEFAULT_SCRAPE_LOCATION),
    salary: nonEmptyString(raw.salary, DEFAULT_SCRAPE_SALARY),
    description: sanitizeDescription(nonEmptyString(raw.description, DEFAULT_SCRAPE_DESCRIPTION)),
  };
}
