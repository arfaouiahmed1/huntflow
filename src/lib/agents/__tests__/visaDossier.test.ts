import { describe, it, expect } from "vitest";
import { generateRelocationVisaDossier } from "../visaDossier";

describe("Relocation & Visa Paperwork Dossier", () => {
  it("generates German dossier with EU Blue Card threshold and 6-month probation notice", () => {
    const dossier = generateRelocationVisaDossier("DE", "Senior Java Engineer");

    expect(dossier.regionCode).toBe("DE");
    expect(dossier.countryName).toBe("Germany");
    expect(dossier.employmentLawHighlights.standardProbationMonths).toBe(6);

    const blueCard = dossier.pathways.find((p) => p.name.includes("Blue Card"));
    expect(blueCard).toBeDefined();
    expect(blueCard?.salaryThreshold).toContain("€45,300");
    expect(blueCard?.requiredDocuments.length).toBeGreaterThan(0);
    expect(dossier.caveatsAndDisclaimers.some((c) => c.includes("Not formal legal advice"))).toBe(true);
  });

  it("generates US dossier with H-1B, O-1, and at-will employment notes", () => {
    const dossier = generateRelocationVisaDossier("US", "Staff AI Engineer");

    expect(dossier.regionCode).toBe("US");
    expect(dossier.employmentLawHighlights.noticePeriodNorms).toContain("At-will");
    expect(dossier.pathways.some((p) => p.name.includes("H-1B"))).toBe(true);
    expect(dossier.pathways.some((p) => p.name.includes("O-1A"))).toBe(true);
  });

  it("generates UAE dossier with Golden Visa threshold and 0% tax realities", () => {
    const dossier = generateRelocationVisaDossier("UAE", "Lead Cloud Architect");

    expect(dossier.regionCode).toBe("UAE");
    const golden = dossier.pathways.find((p) => p.name.includes("Golden Visa"));
    expect(golden).toBeDefined();
    expect(golden?.salaryThreshold).toContain("30,000");
    expect(dossier.caveatsAndDisclaimers.some((c) => c.includes("0% individual income tax"))).toBe(true);
  });
});
