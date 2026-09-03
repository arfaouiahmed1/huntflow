import { describe, it, expect, beforeEach } from "vitest";
import { POST as POST_GENERATE } from "@/app/api/generate/route";
import { POST as POST_PARTIAL_PIPELINE } from "@/app/api/agent/partial-pipeline/route";
import { POST as POST_VAULT } from "@/app/api/vault/route";
import { GET as GET_VAULT_SEARCH, POST as POST_VAULT_SEARCH } from "@/app/api/vault/search/route";
import { extractJson, LLMError } from "@/lib/llm/client";
import { resolveChain, callLLM } from "@/lib/llm/router";
import { scoreFit } from "@/lib/prompts/generationPrompts";
import { analyzeAts } from "@/lib/ats/analyze";
import { renderTemplate, loadTemplateSource } from "@/lib/pdf/resumeTemplates";
import { escapeLatex } from "@/lib/pdf/sanitize";
import { runResumeAgent, parseResumeTextFallback } from "@/agents/resumeAgent";
import { runPartialPipeline, runMultiAgentApp } from "@/agents/multiAgentAppGraph";
import { auditRegionalCompliance, getRegionalRules } from "@/lib/agents/regionalNorms";
import { ingestDocument, searchVault, listDocuments, deleteDocument, setDocLabel } from "@/lib/vault";
import { chunkText } from "@/lib/vault/chunk";
import { localEmbed, cosine } from "@/lib/vault/embeddings";
import {
  createJsonRequest,
  createFormDataRequest,
  createUrlRequest,
  parseResponse,
  resetTestDb,
  jobsRepo,
  usageRepo,
  agentRunHistoryRepo,
} from "../e2e/helpers/testHarness";
import {
  mockJobApplication1,
  mockJobApplication2,
  mockUserProfile,
} from "../e2e/helpers/testFixtures";
import { UserProfile, JobApplication, ResumeContent } from "@/types";

