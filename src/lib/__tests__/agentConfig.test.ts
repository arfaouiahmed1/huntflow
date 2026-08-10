import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_AGENT_SETTINGS,
  cleanAgentSettings,
  getAgentSettings,
  setAgentSettings,
  agentBehaviorPrompt,
  tonePrompt,
  atsPrompt,
  AGENT_SETTINGS_KEY,
} from "@/lib/agentConfig";
import { settingsRepo } from "@/lib/db";

afterEach(() => {
  settingsRepo.set(AGENT_SETTINGS_KEY, "");
});

describe("cleanAgentSettings", () => {
  it("returns defaults for junk input", () => {
    expect(cleanAgentSettings(null)).toEqual(DEFAULT_AGENT_SETTINGS);
    expect(cleanAgentSettings("nope")).toEqual(DEFAULT_AGENT_SETTINGS);
    expect(cleanAgentSettings(42)).toEqual(DEFAULT_AGENT_SETTINGS);
  });

  it("clamps enum fields to allowed values", () => {
    const s = cleanAgentSettings({ tone: "angry", atsStrictness: "maximal", bulletLength: "long", tailoring: "ferocious", maxPages: 5 });
    expect(s.tone).toBe("professional");
    expect(s.atsStrictness).toBe("strict");
    expect(s.bulletLength).toBe("detailed");
    expect(s.tailoring).toBe("medium");
    expect(s.maxPages).toBe(1);
  });

  it("accepts valid values and partial section toggles", () => {
    const s = cleanAgentSettings({ tone: "confident", maxPages: 2, includeMetrics: false, sections: { summary: false } });
    expect(s.tone).toBe("confident");
    expect(s.maxPages).toBe(2);
    expect(s.includeMetrics).toBe(false);
    expect(s.sections.summary).toBe(false);
    expect(s.sections.skills).toBe(true);
  });
});

describe("settings persistence", () => {
  it("round-trips through settingsRepo", () => {
    setAgentSettings({ tone: "friendly", tailoring: "aggressive", bulletLength: "concise" });
    const s = getAgentSettings();
    expect(s.tone).toBe("friendly");
    expect(s.tailoring).toBe("aggressive");
    expect(s.bulletLength).toBe("concise");
  });

  it("falls back to defaults when the key is missing or corrupt", () => {
    settingsRepo.set(AGENT_SETTINGS_KEY, "{not json");
    expect(getAgentSettings()).toEqual(DEFAULT_AGENT_SETTINGS);
    settingsRepo.set(AGENT_SETTINGS_KEY, "");
    expect(getAgentSettings()).toEqual(DEFAULT_AGENT_SETTINGS);
  });
});

describe("prompt fragments", () => {
  it("produces tone guidance for each tone", () => {
    expect(tonePrompt("confident")).toContain("confident");
    expect(tonePrompt("friendly")).toContain("warm");
    expect(tonePrompt("professional")).toContain("professional");
  });

  it("strict ATS guidance forbids tables/images", () => {
    expect(atsPrompt("strict")).toContain("single column");
    expect(atsPrompt("strict")).toContain("tables");
  });

  it("behavior prompt includes all dimensions", () => {
    const p = agentBehaviorPrompt(DEFAULT_AGENT_SETTINGS);
    expect(p).toContain("WRITING STYLE");
    expect(p).toContain("ATS");
    expect(p).toContain("one page");
    expect(p).toContain("Quantify");
  });
});
