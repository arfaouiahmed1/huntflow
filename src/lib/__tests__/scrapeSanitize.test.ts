import { describe, it, expect } from "vitest";
import {
  stripNonContent,
  htmlToText,
  isLowQualityDescription,
  sanitizeDescription,
  sanitizeScrapeResponse,
} from "@/lib/scrapeSanitize";
import * as cheerio from "cheerio";

const NEXT_SHELL_HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Senior Backend Engineer - Acme</title>
  <style>body { margin: 0; font-family: sans-serif; }</style>
  <script>self.__next_f.push([1,"5a:[\\"$\\",\\"section\\",null,{\\"dangerouslySetInnerHTML\\"}"]])</script>
  <script src="/_next/static/chunks/main-app.js"></script>
  <noscript>Enable JavaScript to view this page.</noscript>
</head>
<body>
  <template id="row-tpl"><span>template row</span></template>
  <main>
    <h1>Senior Backend Engineer</h1>
    <div class="job-description">
      <p>You will design and operate distributed services powering our payments platform.</p>
      <p>Requirements: five years of Go or TypeScript, deep Kubernetes experience, and a bias for shipping.</p>
      <p>We offer a competitive salary, equity, and a fully remote team across twelve countries.</p>
    </div>
  </main>
  <script>self.__next_f.push([1,"7:[\\"$\\",\\"footer\\",null,{}"]])</script>
