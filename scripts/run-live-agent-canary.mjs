import { spawn } from "node:child_process";
import { resolve } from "node:path";

const vitestEntrypoint = resolve(process.cwd(), "node_modules/vitest/vitest.mjs");
const child = spawn(process.execPath, [vitestEntrypoint, "run", "tests/live/agentCanary.test.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, HUNTFLOW_LIVE_EVAL: "1" },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`Could not start the live agent canary: ${error.message}`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Live agent canary stopped by ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
