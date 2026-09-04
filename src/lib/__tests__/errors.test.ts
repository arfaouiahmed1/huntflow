import { describe, it, expect } from "vitest";
import { AppError, toErrorMessage, routeError, readBody, readJsonResponse } from "@/lib/errors";


describe("readJsonResponse", () => {
  it("returns null for an empty response body", async () => {
    expect(await readJsonResponse(new Response(""))).toBeNull();
  });

  it("parses a valid JSON response", async () => {
    expect(await readJsonResponse<{ ok: boolean }>(new Response('{"ok":true}'))).toEqual({ ok: true });
  });

  it("reports malformed JSON with the upstream HTTP status", async () => {
    try {
      await readJsonResponse(new Response("not json", { status: 502 }));
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(502);
      expect((e as AppError).code).toBe("INVALID_JSON_RESPONSE");
    }
  });
});

describe("AppError", () => {
  it("defaults to 500 / UNKNOWN", () => {
    const e = new AppError("boom");
    expect(e.status).toBe(500);
    expect(e.code).toBe("UNKNOWN");
    expect(e.message).toBe("boom");
  });
});

describe("toErrorMessage", () => {
  it("uses AppError message", () => {
    expect(toErrorMessage(new AppError("m1", "X", 400))).toBe("m1");
  });
  it("uses Error message", () => {
    expect(toErrorMessage(new Error("m2"))).toBe("m2");
  });
  it("has a fallback for unknown values", () => {
    expect(toErrorMessage("garbage")).toBe("Something unexpected went wrong.");
    expect(toErrorMessage(undefined)).toBe("Something unexpected went wrong.");
  });
});

describe("routeError", () => {
  it("maps AppError status and code", async () => {
    const res = routeError(new AppError("bad", "BAD_BODY", 400));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("BAD_BODY");
    expect(body.error.message).toBe("bad");
  });

  it("maps generic errors to 500 with the error name", async () => {
    const res = routeError(new TypeError("nope"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("TypeError");
  });

  it("maps unknown values to a generic 500", async () => {
    const res = routeError(42);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.message).toBe("Unexpected server error.");
  });
});

describe("readBody", () => {
  it("rejects invalid JSON with BAD_BODY 400", async () => {
    const req = new Request("http://localhost/api", { method: "POST", body: "{not json" });
    try {
      await readBody(req);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      expect((e as AppError).status).toBe(400);
      expect((e as AppError).code).toBe("BAD_BODY");
    }
  });

  it("parses valid JSON", async () => {
    const req = new Request("http://localhost/api", { method: "POST", body: '{"a":1}' });
    expect(await readBody(req)).toEqual({ a: 1 });
  });
});
