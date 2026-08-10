import { UserProfile, JobApplication, SkillsGapAnalysis, STARCard, InterviewQuestion, JobBrief, SalaryIntel, SkillRoadmapItem, PipelineReport } from "@/types";
import { buildProfileContext, buildJobContext, extractJdTerms, SYSTEM_PREAMBLE, JSON_RULE } from "./commonPrompts";

/* ------------------------------------------------------------------ */
/* Match analysis                                                      */
/* ------------------------------------------------------------------ */

export function matchSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a technical recruiting analyst. You score job fit like a rigorous hiring manager and explain it like a coach. You evaluate dealbreakers first, then must-haves, then nice-to-haves, and you are decisive — no grade inflation.

${JSON_RULE}`;
}

export function matchUserPrompt(job: JobApplication, profile: UserProfile): string {
  return `${buildProfileContext(profile)}

${buildJobContext(job)}

TASK: Analyze candidate-vs-job fit. Respond as JSON:
- "matchScore": integer 0-100 (be honest — no grade inflation; consider skill overlap, experience depth, and seniority).
- "fit": "high" | "medium" | "low" | "skip" — overall fit rating. Mark "skip" if ANY dealbreaker applies: required work authorization/citizenship/clearance the candidate lacks, on-site-only vs a remote-only preference, salary below the candidate's stated minimum, or an unwillingness to relocate.
- "dealbreakers": string[] — the concrete blocking reasons (empty array if none).
- "matchingSkills": string[] — skills from the candidate's profile the job explicitly needs.
- "missingSkills": string[] — skills the job explicitly requires that the candidate lacks (max 6).
- "strengths": string[] — 3 specific, evidence-based reasons the candidate fits.
- "recommendations": string[] — 4 tactical actions (resume tweaks, interview angles, skill-building, or how to overcome a dealbreaker).
- "keyTermFrequency": [{ "term": string, "count": number, "inResume": boolean }] — the 8 most important job-description keywords, with how often they appear and whether the candidate's resume covers them.`;
}

export type FitRating = "high" | "medium" | "low" | "skip";

export interface FitScoring {
  fit: FitRating;
  dealbreakers: string[];
  mustHavesMet: string[];
  niceHavesMet: string[];
}

/* Words that are too generic to establish a title-family match. */
const TITLE_STOPWORDS = new Set([
  "engineer", "engineers", "developer", "developers", "engineering", "development",
  "senior", "lead", "junior", "principal", "staff", "sr", "the", "and", "of", "for", "i", "ii", "iii",
]);
/* Role nouns that signal the same family even when titles differ. */
const CORE_ROLE_NOUNS = [
  "frontend", "backend", "full", "stack", "mobile", "devops", "data", "machine", "ml", "ai",
  "platform", "infrastructure", "qa", "design", "product", "growth", "marketing", "sales",
  "support", "security", "cloud", "sre", "wordpress", "php", "solutions", "technical", "test",
];

