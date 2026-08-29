import { describe, expect, it } from "vitest";
import { extractJdTerms } from "@/lib/prompts/commonPrompts";

describe("extractJdTerms", () => {
  it("aggregates case and whitespace variants across profile and common-tech sources", () => {
    const terms = extractJdTerms("Docker docker DOCKER", ["Docker", " docker "]);

    expect(terms).toEqual([{ term: "Docker", count: 3, inResume: true }]);
  });

  it("keeps first-seen order for equal counts while applying the twelve-term cap", () => {
    const skills = Array.from({ length: 13 }, (_, index) => `token${String(index + 1).padStart(2, "0")}`);
    const terms = extractJdTerms(skills.join(" "), skills);

    expect(terms).toHaveLength(12);
    expect(terms.map((term) => term.term)).toEqual(skills.slice(0, 12));
  });
});
