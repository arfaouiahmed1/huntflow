import { describe, it, expect } from "vitest";
import { scanEmploymentContract } from "../contractScanner";

describe("Adversarial Contract & Offer Letter Scanner", () => {
  it("flags overbroad IP assignment claiming personal weekend projects", () => {
    const text = `
      All inventions, intellectual property, and works authored or developed during employment,
      whether or not during working hours or using company equipment, shall belong exclusively to the Company.
    `;

    const report = scanEmploymentContract(text);
    expect(report.overallRiskScore).toBeGreaterThanOrEqual(40);
    const ipFinding = report.findings.find((f) => f.category === "ip_assignment");
    expect(ipFinding).toBeDefined();
    expect(ipFinding?.riskLevel).toBe("critical");
    expect(ipFinding?.suggestedCounterClause).toContain("personal time");
  });

  it("flags 24-month non-compete and signing bonus clawbacks", () => {
    const text = `
      Employee agrees not to render services to any competing business for a period of 24 months following termination.
      The signing bonus of $20,000 must be repaid in full if employment terminates within 24 months.
    `;

    const report = scanEmploymentContract(text);
    expect(report.findings.some((f) => f.category === "non_compete")).toBe(true);
    expect(report.findings.some((f) => f.category === "bonus_clawback")).toBe(true);
    expect(report.counterOfferScripts.nonCompeteCarveOut).toBeDefined();
  });

  it("reports clean low risk for standard benign offer letters", () => {
    const text = `
      We are pleased to offer you the position of Staff Frontend Engineer at Acme Corp with an annual base salary of $180,000.
      Standard health, dental, and 401k benefits apply. Employment is at-will.
    `;

    const report = scanEmploymentContract(text);
    expect(report.riskLevel).toBe("low");
    expect(report.findings.length).toBe(0);
  });
});