export function titleFamiliesOverlap(jobTitle: string, targetTitle: string): boolean {
  const tokens = (t: string) =>
    new Set(
      t
        .toLowerCase()
        .replace(/[^a-z0-9+.#-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !TITLE_STOPWORDS.has(w))
    );
  const a = tokens(jobTitle);
  const b = tokens(targetTitle);
  for (const w of a) if (b.has(w)) return true;
  return CORE_ROLE_NOUNS.some((c) => a.has(c) && b.has(c));
}

/**
 * Parse an annual-salary-ish string ("$120k - $150k", "$120,000 - $150,000",
 * "80.000 - 90.000") into a { min, max } pair in the same unit. Returns null
 * when nothing numeric is present. "Competitive salary" with no range → null.
 */
export function parseSalaryText(text: string | undefined | null): { min: number; max: number } | null {
  if (!text) return null;
  const cleaned = String(text).replace(/[,\s]/g, "");
  const nums = Array.from(cleaned.matchAll(/(\d+(?:\.\d+)?)(k|m)?/gi))
    .map((m) => {
      const n = parseFloat(m[1]);
      if (!Number.isFinite(n) || n <= 0) return null;
      const suffix = (m[2] ?? "").toLowerCase();
      return suffix === "k" ? n * 1000 : suffix === "m" ? n * 1_000_000 : n;
    })
    .filter((n): n is number => n !== null);
  if (!nums.length) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  /* A single figure reads as a floor → widen to a range. */
  return max > min ? { min, max } : { min, max: min * 1.2 };
}

/**
 * Deterministic, offline fit engine (per the Proficiently fit-scoring rubric):
 * dealbreakers → must-haves → nice-to-haves → "high" | "medium" | "low" | "skip".
 *
 * - Skip: any dealbreaker (visa/clearance, on-site-only vs remote preference,
 *   salary below the stated minimum, no relocation for an on-site role).
 * - High: no dealbreakers + all must-haves (core-skill overlap AND title
 *   family) + 2+ nice-to-haves.
 * - Medium: no dealbreakers + most must-haves (either core skills or title).
 * - Low: no dealbreakers but significant gaps in must-haves.
 */
export function scoreFit(
  job: Pick<JobApplication, "title" | "company" | "salary" | "jobDescription">,
  profile: UserProfile,
  matchingSkills: string[]
): FitScoring {
  const jd = (job.jobDescription || "").toLowerCase();
  const dealbreakers: string[] = [];

  /* ---- Dealbreakers: visa / clearance ---- */
  const authRequired =
    /(must (be|already have|possess|hold))?.*(authorized to work|work authori[sz]ation|work permit|no (visa|sponsorship)|sponsorship (is )?not|cannot (sponsor|offer sponsorship)|citizen(?!ship)|citizenship required|legal (right|status) to work)/i.test(
      jd
    );
  if (authRequired && profile.workPermitStatus === "sponsorship_required") {
    dealbreakers.push("Posting requires existing work authorization, but your profile asks for sponsorship.");
  }
  if (/security clearance|active clearance|ts\/sci|secret clearance|clearance level/i.test(jd) && !profile.clearanceLevel) {
    dealbreakers.push("Posting requires a security clearance that your profile does not list.");
  }

  /* ---- Dealbreakers: location / work mode / relocation ---- */
  const explicitOnsite = /on-?site|in.?office|must (be|work|live) in|relocat(e|ion) (required|mandatory)/i.test(jd);
  const explicitRemote = /100% remote|fully remote|remote (first|only|anywhere)|work from anywhere/i.test(jd);
  const onsiteOnly = explicitOnsite && !/(remote|hybrid)/.test(jd);
  const preferred = profile.preferredWorkMode;
  const relocation = profile.willingnessToRelocate;

  if (onsiteOnly && preferred === "remote") {
    dealbreakers.push("Posting is on-site only, but your preference is remote work.");
  }
  if (onsiteOnly && relocation === "no") {
    dealbreakers.push("Posting requires being on-site, but you are not willing to relocate.");
  }
  if (explicitRemote && preferred === "onsite") {
    dealbreakers.push("Posting is fully remote, but you prefer on-site work.");
  }
  if (relocation === "remote_only" && explicitOnsite && !explicitRemote) {
    dealbreakers.push("You are only open to remote work, but this role requires being on-site.");
  }

  /* ---- Dealbreakers: salary below the stated minimum ---- */
  const jdSalary = parseSalaryText(job.salary || jd);
  const desiredSalary = parseSalaryText(profile.desiredSalary || profile.salaryExpectations);
  if (jdSalary && desiredSalary && desiredSalary.min > 0 && jdSalary.max < desiredSalary.min) {
    dealbreakers.push(
      `Stated salary (${job.salary || "in the posting"}) is below your minimum of ${profile.desiredSalary || profile.salaryExpectations}.`
    );
  }

  /* ---- Must-haves ---- */
  const mustHavesMet: string[] = [];
  if (matchingSkills.length >= 2) mustHavesMet.push(`Core skill overlap: ${matchingSkills.slice(0, 3).join(", ")}.`);
  if (titleFamiliesOverlap(job.title, profile.targetTitle)) {
    mustHavesMet.push(`Title family matches: ${job.title} ~ ${profile.targetTitle}.`);
  }

  /* ---- Nice-to-haves ---- */
  const niceHavesMet: string[] = [];
  const jdSenior = /senior|lead|principal|staff|sr\.?/i.test(jd + job.title);
  const targetSenior = /senior|lead|principal|staff|sr\.?/i.test(profile.targetTitle);
  if (jdSenior === targetSenior) niceHavesMet.push("Seniority level aligns with your title.");
  if (jdSalary && desiredSalary && jdSalary.min >= desiredSalary.min) {
    niceHavesMet.push("Salary meets or exceeds your minimum expectation.");
  }
  const workModeOk = !onsiteOnly || (preferred !== "remote" && relocation !== "no");
  if (workModeOk && (preferred || relocation)) niceHavesMet.push("Work-mode requirement matches your preferences.");
  if ((profile.experience?.length ?? 0) >= 2) niceHavesMet.push("Two or more previous roles provide depth.");

  let fit: FitRating;
  if (dealbreakers.length) fit = "skip";
  else if (mustHavesMet.length >= 2 && niceHavesMet.length >= 2) fit = "high";
  else if (mustHavesMet.length >= 1) fit = "medium";
  else fit = "low";

  return { fit, dealbreakers, mustHavesMet, niceHavesMet };
}

export function matchFallback(job: JobApplication, profile: UserProfile): SkillsGapAnalysis {
  const terms = extractJdTerms(job.jobDescription, profile.skills);
  const matchingSkills = terms.filter((t) => t.inResume).map((t) => t.term);
  const missingSkills = terms.filter((t) => !t.inResume).map((t) => t.term).slice(0, 6);

  const jd = job.jobDescription.toLowerCase();
  const hasSenior = /senior|lead|principal|staff|sr\.?/i.test(jd + job.title);
  const seniorityScore = hasSenior && /senior|lead|principal|staff/.test(profile.targetTitle.toLowerCase()) ? 15 : hasSenior ? 5 : 15;

  const coverage = terms.length ? matchingSkills.length / terms.length : 0.4;
  const score = Math.round(Math.min(97, Math.max(38, coverage * 70 + seniorityScore + (profile.experience.length >= 2 ? 8 : 0))));

  const { fit, dealbreakers, niceHavesMet } = scoreFit(job, profile, matchingSkills);

  const titleAligned = titleFamiliesOverlap(job.title, profile.targetTitle);
  const strengths = [
    titleAligned
      ? `Profile targets ${profile.targetTitle}, which maps to this ${job.title} role.`
      : `Target title ${profile.targetTitle} is adjacent to this ${job.title} role — seniority may differ.`,
    `Core stack coverage: ${matchingSkills.slice(0, 3).join(", ") || profile.skills.slice(0, 3).join(", ")}.`,
    `${profile.experience.length} relevant role(s) with ${profile.experience[0]?.duration ?? "industry"} tenure.`,
    fit === "high"
      ? "This role is a strong fit for your profile — apply with a tailored pitch."
      : fit === "skip"
        ? "Do not apply until the dealbreaker(s) are resolved."
        : `Moderate fit${niceHavesMet.length ? ` (${niceHavesMet.length} nice-to-have alignment${niceHavesMet.length === 1 ? "" : "s"})` : ""} — worth a tailored application.`,
  ];

  const recommendations = [
    `Lead with ${matchingSkills[0] ?? profile.skills[0]} in the resume summary and top 2 bullet points.`,
    missingSkills.length
      ? `Address missing terms in the cover letter: ${missingSkills.slice(0, 3).join(", ")}.`
      : "Keyword coverage is strong — focus on storytelling and metrics in interviews.",
    dealbreakers.length
      ? `Resolve the blocking issue before applying: ${dealbreakers[0]}.`
      : "Add a personal project or section demonstrating the single biggest gap.",
    "Send the tailored follow-up email 4 days after applying to stay top-of-mind.",
  ];

  return {
    matchScore: score,
    matchingSkills: matchingSkills.length ? matchingSkills : profile.skills.slice(0, 3),
    missingSkills: missingSkills.length ? missingSkills : ["Cloud deployment (AWS/GCP)", "CI/CD pipelines"],
    strengths,
    recommendations,
    keyTermFrequency: terms.length ? terms : extractJdTerms(job.jobDescription, profile.skills).slice(0, 1),
    fit,
    dealbreakers: dealbreakers.length ? dealbreakers : undefined,
  };
}

/* ------------------------------------------------------------------ */
/* STAR flashcards                                                     */
/* ------------------------------------------------------------------ */

export function starSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are an interview coach who converts job descriptions into sharp behavioral questions and crafts STAR answers grounded in the candidate's REAL experience.

${JSON_RULE}`;
}

export function starUserPrompt(job: JobApplication, profile: UserProfile): string {
  return `${buildProfileContext(profile)}

${buildJobContext(job)}

TASK: Create 4 STAR-method behavioral flashcards that this candidate will actually be asked in an interview for this job.
Each card:
- "question": a realistic behavioral question tied to the job's core demands.
- "situation": a 1-2 sentence scenario drawn ONLY from the candidate's real experience (paraphrase their bullets).
- "task": what the candidate was responsible for.
- "action": what the candidate DID (2-3 sentences, first person, concrete).
- "result": a measurable outcome (use metrics already in their profile; never fabricate exact numbers beyond what's given).
- "difficulty": "easy" | "medium" | "hard" based on how the role stresses this area.
- "status": "unstudied"

Respond as JSON: { "cards": [...] }`;
}

export function starFallback(job: JobApplication, profile: UserProfile): STARCard[] {
  const exp = profile.experience[0];
  const skill = profile.skills[0] ?? "engineering";
  return [
    {
      id: `star-${Date.now()}-1`,
      question: `Walk me through a time you solved a hard ${skill} problem end-to-end.`,
      situation: exp
        ? `At ${exp.company}, a production issue demanded deep ${skill} work under deadline pressure.`
        : `A production problem required deep ${skill} work under deadline pressure.`,
      task: `I owned the diagnosis and the fix from start to finish.`,
      action: `I traced the root cause, implemented a fix, added regression coverage, and communicated status to stakeholders.`,
      result: `The incident closed on time and the fix held, becoming the template for future incidents.`,
      difficulty: "medium",
      status: "unstudied",
    },
    {
      id: `star-${Date.now()}-2`,
      question: `Describe a conflict or misalignment you resolved between teams.`,
      situation: exp
        ? `At ${exp.company}, engineering and product disagreed on scope priorities.`
        : `Engineering and product disagreed on scope priorities.`,
      task: `I needed to unblock delivery without burning relationships.`,
      action: `I quantified the tradeoffs, aligned on a staged rollout, and kept both sides updated.`,
      result: `We shipped on schedule and the working relationship improved for the next cycle.`,
      difficulty: "easy",
      status: "unstudied",
    },
    {
      id: `star-${Date.now()}-3`,
      question: `Tell me about adapting to a major change — tech stack, team, or deadline.`,
      situation: `The team adopted a new AI-assisted development workflow mid-project.`,
      task: `I had to stay productive while the toolchain shifted around me.`,
      action: `I learned the new tools quickly, updated our patterns, and helped teammates ramp up.`,
      result: `The transition cost zero delivery time and raised team velocity afterward.`,
      difficulty: "hard",
      status: "unstudied",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Technical interview questions                                       */
/* ------------------------------------------------------------------ */

export function questionsSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a senior hiring manager at the company. You design realistic technical interviews.

${JSON_RULE}`;
}

export function questionsUserPrompt(job: JobApplication, profile: UserProfile): string {
  return `${buildProfileContext(profile)}

${buildJobContext(job)}

TASK: Design 6 interview questions this candidate is likely to face:
- Mix: 3 technical (architecture, code, system design, domain knowledge) + 2 behavioral + 1 "final round" culture-fit.
- "category": "technical" | "behavioral" | "culture".
- "difficulty": "easy" | "medium" | "hard".
- "hint": one concrete preparation tip or likely follow-up.
- "idealAnswer": 3-5 bullet summary of what a strong answer covers (grounded in the candidate's skills).

Respond as JSON: { "questions": [ { "id": string, "question": string, "category": string, "difficulty": string, "hint": string, "idealAnswer": string } ] }`;
}

export function questionsFallback(job: JobApplication, profile: UserProfile): InterviewQuestion[] {
  const tech = profile.skills.slice(0, 4);
  const mk = (i: number, category: InterviewQuestion["category"], question: string, hint: string, idealAnswer: string, difficulty: InterviewQuestion["difficulty"] = "medium"): InterviewQuestion => ({
    id: `q-${Date.now()}-${i}`,
    question,
    category,
    difficulty,
    hint,
    idealAnswer,
  });
  return [
    mk(1, "technical", `Deep dive: take me through the architecture of your most complex ${tech[0] ?? "full-stack"} project.`,
      "Prepare a 3-minute walkthrough with a diagram in your head. They will drill into tradeoffs.",
      `1. Context and constraints.\n2. Key components and data flow.\n3. Tradeoffs you made.\n4. What you'd do differently.`),
    mk(2, "technical", `How would you design ${tech[1] ?? "the core API"} for this product at scale?`,
      "Cover load, failure modes, and data model before reaching for the whiteboard.",
      `1. Requirements & scale estimation.\n2. API/data model.\n3. Caching & async patterns.\n4. Failure handling.`, "hard"),
    mk(3, "technical", `What are the tradeoffs between ${tech.slice(0, 2).join(" and ") || "the technologies you know"}, and when would you pick each?`,
      "Compare on performance, developer experience, and ecosystem — not just popularity.",
      `1. Strengths of each.\n2. Weaknesses of each.\n3. Decision rubric with an example.`),
    mk(4, "behavioral", `Tell me about a time you shipped something under an aggressive deadline.`,
      "Use STAR and keep the result measurable.",
      `1. Situation & stakes.\n2. Your specific role.\n3. Concrete actions.\n4. Outcome + lesson.`),
    mk(5, "behavioral", `Tell me about a technical decision you made that you later regretted.`,
      "Show self-awareness and a learning loop — they want growth, not a confession.",
      `1. The decision.\n2. Why it looked right.\n3. What broke.\n4. How you'd approach it now.`),
    mk(6, "culture", `What does your ideal work week look like, and how does ${job.company} fit that?`,
      "Show you've researched the company's rituals and values.",
      `1. Concrete preferences.\n2. Link to ${job.company}'s culture signals.\n3. Enthusiasm + one question back.`, "easy"),
  ];
}

/* ------------------------------------------------------------------ */
/* Job brief                                                           */
/* ------------------------------------------------------------------ */

export function briefSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a job-market intelligence analyst. You distill job postings into sharp, decision-ready briefs.

${JSON_RULE}`;
}

export function briefUserPrompt(job: JobApplication): string {
  return `${buildJobContext(job)}

TASK: Produce an intelligence brief as JSON:
- "summary": 2-3 sentences: what the job actually is, in plain language.
- "techStack": string[] — technologies/tools named in the posting.
- "topRequirements": string[] — the 5 most important requirements, in priority order.
- "redFlags": string[] — warning signs in the posting (e.g. "5+ years required but title is mid-level", vague equity, on-call, "rockstar" language, conflicting requirements). Empty array if clean.
- "questionsToAsk": string[] — 4 sharp questions to ask the recruiter/hiring manager.
- "cultureSignals": string[] — 3 clues about the company's working style gleaned from the posting.`;
}

export function briefFallback(job: JobApplication): JobBrief {
  const lines = job.jobDescription.split("\n").map((l) => l.trim()).filter(Boolean);
  const bulletish = lines.filter((l) => /^[-•*]|^[0-9]\.|:/.test(l)).slice(0, 8);
  return {
    summary: `${job.title} at ${job.company}${job.location ? ` (${job.location})` : ""}. ${lines[0]?.slice(0, 140) ?? "See description for details."}`,
    techStack: extractJdTerms(job.jobDescription, []).map((t) => t.term).slice(0, 8),
    topRequirements: bulletish.slice(0, 5),
    redFlags: [],
    questionsToAsk: [
      "What does success look like in the first 90 days?",
      "What is the team's biggest technical challenge right now?",
      "How is performance evaluated and what is the promotion cadence?",
      "Who would I be working closest with, and how does the team collaborate?",
    ],
    cultureSignals: ["See job description language for signals"],
  };
}

/* ------------------------------------------------------------------ */
/* Salary intel                                                        */
/* ------------------------------------------------------------------ */

export function salarySystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a compensation analyst who knows 2026 market rates for engineering roles across the US and EU.

${JSON_RULE}`;
}

export function salaryUserPrompt(job: JobApplication, profile: UserProfile): string {
  return `${buildJobContext(job)}
Candidate seniority: ${profile.targetTitle} — ${profile.experience.length} role(s), latest: ${profile.experience[0]?.duration ?? "n/a"}.
Location: ${profile.location}

TASK: Estimate fair compensation. Respond as JSON:
- "estimateLow": number (USD annual).
- "estimateHigh": number (USD annual).
- "basis": "posting" | "market" | "hybrid" — whether the posting disclosed a range.
- "disclosedRange": string | null — exact range from the posting if present.
- "factors": string[] — 3 factors that push the estimate up or down (location, seniority, equity, industry).
- "negotiationTips": string[] — 4 tactical negotiation plays (anchor, leverage, timing, non-cash).`;
}

export function salaryFallback(job: JobApplication): SalaryIntel {
  const disclosed = job.salary && /[\d,]/.test(job.salary) ? job.salary : null;
  const senior = /senior|lead|principal|staff/i.test(job.title + job.jobDescription.replace(/<[^>]*>/g, "")) ? 1.25 : 1;
  const base = /ai|ml|llm|machine/i.test(job.jobDescription) ? 165000 : 140000;
  return {
    estimateLow: Math.round((base * senior) / 1000) * 1000,
    estimateHigh: Math.round((base * senior * 1.35) / 1000) * 1000,
    basis: disclosed ? "posting" : "market",
    disclosedRange: disclosed,
    factors: [
      "Seniority signaled by the title and description",
      "Location & remote policy (hybrid vs fully remote)",
      "AI specialization premiums when relevant",
    ],
    negotiationTips: [
      "Ask for the band before sharing your number.",
      "Anchor at the top of the disclosed range plus 10%.",
      "Leverage competing timelines to accelerate decisions.",
      "Negotiate equity and flexible work before signing.",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Global insights (recommendations / roadmap / report)                */
/* ------------------------------------------------------------------ */

export function recommendationsSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a job-market strategist who knows which roles and companies a candidate should target next.

${JSON_RULE}`;
}

