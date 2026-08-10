export type RegionCode =
  | "US"
  | "DE"
  | "FR"
  | "TN"
  | "UK"
  | "ES"
  | "JP"
  | "CH"
  | "NL"
  | "UAE"
  | "INTL";

export interface RegionalRules {
  region: RegionCode;
  name: string;
  pageLimit: number;
  photoRequired: boolean;
  photoAllowed: boolean;
  includeDateLocationLine: boolean;
  salutationFormat: string;
  closingFormat: string;
  mandatorySections: string[];
  restrictedFields: string[];
  recommendedTemplate: string;
  letterKind: "cover_letter" | "motivation_letter";
}

export const REGIONAL_RULES_DATA: Record<RegionCode, RegionalRules> = {
  US: {
    region: "US",
    name: "United States & Canada",
    pageLimit: 1,
    photoRequired: false,
    photoAllowed: false,
    includeDateLocationLine: false,
    salutationFormat: "Dear Hiring Manager,",
    closingFormat: "Sincerely,",
    mandatorySections: ["Experience", "Education", "Skills"],
    restrictedFields: ["photo", "age", "marital_status", "nationality", "gender"],
    recommendedTemplate: "classic-ats",
    letterKind: "cover_letter",
  },
  DE: {
    region: "DE",
    name: "Germany / DACH (Tabellarischer Lebenslauf)",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: true,
    salutationFormat: "Sehr geehrte Damen und Herren,",
    closingFormat: "Mit freundlichen Grüßen,",
    mandatorySections: ["Berufserfahrung", "Ausbildung", "Kenntnisse", "Sprachen"],
    restrictedFields: [],
    recommendedTemplate: "tabular-german",
    letterKind: "motivation_letter",
  },
  FR: {
    region: "FR",
    name: "France (CV & Lettre de Motivation)",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: true,
    salutationFormat: "Madame, Monsieur,",
    closingFormat: "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
    mandatorySections: ["Expérience Professionnelle", "Formation", "Compétences", "Langues"],
    restrictedFields: [],
    recommendedTemplate: "modern-french",
    letterKind: "motivation_letter",
  },
  TN: {
    region: "TN",
    name: "Tunisia & North Africa (Bilingual)",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: true,
    salutationFormat: "Dear Hiring Team / Madame, Monsieur,",
    closingFormat: "Best regards / Cordialement,",
    mandatorySections: ["Experience / Expérience", "Education / Formation", "Technical Skills / Compétences", "Certifications", "Languages / Langues"],
    restrictedFields: [],
    recommendedTemplate: "modern-professional",
    letterKind: "motivation_letter",
  },
  UK: {
    region: "UK",
    name: "United Kingdom & Australia",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: false,
    includeDateLocationLine: false,
    salutationFormat: "Dear [Hiring Manager / Team],",
    closingFormat: "Yours sincerely,",
    mandatorySections: ["Profile Summary", "Key Achievements", "Professional Experience", "Education", "References"],
    restrictedFields: ["photo", "age", "marital_status"],
    recommendedTemplate: "modern-professional",
    letterKind: "cover_letter",
  },
  ES: {
    region: "ES",
    name: "Spain & LATAM",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: true,
    salutationFormat: "Estimado/a Responsables de Selección,",
    closingFormat: "Atentamente,",
    mandatorySections: ["Experiencia Profesional", "Educación", "Habilidades Tecnológicas", "Idiomas"],
    restrictedFields: [],
    recommendedTemplate: "modern-professional",
    letterKind: "cover_letter",
  },
  JP: {
    region: "JP",
    name: "Japan (Rirekisho / Shokumukaryekisho)",
    pageLimit: 2,
    photoRequired: true,
    photoAllowed: true,
    includeDateLocationLine: true,
    salutationFormat: "拝啓 (Dear Hiring Officer),",
    closingFormat: "敬具 (Yours Respectfully),",
    mandatorySections: ["職務要約 (Summary)", "職務経歴 (Work History)", "活かせる経験・知識・技術 (Skills)", "資格 (Certifications)"],
    restrictedFields: [],
    recommendedTemplate: "classic-ats",
    letterKind: "motivation_letter",
  },
  CH: {
    region: "CH",
    name: "Switzerland (Multilingual)",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: true,
    salutationFormat: "Dear Hiring Committee / Sehr geehrte Damen und Herren,",
    closingFormat: "Kind regards / Mit freundlichen Grüßen,",
    mandatorySections: ["Experience", "Education", "Language Skills (CEFR)", "Permit / Work Status"],
    restrictedFields: [],
    recommendedTemplate: "modern-professional",
    letterKind: "motivation_letter",
  },
  NL: {
    region: "NL",
    name: "Netherlands & Nordics",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: false,
    salutationFormat: "Beste Recruitment Team / Dear Hiring Team,",
    closingFormat: "Met vriendelijke groet / Best regards,",
    mandatorySections: ["Work Experience", "Education", "Skills", "Personal Projects & Initiatives"],
    restrictedFields: [],
    recommendedTemplate: "nordic-clean",
    letterKind: "cover_letter",
  },
  UAE: {
    region: "UAE",
    name: "UAE & Gulf (GCC)",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: false,
    salutationFormat: "Dear Hiring Committee / Manager,",
    closingFormat: "Warm regards,",
    mandatorySections: ["Executive Summary", "Core Competencies", "Work Experience", "Education & Credentials", "Visa & Contact Details"],
    restrictedFields: [],
    recommendedTemplate: "executive-serif",
    letterKind: "cover_letter",
  },
  INTL: {
    region: "INTL",
    name: "Global Remote Standard",
    pageLimit: 2,
    photoRequired: false,
    photoAllowed: true,
    includeDateLocationLine: false,
    salutationFormat: "Hi [Hiring Team],",
    closingFormat: "Best regards,",
    mandatorySections: ["Remote Skills & Stack", "Work History", "Key Projects", "Education", "Links & Portfolio"],
    restrictedFields: [],
    recommendedTemplate: "creative-sidebar",
    letterKind: "cover_letter",
  },
};

export function getRegionalRules(region: RegionCode): RegionalRules {
  return REGIONAL_RULES_DATA[region] || REGIONAL_RULES_DATA.US;
}

export interface ComplianceCheckResult {
  passed: boolean;
  score: number;
  warnings: string[];
  recommendations: string[];
}

export function auditRegionalCompliance(
  resumeText: string,
  region: RegionCode
): ComplianceCheckResult {
  const rules = getRegionalRules(region);
  const warnings: string[] = [];
  const recommendations: string[] = [];
  let score = 100;

  if (rules.restrictedFields.includes("photo") && /photo|photograph|picture/i.test(resumeText)) {
    warnings.push(`Region ${region} strictly advises against photos to comply with anti-discrimination laws.`);
    score -= 15;
  }
  if (rules.restrictedFields.includes("age") && /date of birth|dob|age:\s*\d+/i.test(resumeText)) {
    warnings.push(`Region ${region} discourages disclosing age or date of birth.`);
    score -= 10;
  }
  if (rules.includeDateLocationLine && !/date:|location:|ort:|datum:/i.test(resumeText)) {
    recommendations.push(`Region ${region} standard practice expects a date and location line.`);
    score -= 5;
  }

  return {
    passed: score >= 80,
    score: Math.max(0, score),
    warnings,
    recommendations,
  };
}
