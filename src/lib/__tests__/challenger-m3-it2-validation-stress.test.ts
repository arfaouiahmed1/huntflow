import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  AddJobSchema,
  VaultProfileSchema,
  VaultSearchSchema,
  VaultFileValidation,
  SettingsProfileSchema,
  CloudinarySettingsSchema,
  MailSettingsSchema,
  formatZodErrors,
  AddJobFormData,
} from "@/lib/validation";

describe("Empirical Challenger 1: Zod Schemas & Validation Boundaries Stress Harness", () => {
  /* =========================================================================
   * 1. AddJobSchema Boundary & Adversarial Stress Tests
   * ========================================================================= */
  describe("1. AddJobSchema Adversarial Boundaries", () => {
    const validMinimalJob: AddJobFormData = {
      title: "Senior Engineer",
      company: "Acme Corp",
      location: "Remote",
      salary: "$120k - $150k",
      status: "wishlist",
      description: "A comprehensive description that exceeds twenty characters for testing.",
      url: "https://acme.com/jobs/123",
    };

    it("accepts valid minimal and maximal payloads with exact boundary lengths", () => {
      // Min title length: 2 characters
      const minTitle = { ...validMinimalJob, title: "AI" };
      expect(AddJobSchema.safeParse(minTitle).success).toBe(true);

      // Max title length: 120 characters
      const maxTitle = { ...validMinimalJob, title: "T".repeat(120) };
      expect(AddJobSchema.safeParse(maxTitle).success).toBe(true);

      // Min company length: 1 character
      const minCompany = { ...validMinimalJob, company: "Q" };
      expect(AddJobSchema.safeParse(minCompany).success).toBe(true);

      // Max company length: 100 characters
      const maxCompany = { ...validMinimalJob, company: "C".repeat(100) };
      expect(AddJobSchema.safeParse(maxCompany).success).toBe(true);

      // Min description length: 20 characters
      const minDesc = { ...validMinimalJob, description: "12345678901234567890" };
      expect(AddJobSchema.safeParse(minDesc).success).toBe(true);

      // Max description length: 50,000 characters
      const maxDesc = { ...validMinimalJob, description: "D".repeat(50000) };
      expect(AddJobSchema.safeParse(maxDesc).success).toBe(true);
    });

    it("rejects values violating lower and upper bounds", () => {
      // Below min title: 1 character or whitespace
      expect(AddJobSchema.safeParse({ ...validMinimalJob, title: "A" }).success).toBe(false);
      expect(AddJobSchema.safeParse({ ...validMinimalJob, title: "   A   " }).success).toBe(false);
      expect(AddJobSchema.safeParse({ ...validMinimalJob, title: "T".repeat(121) }).success).toBe(false);

      // Below min company: empty or whitespace
      expect(AddJobSchema.safeParse({ ...validMinimalJob, company: "" }).success).toBe(false);
      expect(AddJobSchema.safeParse({ ...validMinimalJob, company: "   " }).success).toBe(false);
      expect(AddJobSchema.safeParse({ ...validMinimalJob, company: "C".repeat(101) }).success).toBe(false);

      // Below min description: 19 characters
      expect(AddJobSchema.safeParse({ ...validMinimalJob, description: "1234567890123456789" }).success).toBe(false);
      // Description with only whitespace
      expect(AddJobSchema.safeParse({ ...validMinimalJob, description: " ".repeat(25) }).success).toBe(false);
      // Exceeding 50,000 characters
      expect(AddJobSchema.safeParse({ ...validMinimalJob, description: "D".repeat(50001) }).success).toBe(false);
    });

    it("sanitizes inputs by trimming whitespace across all text fields", () => {
      const untrimmed = {
        ...validMinimalJob,
        title: "   Staff AI Architect   ",
        company: "   OpenAI Labs   ",
        location: "   San Francisco, CA   ",
        salary: "   $200,000 - $250,000   ",
        description: "   We are hiring a staff AI architect to design autonomous agent systems.   ",
        url: "   https://openai.com/careers/456   ",
      };

      const result = AddJobSchema.safeParse(untrimmed);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("Staff AI Architect");
        expect(result.data.company).toBe("OpenAI Labs");
        expect(result.data.location).toBe("San Francisco, CA");
        expect(result.data.salary).toBe("$200,000 - $250,000");
        expect(result.data.description).toBe("We are hiring a staff AI architect to design autonomous agent systems.");
        expect(result.data.url).toBe("https://openai.com/careers/456");
      }
    });

    it("handles Unicode, multi-byte characters, and RTL scripts safely", () => {
      const unicodeJob = {
        title: "مهندس ذكاء اصطناعي (AI Lead)",
        company: "مختبرات الأبحاث 東京研究所 🤖",
        location: "تونس / Tokyo (Remote)",
        salary: "¥15,000,000 - ¥20,000,000",
        status: "wishlist" as const,
        description: "نبحث عن مهندس ذكاء اصطناعي متمرس لبناء أنظمة متعددة الوكلاء باستخدام نماذج اللغات الكبيرة.",
        url: "https://example.jp/careers/ai-lead",
      };

      const result = AddJobSchema.safeParse(unicodeJob);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("مهندس ذكاء اصطناعي (AI Lead)");
        expect(result.data.company).toBe("مختبرات الأبحاث 東京研究所 🤖");
      }
    });

    it("rejects non-URL strings for the url field", () => {
      const malformedUrls = [
        "not a url",
        "careers.google.com/without-protocol",
        "http://",
        "https://",
        "invalid://::",
        "http://[::1",
      ];

      for (const badUrl of malformedUrls) {
        const res = AddJobSchema.safeParse({ ...validMinimalJob, url: badUrl });
        expect(res.success).toBe(false);
      }
    });

    it("allows optional fields to be undefined or empty string literal", () => {
      const emptyOptional1 = { ...validMinimalJob, salary: "", url: "" };
      expect(AddJobSchema.safeParse(emptyOptional1).success).toBe(true);

      const emptyOptional2 = { ...validMinimalJob, salary: undefined, url: undefined };
      expect(AddJobSchema.safeParse(emptyOptional2).success).toBe(true);
    });
  });

  /* =========================================================================
   * 2. VaultProfileSchema & VaultSearchSchema Stress Tests
   * ========================================================================= */
  describe("2. VaultProfileSchema & VaultSearchSchema Boundaries", () => {
    const validVaultBase = {
      name: "Ahmed Arfaoui",
      email: "ahmed@huntflow.ai",
      phone: "+216 58 732 642",
      address: "123 Innovation Avenue",
      city: "Tunis",
      country: "Tunisia",
      headline: "AI Engineer & Agent Systems Specialist",
      targetTitle: "Lead AI Engineer",
      summary: "Experienced in building autonomous agents and RAG pipelines.",
      workPermitStatus: "authorized" as const,
      desiredSalary: "$130k",
      noticePeriod: "2 Weeks",
      preferredWorkMode: "remote" as const,
      willingnessToRelocate: "yes" as const,
      yearsOfExperience: 4,
      linkedin: "https://linkedin.com/in/ahmed-arfaoui",
      github: "https://github.com/ahmedarfaoui",
      portfolio: "https://ahmedarfaoui.dev",
    };

    it("validates valid VaultProfile with full optional demographic fields", () => {
      const result = VaultProfileSchema.safeParse(validVaultBase);
      expect(result.success).toBe(true);
    });

    it("enforces email validation strictly", () => {
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, email: "invalid-email" }).success).toBe(false);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, email: "@domain.com" }).success).toBe(false);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, email: "user@" }).success).toBe(false);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, email: "user@domain..com" }).success).toBe(false);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, email: "valid.user+huntflow@sub.domain.org" }).success).toBe(true);
    });

    it("validates yearsOfExperience boundaries (0 to 60, allows NaN for empty input)", () => {
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, yearsOfExperience: 0 }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, yearsOfExperience: 60 }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, yearsOfExperience: -0.5 }).success).toBe(false);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, yearsOfExperience: 61 }).success).toBe(false);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, yearsOfExperience: NaN }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, yearsOfExperience: undefined }).success).toBe(true);
    });

    it("validates enum fields and rejects invalid values", () => {
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, workPermitStatus: "authorized" }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, workPermitStatus: "citizen" }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, workPermitStatus: "illegal_val" as unknown as "authorized" }).success).toBe(false);

      expect(VaultProfileSchema.safeParse({ ...validVaultBase, preferredWorkMode: "remote" }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, preferredWorkMode: "hybrid" }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, preferredWorkMode: "onsite" }).success).toBe(true);
      expect(VaultProfileSchema.safeParse({ ...validVaultBase, preferredWorkMode: "other" as unknown as "remote" }).success).toBe(false);

      expect(VaultProfileSchema.safeParse({ ...validVaultBase, willingnessToRelocate: "remote_only" }).success).toBe(true);
    });

    it("validates VaultSearchSchema query string limits (2 to 300)", () => {
      expect(VaultSearchSchema.safeParse({ query: "a" }).success).toBe(false);
      expect(VaultSearchSchema.safeParse({ query: "  a  " }).success).toBe(false);
      expect(VaultSearchSchema.safeParse({ query: "ai" }).success).toBe(true);
      expect(VaultSearchSchema.safeParse({ query: "q".repeat(300) }).success).toBe(true);
      expect(VaultSearchSchema.safeParse({ query: "q".repeat(301) }).success).toBe(false);
    });
  });

  /* =========================================================================
   * 3. SettingsProfileSchema & Cloudinary / Mail Schemas Stress Tests
   * ========================================================================= */
  describe("3. SettingsProfileSchema & System Integration Schemas", () => {
    it("validates SettingsProfileSchema with nested experience and education objects", () => {
      const validProfile = {
        name: "Ahmed Arfaoui",
        email: "ahmed@example.com",
        targetTitle: "Lead AI Engineer",
        skills: ["TypeScript", "Next.js", "Python", "SQLite"],
        experience: [
          {
            id: "exp-1",
            company: "Tech Corp",
            role: "Senior AI Engineer",
            duration: "2024 - Present",
            bulletPoints: ["Architected LangGraph multi-agent pipelines with 98% reliability."],
          },
        ],
        education: [
          {
            id: "edu-1",
            degree: "Master in Computer Science",
            school: "ESPRIT Engineering School",
            year: "2026",
          },
        ],
      };

      const result = SettingsProfileSchema.safeParse(validProfile);
      expect(result.success).toBe(true);

      // Experience with missing company
      const missingCompany = {
        ...validProfile,
        experience: [{ id: "exp-1", company: "", role: "Lead" }],
      };
      expect(SettingsProfileSchema.safeParse(missingCompany).success).toBe(false);

      // Experience with missing role
      const missingRole = {
        ...validProfile,
        experience: [{ id: "exp-1", company: "Company", role: "" }],
      };
      expect(SettingsProfileSchema.safeParse(missingRole).success).toBe(false);

      // Education with missing degree or school
      const missingEdu = {
        ...validProfile,
        education: [{ id: "edu-1", degree: "", school: "ESPRIT", year: "2026" }],
      };
      expect(SettingsProfileSchema.safeParse(missingEdu).success).toBe(false);
    });

    it("validates CloudinarySettingsSchema default values and concurrency constraints", () => {
      // Empty input uses default empty strings and concurrency 1
      const emptyResult = CloudinarySettingsSchema.safeParse({});
      expect(emptyResult.success).toBe(true);
      if (emptyResult.success) {
        expect(emptyResult.data.cloudName).toBe("");
        expect(emptyResult.data.apiKey).toBe("");
        expect(emptyResult.data.apiSecret).toBe("");
        expect(emptyResult.data.concurrency).toBe(1);
      }

      // Concurrency must be integer between 1 and 16
      expect(CloudinarySettingsSchema.safeParse({ concurrency: 1 }).success).toBe(true);
      expect(CloudinarySettingsSchema.safeParse({ concurrency: 16 }).success).toBe(true);
      expect(CloudinarySettingsSchema.safeParse({ concurrency: 0 }).success).toBe(false);
      expect(CloudinarySettingsSchema.safeParse({ concurrency: 17 }).success).toBe(false);
      expect(CloudinarySettingsSchema.safeParse({ concurrency: 4.5 }).success).toBe(false); // floats rejected
    });

    it("validates MailSettingsSchema ports and email fields", () => {
      const validMail = {
        smtpHost: "smtp.gmail.com",
        smtpPort: 587,
        smtpUser: "test@gmail.com",
        smtpPass: "secretpass",
        imapHost: "imap.gmail.com",
        imapPort: 993,
        imapUser: "test@gmail.com",
        imapPass: "secretpass",
        fromName: "Huntflow Candidate",
        fromEmail: "test@gmail.com",
      };

      expect(MailSettingsSchema.safeParse(validMail).success).toBe(true);

      // Port bounds
      expect(MailSettingsSchema.safeParse({ ...validMail, smtpPort: 0 }).success).toBe(false);
      expect(MailSettingsSchema.safeParse({ ...validMail, smtpPort: 65536 }).success).toBe(false);
      expect(MailSettingsSchema.safeParse({ ...validMail, smtpPort: 65535 }).success).toBe(true);
      expect(MailSettingsSchema.safeParse({ ...validMail, smtpPort: 1 }).success).toBe(true);

      // Invalid email addresses
      expect(MailSettingsSchema.safeParse({ ...validMail, fromEmail: "not-an-email" }).success).toBe(false);
      expect(MailSettingsSchema.safeParse({ ...validMail, smtpUser: "not-an-email" }).success).toBe(false);
    });
  });

  /* =========================================================================
   * 4. formatZodErrors Mapping & Edge Cases
   * ========================================================================= */
  describe("4. formatZodErrors Formatting Logic", () => {
    it("correctly maps single, nested, and array-indexed error paths", () => {
      const testSchema = z.object({
        user: z.object({
          name: z.string().min(2, "Name too short"),
          contact: z.object({
            email: z.string().email("Invalid email"),
          }),
        }),
        items: z.array(
          z.object({
            title: z.string().min(1, "Title required"),
          })
        ),
      });

      const invalidData = {
        user: {
          name: "A",
          contact: { email: "invalid" },
        },
        items: [{ title: "" }],
      };

      const result = testSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMap = formatZodErrors(result.error);
        expect(errorMap["user.name"]).toBe("Name too short");
        expect(errorMap["user.contact.email"]).toBe("Invalid email");
        expect(errorMap["items.0.title"]).toBe("Title required");
      }
    });

    it("maps root-level validation errors with empty issue path to 'form'", () => {
      const rootSchema = z.string().refine(() => false, { message: "Root level error" });
      const result = rootSchema.safeParse("valid string triggering refine failure");
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMap = formatZodErrors(result.error);
        expect(errorMap["form"]).toBe("Root level error");
      }
    });

    it("retains the first error message when multiple issues exist on the same field", () => {
      const multiRuleSchema = z.object({
        field: z.string().min(5, "First rule failed").regex(/^[A-Z]+$/, "Second rule failed"),
      });

      const result = multiRuleSchema.safeParse({ field: "a" });
      expect(result.success).toBe(false);
      if (!result.success) {
        const errorMap = formatZodErrors(result.error);
        expect(errorMap["field"]).toBe("First rule failed");
      }
    });
  });

  /* =========================================================================
   * 5. VaultFileValidation Boundary Tests
   * ========================================================================= */
  describe("5. VaultFileValidation Limits & Extensions", () => {
    it("accepts valid PDF, DOCX, TXT, and MD files under 25MB", () => {
      const file25MB = { name: "portfolio.pdf", size: 25 * 1024 * 1024 } as File;
      const fileDocx = { name: "resume.docx", size: 1024 * 1024 } as File;
      const fileTxt = { name: "notes.txt", size: 500 } as File;
      const fileMd = { name: "readme.md", size: 100 } as File;

      expect(VaultFileValidation.validateFile(file25MB).valid).toBe(true);
      expect(VaultFileValidation.validateFile(fileDocx).valid).toBe(true);
      expect(VaultFileValidation.validateFile(fileTxt).valid).toBe(true);
      expect(VaultFileValidation.validateFile(fileMd).valid).toBe(true);
    });

    it("rejects files exceeding 25MB boundary by 1 byte", () => {
      const file25MBPlus1 = { name: "large.pdf", size: 25 * 1024 * 1024 + 1 } as File;
      const result = VaultFileValidation.validateFile(file25MBPlus1);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds 25 MB limit");
    });

    it("rejects disallowed file types (executable, html, image, zip)", () => {
      const badFiles = [
        { name: "script.sh", size: 100 } as File,
        { name: "page.html", size: 100 } as File,
        { name: "image.png", size: 100 } as File,
        { name: "archive.tar.gz", size: 100 } as File,
        { name: "binary.exe", size: 100 } as File,
      ];

      for (const f of badFiles) {
        const res = VaultFileValidation.validateFile(f);
        expect(res.valid).toBe(false);
        expect(res.error).toContain("must be a PDF, DOCX, TXT, or MD file");
      }
    });
  });
});
