import { describe, it, expect } from "vitest";
import { galleryTemplates } from "./templateGallery";
import { RESUME_TEMPLATES } from "@/lib/pdf/resumeTemplates";

describe("galleryTemplates", () => {
  it("covers every registry resume/cv template with no invented entries", () => {
    for (const kind of ["resume", "cv"] as const) {
      const expected = RESUME_TEMPLATES.filter((t) => t.kinds.includes(kind)).map((t) => t.id);
      expect(galleryTemplates(kind).map((g) => g.meta.id)).toEqual(expected);
    }
  });

  it("exposes real metadata with icons, swatches, and audience badges", () => {
    for (const g of galleryTemplates("resume")) {
      expect(g.meta.name.length).toBeGreaterThan(0);
      expect(g.meta.description.length).toBeGreaterThan(0);
      expect(g.meta.fontFamily.length).toBeGreaterThan(0);
      expect(g.icon).toBeTruthy();
      expect(g.swatch).toContain("bg-");
      expect(g.badge.length).toBeGreaterThan(0);
    }
  });

  it("never surfaces numeric ATS scores or guarantee copy", () => {
    const json = JSON.stringify(galleryTemplates("resume").map((g) => ({ ...g, icon: undefined, meta: { ...g.meta, atsScore: undefined } })));
    expect(json).not.toMatch(/atsScore/i);
    expect(json).not.toMatch(/guarantee/i);
    const source = galleryTemplates("cv")
      .map((g) => `${g.meta.name} ${g.meta.description} ${g.meta.recommendationReason}`)
      .join(" ");
    expect(source).not.toMatch(/guarantee/i);
  });
});
