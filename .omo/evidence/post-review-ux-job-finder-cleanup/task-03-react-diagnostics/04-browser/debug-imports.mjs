import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const messages = [];
  page.on("console", (m) => messages.push(`[${m.type()}] ${m.text()}`));
  page.on("pageerror", (e) => messages.push(`[pageerror] ${e}`));
  await page.goto("http://127.0.0.1:3013", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(8_000);
  const result = await page.evaluate(async () => {
    const out = {};
    try {
      const m = await import("react-scan");
      out.reactScanKeys = Object.keys(m).slice(0, 12);
      if (typeof m.scan === "function") {
        m.scan({ enabled: true });
        out.scanCalled = true;
      }
    } catch (error) {
      out.reactScanError = String(error && error.stack ? error.stack : error);
    }
    try {
      const g = await import("react-grab");
      out.reactGrabKeys = Object.keys(g).slice(0, 12);
    } catch (error) {
      out.reactGrabError = String(error && error.stack ? error.stack : error);
    }
    return out;
  });
  console.log(JSON.stringify({ result, messages }, null, 2));
} finally {
  await browser.close();
}