export function recommendationsUserPrompt(profile: UserProfile, trackedJobs: JobApplication[]): string {
  return `${buildProfileContext(profile)}

ALREADY TRACKED ROLES:
${trackedJobs.map((j) => `- ${j.title} @ ${j.company} (${j.location})`).join("\n") || "none"}

TASK: Recommend 5 concrete job targets (roles + company archetypes + why) this candidate should pursue next, informed by their skills and gaps. Respond as JSON: { "recommendations": [ { "title": string, "companyArchetype": string, "why": string, "matchProbability": number } ] }`;
}

export function recommendationsFallback(profile: UserProfile, trackedJobs: JobApplication[]): { title: string; companyArchetype: string; why: string; matchProbability: number }[] {
  const used = new Set(trackedJobs.map((j) => j.title.toLowerCase()));
  const topSkill = profile.skills[0] ?? "";
  const ideas = [
    { title: `Senior ${topSkill} Engineer`, companyArchetype: "Series B-D product companies", why: `Direct use of your strongest skill: ${topSkill}.`, matchProbability: 88 },
    { title: `Full Stack Engineer (AI Products)`, companyArchetype: "AI-native startups", why: "Your stack maps to AI product teams, the fastest-growing segment.", matchProbability: 82 },
    { title: `Platform / Infrastructure Engineer`, companyArchetype: "Scale-ups with real infra budgets", why: "Diversifies from feature work into high-leverage systems roles.", matchProbability: 74 },
    { title: `Staff Software Engineer`, companyArchetype: "Companies with IC leadership tracks", why: "Next career step after senior — matches your experience depth.", matchProbability: 70 },
    { title: `Technical Lead (IC)`, companyArchetype: "Mid-size product companies", why: "Leverages your breadth while keeping you hands-on.", matchProbability: 76 },
  ].filter((r) => !used.has(r.title.toLowerCase()));
  return ideas.slice(0, 5);
}

