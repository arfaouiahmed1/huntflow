/**
 * Hiring Without Whiteboards — Cited Knowledge Integration.
 *
 * Queries SQLite enrichment_items backed by the curated repository
 * (poteto/hiring-without-whiteboards). Verified engineering companies that use
 * real-world, discussion-based, take-home, or pair-programming evaluations.
 *
 * NOTE: Absence of a company from this catalog means "unknown interview process",
 * never "uses whiteboards".
 */

import { enrichmentItemsRepo } from "@/lib/db";

export interface WhiteboardFreeCompany {
  name: string;
  atsProvider: "greenhouse" | "lever" | "ashby" | "workday" | "custom";
  boardToken: string;
  careerUrl?: string;
  interviewStyle: string;
  regions: string[];
  provenance?: string;
  updatedAt?: string;
}

export const HIRING_WITHOUT_WHITEBOARDS_COMPANIES: WhiteboardFreeCompany[] = [
  { name: "Stripe", boardToken: "stripe", atsProvider: "greenhouse", interviewStyle: "Practical coding in chosen environment + system architecture & pairing", regions: ["global", "americas", "europe"] },
  { name: "GitHub", boardToken: "github", atsProvider: "greenhouse", interviewStyle: "Real-world pull request reviews, asynchronous take-home, and domain discussion", regions: ["global", "americas", "europe"] },
  { name: "GitLab", boardToken: "gitlab", atsProvider: "greenhouse", interviewStyle: "Transparent handbook review, practical take-home project, and team discussion", regions: ["global", "americas", "europe", "apac"] },
  { name: "Basecamp / 37signals", boardToken: "37signals", atsProvider: "custom", interviewStyle: "Paid take-home project reviewing real product issues without trivia", regions: ["global", "americas"] },
  { name: "Linear", boardToken: "linear", atsProvider: "lever", interviewStyle: "Product mindset conversation + building a small feature in your editor", regions: ["global", "americas", "europe"] },
  { name: "Supabase", boardToken: "supabase", atsProvider: "ashby", interviewStyle: "Open source contributions, async RFC drafting, and database pairing", regions: ["global", "americas", "europe", "apac"] },
  { name: "Automattic", boardToken: "automattic", atsProvider: "greenhouse", interviewStyle: "Paid trial project (2-4 weeks async) replacing traditional interviews", regions: ["global", "americas", "europe", "africa", "mena", "apac"] },
  { name: "DuckDuckGo", boardToken: "duckduckgo", atsProvider: "greenhouse", interviewStyle: "Paid project working on actual tasks with standard tooling", regions: ["global", "americas", "europe"] },
  { name: "Zapier", boardToken: "zapier", atsProvider: "greenhouse", interviewStyle: "Collaborative pairing on practical integration problems", regions: ["global", "americas"] },
  { name: "Buffer", boardToken: "buffer", atsProvider: "greenhouse", interviewStyle: "Values-aligned practical discussion and scenario evaluation", regions: ["global"] },
  { name: "Vercel", boardToken: "vercel", atsProvider: "greenhouse", interviewStyle: "Frontend / infrastructure systems design + practical code review", regions: ["global", "americas", "europe"] },
  { name: "Tailscale", boardToken: "tailscale", atsProvider: "greenhouse", interviewStyle: "Network systems pairing and take-home exercises", regions: ["global", "americas", "europe", "apac"] },
  { name: "HashiCorp", boardToken: "hashicorp", atsProvider: "greenhouse", interviewStyle: "Systems engineering design and practical problem solving", regions: ["global", "americas", "europe"] },
  { name: "Datadog", boardToken: "datadog", atsProvider: "greenhouse", interviewStyle: "Real-world telemetry debugging and architecture discussion", regions: ["global", "americas", "europe"] },
];

export function getWhiteboardFreeCompanies(): WhiteboardFreeCompany[] {
  try {
    const items = enrichmentItemsRepo.listBySource("hiring-without-whiteboards", 1000);
    if (items.length > 0) {
      return items.map((it) => {
        const payload = JSON.parse(it.payloadJson);
        return {
          name: payload.name,
          atsProvider: payload.atsProvider || "custom",
          boardToken: payload.boardToken || "",
          careerUrl: payload.url,
          interviewStyle: payload.interviewStyle || "Practical take-home or discussion evaluation",
          regions: payload.regions || ["global"],
          provenance: it.provenance,
          updatedAt: it.updatedAt,
        };
      });
    }
  } catch {
    // Fallback during initial boot/test
  }
  return HIRING_WITHOUT_WHITEBOARDS_COMPANIES;
}

export function getWhiteboardFreeAtsBoards(): Array<{ provider: "greenhouse" | "lever" | "ashby"; token: string; companyName: string }> {
  const companies = getWhiteboardFreeCompanies();
  return companies
    .filter((c) => ["greenhouse", "lever", "ashby"].includes(c.atsProvider) && c.boardToken)
    .map((c) => ({
      provider: c.atsProvider as "greenhouse" | "lever" | "ashby",
      token: c.boardToken,
      companyName: c.name,
    }));
}

export function searchWhiteboardFreeCompanies(query: string): WhiteboardFreeCompany[] {
  const clean = query.trim().toLowerCase();
  const all = getWhiteboardFreeCompanies();
  if (!clean) return all;

  return all.filter((c) => {
    return (
      c.name.toLowerCase().includes(clean) ||
      c.regions.some((r) => r.toLowerCase().includes(clean)) ||
      c.interviewStyle.toLowerCase().includes(clean)
    );
  });
}
