import { describe, it, expect, beforeEach } from "vitest";
import { settingsRepo } from "@/lib/db";
import {
  storeGmailTokens,
  loadGmailTokens,
  clearGmailTokens,
  gmailStatus,
  GmailOAuthTokens,
} from "@/lib/gmailAuth";

const tokens: GmailOAuthTokens = {
  email: "you@gmail.com",
  accessToken: "ya29.live-access",
  refreshToken: "1//live-refresh",
  expiry: Date.now() + 3600_000,
  scope: "https://mail.google.com/",
};

beforeEach(() => {
  settingsRepo.wipe();
});

describe("gmailAuth token persistence", () => {
  it("stores and loads tokens under the gmail_oauth settings key", () => {
    storeGmailTokens(tokens);
    expect(settingsRepo.get("gmail_oauth")).toBe(JSON.stringify(tokens));
    expect(loadGmailTokens()).toEqual(tokens);
  });

  it("returns null when nothing is stored", () => {
    expect(loadGmailTokens()).toBeNull();
  });

  it("treats corrupt blobs as not connected", () => {
    settingsRepo.set("gmail_oauth", "{not json");
    expect(loadGmailTokens()).toBeNull();
  });

  it("treats empty blobs as not connected", () => {
    settingsRepo.set("gmail_oauth", "");
    expect(loadGmailTokens()).toBeNull();
  });

  it("clearGmailTokens empties the blob", () => {
    storeGmailTokens(tokens);
    clearGmailTokens();
    expect(loadGmailTokens()).toBeNull();
  });
});

describe("gmailStatus", () => {
  it("reports connected with email and expiry but no secrets", () => {
    storeGmailTokens(tokens);
    const s = gmailStatus();
    expect(s).toMatchObject({ connected: true, email: tokens.email, expiry: tokens.expiry });
  });

  it("reports not connected when cleared", () => {
    clearGmailTokens();
    expect(gmailStatus()).toMatchObject({ connected: false });
  });
});
