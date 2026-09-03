/**
 * Adversarial Offer & Employment Contract Scanner — Huntflow Agent Hardening (Phase 2)
 *
 * Scans offer letters and employment agreements for restrictive clauses, IP ownership traps,
 * non-compete overreach, equity cliff pitfalls, and produces counter-offer negotiation scripts.
 */

export type ContractRiskLevel = "low" | "medium" | "high" | "critical";

export interface ContractFinding {
  id: string;
  category: "ip_assignment" | "non_compete" | "equity_cliff" | "bonus_clawback" | "termination_probation";
  title: string;
  riskLevel: ContractRiskLevel;
  extractedSnippet: string;
  explanation: string;
  suggestedCounterClause: string;
}

export interface ContractScanReport {
  overallRiskScore: number; // 0 (clean) to 100 (highly restrictive)
  riskLevel: ContractRiskLevel;
  findings: ContractFinding[];
  counterOfferScripts: {
    ipClauseAdjustment: string;
    compensationCounter?: string;
    nonCompeteCarveOut?: string;
  };
  summary: string;
}

export function scanEmploymentContract(contractText: string): ContractScanReport {
  const text = contractText.toLowerCase();
  const findings: ContractFinding[] = [];
  let score = 10; // baseline

  // 1. IP Assignment & Moonlighting Overreach
  if (
    /all\s+(inventions|intellectual\s+property|works)\s+(created|authored|developed)\s+(during|throughout)\s+(employment|term)/i.test(contractText) ||
    /whether\s+or\s+not\s+(during\s+working\s+hours|on\s+company\s+premises|using\s+company\s+equipment)/i.test(contractText)
  ) {
    score += 30;
    findings.push({
      id: "find_ip_overreach",
      category: "ip_assignment",
      title: "Overbroad IP Assignment (Weekend / Personal Project Risk)",
      riskLevel: "critical",
      extractedSnippet: "All inventions developed whether or not during working hours or using company equipment...",
      explanation: "Clause claims ownership over projects built on your personal time, outside working hours, and without company resources.",
      suggestedCounterClause: "Exclude inventions developed entirely on employee's personal time without use of company equipment, supplies, or trade secret information.",
    });
  }

  // 2. Non-Compete Clauses
  if (
    /non-?compete|(shall|agrees?\s+to|agrees?)\s+not\s+(to\s+)?(engage\s+in|work\s+for|render\s+services\s+to)\s+any\s+(competing|similar)\s+business/i.test(
      contractText
    )
  ) {
    const isOver1Year = /12\s*months|1\s*year|2\s*years|24\s*months/i.test(contractText);
    const riskLevel: ContractRiskLevel = isOver1Year ? "high" : "medium";
    score += isOver1Year ? 25 : 15;

    findings.push({
      id: "find_non_compete",
      category: "non_compete",
      title: "Restrictive Non-Compete Covenant",
      riskLevel,
      extractedSnippet: "Employee agrees not to render services to any competing business for a period of...",
      explanation: "Restricts your ability to work for industry peers post-employment. Check local state/national enforceability (e.g. FTC rules in US, mandatory garden leave compensation in Germany).",
      suggestedCounterClause: "Narrow to direct key competitors named in an explicit schedule, or limit strictly to non-solicitation of clients and staff.",
    });
  }

  // 3. Equity Vesting & Exercise Window Traps
  if (/options|equity|rsus|vesting/i.test(text)) {
    if (/90\s*days\s+(following|after)\s+termination/i.test(text) || /exercise\s+period\s+of\s+90\s*days/i.test(text)) {
      score += 20;
      findings.push({
        id: "find_equity_short_exercise",
        category: "equity_cliff",
        title: "PTE Window Trap (90-Day Post-Termination Exercise)",
        riskLevel: "high",
        extractedSnippet: "Stock options must be exercised within 90 days of termination...",
        explanation: "Forces you to purchase vested options within 90 days of leaving or forfeit equity, creating large unexpected tax burdens.",
        suggestedCounterClause: "Request an extended post-termination exercise window (PTEW) of 7 to 10 years for vested options.",
      });
    }
  }

  // 4. Bonus Clawbacks
  if (
    (/clawback|repaid|repay|reimburse|reimbursement/i.test(text) && /bonus|relocation|signing/i.test(text)) ||
    /signing\s+bonus[^\n]{0,120}repaid/i.test(text)
  ) {
    const isTwoYears = /24\s*months|2\s*years/i.test(text);
    score += isTwoYears ? 15 : 10;
    findings.push({
      id: "find_clawback",
      category: "bonus_clawback",
      title: "Bonus Repayment Clawback Window",
      riskLevel: isTwoYears ? "medium" : "low",
      extractedSnippet: "Signing bonus must be repaid in full if employment terminates within 24 months...",
      explanation: "Full repayment requirement without pro-rated monthly vesting locks you into the role.",
      suggestedCounterClause: "Make clawback pro-rated monthly (1/12th or 1/24th forgiven per month worked) and void upon termination without cause.",
    });
  }

  // Final score clamping
  const finalScore = Math.min(100, Math.max(10, score));
  const overallRisk: ContractRiskLevel =
    finalScore >= 70 ? "critical" : finalScore >= 45 ? "high" : finalScore >= 25 ? "medium" : "low";

  const counterScripts = {
    ipClauseAdjustment:
      "I would like to ensure that inventions created entirely on my own time without using company equipment or confidential information remain excluded from the standard IP assignment, per standard industry practice.",
    compensationCounter:
      "Based on current market benchmarks for this seniority level and scope, I am requesting a base adjustment to $X and standard monthly pro-rata vesting for the signing bonus.",
    nonCompeteCarveOut:
      "I propose narrowing the non-compete covenant to direct competitors listed in a mutual schedule, or replacing it with standard non-solicitation of clients and employees.",
  };

  return {
    overallRiskScore: finalScore,
    riskLevel: overallRisk,
    findings,
    counterOfferScripts: counterScripts,
    summary:
      findings.length > 0
        ? `Identified ${findings.length} notable clause(s) requiring review (Overall Risk: ${overallRisk.toUpperCase()}).`
        : "Contract looks standard with no high-risk IP or non-compete anomalies detected.",
  };
}
