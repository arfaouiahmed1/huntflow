// Task 03 dev-diagnostics browser QA. Usage:
//   node qa-dev.mjs <url> <active|suppressed> <outJson> <screenshotPath>
// Exits 0 when observed DOM/console state matches the expectation, 1 otherwise.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const [url, expectation, outJson, screenshotPath] = process.argv.slice(2);
if (!url || !expectation || !outJson || !screenshotPath) {
  console.error("usage: node qa-dev.mjs <url> <active|suppressed> <outJson> <screenshotPath>");
  process.exit(2);
}

const consoleMessages = [];
const pageErrors = [];

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("console", (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error));
  });

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120_000 });

  // Poll up to 30s for the diagnostics attribute (dynamic imports resolve async)
  // and for react-scan's toolbar, which mounts after instrumentation activates.
  let attributeValue = null;
  let toolbarPresent = false;
  for (let i = 0; i < 60; i += 1) {
    const state = await page.evaluate(() => ({
      attributeValue: document.documentElement.getAttribute("data-dev-diagnostics"),
      toolbarPresent: ['react-scan-toolbar-root', 'react-scan-root'].some((id) => document.getElementById(id) !== null),
    }));
    attributeValue = state.attributeValue;
    toolbarPresent = state.toolbarPresent;
    if (attributeValue !== null && (expectation === "suppressed" || toolbarPresent)) break;
    await page.waitForTimeout(500);
  }

  const canvasCount = await page.evaluate(
    () => document.querySelectorAll("canvas[id^='react-scan']").length,
  );
  const grabArtifacts = await page.evaluate(() => ({
    styleTagsReactGrab: document.querySelectorAll("style[data-react-grab], #react-grab-style").length,
    dataIgnoreNodes: document.querySelectorAll("[data-react-grab-ignore]").length,
  }));

  await page.waitForTimeout(1_000); // settle late console output
  await page.screenshot({ path: screenshotPath, fullPage: false });

  const initConsoleLines = consoleMessages.filter((m) =>
    m.text.includes("[huntflow:dev-diagnostics]"),
  );
  const reactScanFailureLines = consoleMessages.filter((m) =>
    m.text.includes("[React Scan] Failed to load"),
  );

  const observed = {
    attributeValue,
    toolbarPresent,
    canvasCount,
    grabArtifacts,
    initConsoleLines,
    reactScanFailureLines,
    consoleMessageCount: consoleMessages.length,
    pageErrors,
  };

  const expectedActive =
    expectation === "active"
      ? attributeValue === "active" && initConsoleLines.length > 0
      : attributeValue === null && initConsoleLines.length === 0;
  // Suppressed case must additionally show no toolbar/canvas artifacts.
  const noLeakage = expectation === "suppressed" ? !toolbarPresent && canvasCount === 0 : true;

  writeFileSync(outJson, JSON.stringify({ url, expectation, observed, pass: expectedActive && noLeakage }, null, 2));
  console.log(JSON.stringify({ pass: expectedActive && noLeakage, observed }, null, 2));
  process.exit(expectedActive && noLeakage ? 0 : 1);
} finally {
  await browser.close();
}

