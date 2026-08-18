#!/usr/bin/env node
// PreToolUse hook: block direct edits to live .env files.
// Blocks:  .env, .env.local, .env.production, ... (live secrets)
// Allows:  .env.local.example, .env.example, ... (non-secret templates, by
//          ending in `example` or having 2+ suffix segments after `.env`)
// Returns a PreToolUse permissionDecision: deny so the edit is rejected.
// Never blocks on a parse error — fail open.
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let filePath;
  try {
    filePath = JSON.parse(input || "{}").tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (!filePath) process.exit(0);

  const base = (filePath.split(/[\/\\]/).pop() || "").toLowerCase();
  // Matches `.env` or `.env.<one-suffix>` but NOT `.env.<a>.<b>` (templates).
  const isEnvSecret = /^\.env(\.[a-z0-9_]+)?$/.test(base) && !/example$/.test(base);
  if (isEnvSecret) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "deny",
          permissionDecisionReason:
            "Editing " +
            base +
            " is blocked by a PreToolUse hook. This project stores live secrets (Gmail OAuth, LLM API keys) in .env files. If you meant to change a value, ask the user or edit a non-secret .env.*.example template instead.",
        },
      })
    );
    // JSON deny decision works with any exit code; use 0.
    process.exit(0);
  }
  process.exit(0);
});
