import { ResumeDocKind } from "@/types";

export interface ResumeTemplateMeta {
  id: string;
  name: string;
  description: string;
  recommendationReason: string;
  recommendedFor: string[];
  fontFamily: string;
  /** 100 = maximally ATS-safe (single column, standard headers, no tables). */
  atsScore: number;
  kinds: ResumeDocKind[];
  fileName: string;
}

export const RESUME_TEMPLATES: ResumeTemplateMeta[] = [
  {
    id: "classic-ats",
    name: "Classic LaTeX ATS",
    description: "A restrained single-column resume set in Latin Modern Roman with standard headings and linear reading order.",
    recommendationReason: "Recommended for US, UK, and global applications that prioritize conventional typography and reliable text extraction.",
    recommendedFor: ["US / Global Tech", "ATS Parsing Priority", "Engineering & Dev"],
    fontFamily: "Latin Modern Roman (LaTeX standard)",
    atsScore: 98,
    kinds: ["resume", "cv"],
    fileName: "classic-ats.tex",
  },
  {
    id: "modern-professional",
    name: "Modern Professional",
    description: "Clean two-tone headers with sharp modern geometry. Highly readable and fully parseable.",
    recommendationReason: "Recommended for Senior Engineers, Product Managers, and tech roles wanting subtle contemporary flair.",
    recommendedFor: ["Senior ICs", "Product & Design", "Modern Tech Companies"],
    fontFamily: "Latin Modern Sans",
    atsScore: 95,
    kinds: ["resume", "cv"],
    fileName: "modern-professional.tex",
  },
  {
    id: "executive",
    name: "Executive Serif",
    description: "Traditional serif styling for executive, VP, and director candidates. Refined rules.",
    recommendationReason: "Recommended for Director, VP, and Leadership candidates seeking an authoritative, elegant serif tone.",
    recommendedFor: ["Leadership", "Executive / VP", "Finance & Management"],
    fontFamily: "Times New Roman / MathPTMX (Serif)",
    atsScore: 95,
    kinds: ["resume", "cv"],
    fileName: "executive.tex",
  },
  {
    id: "tabular-german",
    name: "German Tabellarischer",
    description: "Strict two-column tabular format expected in DACH (Germany, Austria, Switzerland) markets.",
    recommendationReason: "Mandatory standard for DACH (Germany, Austria, Switzerland) applications requiring tabular chronologies.",
    recommendedFor: ["DACH Region", "Germany / Austria / Swiss", "Tabellarischer Lebenslauf"],
    fontFamily: "Latin Modern Sans (DIN Compatible)",
    atsScore: 90,
    kinds: ["cv"],
    fileName: "tabular-german.tex",
  },
  {
    id: "modern-french",
    name: "French Professional",
    description: "Formal French CV format with target title banner and structured competencies grid.",
    recommendationReason: "Recommended for French and Francophone enterprise & agency job markets.",
    recommendedFor: ["France / Benelux", "Francophone Markets", "Consulting"],
    fontFamily: "Latin Modern Sans",
    atsScore: 90,
    kinds: ["cv"],
    fileName: "modern-french.tex",
  },
  {
    id: "mena-cv",
    name: "MENA & Tunisia Bilingual CV",
    description: "Tunisian and MENA-region bilingual format featuring standard English and French metadata headers.",
    recommendationReason: "Recommended for Tunisia and MENA engineering candidates applying to local and regional tech hubs.",
    recommendedFor: ["Tunisia / MENA", "Bilingual Tech Roles", "Local & Regional Hubs"],
    fontFamily: "Latin Modern Sans",
    atsScore: 95,
    kinds: ["cv", "resume"],
    fileName: "mena-cv.tex",
  },
  {
    id: "nordic-clean",
    name: "Nordic Clean",
    description: "Generous whitespace, quiet typography, and slate accents for Scandinavian and modern European teams.",
    recommendationReason: "Recommended for Scandinavian, Dutch, and European remote roles valuing minimalism and modern UI.",
    recommendedFor: ["Nordics / Netherlands", "Remote European Teams", "Design & UX"],
    fontFamily: "Latin Modern Sans",
    atsScore: 95,
    kinds: ["cv", "resume"],
    fileName: "nordic-clean.tex",
  },
  {
    id: "creative-sidebar",
    name: "Creative Sidebar",
    description: "Left rail for skills and contact, wide column for experience. Bold styling.",
    recommendationReason: "Recommended for Creative Technologists, UX Engineers, and Front-end Specialists.",
    recommendedFor: ["Design Technologists", "Creative & UI", "Portfolio Showcases"],
    fontFamily: "Latin Modern Sans",
    atsScore: 80,
    kinds: ["resume"],
    fileName: "creative-sidebar.tex",
  },
  {
    id: "academic-cv",
    name: "Academic CV",
    description: "Comprehensive multi-page format for research, publications, grants, and education.",
    recommendationReason: "Recommended for Postdocs, AI Researchers, and University/R&D positions.",
    recommendedFor: ["AI Research / PhD", "Academia & R&D", "Publications & Grants"],
    fontFamily: "Computer Modern (TeX Standard)",
    atsScore: 90,
    kinds: ["cv"],
    fileName: "academic-cv.tex",
  },
  {
    id: "minimal-clean",
    name: "Minimal Clean",
    description: "Quiet typography, generous whitespace, single teal accent line. Zero noise.",
    recommendationReason: "Recommended for minimalist candidates wanting a pure, distraction-free reading experience.",
    recommendedFor: ["Systems Engineering", "Minimalist Style", "High-Readability"],
    fontFamily: "Latin Modern Sans",
    atsScore: 100,
    kinds: ["resume"],
    fileName: "minimal-clean.tex",
  },
  {
    id: "technical-modern",
    name: "Technical Modern",
    description: "Dense monospace headers and compact listings for senior software and systems engineers.",
    recommendationReason: "Recommended for Backend, Cloud, Infrastructure, and Systems Engineers.",
    recommendedFor: ["Infrastructure / DevOps", "Senior Systems Engineers", "Data Platforms"],
    fontFamily: "Latin Modern Sans + Mono accents",
    atsScore: 95,
    kinds: ["resume"],
    fileName: "technical-modern.tex",
  },
  {
    id: "executive-elegant",
    name: "Executive Elegant",
    description: "Small-caps section headers, warm neutral palette, and classic book typography.",
    recommendationReason: "Recommended for C-Suite, VP of Engineering, and Managing Directors.",
    recommendedFor: ["C-Suite / VP", "Managing Directors", "Board Profiles"],
    fontFamily: "TeX Gyre Termes / Classic Book Serif",
    atsScore: 95,
    kinds: ["resume", "cv"],
    fileName: "executive-elegant.tex",
  },
  {
    id: "developer-dashboard",
    name: "Developer Dashboard",
    description: "Tech-stack badges, metric highlights, and GitHub-style status accents.",
    recommendationReason: "Recommended for Full-Stack, Web3, and Open-Source contributors.",
    recommendedFor: ["Full-Stack Developers", "Open Source Contributors", "Web3 / Modern Dev"],
    fontFamily: "Latin Modern Sans",
    atsScore: 85,
    kinds: ["resume"],
    fileName: "developer-dashboard.tex",
  },
  {
    id: "academic-europass",
    name: "Europass Modern",
    description: "Contemporary interpretation of the EU standard CV format with structured categories.",
    recommendationReason: "Recommended for EU institutional, governmental, and academic tenders.",
    recommendedFor: ["EU Institutional", "Government / Erasmus", "European Tenders"],
    fontFamily: "Latin Modern Sans / Europass Standard",
    atsScore: 90,
    kinds: ["cv"],
    fileName: "academic-europass.tex",
  },
  {
    id: "creative-portfolio",
    name: "Portfolio Hybrid",
    description: "Visual project spotlights with project links and technology tags.",
    recommendationReason: "Recommended for Project-heavy portfolios and Freelance Consultants.",
    recommendedFor: ["Freelance Consultants", "Project Spotlights", "Showcase Profiles"],
    fontFamily: "Latin Modern Sans",
    atsScore: 80,
    kinds: ["resume"],
    fileName: "creative-portfolio.tex",
  },
  {
    id: "letter-cover",
    name: "Standard Cover Letter",
    description: "Classic single-page cover letter matching the classic-ats typography.",
    recommendationReason: "Recommended for standard US & Global cover letters.",
    recommendedFor: ["US Standard", "Global Tech Cover Letters"],
    fontFamily: "Latin Modern Roman (LaTeX standard)",
    atsScore: 100,
    kinds: ["cover_letter"],
    fileName: "letter-cover.tex",
  },
  {
    id: "letter-motivation",
    name: "Motivation Letter",
    description: "Formal multi-paragraph motivation letter for European and international applications.",
    recommendationReason: "Recommended for European motivation letters and graduate programs.",
    recommendedFor: ["European Applications", "Graduate / Academic Admissions"],
    fontFamily: "Latin Modern Roman",
    atsScore: 100,
    kinds: ["motivation_letter"],
    fileName: "letter-motivation.tex",
  },
  {
    id: "letter-anschreiben-de",
    name: "German Anschreiben",
    description: "Formal German Anschreiben adhering to DIN 5008 correspondence rules.",
    recommendationReason: "Mandatory standard for formal German, Austrian, and Swiss job applications.",
    recommendedFor: ["Germany / DACH", "DIN 5008 Standard"],
    fontFamily: "Latin Modern Sans",
    atsScore: 100,
    kinds: ["motivation_letter"],
    fileName: "letter-anschreiben-de.tex",
  },
  {
    id: "letter-motivation-fr",
    name: "Lettre de Motivation (FR)",
    description: "Formal French Lettre de Motivation following French business correspondence standards.",
    recommendationReason: "Recommended for formal French and Francophone job applications.",
    recommendedFor: ["France & Francophone", "Standard Français"],
    fontFamily: "Latin Modern Sans",
    atsScore: 100,
    kinds: ["motivation_letter"],
    fileName: "letter-motivation-fr.tex",
  },
  {
    id: "letter-modern",
    name: "Modern Letter",
    description: "Modern cover letter with a blue accent rule and clean block formatting.",
    recommendationReason: "Recommended for modern tech startups and dynamic companies.",
    recommendedFor: ["Tech Startups", "Modern Roles"],
    fontFamily: "Latin Modern Sans",
    atsScore: 100,
    kinds: ["cover_letter"],
    fileName: "letter-modern.tex",
  },
  {
    id: "letter-minimal",
    name: "Minimal Letter",
    description: "Quiet, minimal cover letter with generous whitespace and no decoration.",
    recommendationReason: "Recommended for direct email outreach and minimalist correspondence.",
    recommendedFor: ["Minimalist", "Direct Outreach"],
    fontFamily: "Latin Modern Sans",
    atsScore: 100,
    kinds: ["cover_letter"],
    fileName: "letter-minimal.tex",
  },
];