export function roadmapSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a learning strategist who turns skill gaps into 30-day action plans.

${JSON_RULE}`;
}

export function roadmapUserPrompt(profile: UserProfile, gaps: string[]): string {
  return `${buildProfileContext(profile)}

CURRENT SKILL GAPS ACROSS ALL TRACKED JOBS:
${gaps.map((g) => `- ${g}`).join("\n") || "none identified"}

TASK: Build a prioritized 30-day skill roadmap. Respond as JSON:
{ "roadmap": [ { "skill": string, "priority": "high"|"medium"|"low", "why": string, "resources": string[] } ] }
Max 6 skills, sorted by priority. Resources should be real, well-known courses/docs.`;
}

export function roadmapFallback(gaps: string[]): SkillRoadmapItem[] {
  const resourcesBySkill: Record<string, string[]> = {
    Docker: ["Docker official docs", "KodeKloud Docker course", "freeCodeCamp Docker tutorial"],
    Kubernetes: ["Kubernetes official docs", "CKA exam guide", "KodeKloud CKA course"],
    "AWS": ["AWS Skill Builder", "A Cloud Guru", "AWS re:Post"],
    GraphQL: ["Apollo docs", "How to GraphQL", "GraphQL by Example (Udemy)"],
    "System Design": ["System Design Primer (GitHub)", "Alex Xu vol.1", "Hello Interview"],
    "Vector DB": ["Pinecone learning center", "pgvector README", "LlamaIndex docs"],
    "CI/CD": ["GitHub Actions docs", "Docker + GitHub Actions guide", "Buildkite docs"],
    Terraform: ["HashiCorp Learn", "Terraform Up & Running", "freeCodeCamp Terraform series"],
    LLM: ["OpenAI cookbook", "Andrej Karpathy's lectures", "HuggingFace course"],
    RAG: ["LlamaIndex docs", "LangChain docs", "DeepLearning.AI RAG course"],
  };
  const defaultResources = ["Official docs", "A hands-on Udemy/coursera course", "Build a small project with it"];
  return gaps.slice(0, 6).map((g, i) => ({
    skill: g,
    priority: i < 2 ? "high" : i < 4 ? "medium" : "low",
    why: `Directly requested in tracked roles; closing this gap raises your match scores.`,
    resources: resourcesBySkill[g] ?? defaultResources,
  }));
}

export function reportSystemPrompt(): string {
  return `${SYSTEM_PREAMBLE}
