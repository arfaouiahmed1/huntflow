/**
 * Job Description Sanitizer — Huntflow Agent Hardening (Phase 1)
 *
 * Detects and removes prompt-injection, hidden Unicode, malicious markdown/HTML,
 * and suspicious base64-encoded instruction blocks from external job descriptions
 * while preserving legitimate technical terms.
 */

export interface SanitizeResult {
  cleanText: string;
  sanitized: boolean;
  strippedPatterns: string[];
  riskScore: number;
}

// ---------------------------------------------------------------------------
// Pattern definitions with deterministic severity weights
// ---------------------------------------------------------------------------

interface PatternDef {
  name: string;
  regex: RegExp;
  score: number;
}

/**
 * Zero-width / invisible formatting characters that can hide prompt injections.
 * Covers: \u200B-\u200D (ZWSP, ZWNJ, ZWJ), \uFEFF (BOM), \u202A-\u202E (bidi overrides), \u00AD (soft hyphen)
 */
const ZERO_WIDTH_REGEX = /[\u200B-\u200D\uFEFF\u202A-\u202E\u00AD]/g;

/**
 * Prompt-injection override phrases.
 * Kept intentionally narrow to avoid false-positives on legitimate HR language
 * like "You are responsible for...".
 */
const PROMPT_INJECTION_PATTERNS: PatternDef[] = [
  {
    name: "prompt_injection:ignore_previous_instructions",
    regex: /ignore\s+(all\s+)?previous\s+instructions/gi,
    score: 30,
  },
  {
    name: "prompt_injection:ignore_instructions",
    regex: /ignore\s+.*?\binstructions\b/gi,
    score: 20,
  },
  {
    name: "prompt_injection:system_role_override",
    regex: /system\s*:\s*you\s+are/gi,
    score: 30,
  },
  {
    name: "prompt_injection:disregard_instructions",
    regex: /disregard\s+(all\s+)?(previous\s+)?instructions/gi,
    score: 25,
  },
  {
    name: "prompt_injection:forget_instructions",
    regex: /forget\s+(all\s+)?(previous\s+)?instructions/gi,
    score: 25,
  },
  {
    name: "prompt_injection:you_are_now_assistant",
    regex: /you\s+are\s+now\s+(an?\s+)?(assistant|ai|chatgpt|system|model)\b/gi,
    score: 25,
  },
  {
    name: "prompt_injection:override_instructions",
    regex: /override\s+(all\s+)?(previous\s+)?instructions/gi,
    score: 20,
  },
];

/**
 * Hidden instruction / chat-template tokens.
 */
const SPECIAL_TOKEN_PATTERNS: PatternDef[] = [
  { name: "special_token:im_start", regex: /<\|im_start\|>/gi, score: 35 },
  { name: "special_token:im_end", regex: /<\|im_end\|>/gi, score: 30 },
  { name: "special_token:system", regex: /<\|system\|>/gi, score: 35 },
  { name: "special_token:assistant", regex: /<\|assistant\|>/gi, score: 25 },
  { name: "special_token:user", regex: /<\|user\|>/gi, score: 25 },
  { name: "special_token:inst", regex: /\[INST\]/gi, score: 30 },
  { name: "special_token:inst_end", regex: /\[\/INST\]/gi, score: 20 },
  { name: "special_token:system_tag", regex: /\[SYSTEM\]/gi, score: 30 },
  { name: "special_token:special_system_tag", regex: /\[\/SYSTEM\]/gi, score: 20 },
];

/**
 * Malicious markdown / HTML / URI injections.
 * Ordered from most-specific to generic so specific removals prevent double-counting.
 */