export function getRecommendedTemplate(region = "US", docKind: ResumeDocKind = "resume", role?: string): ResumeTemplateMeta {
  const reg = region.toUpperCase();
  if (docKind === "cover_letter") {
    return RESUME_TEMPLATES.find((t) => t.id === "letter-cover") || RESUME_TEMPLATES[0];
  }
  if (docKind === "motivation_letter") {
    if (reg === "DE") return RESUME_TEMPLATES.find((t) => t.id === "letter-anschreiben-de") || RESUME_TEMPLATES[0];
    if (reg === "FR") return RESUME_TEMPLATES.find((t) => t.id === "letter-motivation-fr") || RESUME_TEMPLATES[0];
    return RESUME_TEMPLATES.find((t) => t.id === "letter-motivation") || RESUME_TEMPLATES[0];
  }
  if (reg === "DE") return RESUME_TEMPLATES.find((t) => t.id === "tabular-german") || RESUME_TEMPLATES[0];
  if (reg === "FR") return RESUME_TEMPLATES.find((t) => t.id === "modern-french") || RESUME_TEMPLATES[0];
  if (reg === "TN") return RESUME_TEMPLATES.find((t) => t.id === "mena-cv") || RESUME_TEMPLATES[0];
  if (reg === "NL") return RESUME_TEMPLATES.find((t) => t.id === "nordic-clean") || RESUME_TEMPLATES[0];
  if (role && /director|head|vp|executive|c.?suite/i.test(role)) {
    return RESUME_TEMPLATES.find((t) => t.id === "executive-elegant") || RESUME_TEMPLATES[0];
  }
  if (role && /designer|ui|ux|creative/i.test(role)) {
    return RESUME_TEMPLATES.find((t) => t.id === "creative-sidebar") || RESUME_TEMPLATES[0];
  }
  return RESUME_TEMPLATES.find((t) => t.id === "classic-ats") || RESUME_TEMPLATES[0];
}

export function templateMeta(id: string): ResumeTemplateMeta | undefined {
  return RESUME_TEMPLATES.find((t) => t.id === id);
}

export function templatesForKind(kind: ResumeDocKind): ResumeTemplateMeta[] {
  return RESUME_TEMPLATES.filter((t) => t.kinds.includes(kind));
}
