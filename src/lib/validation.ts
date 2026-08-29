import { z } from "zod";

/* ------------------------------------------------------------------ *
 * Helper Utilities
 * ------------------------------------------------------------------ */

export type FormErrors<T = Record<string, unknown>> = Record<keyof T | string, string>;

/** Extracts field-level error messages from a ZodError */
export function formatZodErrors<T = unknown>(error: z.ZodError<T>): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path.join(".") || "form";
    if (!errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

/* ------------------------------------------------------------------ *
 * 1. AddJobModal Schemas
 * ------------------------------------------------------------------ */

export const ScrapeUrlSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Job offer URL is required")
    .url("Please enter a valid HTTP or HTTPS URL (e.g. https://careers.example.com/job/123)"),
});

export const AddJobSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Job title must be at least 2 characters")
    .max(120, "Job title cannot exceed 120 characters"),
  company: z
    .string()
    .trim()
    .min(1, "Company name is required")
    .max(100, "Company name cannot exceed 100 characters"),
  location: z
    .string()
    .trim()
    .max(100, "Location cannot exceed 100 characters")
    .default("Remote"),
  postalCode: z
    .string()
    .trim()
    .max(20, "Postal code cannot exceed 20 characters")
    .optional()
    .or(z.literal("")),
  salary: z
    .string()
    .trim()
    .max(80, "Salary range cannot exceed 80 characters")
    .optional()
    .or(z.literal("")),
  status: z.enum(["wishlist", "applied", "interviewing", "offer", "rejected"]),
  description: z
    .string()
    .trim()
    .min(20, "Job description must be at least 20 characters to enable AI tailoring and match scoring")
    .max(50000, "Job description cannot exceed 50,000 characters"),
  url: z
    .string()
    .trim()
    .url("Must be a valid URL")
    .optional()
    .or(z.literal("")),
});

export type AddJobFormData = z.infer<typeof AddJobSchema>;

/* ------------------------------------------------------------------ *
 * 2. Vault Schemas
 * ------------------------------------------------------------------ */

export const VaultProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Name cannot exceed 100 characters"),
  email: z
    .string()
    .trim()
    .min(1, "Email address is required")
    .email("Please enter a valid email address"),
  phone: z
    .string()
    .trim()
    .max(30, "Phone number cannot exceed 30 characters")
    .optional()
    .or(z.literal("")),
  address: z.string().trim().max(200, "Address cannot exceed 200 characters").optional().or(z.literal("")),
  city: z.string().trim().max(100, "City cannot exceed 100 characters").optional().or(z.literal("")),
  state: z.string().trim().max(100).optional().or(z.literal("")),
  postalCode: z.string().trim().max(30).optional().or(z.literal("")),
  country: z.string().trim().max(100, "Country cannot exceed 100 characters").optional().or(z.literal("")),
  location: z.string().trim().max(100).optional().or(z.literal("")),
  headline: z.string().trim().max(200).optional().or(z.literal("")),
  targetTitle: z.string().trim().max(100).optional().or(z.literal("")),
  summary: z.string().trim().max(3000).optional().or(z.literal("")),
  linkedin: z
    .string()
    .trim()
    .url("Must be a valid URL (https://linkedin.com/in/...)")
    .optional()
    .or(z.literal("")),
  github: z
    .string()
    .trim()
    .url("Must be a valid URL (https://github.com/...)")
    .optional()
    .or(z.literal("")),
  portfolio: z
    .string()
    .trim()
    .url("Must be a valid URL (https://...)")
    .optional()
    .or(z.literal("")),
  workPermitStatus: z
    .enum(["authorized", "sponsorship_required", "citizen", "green_card", "eu_passport", "other"])
    .optional(),
  desiredSalary: z.string().trim().max(100).optional().or(z.literal("")),
  noticePeriod: z.string().trim().max(100).optional().or(z.literal("")),
  preferredWorkMode: z.enum(["remote", "hybrid", "onsite"]).optional(),
  willingnessToRelocate: z.enum(["yes", "no", "remote_only"]).optional(),
  yearsOfExperience: z
    .number()
    .min(0, "Years of experience cannot be negative")
    .max(60, "Years of experience cannot exceed 60")
    .optional()
    .or(z.nan()),
  dateOfBirth: z.string().optional().or(z.literal("")),
  nationality: z.string().trim().max(100).optional().or(z.literal("")),
  visaStatus: z.string().trim().max(100).optional().or(z.literal("")),
  gender: z.string().trim().max(50).optional().or(z.literal("")),
  veteranStatus: z.string().trim().max(50).optional().or(z.literal("")),
  disabilityStatus: z.string().trim().max(50).optional().or(z.literal("")),
  clearanceLevel: z.string().trim().max(100).optional().or(z.literal("")),
  driversLicense: z.string().trim().max(100).optional().or(z.literal("")),
  languagesSpoken: z.string().trim().max(200).optional().or(z.literal("")),
  maritalStatus: z.string().trim().max(50).optional().or(z.literal("")),
  salaryExpectations: z.string().trim().max(100).optional().or(z.literal("")),
  availability: z.string().trim().max(100).optional().or(z.literal("")),
  references: z.string().trim().max(2000, "References cannot exceed 2000 characters").optional().or(z.literal("")),
});

