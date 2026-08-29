import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { shouldInitializeDevDiagnostics } from "../gate";

describe("shouldInitializeDevDiagnostics", () => {
  it("initializes when NODE_ENV is development and the disable flag is unset", () => {
    expect(
      shouldInitializeDevDiagnostics({ nodeEnv: "development", disableFlag: undefined }),
    ).toBe(true);
  });

  it("initializes when NODE_ENV is development and the disable flag is any value other than 1", () => {
    expect(shouldInitializeDevDiagnostics({ nodeEnv: "development", disableFlag: "" })).toBe(
      true,
    );
    expect(shouldInitializeDevDiagnostics({ nodeEnv: "development", disableFlag: "0" })).toBe(
      true,
    );
    expect(
      shouldInitializeDevDiagnostics({ nodeEnv: "development", disableFlag: "false" }),
    ).toBe(true);
  });

  it("suppresses initialization when the disable flag equals 1 in development", () => {
    expect(
      shouldInitializeDevDiagnostics({ nodeEnv: "development", disableFlag: "1" }),
    ).toBe(false);
  });

  it("never initializes in production regardless of the disable flag", () => {
    for (const disableFlag of [undefined, "", "0", "false", "1"]) {
      expect(shouldInitializeDevDiagnostics({ nodeEnv: "production", disableFlag })).toBe(
        false,
      );
    }
  });

  it("suppresses initialization when NODE_ENV is missing or unexpected", () => {
    expect(shouldInitializeDevDiagnostics({ nodeEnv: undefined, disableFlag: undefined })).toBe(
      false,
    );
    expect(shouldInitializeDevDiagnostics({ nodeEnv: "test", disableFlag: undefined })).toBe(
      false,
    );
  });

  it("uses the exact public opt-out variable across every runtime gate", async () => {
    const runtimeGatePaths = [
      "src/app/layout.tsx",
      "src/components/dev/DevDiagnostics.tsx",
      "src/app/api/dev-tools/route.ts",
    ] as const;
    const runtimeGates = await Promise.all(
      runtimeGatePaths.map((filePath) => readFile(path.join(process.cwd(), filePath), "utf8")),
    );

    for (const runtimeGate of runtimeGates) {
      expect(runtimeGate).toContain("process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS");
      expect(runtimeGate).not.toContain("process.env.NEXT_PUBLIC_DISABLE_DEVTOOLS");
    }
  });
});
