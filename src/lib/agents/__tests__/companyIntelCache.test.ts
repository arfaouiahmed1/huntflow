import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeCompanyKey,
  getCompanyResearchFromCache,
  setCompanyResearchCache,
  extractCompanyDomain,
  __clearCompanyResearchCacheForTests,
} from "@/lib/agents/companyIntelCache";

describe("normalizeCompanyKey", () => {
  beforeEach(() => {
    __clearCompanyResearchCacheForTests();
  });

  it("handles spaces and uppercase deterministically", () => {
    const a = normalizeCompanyKey("  OpenAI  ");
    const b = normalizeCompanyKey("openai");
    const c = normalizeCompanyKey("OPENAI");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(a).toBe("openai");
  });

  it("strips punctuation and collapses whitespace", () => {
    const base = normalizeCompanyKey("FusionAuth, Inc.");
    const withSpaces = normalizeCompanyKey("FusionAuth   Inc");
    const withPunct = normalizeCompanyKey("FusionAuth-Inc.");
    expect(base).toBe("fusionauth-inc");
    expect(withSpaces).toBe("fusionauth-inc");
    expect(withPunct).toBe("fusionauth-inc");
  });

  it("incorporates URL domain into the key", () => {
    const withoutUrl = normalizeCompanyKey("Acme");
    const withUrl = normalizeCompanyKey("Acme", "https://acme.io/careers");
    const withUrlUpper = normalizeCompanyKey("Acme", "https://ACME.IO/careers");
    expect(withoutUrl).toBe("acme");
    expect(withUrl).toBe("acme::acme.io");
    expect(withUrl).toBe(withUrlUpper);
  });

  it("returns domain alone when name is empty and url is provided", () => {
    const key = normalizeCompanyKey("   ", "https://fusionauth.io/careers/senior-eng");
    expect(key).toBe("fusionauth.io");
  });

  it("treats same company with different urls as different keys", () => {
    const k1 = normalizeCompanyKey("Acme", "https://acme.io/jobs");
    const k2 = normalizeCompanyKey("Acme", "https://acme.com/jobs");
    expect(k1).not.toBe(k2);
  });

  it("normalizes multiple punctuation variants to same key", () => {
    const variants = [
      normalizeCompanyKey("Acme Corp."),
      normalizeCompanyKey("Acme   Corp"),
      normalizeCompanyKey("ACME-CORP"),
      normalizeCompanyKey("acme, corp!"),
    ];
    const expected = "acme-corp";
    for (const v of variants) {
      expect(v).toBe(expected);
    }
  });
});