</body>
</html>`;

const FLIGHT_JS_BLOB = [
  'self.__next_f.push([1,"5:L5,[\\"$\\",\\"$L7\\",null,{\\"children\\":[]}])"',
  'self.__next_f.push([1,"7:{\\"name\\":\\"$Sreact.suspense\\"}"])',
  'self.__next_f.push([1,"9:[\\"$\\",\\"div\\",null,{\\"className\\":\\"grid\\"}"])',
].join("\n");

const JSONLD_HTML_SNIPPET =
  "<p>Lead the platform team.</p><script>trackEvent('apply');</script><style>.x{}</style><p>Remote-first, {braces} in copy.</p>";

function extractWithCheerio(html: string): { text: string; description: string } {
  const $ = cheerio.load(html);
  stripNonContent($);
  const text = $("[class*='job-description']").text().replace(/\s+/g, " ").trim();
  return { text, description: sanitizeDescription(text) };
}

describe("stripNonContent", () => {
  it("removes script, style, noscript and template before text extraction", () => {
    const $ = cheerio.load(NEXT_SHELL_HTML);
    stripNonContent($);
    const body = $("body").text();
    expect(body).not.toContain("__next_f");
    expect(body).not.toContain("_next/static");
    expect(body).not.toContain("font-family");
    expect(body).not.toContain("Enable JavaScript");
    expect(body).not.toContain("template row");
    expect($(".job-description")).toHaveLength(1);
  });

  it("strips scripts from a JSON-LD description re-parse via htmlToText", () => {
    const text = htmlToText(JSONLD_HTML_SNIPPET);
    expect(text).toBe("Lead the platform team. Remote-first, {braces} in copy.");
  });
});

describe("isLowQualityDescription", () => {
  it("accepts real job copy extracted from a Next.js shell", () => {
    const { text } = extractWithCheerio(NEXT_SHELL_HTML);
    expect(text).toContain("distributed services powering our payments platform");
    expect(text).not.toContain("__next_f");
    expect(isLowQualityDescription(text)).toBe(false);
  });

  it("rejects React Flight JS blobs", () => {
    expect(isLowQualityDescription(FLIGHT_JS_BLOB)).toBe(true);
    expect(isLowQualityDescription(FLIGHT_JS_BLOB.replace(/__next_f/g, "bundle"))).toBe(true);
  });

  it("rejects bundle signatures and empty input regardless of length", () => {
    expect(isLowQualityDescription("__NEXT_DATA__ = {}")).toBe(true);
    expect(isLowQualityDescription("see /_next/static/chunks below")).toBe(true);
    expect(isLowQualityDescription("")).toBe(true);
    expect(isLowQualityDescription("   ")).toBe(true);
  });

  it("rejects Next bundle markers case-insensitively", () => {
    expect(isLowQualityDescription("self.__Next_F.push([1,\"x\"])")).toBe(true);
    expect(isLowQualityDescription("__next_data__ = {}")).toBe(true);
    expect(isLowQualityDescription("load /_NEXT/STATIC/chunks/app.js")).toBe(true);
  });

  it("rejects high-density script/JSON residue without rejecting ordinary prose", () => {
    // A leaked JSON/JS fragment (no Next signature) — dense braces, near-zero
    // whitespace-delimited real prose. Must be caught by density.
    const jsonDump =
      '{"items":[{"id":1,"role":"engineer"},{"id":2,"role":"designer"},' +
      '{"id":3,"role":"pm"},{"id":4,"role":"qa"}]}';
    expect(isLowQualityDescription(jsonDump)).toBe(true);
    // Ordinary prose with parentheticals and numbered lists is not over-rejected.
    const prose =
      "This role (f/m/d) leads a team of 5. Responsibilities: [1] roadmap, [2] hiring, [3] delivery. " +
      "We value ownership, empathy, and technical depth. Apply today.";
    expect(isLowQualityDescription(prose)).toBe(false);
  });

  it("accepts short real copy without signatures", () => {
    expect(isLowQualityDescription("Part-time role in Berlin. Apply by Friday.")).toBe(false);
  });
});

describe("sanitizeScrapeResponse", () => {
  const good = {
    title: "Senior Backend Engineer",
    company: "Acme",
    location: "Remote / Flexible",
    salary: "Competitive Salary",
    description: "You will design and operate distributed services powering our payments platform.",
  };

  it("replaces a flight-JS description with the fallback and keeps other fields", () => {
    expect(sanitizeScrapeResponse({ ...good, description: FLIGHT_JS_BLOB })).toEqual({
      ...good,
      description: "Job description extracted from link.",
    });
  });

  it("passes a good payload through with identical values", () => {
    expect(sanitizeScrapeResponse(good)).toEqual(good);
  });

  it("fills partial payloads with neutral defaults for every missing field", () => {
    expect(sanitizeScrapeResponse({})).toEqual({
      title: "Software Engineer",
      company: "Tech Company",
      location: "Remote / Flexible",
      salary: "Competitive Salary",
      description: "Job description extracted from link.",
    });
    expect(sanitizeScrapeResponse({ title: "Backend Engineer" })).toEqual({
      title: "Backend Engineer",
      company: "Tech Company",
      location: "Remote / Flexible",
      salary: "Competitive Salary",
      description: "Job description extracted from link.",
    });
  });

  it("treats malformed or blank description as junk and fills the fallback", () => {
    expect(sanitizeScrapeResponse({ ...good, description: 42 })).toEqual({
      ...good,
      description: "Job description extracted from link.",
    });
    expect(sanitizeScrapeResponse({ ...good, description: "" })).toEqual({
      ...good,
      description: "Job description extracted from link.",
    });
    expect(sanitizeScrapeResponse({ ...good, description: "   " })).toEqual({
      ...good,
      description: "Job description extracted from link.",
    });
  });
});

describe("sanitizeDescription", () => {
  it("falls back to the default description for flight JS output", () => {
    expect(sanitizeDescription(FLIGHT_JS_BLOB)).toBe("Job description extracted from link.");
  });

  it("normalizes whitespace and caps length at 4000 chars", () => {
    const long = "Hiring engineers. ".repeat(400);
    const out = sanitizeDescription(long);
    expect(out.length).toBe(4000);
    expect(sanitizeDescription("Line one\n\n  Line  two\tthree")).toBe("Line one Line two three");
  });
});