describe("Adversarial AI & Intelligence Resilience Suite (Tier 5)", () => {
  beforeEach(() => {
    resetTestDb();
    jobsRepo.upsert(mockJobApplication1);
    jobsRepo.upsert(mockJobApplication2);
  });

  /* ------------------------------------------------------------------------ */
  /* Section 1: LLM Engine, Fallback Router & Corrupt API Keys                */
  /* ------------------------------------------------------------------------ */
  describe("1. LLM Engine & Provider Resilience", () => {
    it("1.1 extractJson parses JSON embedded in noisy markdown fences and leading/trailing text", () => {
      const noisy1 = "Here is the response:\n```json\n{\"score\": 85, \"status\": \"ok\"}\n```\nHope that helps!";
      const parsed1 = extractJson(noisy1) as { score: number; status: string };
      expect(parsed1.score).toBe(85);
      expect(parsed1.status).toBe("ok");

      const noisy2 = "```\n[\"React\", \"TypeScript\", \"Next.js\"]\n```";
      const parsed2 = extractJson(noisy2) as string[];
      expect(Array.isArray(parsed2)).toBe(true);
      expect(parsed2).toHaveLength(3);
      expect(parsed2[0]).toBe("React");
    });

    it("1.2 extractJson throws LLMError with code PARSE_ERROR on completely non-JSON content", () => {
      expect(() => extractJson("")).toThrow(LLMError);
      expect(() => extractJson("Just a plain text message without any json braces")).toThrow();
      expect(() => extractJson("{\"unclosed\": true")).toThrow();

      try {
        extractJson("Random invalid string");
      } catch (err) {
        expect(err).toBeInstanceOf(LLMError);
        expect((err as LLMError).code).toBe("PARSE_ERROR");
      }
    });

    it("1.3 Router resolveChain safely resolves empty/custom configs without throwing", () => {
      const emptyChain = resolveChain(null);
      expect(Array.isArray(emptyChain)).toBe(true);

      const customChain = resolveChain({
        providerId: "custom",
        apiKey: "sk-corrupt-test-key",
        model: "gpt-4-custom",
        baseURL: "http://localhost:9999/v1",
      });
      expect(customChain.some((p) => p.id === "custom")).toBe(true);
    });

    it("1.4 callLLM logs error and throws CHAIN_EXHAUSTED when no provider succeeds", async () => {
      const initialUsageCount = usageRepo.all().length;
      const brokenChain = [
        {
          id: "custom-broken",
          providerId: "openai",
          kind: "openai" as const,
          label: "Broken Provider",
          apiKey: "sk-fake-key",
          model: "fake-model",
          baseURL: "http://127.0.0.1:54321/nonexistent",
          enabled: true,
          capabilities: ["json" as const],
        },
      ];

      await expect(
        callLLM(
          {
            system: "You are a test.",
            user: "Ping",
            agent: "test_resilience",
          },
          brokenChain
        )
      ).rejects.toThrow();

      const logsAfter = usageRepo.all();
      expect(logsAfter.length).toBeGreaterThan(initialUsageCount);
      const errorLog = logsAfter.find((l) => l.agent === "test_resilience" && l.status === "error");
      expect(errorLog).toBeDefined();
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Section 2: AI Insights & Generation Endpoints (`/api/generate`)          */
  /* ------------------------------------------------------------------------ */
  describe("2. AI Insight Generation Boundary & Fallback Robustness", () => {
    it("2.1 POST /api/generate rejects requests missing generation type with 400", async () => {
      const req = createJsonRequest("http://localhost/api/generate", "POST", {
        profile: mockUserProfile,
        job: mockJobApplication1,
      });
      const res = await POST_GENERATE(req);
      expect(res.status).toBe(400);
      const data = await parseResponse<{ error: { message: string } | string }>(res);
      const msg = typeof data.error === "object" ? data.error.message : data.error;
      expect(msg).toContain("Missing generation type");
    });

    it("2.2 POST /api/generate rejects unknown generation types with 400", async () => {
      const req = createJsonRequest("http://localhost/api/generate", "POST", {
        type: "quantum_fortune_telling",
        profile: mockUserProfile,
        job: mockJobApplication1,
      });
      const res = await POST_GENERATE(req);
      expect(res.status).toBe(400);
      const data = await parseResponse<{ error: { message: string } | string }>(res);
      const msg = typeof data.error === "object" ? data.error.message : data.error;
      expect(msg).toContain("Unknown generation type");
    });

    it("2.3 POST /api/generate rejects job-scoped types without job payload with 400", async () => {
      const jobScopedTypes = [
        "documents",
        "match_analysis",
        "star_flashcards",
        "interview_questions",
        "job_brief",
        "salary_intel",
      ];

      for (const type of jobScopedTypes) {
        const req = createJsonRequest("http://localhost/api/generate", "POST", {
          type,
          profile: mockUserProfile,
          // intentionally omitting job
        });
        const res = await POST_GENERATE(req);
        expect(res.status).toBe(400);
        const data = await parseResponse<{ error: { message: string } | string }>(res);
        const msg = typeof data.error === "object" ? data.error.message : data.error;
        expect(msg).toContain("Missing job payload");
      }
    });

    it("2.4 POST /api/generate gracefully handles extreme 500,000-character payload via context budget truncation", async () => {
      const massiveDescription = "Senior Systems Engineer: " + "We need high performance architectures and deep scalability. ".repeat(7000);
      const massiveJob: JobApplication = {
        ...mockJobApplication1,
        id: "job-massive-payload",
        jobDescription: massiveDescription,
      };

      const req = createJsonRequest("http://localhost/api/generate", "POST", {
        type: "job_brief",
        job: massiveJob,
        profile: mockUserProfile,
      });

      const res = await POST_GENERATE(req);
      expect(res.status).toBe(200);
      const data = await parseResponse<{ brief: { summary: string; topRequirements: string[] } }>(res);
      expect(data.brief).toBeDefined();
      expect(data.brief.summary).toBeTruthy();
    });

    it("2.5 POST /api/generate works with completely sparse / empty profile without crashing", async () => {
      const sparseProfile: UserProfile = {
        name: "",
        email: "",
        phone: "",
        location: "",
        targetTitle: "",
        summary: "",
        skills: [],
        experience: [],
        education: [],
      };

      const req = createJsonRequest("http://localhost/api/generate", "POST", {
        type: "match_analysis",
        job: mockJobApplication1,
        profile: sparseProfile,
      });

      const res = await POST_GENERATE(req);
      expect(res.status).toBe(200);
      const data = await parseResponse<{ analysis: { matchScore: number; strengths: string[] } }>(res);
      expect(data.analysis).toBeDefined();
      expect(data.analysis.matchScore).toBeGreaterThanOrEqual(0);
      expect(data.analysis.matchScore).toBeLessThanOrEqual(100);
    });

    it("2.6 POST /api/generate verifies deterministic fallback schemas for all 9 generation types", async () => {
      // 1. documents
      const resDocs = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "documents",
        job: mockJobApplication1,
        profile: mockUserProfile,
      }));
      expect(resDocs.status).toBe(200);
      const dataDocs = await parseResponse<{ documents: { tailoredResume: string; coverLetter: string; source: string } }>(resDocs);
      expect(dataDocs.documents.tailoredResume).toContain("ALEX JOHNSON");
      expect(dataDocs.documents.coverLetter).toContain("Acme Corp");
      expect(dataDocs.documents.source).toBe("heuristic_fallback");

      // 2. match_analysis
      const resMatch = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "match_analysis",
        job: mockJobApplication1,
        profile: mockUserProfile,
      }));
      expect(resMatch.status).toBe(200);
      const dataMatch = await parseResponse<{ analysis: { matchScore: number; source: string } }>(resMatch);
      expect(dataMatch.analysis.matchScore).toBeGreaterThan(0);
      expect(dataMatch.analysis.source).toBe("heuristic_fallback");

      // 3. star_flashcards
      const resStar = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "star_flashcards",
        job: mockJobApplication1,
        profile: mockUserProfile,
      }));
      expect(resStar.status).toBe(200);
      const dataStar = await parseResponse<{ cards: { competency: string; situation: string }[] }>(resStar);
      expect(dataStar.cards.length).toBeGreaterThan(0);

      // 4. interview_questions
      const resQuestions = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "interview_questions",
        job: mockJobApplication1,
        profile: mockUserProfile,
      }));
      expect(resQuestions.status).toBe(200);
      const dataQuestions = await parseResponse<{ questions: { category: string; question: string }[] }>(resQuestions);
      expect(dataQuestions.questions.length).toBeGreaterThan(0);

      // 5. job_brief
      const resBrief = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "job_brief",
        job: mockJobApplication1,
        profile: mockUserProfile,
      }));
      expect(resBrief.status).toBe(200);
      const dataBrief = await parseResponse<{ brief: { summary: string; topRequirements: string[] } }>(resBrief);
      expect(dataBrief.brief.summary).toBeTruthy();

      // 6. salary_intel
      const resSalary = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "salary_intel",
        job: mockJobApplication1,
        profile: mockUserProfile,
      }));
      expect(resSalary.status).toBe(200);
      const dataSalary = await parseResponse<{ salary: { estimateLow: number; estimateHigh: number } }>(resSalary);
      expect(dataSalary.salary.estimateHigh).toBeGreaterThan(0);

      // 7. recommendations
      const resRecs = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "recommendations",
        profile: mockUserProfile,
        trackedJobs: [mockJobApplication1],
      }));
      expect(resRecs.status).toBe(200);
      const dataRecs = await parseResponse<{ recommendations: unknown[] }>(resRecs);
      expect(dataRecs.recommendations.length).toBeGreaterThan(0);

      // 8. skill_roadmap
      const resRoadmap = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "skill_roadmap",
        profile: mockUserProfile,
        gaps: ["Rust", "Kubernetes"],
      }));
      expect(resRoadmap.status).toBe(200);
      const dataRoadmap = await parseResponse<{ roadmap: unknown[] }>(resRoadmap);
      expect(dataRoadmap.roadmap.length).toBeGreaterThan(0);

      // 9. pipeline_report
      const resReport = await POST_GENERATE(createJsonRequest("http://localhost/api/generate", "POST", {
        type: "pipeline_report",
        profile: mockUserProfile,
        trackedJobs: [mockJobApplication1, mockJobApplication2],
      }));
      expect(resReport.status).toBe(200);
      const dataReport = await parseResponse<{ report: { headline: string } }>(resReport);
      expect(dataReport.report.headline).toBeTruthy();
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Section 3: Job Fit Scoring & ATS Boundary & Dealbreaker Engine           */
  /* ------------------------------------------------------------------------ */
  describe("3. Deterministic Fit Scoring & ATS Boundary Engine", () => {
    it("3.1 scoreFit handles zero/empty strings without throwing and returns valid low rating", () => {
      const emptyJob = { title: "", company: "", salary: "", jobDescription: "" };
      const emptyProfile: UserProfile = {
        name: "",
        email: "",
        phone: "",
        location: "",
        targetTitle: "",
        summary: "",
        skills: [],
        experience: [],
        education: [],
      };

      const result = scoreFit(emptyJob, emptyProfile, []);
      expect(result).toBeDefined();
      expect(result.fit).toBe("low");
      expect(result.dealbreakers).toEqual([]);
    });

    it("3.2 scoreFit catches visa sponsorship dealbreaker when JD requires existing legal authorization", () => {
      const visaRestrictedJob = {
        title: "Staff Systems Engineer",
        company: "Defense Tech LLC",
        salary: "$180,000",
        jobDescription: "Must already hold valid work authorization. No visa sponsorship provided. Citizenship required.",
      };
      const candidateNeedingVisa: UserProfile = {
        ...mockUserProfile,
        workPermitStatus: "sponsorship_required",
      };

      const result = scoreFit(visaRestrictedJob, candidateNeedingVisa, ["TypeScript"]);
      expect(result.fit).toBe("skip");
      expect(result.dealbreakers.some((d) => d.includes("sponsorship"))).toBe(true);
    });

    it("3.3 scoreFit catches security clearance dealbreaker when role requires active clearance", () => {
      const clearanceJob = {
        title: "Cloud Security Specialist",
        company: "GovSec Systems",
        salary: "$190,000",
        jobDescription: "Active TS/SCI security clearance level required for immediate deployment.",
      };
      const unclassifiedCandidate: UserProfile = {
        ...mockUserProfile,
        clearanceLevel: undefined,
      };

      const result = scoreFit(clearanceJob, unclassifiedCandidate, ["AWS", "Docker"]);
      expect(result.fit).toBe("skip");
      expect(result.dealbreakers.some((d) => d.includes("security clearance"))).toBe(true);
    });

    it("3.4 scoreFit catches location dealbreaker when role is strictly on-site and candidate is remote-only", () => {
      const onSiteJob = {
        title: "Data Center Tech",
        company: "Core Infra Corp",
        salary: "$130,000",
        jobDescription: "Mandatory 100% on-site presence required at our Dallas data center. Relocation mandatory.",
      };
      const remoteOnlyCandidate: UserProfile = {
        ...mockUserProfile,
        preferredWorkMode: "remote",
        willingnessToRelocate: "no",
      };

      const result = scoreFit(onSiteJob, remoteOnlyCandidate, ["Linux", "Networking"]);
      expect(result.fit).toBe("skip");
      expect(result.dealbreakers.length).toBeGreaterThan(0);
    });

    it("3.5 scoreFit catches salary dealbreaker when stated salary ceiling is below candidate minimum expectation", () => {
      const lowSalaryJob = {
        title: "Junior Support Engineer",
        company: "Budget Corp",
        salary: "$60,000 - $75,000",
        jobDescription: "Entry level web maintenance role.",
      };
      const seniorCandidate: UserProfile = {
        ...mockUserProfile,
        desiredSalary: "$150,000",
      };

      const result = scoreFit(lowSalaryJob, seniorCandidate, ["HTML", "CSS"]);
      expect(result.fit).toBe("skip");
      expect(result.dealbreakers.some((d) => d.includes("below your minimum"))).toBe(true);
    });

    it("3.6 scoreFit yields high fit rating when core skills, title family, seniority, and salary align", () => {
      const perfectJob = {
        title: "Senior Full-Stack Engineer",
        company: "HyperScale Inc",
        salary: "$160,000 - $195,000",
        jobDescription: "Senior Full-Stack Engineer needed for distributed React and TypeScript infrastructure. Remote (US).",
      };
      const matchingSkills = ["React", "TypeScript", "Node.js", "GraphQL"];

      const result = scoreFit(perfectJob, mockUserProfile, matchingSkills);
      expect(result.fit).toBe("high");
      expect(result.dealbreakers).toHaveLength(0);
      expect(result.mustHavesMet.length).toBeGreaterThanOrEqual(2);
      expect(result.niceHavesMet.length).toBeGreaterThanOrEqual(2);
    });

    it("3.7 analyzeAts survives null/empty inputs without crashing or producing NaN", () => {
      const reportEmpty = analyzeAts("");
      expect(reportEmpty.score).toBeGreaterThanOrEqual(0);
      expect(reportEmpty.score).toBeLessThanOrEqual(100);
      expect(reportEmpty.checks.length).toBeGreaterThan(0);
      expect(reportEmpty.estimatedPages).toBe(1);
      expect(Number.isNaN(reportEmpty.score)).toBe(false);

      const reportNull = analyzeAts(null as unknown as string);
      expect(reportNull.score).toBeGreaterThanOrEqual(0);
      expect(Number.isNaN(reportNull.score)).toBe(false);
    });

    it("3.8 analyzeAts flags layout breakers (tabular, multicols, includegraphics)", () => {
      const dirtyTex = `
        \\documentclass{article}
        \\begin{document}
        \\begin{tabular}{cc} Name & Role \\end{tabular}
        \\includegraphics{headshot.jpg}
        \\begin{multicols}{2} Two column text \\end{multicols}
        \\end{document}
      `;
      const report = analyzeAts(dirtyTex);
      const layoutCheck = report.checks.find((c) => c.id === "layout");
      expect(layoutCheck).toBeDefined();
      expect(layoutCheck?.ok).toBe(false);
    });

    it("3.9 analyzeAts flags excessive length discipline when word count exceeds 2 pages (>1000 words)", () => {
      const longText = "Summary Experience Education Skills. Led built shipped developed. " + "word ".repeat(1500);
      const report = analyzeAts(longText);
      const lengthCheck = report.checks.find((c) => c.id === "length");
      expect(lengthCheck).toBeDefined();
      expect(lengthCheck?.ok).toBe(false);
      expect(report.estimatedPages).toBeGreaterThan(2);
    });

    it("3.10 analyzeAts flags recruiter jargon and filler phrases", () => {
      const jargonText = "Alex Johnson | alex@example.com | Experience | Education | Skills | Summary\n" +
        "Hard-working results-driven team player responsible for duties included in engineering.";
      const report = analyzeAts(jargonText);
      const fillerCheck = report.checks.find((c) => c.id === "filler");
      expect(fillerCheck).toBeDefined();
      expect(fillerCheck?.ok).toBe(false);
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Section 4: Resume Agent, Template Engine & Malformed Content             */
  /* ------------------------------------------------------------------------ */
  describe("4. Resume Agent & LaTeX Compilation Resilience", () => {
    it("4.1 loadTemplateSource throws descriptive error on unknown template ID", () => {
      expect(() => loadTemplateSource("non-existent-template-id")).toThrow("Unknown resume template");
    });

    it("4.2 renderTemplate successfully compiles system templates with minimal / sparse content", () => {
      const templates = ["classic-ats", "modern-professional", "executive", "minimal-clean", "technical-modern", "nordic-clean"];
      const minimalContent: ResumeContent = {
        header: {
          name: "Test Candidate",
          title: "Engineer",
          email: "test@example.com",
          phone: "555-0100",
          location: "Online",
          linkedin: "",
          github: "",
          portfolio: "",
        },
        summary: "Minimal summary statement.",
        skills: ["Testing"],
      };

      for (const tId of templates) {
        const tex = renderTemplate(tId, minimalContent);
        expect(tex).toBeDefined();
        expect(tex).toContain("Test Candidate");
        expect(tex).toContain("test@example.com");
        expect(tex).not.toContain("{{NAME}}");
      }
    });

    it("4.3 escapeLatex sanitizes special characters without generating unescaped syntax", () => {
      const dangerous = "Special chars: & % $ # _ { } ~ ^ \\ and quotes \"test\"";
      const escaped = escapeLatex(dangerous);
      expect(escaped).toContain("\\&");
      expect(escaped).toContain("\\%");
      expect(escaped).toContain("\\$");
      expect(escaped).toContain("\\#");
      expect(escaped).toContain("\\_");
      expect(escaped).not.toContain(" & ");
    });

    it("4.4 runResumeAgent executes deterministic fallbacks across draft, improve, tailor, ats, and parse_pdf", async () => {
      // 1. draft
      const resDraft = await runResumeAgent({
        task: "draft",
        kind: "resume",
        templateId: "classic-ats",
        profile: mockUserProfile,
      });
      expect(resDraft.tex).toContain("Alex Johnson");
      expect(resDraft.summary).toContain("deterministic fallback");

      // 2. tailor
      const resTailor = await runResumeAgent({
        task: "tailor",
        kind: "resume",
        templateId: "modern-professional",
        profile: mockUserProfile,
        current: resDraft.content,
        job: {
          title: mockJobApplication1.title,
          company: mockJobApplication1.company,
          jobDescription: mockJobApplication1.jobDescription || "",
        },
      });
      expect(resTailor.content.skills).toBeDefined();
      expect(resTailor.summary).toContain("Tailored");

      // 3. ats
      const resAts = await runResumeAgent({
        task: "ats",
        kind: "resume",
        templateId: "classic-ats",
        profile: mockUserProfile,
        current: resDraft.content,
        job: {
          title: mockJobApplication1.title,
          company: mockJobApplication1.company,
          jobDescription: mockJobApplication1.jobDescription || "",
        },
      });
      expect(resAts.ats).toBeDefined();
      expect(resAts.ats?.score).toBeGreaterThan(0);

      // 4. parse_pdf fallback
      const sampleText = "Alex Johnson\nSenior Engineer\nalex@example.com\n(555) 123-4567\nExperience\nGoogle -- Engineer\nSkills\nReact, TypeScript";
      const resParse = await runResumeAgent({
        task: "parse_pdf",
        kind: "resume",
        templateId: "classic-ats",
        extractedText: sampleText,
      });
      expect(resParse.content.header.name).toBe("Alex Johnson");
      expect(resParse.content.header.email).toBe("alex@example.com");
    });

    it("4.5 parseResumeTextFallback handles unformatted text missing email or standard headers", () => {
      const unstructuredText = "CURRICULUM VITAE\nJane Doe\nArchitect\nNo direct email listed\nSummary\nExperienced architect.";
      const parsed = parseResumeTextFallback(unstructuredText);
      expect(parsed.header.name).toBe("Jane Doe");
      expect(parsed.header.title).toBe("Architect");
      expect(parsed.header.email).toBe("");
    });
  });

  /* ------------------------------------------------------------------------ */
  /* Section 5: Agent Pipeline & Multi-Agent Graph Stress Verification        */
  /* ------------------------------------------------------------------------ */
  describe("5. Multi-Agent Pipeline & Partial Execution Resilience", () => {
    it("5.1 POST /api/agent/partial-pipeline returns 400 for invalid stopAfter / step parameter", async () => {
      const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
        jobId: mockJobApplication1.id,
        profile: mockUserProfile,
        stopAfter: "invalid_hallucinated_step",
      });

      const res = await POST_PARTIAL_PIPELINE(req);
      expect(res.status).toBe(400);
      const data = await parseResponse<{ error: string }>(res);
      expect(data.error).toContain("Invalid stopAfter node");
    });

    it("5.2 POST /api/agent/partial-pipeline returns 400 when missing jobId or profile", async () => {
      const req1 = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
        profile: mockUserProfile,
        step: "intel",
      });
      const res1 = await POST_PARTIAL_PIPELINE(req1);
      expect(res1.status).toBe(400);

      const req2 = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
        jobId: mockJobApplication1.id,
        step: "intel",
      });
      const res2 = await POST_PARTIAL_PIPELINE(req2);
      expect(res2.status).toBe(400);
    });

    it("5.3 POST /api/agent/partial-pipeline returns 404 for non-existent jobId", async () => {
      const req = createJsonRequest("http://localhost/api/agent/partial-pipeline", "POST", {
        jobId: "non-existent-job-uuid-999",
        profile: mockUserProfile,
        step: "intel",
      });

      const res = await POST_PARTIAL_PIPELINE(req);
      expect(res.status).toBe(404);
      const data = await parseResponse<{ error: string }>(res);
      expect(data.error).toBe("Job not found");
    });

    it("5.4 runPartialPipeline executes companyIntel (intel) step and terminates cleanly", async () => {
      const result = await runPartialPipeline({
        job: {
          id: mockJobApplication1.id,
          title: mockJobApplication1.title,
          company: mockJobApplication1.company,
          jobDescription: mockJobApplication1.jobDescription || "",
        },
        profile: mockUserProfile,
        targetRegion: "US",
        stopAfter: "companyIntel",
      });

      expect(result.threadId).toBeDefined();
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.logs.some((l) => l.message.includes("CompanyIntel"))).toBe(true);

      const history = agentRunHistoryRepo.listRecent(10);
      expect(history.some((h) => h.agentName.includes("companyIntel"))).toBe(true);
    });

    it("5.5 runPartialPipeline executes multi-step chain up to atsAudit (audit) with regional norms", async () => {
      const result = await runPartialPipeline({
        job: {
          id: mockJobApplication1.id,
          title: mockJobApplication1.title,
          company: mockJobApplication1.company,
          jobDescription: mockJobApplication1.jobDescription || "",
        },
        profile: mockUserProfile,
        targetRegion: "DE",
        stopAfter: "atsAudit",
      });

      expect(result.recommendedTemplate).toBeDefined();
      expect(result.atsScore).toBeGreaterThanOrEqual(0);
      expect(result.logs.some((l) => l.message.includes("RegionalNorms"))).toBe(true);
      expect(result.logs.some((l) => l.message.includes("ATSAudit"))).toBe(true);
    });

    it("5.6 auditRegionalCompliance identifies sensitive PII restrictions across US, EU, and DE", () => {
      const textWithPii = "Alex Johnson\nBorn: 1990-05-12\nSSN: 123-45-6789\nMarried, 2 children\nGerman citizen\nPhoto attached.";

      const auditUS = auditRegionalCompliance(textWithPii, "US");
      expect(auditUS.warnings.length).toBeGreaterThan(0);
      expect(auditUS.warnings.some((w) => w.includes("photo") || w.includes("age") || w.includes("anti-discrimination"))).toBe(true);

      const deRules = getRegionalRules("DE");
      expect(deRules).toBeDefined();
      expect(deRules.recommendedTemplate).toBe("tabular-german");
    });

    it("5.7 runMultiAgentApp executes safely with submit: false and logs execution to history", async () => {
      const result = await runMultiAgentApp({
        job: {
          id: mockJobApplication1.id,
          title: mockJobApplication1.title,
          company: mockJobApplication1.company,
          jobDescription: mockJobApplication1.jobDescription || "",
          url: mockJobApplication1.url,
        },
        profile: mockUserProfile,
        targetRegion: "US",
        submit: false,
      });

      expect(["manual_required", "skipped", "applied"]).toContain(result.status);
      expect(result.logs.length).toBeGreaterThan(0);
      expect(result.atsScore).toBeGreaterThanOrEqual(0);

      const recentHistory = agentRunHistoryRepo.listRecent(10);
      expect(recentHistory.some((h) => h.agentName === "MasterMultiAgentOrchestrator")).toBe(true);
    }, 180000);
  });

  /* ------------------------------------------------------------------------ */
  /* Section 6: Document Vault Adversarial Boundaries                         */
  /* ------------------------------------------------------------------------ */
  describe("6. Document Vault Adversarial & Ingestion Boundaries", () => {
    it("6.1 Ingesting zero-byte file throws error and rolls back doc entry", async () => {
      const initialDocCount = listDocuments().length;
      await expect(
        ingestDocument({
          buffer: Buffer.from(""),
          filename: "empty-resume.txt",
          mime: "text/plain",
        })
      ).rejects.toThrow();

      expect(listDocuments().length).toBe(initialDocCount);
    });

    it("6.2 Ingesting unsupported MIME type is rejected without polluting DB", async () => {
      const initialDocCount = listDocuments().length;
      await expect(
        ingestDocument({
          buffer: Buffer.from("MZ\x90\x00\x03\x00\x00\x00"),
          filename: "malware.exe",
          mime: "application/x-msdownload",
        })
      ).rejects.toThrow("Unsupported file type");

      expect(listDocuments().length).toBe(initialDocCount);
    });

    it("6.3 POST /api/vault rejects uploads larger than 25MB with 413 Payload Too Large", async () => {
      const largeBlob = new Blob([new Uint8Array(26 * 1024 * 1024)], { type: "application/pdf" });
      const mockFile = new File([largeBlob], "giant-portfolio.pdf", { type: "application/pdf" });

      const formData = new FormData();
      formData.append("file", mockFile);

      const req = createFormDataRequest("http://localhost/api/vault", formData);
      const res = await POST_VAULT(req);
      expect(res.status).toBe(413);
      const data = await parseResponse<{ error: string }>(res);
      expect(data.error).toContain("File too large");
    });

    it("6.4 Ingesting file with special / malicious path characters stores sanitized filename safely", async () => {
      const pathTraversalName = "../../../etc/passwd_resume.txt";
      const doc = await ingestDocument({
        buffer: Buffer.from("Alex Johnson Software Engineer resume content with extensive TypeScript background."),
        filename: pathTraversalName,
        mime: "text/plain",
        label: "Secure Upload",
      });

      expect(doc.id).toBeDefined();
      expect(doc.status).toBe("ready");
      expect(doc.chunkCount).toBeGreaterThan(0);

      // Clean up
      deleteDocument(doc.id);
    });

    it("6.5 chunkText handles empty strings, long token words, and unicode gracefully", () => {
      expect(chunkText("")).toEqual([]);
      expect(chunkText("   \n\t  ")).toEqual([]);

      const singleHugeWord = "A".repeat(5000);
      const chunksHuge = chunkText(singleHugeWord);
      expect(chunksHuge.length).toBeGreaterThan(0);

      const text = "word ".repeat(1500);
      const chunks = chunkText(text);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        expect(c.tokens).toBeLessThanOrEqual(800);
      }
    });

    it("6.6 localEmbed and cosine math withstand empty, identical, and mismatched vectors", () => {
      const vec1 = localEmbed("react typescript nextjs backend");
      const vec2 = localEmbed("react typescript nextjs backend");
      const vec3 = localEmbed("cooking recipes Italian pasta");

      expect(vec1.length).toBe(256);
      expect(cosine(vec1, vec2)).toBeCloseTo(1.0, 4);
      expect(cosine(vec1, vec3)).toBeLessThan(0.7);

      expect(cosine([], [1, 2, 3])).toBe(0);
      expect(cosine([1, 2], [1, 2, 3])).toBe(0);
    });

    it("6.7 GET & POST /api/vault/search validate empty queries and clamp boundary k parameters", async () => {
      // Missing query -> 400
      const resEmptyGet = await GET_VAULT_SEARCH(createUrlRequest("http://localhost/api/vault/search?q="));
      expect(resEmptyGet.status).toBe(400);

      const resEmptyPost = await POST_VAULT_SEARCH(createJsonRequest("http://localhost/api/vault/search", "POST", { query: "   " }));
      expect(resEmptyPost.status).toBe(400);

      // Valid search with extreme k bounds
      const resKBound = await GET_VAULT_SEARCH(createUrlRequest("http://localhost/api/vault/search?q=TypeScript&k=9999"));
      expect(resKBound.status).toBe(200);
      const dataKBound = await parseResponse<{ hits: unknown[] }>(resKBound);
      expect(Array.isArray(dataKBound.hits)).toBe(true);
    });

    it("6.8 Document Vault CRUD: Ingest, Patch Label, List, Search, and Delete", async () => {
      const doc = await ingestDocument({
        buffer: Buffer.from("HuntFlow architectural documentation and candidate profile notes covering React 19 and SQLite WAL mode."),
        filename: "huntflow-architecture.md",
        mime: "text/markdown",
        label: "Architecture Doc",
      });

      expect(listDocuments().some((d) => d.id === doc.id)).toBe(true);

      // Search
      const hits = await searchVault("architectural documentation React SQLite", 5);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits.some((h) => h.docId === doc.id)).toBe(true);

      // Patch label
      setDocLabel(doc.id, "Updated Architecture Label");
      const updatedDoc = listDocuments().find((d) => d.id === doc.id);
      expect(updatedDoc?.label).toBe("Updated Architecture Label");

      // Delete
      const deleted = deleteDocument(doc.id);
      expect(deleted).toBe(true);
      expect(listDocuments().some((d) => d.id === doc.id)).toBe(false);
    });
  });
});
