#!/usr/bin/env node
// PostToolUse hook: lint .ts/.tsx files after Edit/Write/MultiEdit.
// Uses the ESLint Node API (picks up eslint.config.mjs automatically) for
// cross-platform reliability — avoids npx/shell/quoting issues on Windows.
// - 0 errors:            silent success (warnings printed as non-blocking info)
// - 1+ errors:           print formatted output to stderr and exit 2 so the
//                        issue is surfaced to the model to act on.
// - eslint can't run:    never block the edit — exit 0 with a notice.
let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", async () => {
  let file;
  try {
    file = JSON.parse(input || "{}").tool_input?.file_path;
  } catch {
    process.exit(0);
  }
  if (!file || !/\.[cm]?tsx?$/.test(file)) process.exit(0);
  // Skip generated / external trees.
  if (
    /[\/\\]\.next[\/\\]/.test(file) ||
    /[\/\\]node_modules[\/\\]/.test(file) ||
    /[\/\\]scrapling-agent[\/\\]/.test(file) ||
    /[\/\\]\.claude[\/\\](worktrees|hooks)[\/\\]/.test(file)
  ) {
    process.exit(0);
  }

  let eslint;
  try {
    eslint = new (require("eslint").ESLint)();
  } catch (e) {
    process.stderr.write(
      "lint-on-edit: eslint not available, skipping (" +
        (e && e.message ? e.message : e) +
        ")\n"
    );
    process.exit(0);
  }

  try {
    const results = await eslint.lintFiles([file]);
    const errorCount = results.reduce((n, r) => n + r.errorCount, 0);
    const warnCount = results.reduce((n, r) => n + r.warningCount, 0);
    if (errorCount === 0) {
      if (warnCount > 0) {
        process.stdout.write(
          `lint-on-edit: ${warnCount} warning(s) in ${file} (non-blocking).\n`
        );
      }
      process.exit(0);
    }
    const formatter = await eslint.loadFormatter("stylish");
    const text = await formatter.format(results);
    process.stderr.write(
      `ESLint found ${errorCount} error(s) after editing ${file}:\n${text}\n`
    );
    process.exit(2);
  } catch (e) {
    process.stderr.write(
      "lint-on-edit: could not run eslint on " +
        file +
        " (" +
        (e && e.message ? e.message : e) +
        ")\n"
    );
    process.exit(0);
  }
});
