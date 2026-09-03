/**
 * HUNTFLOW Cited Knowledge — Licensed Enrichment Catalog.
 *
 * Sourced repositories for cited knowledge, interview signals, skill ontologies,
 * and company engineering blogs. Repositories are cited knowledge data sources only,
 * never executed code plugins.
 */

export interface EnrichmentCatalogEntry {
  id: string;
  name: string;
  repo: string;
  commitSha: string;
  license: string;
  purpose: string;
  processor: string;
  cadenceDays: number;
  attributionUrl: string;
  enabled: boolean;
  description: string;
}

export const PERMITTED_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "CC-BY-4.0",
  "CC-BY-SA-4.0",
  "CC-BY-NC-SA-4.0",
  "ISC",
  "Unlicense",
]);

export const ENRICHMENT_CATALOG: readonly EnrichmentCatalogEntry[] = Object.freeze([
  {
    id: "hiring-without-whiteboards",
    name: "Hiring Without Whiteboards",
    repo: "poteto/hiring-without-whiteboards",
    commitSha: "83e9140407ca8d20364e7c3b946fb44760d62d2d",
    license: "CC-BY-4.0",
    purpose: "company_interview_style_signals",
    processor: "hiringWithoutWhiteboards",
    cadenceDays: 14,
    attributionUrl: "https://github.com/poteto/hiring-without-whiteboards",
    enabled: true,
    description: "Verified tech companies using discussion, practical take-home, or pairing instead of LeetCode.",
  },
  {
    id: "tech-interview-handbook",
    name: "Tech Interview Handbook",
    repo: "yangshun/tech-interview-handbook",
    commitSha: "f38891cf19eb1bbdb18e90632d4b0051e5132ce0",
    license: "MIT",
    purpose: "behavioral_and_negotiation_guidance",
    processor: "techInterviewHandbook",
    cadenceDays: 30,
    attributionUrl: "https://github.com/yangshun/tech-interview-handbook",
    enabled: true,
    description: "Curated guides for behavioral interviews, compensation negotiation, and team evaluations.",
  },
  {
    id: "system-design-primer",
    name: "System Design Primer",
    repo: "donnemartin/system-design-primer",
    commitSha: "1837130283c2ad2c358dc35cb8c1e2b5e28a554a",
    license: "CC-BY-SA-4.0",
    purpose: "system_design_study_references",
    processor: "systemDesignPrimer",
    cadenceDays: 30,
    attributionUrl: "https://github.com/donnemartin/system-design-primer",
    enabled: true,
    description: "Architecture blueprints, trade-offs, and scalability study references.",
  },
  {
    id: "developer-roadmap",
    name: "Developer Roadmaps & Skill Ontology",
    repo: "kamranahmedse/developer-roadmap",
    commitSha: "7559e81b67f10b7f6c8d76d498679f225d57b282",
    license: "CC-BY-NC-SA-4.0",
    purpose: "skill_ontology_and_learning_paths",
    processor: "developerRoadmap",
    cadenceDays: 30,
    attributionUrl: "https://github.com/kamranahmedse/developer-roadmap",
    enabled: true,
    description: "Community skill trees and learning paths for frontend, backend, DevOps, and AI roles.",
  },
  {
    id: "awesome-interview-questions",
    name: "Awesome Interview Questions",
    repo: "DopplerHQ/awesome-interview-questions",
    commitSha: "9260c6d7088b90b830d1d1a108a735c9869680ee",
    license: "MIT",
    purpose: "technology_interview_questions",
    processor: "awesomeInterviewQuestions",
    cadenceDays: 30,
    attributionUrl: "https://github.com/DopplerHQ/awesome-interview-questions",
    enabled: true,
    description: "Targeted question packs by language, framework, database, and system architecture.",
  },
  {
    id: "engineering-blogs",
    name: "Company Engineering Blogs",
    repo: "kilimchoi/engineering-blogs",
    commitSha: "9b661d9a2ff2a44a7f34f7da8d8c9f6d7ebfe9b3",
    license: "MIT",
    purpose: "company_engineering_blog_discovery",
    processor: "engineeringBlogs",
    cadenceDays: 30,
    attributionUrl: "https://github.com/kilimchoi/engineering-blogs",
    enabled: true,
    description: "Direct engineering blog URLs and RSS feeds for corporate tech teams.",
  },
]);

export function getEnrichmentEntry(id: string): EnrichmentCatalogEntry | undefined {
  return ENRICHMENT_CATALOG.find((e) => e.id === id);
}
