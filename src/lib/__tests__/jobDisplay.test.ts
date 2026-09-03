import { describe, expect, it } from "vitest";
import { displayJobCompany, displayJobTitle } from "@/lib/jobDisplay";
import { agentScreenshotUrl } from "@/lib/agentScreenshot";

describe("job display normalization", () => {
  it("removes a crawler URL prefix from a legacy title", () => {
    expect(displayJobTitle({ title: "http://Empowrd.AI — Junior AI Engineer" })).toBe("Junior AI Engineer");
  });

  it("renders a URL-shaped company as a hostname", () => {
    expect(displayJobCompany({ company: "http://Empowrd.AI" })).toBe("empowrd.ai");
  });

  it("preserves ordinary role and company names", () => {
    expect(displayJobTitle({ title: "AI Engineer" })).toBe("AI Engineer");
    expect(displayJobCompany({ company: "Example Labs" })).toBe("Example Labs");
  });

  it("removes a duplicated company prefix from the role title", () => {
    expect(
      displayJobTitle({
        title: "Bending Spoons — Graduate AI Software Engineer",
        company: "Bending Spoons",
      })
    ).toBe("Graduate AI Software Engineer");
  });
});

describe("agent screenshot proxy URLs", () => {
  it("prefers a configured Cloudinary URL", () => {
    expect(agentScreenshotUrl("run/shot.png", "https://res.cloudinary.com/demo/shot.png")).toBe(
      "https://res.cloudinary.com/demo/shot.png"
    );
  });

  it("routes local screenshots through the authenticated web proxy", () => {
    expect(agentScreenshotUrl("run id/shot 1.png")).toBe("/api/agent/screenshot/run%20id/shot%201.png");
  });

  it("preserves an existing remote screenshot URL", () => {
    expect(agentScreenshotUrl("https://proofs.example/role.png")).toBe("https://proofs.example/role.png");
  });

  it("drops traversal segments", () => {
    expect(agentScreenshotUrl("../run/shot.png")).toBe("/api/agent/screenshot/run/shot.png");
  });
});