export const VaultSearchSchema = z.object({
  query: z
    .string()
    .trim()
    .min(2, "Search query must be at least 2 characters")
    .max(300, "Search query cannot exceed 300 characters"),
});

export const VaultFileValidation = {
  maxSizeBytes: 25 * 1024 * 1024, // 25 MB
  allowedExtensions: [".pdf", ".docx", ".txt", ".md"],
  validateFile: (file: File): { valid: boolean; error?: string } => {
    if (file.size > VaultFileValidation.maxSizeBytes) {
      return { valid: false, error: `File "${file.name}" exceeds 25 MB limit.` };
    }
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!VaultFileValidation.allowedExtensions.includes(ext)) {
      return { valid: false, error: `File "${file.name}" must be a PDF, DOCX, TXT, or MD file.` };
    }
    return { valid: true };
  },
};

/* ------------------------------------------------------------------ *
 * 3. Settings Schemas
 * ------------------------------------------------------------------ */

export const SettingsProfileSchema = z.object({
  name: z.string().trim().min(2, "Full name must be at least 2 characters").max(100),
  email: z.string().trim().min(1, "Email is required").email("Please enter a valid email address"),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  location: z.string().trim().max(100).optional().or(z.literal("")),
  targetTitle: z.string().trim().min(2, "Target title must be at least 2 characters").max(100),
  summary: z.string().trim().max(3000, "Summary cannot exceed 3000 characters").optional().or(z.literal("")),
  linkedin: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  github: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  portfolio: z.string().trim().url("Must be a valid URL").optional().or(z.literal("")),
  skills: z.array(z.string().trim()).optional().default([]),
  experience: z
    .array(
      z.object({
        id: z.string(),
        company: z.string().trim().min(1, "Company name is required"),
        role: z.string().trim().min(1, "Role title is required"),
        duration: z.string().trim().optional().or(z.literal("")),
        bulletPoints: z.array(z.string().trim()).optional().default([]),
      })
    )
    .optional()
    .default([]),
  education: z
    .array(
      z.object({
        id: z.string(),
        degree: z.string().trim().min(1, "Degree is required"),
        school: z.string().trim().min(1, "School is required"),
        year: z.string().trim().optional().or(z.literal("")),
      })
    )
    .optional()
    .default([]),
});

export const CloudinarySettingsSchema = z.object({
  cloudName: z.string().trim().max(100).optional().default(""),
  apiKey: z.string().trim().max(100).optional().default(""),
  apiSecret: z.string().trim().max(100).optional().default(""),
  concurrency: z.number().int().min(1, "Min 1 worker").max(16, "Max 16 workers").default(1),
});

export const GoogleOAuthConfigSchema = z.object({
  clientId: z.string().trim().min(5, "Google Client ID is required"),
  clientSecret: z.string().trim().min(5, "Google Client Secret is required"),
});

export const LinkedInCookieSchema = z.object({
  cookie: z.string().trim().min(10, "Valid li_at session cookie is required"),
});

export const MailSettingsSchema = z.object({
  smtpHost: z.string().trim().max(100).optional().or(z.literal("")),
  smtpPort: z.number().int().min(1).max(65535).default(587),
  smtpUser: z.string().trim().email("SMTP user must be a valid email").optional().or(z.literal("")),
  smtpPass: z.string().optional().or(z.literal("")),
  imapHost: z.string().trim().max(100).optional().or(z.literal("")),
  imapPort: z.number().int().min(1).max(65535).default(993),
  imapUser: z.string().trim().email("IMAP user must be a valid email").optional().or(z.literal("")),
  imapPass: z.string().optional().or(z.literal("")),
  fromName: z.string().trim().max(100).optional().or(z.literal("")),
  fromEmail: z.string().trim().email("From email must be a valid email").optional().or(z.literal("")),
});
