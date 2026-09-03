import { describe, it, expect } from "vitest";
import { calculatePppCompensation } from "../salaryPpp";

describe("Purchasing Power Parity (PPP) & Net Pay Calculator", () => {
  it("calculates US baseline salary with standard tax estimate", () => {
    const res = calculatePppCompensation("$150,000 - $180,000 USD", "US");

    expect(res.currency).toBe("USD");
    expect(res.minGrossLocal).toBe(150000);
    expect(res.maxGrossLocal).toBe(180000);
    expect(res.minNetLocal).toBe(Math.round(150000 * 0.72));
    expect(res.pppConversionFactor).toBe(1.0);
    expect(res.minGrossPppUsd).toBe(150000);
  });

  it("normalizes German EUR compensation with DACH tax bracket and PPP factor", () => {
    const res = calculatePppCompensation("€90,000 - €110,000", "DE");

    expect(res.currency).toBe("EUR");
    expect(res.minGrossLocal).toBe(90000);
    expect(res.maxGrossLocal).toBe(110000);
    expect(res.estimatedTaxRate).toBe(0.42);
    expect(res.minGrossPppUsd).toBeGreaterThan(90000); // 90k / 0.92 ~ 97.8k USD purchasing power
  });

  it("handles UAE tax-free income calculation correctly", () => {
    const res = calculatePppCompensation("400,000 - 500,000 AED", "UAE");

    expect(res.currency).toBe("AED");
    expect(res.estimatedTaxRate).toBe(0.0);
    expect(res.minNetLocal).toBe(400000);
    expect(res.maxNetLocal).toBe(500000);
  });
});
