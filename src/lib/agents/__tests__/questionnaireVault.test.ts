import { describe, it, expect, beforeEach } from "vitest";
import {
  detectQuestionCategory,
  saveQuestionAnswer,
  findMatchingQuestionAnswer,
  autoFillApplicationQuestions,
} from "../questionnaireVault";
import { questionnaireRepo } from "@/lib/db";

describe("Universal Bespoke Questionnaire Vault", () => {
  beforeEach(() => {
    const list = questionnaireRepo.list();
    for (const item of list) {
      questionnaireRepo.remove(item.key);
    }
  });

  it("accurately detects categories for diverse question variations", () => {
    expect(detectQuestionCategory("What is your standard notice period?")).toBe("notice_period");
    expect(detectQuestionCategory("Will you now or in the future require visa sponsorship?")).toBe("visa_sponsorship");
    expect(detectQuestionCategory("What is your desired annual gross compensation?")).toBe("salary_expectation");
    expect(detectQuestionCategory("Are you subject to any non-compete agreements?")).toBe("non_compete");
    expect(detectQuestionCategory("Are you legally authorized to work in the US?")).toBe("work_authorization");
  });

  it("stores and retrieves answers with high similarity confidence", () => {
    saveQuestionAnswer("What is your notice period?", "2 weeks from signed offer", "notice_period");

    const match = findMatchingQuestionAnswer("How soon can you start / what is your notice period?");
    expect(match.matched).toBe(true);
    expect(match.answer).toBe("2 weeks from signed offer");
    expect(match.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("auto-fills batch questions across multiple categories", () => {
    saveQuestionAnswer("What is your notice period?", "2 weeks", "notice_period");
    saveQuestionAnswer("Do you need visa sponsorship?", "No, US Citizen", "visa_sponsorship");

    const results = autoFillApplicationQuestions([
      "Please state your notice period in days or weeks",
      "Will you require immigration visa sponsorship?",
      "What is your favorite text editor?",
    ]);

    expect(results.length).toBe(3);
    expect(results[0].isPreFilled).toBe(true);
    expect(results[0].answer).toBe("2 weeks");
    expect(results[1].isPreFilled).toBe(true);
    expect(results[1].answer).toBe("No, US Citizen");
    expect(results[2].isPreFilled).toBe(false);
  });
});
