/**
 * Purchasing Power Parity (PPP) & Net Take-Home Calculator — Huntflow Agent Hardening
 *
 * Normalizes multi-currency compensation to USD purchasing power equivalents
 * and computes estimated net take-home pay based on regional tax brackets.
 */

export interface PppSalaryResult {
  currency: string;
  rawRange: string;
  minGrossLocal: number;
  maxGrossLocal: number;
  minNetLocal: number;
  maxNetLocal: number;
  pppConversionFactor: number;
  minGrossPppUsd: number;
  maxGrossPppUsd: number;
  estimatedTaxRate: number;
  formattedSummary: string;
}

// World Bank PPP conversion factors relative to USD (1.0 = US baseline)
const PPP_FACTORS: Record<string, { factor: number; currency: string; avgTaxRate: number }> = {
  US: { factor: 1.0, currency: "USD", avgTaxRate: 0.28 },
  CA: { factor: 0.85, currency: "CAD", avgTaxRate: 0.32 },
  DE: { factor: 0.92, currency: "EUR", avgTaxRate: 0.42 },
  FR: { factor: 0.88, currency: "EUR", avgTaxRate: 0.38 },
  UK: { factor: 0.95, currency: "GBP", avgTaxRate: 0.33 },
  NL: { factor: 0.94, currency: "EUR", avgTaxRate: 0.39 },
  CH: { factor: 1.25, currency: "CHF", avgTaxRate: 0.22 },
  TN: { factor: 0.35, currency: "TND", avgTaxRate: 0.25 },
  EG: { factor: 0.28, currency: "EGP", avgTaxRate: 0.22 },
  AE: { factor: 0.65, currency: "AED", avgTaxRate: 0.0 },
  UAE: { factor: 0.65, currency: "AED", avgTaxRate: 0.0 },
  GCC: { factor: 0.65, currency: "AED", avgTaxRate: 0.0 },
  SA: { factor: 0.62, currency: "SAR", avgTaxRate: 0.0 },
  AU: { factor: 0.88, currency: "AUD", avgTaxRate: 0.32 },
  SG: { factor: 1.05, currency: "SGD", avgTaxRate: 0.15 },
  JP: { factor: 0.78, currency: "JPY", avgTaxRate: 0.33 },
  IN: { factor: 0.32, currency: "INR", avgTaxRate: 0.30 },
  BR: { factor: 0.42, currency: "BRL", avgTaxRate: 0.27 },
  MX: { factor: 0.45, currency: "MXN", avgTaxRate: 0.30 },
  NG: { factor: 0.28, currency: "NGN", avgTaxRate: 0.24 },
  KE: { factor: 0.30, currency: "KES", avgTaxRate: 0.30 },
  ZA: { factor: 0.48, currency: "ZAR", avgTaxRate: 0.31 },
  ES: { factor: 0.85, currency: "EUR", avgTaxRate: 0.38 },
  INTL: { factor: 1.0, currency: "USD", avgTaxRate: 0.25 },
};

function extractMinMaxSalary(raw: string): { min: number; max: number } {
  const matches = raw.match(/\d[\d,]*(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return { min: 0, max: 0 };
  const nums = matches.map((m) => Number(m.replace(/,/g, ""))).filter(Number.isFinite);

  if (nums.length === 1) {
    let val = nums[0];
    if (/k\b/i.test(raw) && val < 1000) val *= 1000;
    return { min: val, max: val };
  }

  let min = Math.min(...nums);
  let max = Math.max(...nums);
  if (/k\b/i.test(raw)) {
    if (min < 1000) min *= 1000;
    if (max < 1000) max *= 1000;
  }
  return { min, max };
}

export function calculatePppCompensation(rawSalary: string, regionCode: string = "US"): PppSalaryResult {
  const reg = regionCode.toUpperCase();
  const config = PPP_FACTORS[reg] || PPP_FACTORS.US;
  const { min, max } = extractMinMaxSalary(rawSalary);

  const taxRate = config.avgTaxRate;
  const minNet = Math.round(min * (1 - taxRate));
  const maxNet = Math.round(max * (1 - taxRate));

  // PPP Conversion: local value / factor gives USD equivalent purchasing power
  const minPpp = Math.round(min / config.factor);
  const maxPpp = Math.round(max / config.factor);

  const formattedSummary = min > 0
    ? `${config.currency} ${min.toLocaleString()} - ${max.toLocaleString()} (Est. Net: ${config.currency} ${minNet.toLocaleString()} - ${maxNet.toLocaleString()} | PPP ~ $${minPpp.toLocaleString()} - $${maxPpp.toLocaleString()} USD)`
    : "Compensation not specified";

  return {
    currency: config.currency,
    rawRange: rawSalary,
    minGrossLocal: min,
    maxGrossLocal: max,
    minNetLocal: minNet,
    maxNetLocal: maxNet,
    pppConversionFactor: config.factor,
    minGrossPppUsd: minPpp,
    maxGrossPppUsd: maxPpp,
    estimatedTaxRate: taxRate,
    formattedSummary,
  };
}