describe("company research cache set/get and TTL", () => {
  beforeEach(() => {
    __clearCompanyResearchCacheForTests();
    vi.useRealTimers();
  });

  it("stores and retrieves research by company name", () => {
    const research = { summary: "Test summary", facts: [] };
    setCompanyResearchCache("OpenAI", research);
    const cached = getCompanyResearchFromCache("OpenAI");
    expect(cached).not.toBeNull();
    expect(cached?.research).toEqual(research);
    expect(cached?.companyKey).toBe(normalizeCompanyKey("OpenAI"));
    expect(cached?.source).toBe("cache");
  });

  it("retrieves same entry via normalized key variations", () => {
    const research = { data: 123 };
    setCompanyResearchCache("  OpenAI  ", research);
    const cachedLower = getCompanyResearchFromCache("openai");
    const cachedUpper = getCompanyResearchFromCache("OPENAI");
    expect(cachedLower?.research).toEqual(research);
    expect(cachedUpper?.research).toEqual(research);
  });

  it("respects URL-aware keys", () => {
    const researchA = { id: "A" };
    const researchB = { id: "B" };
    setCompanyResearchCache("Acme", researchA, "https://acme.io/careers");
    setCompanyResearchCache("Acme", researchB, "https://acme.com/careers");
    expect(getCompanyResearchFromCache("Acme", "https://acme.io/careers")?.research).toEqual(researchA);
    expect(getCompanyResearchFromCache("Acme", "https://acme.com/careers")?.research).toEqual(researchB);
    expect(getCompanyResearchFromCache("Acme", "https://acme.io/careers")?.research).not.toEqual(
      getCompanyResearchFromCache("Acme", "https://acme.com/careers")?.research,
    );
  });

  it("returns null for missing entry", () => {
    expect(getCompanyResearchFromCache("NonExistentCorp")).toBeNull();
    expect(getCompanyResearchFromCache("Acme", "https://missing.io")).toBeNull();
  });

  it("expires entries after TTL", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);
    const research = { hello: "world" };
    setCompanyResearchCache("ExpireCo", research, undefined, 1000);
    // Not expired immediately
    expect(getCompanyResearchFromCache("ExpireCo")).not.toBeNull();
    // Advance beyond TTL
    vi.setSystemTime(now + 1001);
    expect(getCompanyResearchFromCache("ExpireCo")).toBeNull();
    // Also verify that expired entry is evicted
    vi.setSystemTime(now + 2000);
    expect(getCompanyResearchFromCache("ExpireCo")).toBeNull();
    vi.useRealTimers();
  });

  it("uses default TTL of 7 days when not provided", () => {
    vi.useFakeTimers();
    const start = new Date("2026-01-01T00:00:00Z").getTime();
    vi.setSystemTime(start);
    const research = { value: "ttl default" };
    setCompanyResearchCache("TTLDefaultCo", research);
    const cached = getCompanyResearchFromCache("TTLDefaultCo");
    expect(cached).not.toBeNull();
    const expectedTtl = 7 * 24 * 60 * 60 * 1000;
    expect(cached?.expiresAt).toBe(start + expectedTtl);
    // Still valid after 6 days
    vi.setSystemTime(start + 6 * 24 * 60 * 60 * 1000);
    expect(getCompanyResearchFromCache("TTLDefaultCo")).not.toBeNull();
    // Expired after 7 days + 1ms
    vi.setSystemTime(start + expectedTtl + 1);
    expect(getCompanyResearchFromCache("TTLDefaultCo")).toBeNull();
    vi.useRealTimers();
  });

  it("respects custom ttlMs", () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    const research = { custom: true };
    setCompanyResearchCache("CustomTTLC", research, undefined, 5000);
    vi.setSystemTime(start + 4000);
    expect(getCompanyResearchFromCache("CustomTTLC")).not.toBeNull();
    vi.setSystemTime(start + 6000);
    expect(getCompanyResearchFromCache("CustomTTLC")).toBeNull();
    vi.useRealTimers();
  });

  it("isolates different companies", () => {
    setCompanyResearchCache("CompanyA", { a: 1 });
    setCompanyResearchCache("CompanyB", { b: 2 });
    expect(getCompanyResearchFromCache("CompanyA")?.research).toEqual({ a: 1 });
    expect(getCompanyResearchFromCache("CompanyB")?.research).toEqual({ b: 2 });
    expect(getCompanyResearchFromCache("CompanyC")).toBeNull();
  });
});

describe("extractCompanyDomain", () => {
  it("extracts clean domain from full URL with path", () => {
    expect(extractCompanyDomain("https://fusionauth.io/careers/senior-eng")).toBe("fusionauth.io");
  });

  it("strips www and lowercases", () => {
    expect(extractCompanyDomain("https://www.example.com/path?x=1")).toBe("example.com");
    expect(extractCompanyDomain("http://WWW.FUSIONAUTH.IO/CAREERS")).toBe("fusionauth.io");
  });

  it("handles URLs without protocol", () => {
    expect(extractCompanyDomain("fusionauth.io/careers")).toBe("fusionauth.io");
    expect(extractCompanyDomain("example.com")).toBe("example.com");
    expect(extractCompanyDomain("sub.example.com/path")).toBe("sub.example.com");
  });

  it("preserves subdomains except www", () => {
    expect(extractCompanyDomain("https://careers.example.com/jobs")).toBe("careers.example.com");
    expect(extractCompanyDomain("https://sub.domain.example.co.uk/path")).toBe("sub.domain.example.co.uk");
  });

  it("handles ports and query strings", () => {
    expect(extractCompanyDomain("https://example.com:8080/path")).toBe("example.com");
    expect(extractCompanyDomain("https://example.com/path?query=1&x=2#hash")).toBe("example.com");
  });

  it("returns null for invalid or missing inputs", () => {
    expect(extractCompanyDomain(undefined)).toBeNull();
    expect(extractCompanyDomain("")).toBeNull();
    expect(extractCompanyDomain("   ")).toBeNull();
    expect(extractCompanyDomain("not a url")).toBeNull();
    expect(extractCompanyDomain("http://")).toBeNull();
    expect(extractCompanyDomain("localhost")).toBeNull();
    expect(extractCompanyDomain("https://invalid_domain")).toBeNull();
  });

  it("parses root domain correctly for various TLDs", () => {
    expect(extractCompanyDomain("https://openai.com/careers/example")).toBe("openai.com");
    expect(extractCompanyDomain("https://jobs.lever.co/acme/123")).toBe("jobs.lever.co");
    expect(extractCompanyDomain("https://acme.co.uk/jobs")).toBe("acme.co.uk");
  });
});