You are a career analytics editor who turns application data into a punchy weekly briefing.

${JSON_RULE}`;
}

export function reportUserPrompt(profile: UserProfile, jobs: JobApplication[]): string {
  return `${buildProfileContext(profile)}

APPLICATION DATA (this week):
${JSON.stringify(
  jobs.map((j) => ({
    title: j.title, company: j.company, status: j.status, match: j.matchScore, auto: j.autoApplyStatus, created: j.createdDate,
  })),
  null,
  2
)}

TASK: Write a candid pipeline report. Respond as JSON:
- "headline": string — one-sentence verdict on the pipeline's health.
- "highlights": string[] — 3 wins or strengths.
- "risks": string[] — 3 concerns (stagnant apps, low-match targets, missing follow-ups, pipeline gaps).
- "actions": string[] — 4 concrete next moves for the coming week.`;
}

export function reportFallback(jobs: JobApplication[]): PipelineReport {
  const counts = (s: string) => jobs.filter((j) => j.status === s).length;
  const scored = jobs.filter((j) => typeof j.matchScore === "number");
  const avgMatch = scored.length ? Math.round(scored.reduce((a, j) => a + (j.matchScore ?? 0), 0) / scored.length) : 0;
  const active = counts("applied") + counts("interviewing");
  const top = [...scored].sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0))[0];
  const stagnant = jobs.filter((j) => (j.status === "applied" || j.status === "wishlist"));
  return {
    headline: jobs.length === 0 ? "Pipeline empty — start tracking roles." : `${jobs.length} roles tracked, ${active} active. Average match ${avgMatch}%.`,
    highlights: [
      avgMatch >= 75 ? `Strong average match score of ${avgMatch}% — good targeting.` : "Pipeline needs higher-match targets.",
      top ? `${top.title} @ ${top.company} is your best-fit role at ${top.matchScore}% match.` : "Add jobs to unlock highlights.",
      counts("offer") > 0 ? `${counts("offer")} offer(s) on the table — negotiate with leverage.` : "No offers yet — keep momentum.",
    ],
    risks: [
      stagnant.length > 3 ? `${stagnant.length} roles have no movement — follow up or move on.` : "Keep statuses fresh as you hear back.",
      active < 4 ? "Too few active pipelines — apply to at least 4 high-match roles this week." : "Healthy number of active pipelines.",
      counts("rejected") > 0 ? `${counts("rejected")} rejections logged — extract learnings, don't stop.` : "No rejections — keep momentum.",
    ],
    actions: [
      "Send tailored follow-ups to every role applied to 4+ days ago.",
      `Study the gap for your best match (${top?.title ?? "top role"}) and close it.`,
      "Run match analysis on all new jobs before applying.",
      "Use the Auto-Apply agent on wishlist roles with URLs and match ≥ 80%.",
    ],
  };
}
