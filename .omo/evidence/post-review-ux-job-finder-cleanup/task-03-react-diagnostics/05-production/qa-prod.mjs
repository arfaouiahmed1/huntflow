import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const toolRequests = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/dev-tools")) toolRequests.push(request.url());
  });
  await page.goto("http://127.0.0.1:3014", { waitUntil: "networkidle", timeout: 120_000 });
  await page.waitForTimeout(6_000);
  const state = await page.evaluate(() => ({
    attribute: document.documentElement.getAttribute("data-dev-diagnostics"),
    scanRoot: document.getElementById("react-scan-root") !== null,
    devToolScripts: [...document.querySelectorAll("script[src*='dev-tools']")].length,
  }));
  console.log(JSON.stringify({ state, toolRequests }, null, 2));
  const pass =
    state.attribute === null && !state.scanRoot && state.devToolScripts === 0 && toolRequests.length === 0;
  process.exit(pass ? 0 : 1);
} finally {
  await browser.close();
}
