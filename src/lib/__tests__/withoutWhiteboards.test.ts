import { describe, it, expect } from "vitest";
import {
  HIRING_WITHOUT_WHITEBOARDS_COMPANIES,
  getWhiteboardFreeAtsBoards,
  searchWhiteboardFreeCompanies,
} from "../data/hiringWithoutWhiteboards";

describe("Hiring Without Whiteboards Catalog & Ingestion", () => {
  it("contains verified companies with non-whiteboard interview styles", () => {
    expect(HIRING_WITHOUT_WHITEBOARDS_COMPANIES.length).toBeGreaterThanOrEqual(10);
    const gitlab = HIRING_WITHOUT_WHITEBOARDS_COMPANIES.find((c) => c.name === "GitLab");
    expect(gitlab).toBeDefined();
    expect(gitlab?.atsProvider).toBe("greenhouse");
    expect(gitlab?.interviewStyle).toContain("handbook");
  });

  it("extracts ATS-compatible boards for direct JSON API crawling", () => {
    const boards = getWhiteboardFreeAtsBoards();
    expect(boards.length).toBeGreaterThan(5);
    expect(boards.some((b) => b.token === "gitlab")).toBe(true);
    expect(boards.some((b) => b.token === "linear")).toBe(true);
    expect(boards.some((b) => b.token === "supabase")).toBe(true);
  });

  it("searches companies by name or region", () => {
    const results = searchWhiteboardFreeCompanies("europe");
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.regions.includes("europe"))).toBe(true);
  });
});