const MARKDOWN_HTML_PATTERNS: PatternDef[] = [
  // markdown image with javascript: or data: payload
  {
    name: "markdown:image_javascript_uri",
    regex: /!\[[^\]]*\]\(\s*javascript:[^)]*\)/gi,
    score: 35,
  },
  {
    name: "markdown:image_data_uri",
    regex: /!\[[^\]]*\]\(\s*data:[^)]*\)/gi,
    score: 35,
  },
  // markdown link with javascript: or data:
  {
    name: "markdown:link_javascript_uri",
    regex: /\[[^\]]*\]\(\s*javascript:[^)]*\)/gi,
    score: 30,
  },
  {
    name: "markdown:link_data_uri",
    regex: /\[[^\]]*\]\(\s*data:[^)]*\)/gi,
    score: 30,
  },
  // generic data URIs with executable payloads
  {
    name: "markdown:data_uri_html",
    regex: /data\s*:\s*text\/html[^,\s]*,[^\s"'\)]*/gi,
    score: 30,
  },
  {
    name: "markdown:data_uri_javascript",
    regex: /data\s*:\s*application\/(?:x-)?javascript[^,\s]*,[^\s"'\)]*/gi,
    score: 30,
  },
  {
    name: "markdown:data_uri_svg_xml",
    regex: /data\s*:\s*image\/svg\+xml[^,\s]*,[^\s"'\)]*/gi,
    score: 30,
  },
  {
    name: "markdown:data_uri_base64",
    regex: /data\s*:[^;,\s]*;base64\s*,[A-Za-z0-9+\/=]+/gi,
    score: 30,
  },
  // HTML tag injections
  {
    name: "html:script_tag",
    regex: /<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi,
    score: 40,
  },
  {
    name: "html:script_open",
    regex: /<script\b[^>]*>/gi,
    score: 35,
  },
  {
    name: "html:iframe_tag",
    regex: /<iframe\b[^>]*>[\s\S]*?(?:<\/iframe\s*>)?/gi,
    score: 35,
  },
  {
    name: "html:object_tag",
    regex: /<object\b[^>]*>[\s\S]*?(?:<\/object\s*>)?/gi,
    score: 30,
  },
  {
    name: "html:embed_tag",
    regex: /<embed\b[^>]*\/?>/gi,
    score: 30,
  },
  {
    name: "html:img_onerror",
    regex: /<img\b[^>]*\bon\w+\s*=/gi,
    score: 35,
  },
  {
    name: "html:svg_onload",
    regex: /<svg\b[^>]*\bon\w+\s*=/gi,
    score: 35,
  },
  {
    name: "html:event_handler",
    regex: /<[^>]*\bon\w+\s*=\s*["'][^"']*["'][^>]*>/gi,
    score: 30,
  },
  // Generic javascript: URI (no space after colon avoids false-positive on "JavaScript: React")
  {
    name: "markdown:javascript_uri",
    regex: /javascript\s*:[^\s"')]+/gi,
    score: 30,
  },
  {
    name: "markdown:vbscript_uri",
    regex: /vbscript\s*:[^\s"')]+/gi,
    score: 30,
  },
];

// ---------------------------------------------------------------------------
// Base64 hidden-instruction detection
// ---------------------------------------------------------------------------

/** Minimum length for a base64 candidate to be considered */
const BASE64_MIN_LENGTH = 20;

/** Pattern to find long base64-like strings (≥20 chars, only base64 alphabet) */
const BASE64_CANDIDATE_REGEX = /[A-Za-z0-9+\/]{20,}={0,2}/g;

/**
 * Keywords that, when found in a decoded base64 payload, indicate hidden instructions.
 * Mirrors prompt-injection phrases but applied to the decoded content.
 */
const DECODED_SUSPICIOUS_REGEX =
  /(ignore\s+(all\s+)?previous\s+instructions|system\s*:\s*you\s+are|disregard\s+.*instructions|forget\s+.*instructions|you\s+are\s+now|override\s+.*instructions|<\|im_start\|>|<\|system\|>|\[INST\]|\[SYSTEM\]|prompt\s+injection|instruction\s+override)/i;

/**
 * Attempt to decode a base64 candidate using Buffer (Node) or atob (browser fallback).
 */
function tryDecodeBase64(candidate: string): string | null {
  // Must be valid base64 length (multiple of 4 after padding handling)
  // Allow missing padding by checking length % 4
  const normalized = candidate.trim();
  if (normalized.length < BASE64_MIN_LENGTH) return null;
  // Quick check: must not be pure alphabetic word without +/ or = and digits — still could be base64, but we require
  // either length >= 32 or contains + / = or decodes to suspicious content.
  // We always attempt decode; false positives are filtered by suspicious keyword test.
  try {
    let decoded: string;
    if (typeof Buffer !== "undefined" && typeof Buffer.from === "function") {
      decoded = Buffer.from(normalized, "base64").toString("utf-8");
    } else if (typeof atob === "function") {
      decoded = atob(normalized);
    } else {
      return null;
    }
    // Validate that re-encoding round-trips-ish and decoded is printable
    if (!decoded || decoded.length < 3) return null;
    // Check for printable ASCII / common unicode — reject binary garbage
    // Allow letters, numbers, punctuation, spaces, newlines
    const printable = /^[\x09\x0A\x0D\x20-\x7E\u00A0-\u024F\u0400-\u04FF]*$/;
    // If decoded is mostly non-printable, ignore
    if (!printable.test(decoded.slice(0, 200))) {
      // Still check suspicious pattern on raw decoded; if it contains keywords, we consider it
      if (!DECODED_SUSPICIOUS_REGEX.test(decoded)) return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Sanitizes a raw job description by detecting and removing prompt-injection,
 * hidden Unicode, malicious markdown/HTML, and suspicious base64 payloads.
 *
 * Preserves valid technical terms such as React, Node.js, C++, TypeScript, Docker, CI/CD, AWS.
 *
 * @param rawText - Original job description text (e.g., scraped from external site)
 * @returns Object containing cleaned text, sanitization flag, list of stripped pattern names, and deterministic risk score 0–100
 */
export function sanitizeJobDescription(rawText: string): SanitizeResult {
  let cleanText: string = rawText;
  const strippedPatterns: string[] = [];
  let riskScore = 0;

  const seen = new Set<string>();

  function addPattern(name: string, score: number): void {
    if (!seen.has(name)) {
      seen.add(name);
      strippedPatterns.push(name);
      riskScore += score;
    }
  }

  // 1. Hidden zero-width / bidi characters
  // Use a fresh regex to test, then replace
  if (ZERO_WIDTH_REGEX.test(cleanText)) {
    addPattern("zero_width_characters", 20);
  }
  // Reset lastIndex after test (global regex)
  ZERO_WIDTH_REGEX.lastIndex = 0;
  // Also detect bidi-specific for more granular reporting if present
  const bidiRegex = /[\u202A-\u202E]/g;
  if (bidiRegex.test(cleanText)) {
    // Already counted zero_width, but add distinct bidi marker if not already present
    // We keep single risk addition to avoid double-charging for same chars,
    // but record the more specific pattern name as well for observability.
    if (!seen.has("bidi_override_characters")) {
      // Do not double-add risk if zero_width already counted bidi chars;
      // instead record pattern without extra score, or with small additional score
      // We choose to record but not add extra score beyond zero_width to keep deterministic total
      strippedPatterns.push("bidi_override_characters");
      seen.add("bidi_override_characters");
      // small additional risk for bidi (direction override is high-severity)
      riskScore += 5;
    }
  }
  bidiRegex.lastIndex = 0;
  cleanText = cleanText.replace(ZERO_WIDTH_REGEX, "");

  // 2. Prompt injection phrases + special tokens
  const allPromptPatterns: PatternDef[] = [...PROMPT_INJECTION_PATTERNS, ...SPECIAL_TOKEN_PATTERNS];
  for (const def of allPromptPatterns) {
    // Clone regex to avoid lastIndex pollution across iterations (global flag)
    const regex = new RegExp(def.regex.source, def.regex.flags);
    if (regex.test(cleanText)) {
      addPattern(def.name, def.score);
      // Reset and replace all occurrences
      const replaceRegex = new RegExp(def.regex.source, def.regex.flags);
      cleanText = cleanText.replace(replaceRegex, "");
    }
  }

  // 3. Malicious markdown / HTML / URI injections
  for (const def of MARKDOWN_HTML_PATTERNS) {
    const regex = new RegExp(def.regex.source, def.regex.flags);
    regex.lastIndex = 0;
    if (regex.test(cleanText)) {
      addPattern(def.name, def.score);
      const replaceRegex = new RegExp(def.regex.source, def.regex.flags);
      cleanText = cleanText.replace(replaceRegex, "");
    }
  }

  // 4. Suspicious base64 instruction blocks
  // Find candidates in the current cleanText (after previous removals)
  const candidates = cleanText.match(BASE64_CANDIDATE_REGEX);
  if (candidates) {
    // Deduplicate candidates to avoid repeat work
    const uniqueCandidates = Array.from(new Set(candidates));
    for (const candidate of uniqueCandidates) {
      // Length sanity: must be multiple of 4 or padded
      // Allow candidates where length % 4 !== 0 only if they could be truncated; we still try
      // But require at least 20 chars
      if (candidate.length < BASE64_MIN_LENGTH) continue;

      // Heuristic: skip candidates that look like normal hex or pure dictionary words
      // If candidate is repeated single char or looks like natural language (e.g., "ReactTypeScriptNodeJSLongWord"), it would still be flagged
      // but decoded check will filter non-suspicious.

      const decoded = tryDecodeBase64(candidate);
      if (decoded === null) continue;

      if (DECODED_SUSPICIOUS_REGEX.test(decoded)) {
        addPattern("base64_hidden_instructions", 30);

        // Also record more specific sub-pattern for observability
        const lower = decoded.toLowerCase();
        if (lower.includes("ignore") && lower.includes("previous")) {
          if (!seen.has("base64:ignore_previous_instructions")) {
            seen.add("base64:ignore_previous_instructions");
            strippedPatterns.push("base64:ignore_previous_instructions");
          }
        } else if (lower.includes("system") && lower.includes("you are")) {
          if (!seen.has("base64:system_override")) {
            seen.add("base64:system_override");
            strippedPatterns.push("base64:system_override");
          }
        }

        // Remove the exact base64 string (escape for regex)
        const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const removalRegex = new RegExp(escaped, "g");
        cleanText = cleanText.replace(removalRegex, "");
      }
    }
  }

  const sanitized = strippedPatterns.length > 0;

  if (sanitized) {
    // Lightweight normalization only when sanitization occurred:
    // - collapse multiple horizontal spaces/tabs
    // - normalize newlines
    // - trim leading/trailing whitespace
    // This preserves technical terms (React, Node.js, C++, etc.) and paragraph structure.

    // Collapse 2+ spaces/tabs into single space (but preserve newlines)
    cleanText = cleanText.replace(/[ \t]{2,}/g, " ");
    // Collapse spaces around newlines
    cleanText = cleanText.replace(/[ \t]*\n[ \t]*/g, "\n");
    // Collapse 3+ consecutive newlines into double newline (paragraph break)
    cleanText = cleanText.replace(/\n{3,}/g, "\n\n");
    // Remove empty lines that contain only spaces
    cleanText = cleanText.replace(/\n\s*\n/g, "\n\n");
    cleanText = cleanText.trim();
    // Final collapse of any remaining double spaces created by removals
    cleanText = cleanText.replace(/ {2,}/g, " ");
  } else {
    // No modifications — preserve original exactly for clean JDs
    cleanText = rawText;
    riskScore = 0;
  }

  // Deterministic score: sum of weights, capped at 100, rounded
  riskScore = Math.min(100, Math.max(0, Math.round(riskScore)));
  if (!sanitized) {
    riskScore = 0;
  }

  return {
    cleanText,
    sanitized,
    strippedPatterns,
    riskScore,
  };
}
