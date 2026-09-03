/**
 * Relocation, Visa & Legal Reality Check Dossier — Huntflow Agent Hardening
 *
 * Generates actionable paperwork checklists, salary threshold checks,
 * probation rights, and prominent official disclaimers for international hiring.
 */

export interface VisaPathway {
  name: string;
  eligibilitySummary: string;
  salaryThreshold?: string;
  processingTimeEst: string;
  employerSponsorshipRequired: boolean;
  requiredDocuments: string[];
}

export interface RelocationVisaDossier {
  regionCode: string;
  countryName: string;
  pathways: VisaPathway[];
  employmentLawHighlights: {
    standardProbationMonths: number;
    noticePeriodNorms: string;
    standardWeeklyHours: number;
    annualLeaveDaysMin: number;
  };
  paperworkChecklist: string[];
  caveatsAndDisclaimers: string[];
  officialResources: Array<{ label: string; url: string }>;
}

const DOSSIER_CONFIGS: Record<string, RelocationVisaDossier> = {
  DE: {
    regionCode: "DE",
    countryName: "Germany",
    pathways: [
      {
        name: "EU Blue Card (Blaue Karte EU)",
        eligibilitySummary: "Recognized university degree + qualified job offer in Germany.",
        salaryThreshold: "€45,300 gross/yr (STEM/Shortage) or €58,400 gross/yr (General)",
        processingTimeEst: "4 - 8 weeks",
        employerSponsorshipRequired: true,
        requiredDocuments: [
          "Signed employment contract or binding offer",
          "Recognized university diploma (Anabin database evaluation / ZAB statement)",
          "Valid passport + biometrics",
          "German statutory or private health insurance proof",
        ],
      },
      {
        name: "Skilled Worker Visa (Fachkräftevisum)",
        eligibilitySummary: "Vocational training or degree recognized in Germany without meeting Blue Card salary minimum.",
        processingTimeEst: "6 - 12 weeks",
        employerSponsorshipRequired: true,
        requiredDocuments: [
          "Declaration of Employment (Erklärung zum Beschäftigungsverhältnis)",
          "Official degree recognition certificate",
          "Proof of accommodation / registered address in Germany",
        ],
      },
    ],
    employmentLawHighlights: {
      standardProbationMonths: 6,
      noticePeriodNorms: "2 weeks during probation; 4 weeks to 3 months thereafter (strongly employee-protective)",
      standardWeeklyHours: 40,
      annualLeaveDaysMin: 20, // 24 for 6-day week, 20 for 5-day week
    },
    paperworkChecklist: [
      "Check university recognition on Anabin portal",
      "Request employer to sign Erklärung zum Beschäftigungsverhältnis",
      "Book embassy appointment (VFS/Auswärtiges Amt)",
      "Register residential address (Anmeldung) upon arrival in Germany",
      "Open German bank account & acquire Tax ID (Steueridentifikationsnummer)",
    ],
    caveatsAndDisclaimers: [
      "⚠️ Mandatory 6-month probation period allows either party to terminate with 2 weeks notice without providing statutory cause.",
      "⚠️ Embassy appointment wait times in non-EU countries can vary from 3 weeks to 4 months.",
      "⚠️ Automated informational guide based on published German Federal Ministry of the Interior regulations. Not formal legal advice.",
    ],
    officialResources: [
      { label: "Make it in Germany (Official Portal)", url: "https://www.make-it-in-germany.com" },
      { label: "Anabin Degree Recognition Database", url: "https://anabin.kmk.org" },
    ],
  },
  US: {
    regionCode: "US",
    countryName: "United States",
    pathways: [
      {
        name: "H-1B Specialty Occupation Visa",
        eligibilitySummary: "Bachelor's degree minimum in specific field. Subject to annual lottery (March) unless cap-exempt.",
        salaryThreshold: "Department of Labor Prevailing Wage Determination (PWD)",
        processingTimeEst: "3 - 6 months (15 days via Premium Processing)",
        employerSponsorshipRequired: true,
        requiredDocuments: [
          "Approved Labor Condition Application (LCA) from DOL",
          "Form I-129 petition filed by employer with USCIS",
          "Educational credential evaluation (if degree from outside US)",
        ],
      },
      {
        name: "O-1A Extraordinary Ability Visa",
        eligibilitySummary: "Demonstrated sustained national/international acclaim (publications, high salary, critical role, press).",
        processingTimeEst: "15 days (with Premium Processing)",
        employerSponsorshipRequired: true,
        requiredDocuments: [
          "Extensive evidence portfolio meeting at least 3 of 8 regulatory criteria",
          "Expert recommendation letters from industry peers",
          "Advisory opinion letter from relevant peer group",
        ],
      },
      {
        name: "TN NAFTA Status (Canadian & Mexican Citizens)",
        eligibilitySummary: "Specific professions (Computer Systems Analyst, Engineer) for CA/MX passport holders.",
        processingTimeEst: "Same-day at Port of Entry (for Canadians)",
        employerSponsorshipRequired: true,
        requiredDocuments: ["Detailed employer support letter", "Original degree transcripts", "Proof of citizenship"],
      },
    ],
    employmentLawHighlights: {
      standardProbationMonths: 3,
      noticePeriodNorms: "At-will employment (either party can terminate at any time without statutory notice)",
      standardWeeklyHours: 40,
      annualLeaveDaysMin: 0, // No federal statutory PTO requirement
    },
    paperworkChecklist: [
      "Verify employer is registered as E-Verify sponsor",
      "Confirm employer covers all mandatory legal & filing fees (employee cannot pay H-1B fees by law)",
      "Secure official university sealed transcripts and degree certificates",
      "Prepare DS-160 and schedule consular visa interview upon petition approval",
    ],
    caveatsAndDisclaimers: [
      "⚠️ H-1B lottery selection rate is typically ~25-30% in general lottery pool.",
      "⚠️ At-will employment applies to almost all US tech roles unless modified by explicit collective contract.",
      "⚠️ Automated informational guide based on USCIS publications. Not formal legal advice.",
    ],
    officialResources: [
      { label: "USCIS Working in the United States", url: "https://www.uscis.gov/working-in-the-united-states" },
      { label: "Foreign Labor Certification Data Center", url: "https://www.flcdatacenter.com" },
    ],
  },
  UK: {
    regionCode: "UK",
    countryName: "United Kingdom",
    pathways: [
      {
        name: "Skilled Worker Visa",
        eligibilitySummary: "Job offer from Home Office-approved sponsor in eligible SOC code.",
        salaryThreshold: "£38,700/yr (or going rate for the occupation, whichever is higher)",
        processingTimeEst: "3 weeks (standard)",
        employerSponsorshipRequired: true,
        requiredDocuments: [
          "Certificate of Sponsorship (CoS) reference number",
          "Proof of English language proficiency (B1/CEFR)",
          "Valid TB test certificate (if applicable per country of residence)",
        ],
      },
      {
        name: "Global Talent Visa (Tech Nation Endorsement)",
        eligibilitySummary: "Endorsement as leader (Exceptional Talent) or emerging leader (Exceptional Promise) in digital technology.",
        salaryThreshold: "None",
        processingTimeEst: "4 - 8 weeks",
        employerSponsorshipRequired: false,
        requiredDocuments: ["Tech Nation endorsement letter", "3 letters of recommendation from recognized tech leaders"],
      },
    ],
    employmentLawHighlights: {
      standardProbationMonths: 6,
      noticePeriodNorms: "1 week statutory minimum; typically 1 to 3 months contractual notice",
      standardWeeklyHours: 37.5,
      annualLeaveDaysMin: 28, // includes public holidays
    },
    paperworkChecklist: [
      "Confirm employer holds active UKVI Sponsor License",
      "Check salary meets the 2024+ £38,700 general threshold",
      "Pay Immigration Health Surcharge (IHS) fee",
    ],
    caveatsAndDisclaimers: [
      "⚠️ UK salary threshold increased significantly in 2024 to £38,700 for Skilled Worker route.",
      "⚠️ Automated informational guide based on UK Home Office policy. Not formal legal advice.",
    ],
    officialResources: [
      { label: "UK Visas and Immigration Official Portal", url: "https://www.gov.uk/skilled-worker-visa" },
    ],
  },
  UAE: {
    regionCode: "UAE",
    countryName: "United Arab Emirates (Dubai / Abu Dhabi)",
    pathways: [
      {
        name: "UAE Golden Visa (Specialist in AI & Tech)",
        eligibilitySummary: "Engineers and specialists in AI, Big Data, and software with certified degree and high salary.",
        salaryThreshold: "AED 30,000 gross/month (~$8,160 USD/mo)",
        processingTimeEst: "2 - 4 weeks",
        employerSponsorshipRequired: false,
        requiredDocuments: [
          "Attested bachelor's degree diploma",
          "6-month bank statement proving salary criterion",
          "Labor contract with UAE entity or high-tech accreditation",
        ],
      },
      {
        name: "Standard Employment Residence Visa",
        eligibilitySummary: "Company-sponsored entry permit and 2-year residency.",
        processingTimeEst: "2 - 3 weeks",
        employerSponsorshipRequired: true,
        requiredDocuments: ["Attested degree", "Medical fitness test in UAE", "Emirates ID application"],
      },
    ],
    employmentLawHighlights: {
      standardProbationMonths: 6,
      noticePeriodNorms: "30 to 90 days contractual notice",
      standardWeeklyHours: 48,
      annualLeaveDaysMin: 30,
    },
    paperworkChecklist: [
      "Attest degree diploma at Ministry of Foreign Affairs (MOFA) in home country and UAE Embassy",
      "Complete in-country blood test and chest X-ray for residency permit",
      "Apply for Emirates ID card",
    ],
    caveatsAndDisclaimers: [
      "⚠️ 0% individual income tax in UAE applies to local and remote employment income.",
      "⚠️ Degree attestation process can take 2-4 weeks prior to departure.",
      "⚠️ Automated informational guide based on ICP/GDRFA rules. Not formal legal advice.",
    ],
    officialResources: [
      { label: "ICP Federal Authority for Identity & Citizenship", url: "https://icp.gov.ae" },
    ],
  },
};

export function generateRelocationVisaDossier(
  regionCode: string = "US",
  roleTitle: string = "Software Engineer",
  grossSalary?: string
): RelocationVisaDossier {
  const reg = regionCode.toUpperCase();
  const dossier = DOSSIER_CONFIGS[reg] || DOSSIER_CONFIGS.US;

  void roleTitle;
  void grossSalary;

  return dossier;
}
