import { UserProfile, JobApplication } from "@/types";
import { LLMProvider } from "@/lib/llm/providers";

/** A valid, enabled provider entry as stored in the settings chain. */
export function providerWithKey(apiKey = "sk-test"): LLMProvider {
  return {
    id: "openrouter",
    label: "OpenRouter",
    kind: "openai",
    providerId: "openrouter",
    apiKey,
    model: "google/gemini-2.5-flash",
    baseURL: "https://openrouter.ai/api/v1",
    temperature: 0.7,
    enabled: true,
    capabilities: ["json", "long-context", "vision"],
  };
}

export const testProfile: UserProfile = {
  name: "Jane Dev",
  email: "jane@dev.io",
  phone: "555-0100",
  location: "Berlin",
  summary:
    "Full-stack engineer with 6 years shipping React, TypeScript and Node products end to end, from design system work to distributed services.",
  headline: "Senior Frontend Engineer",
  targetTitle: "Senior Frontend Engineer",
  skills: ["React", "TypeScript", "Node.js", "GraphQL", "Tailwind CSS", "AWS", "Docker"],
  experience: [
    {
      id: "e1",
      company: "Acme",
      role: "Senior Engineer",
      duration: "2022–2025",
      bulletPoints: ["Led the frontend platform team", "Built the internal design system"],
    },
    {
      id: "e2",
      company: "Globex",
      role: "Engineer",
      duration: "2019–2022",
      bulletPoints: ["Shipped the checkout flow", "Introduced typed API clients"],
    },
  ],
  education: [{ id: "edu1", degree: "BSc Computer Science", school: "TU Berlin", year: "2019" }],
  github: "github.com/janedev",
};

export function makeJob(id: string, overrides: Partial<JobApplication> = {}): JobApplication {
  return {
    id,
    title: "Frontend Engineer",
    company: "Acme",
    location: "Remote",
    status: "wishlist",
    jobDescription:
      "We are hiring a React and TypeScript engineer. Experience with Node.js, GraphQL, Tailwind CSS and AWS is a plus. Senior candidates with design system experience preferred.",
    autoApplyStatus: "idle",
    autoApplyLogs: [],
    createdDate: "2026-08-01",
    ...overrides,
  };
}

export const agentJob = {
  id: "job-agent-1",
  title: "Frontend Engineer",
  company: "Acme",
  url: "https://careers.acme.io/frontend",
  jobDescription: makeJob("x").jobDescription,
  matchScore: undefined as number | undefined,
};
