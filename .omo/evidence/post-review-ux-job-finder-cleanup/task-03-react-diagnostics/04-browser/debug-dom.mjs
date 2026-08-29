import { chromium } from "playwright";

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const messages = [];
  page.on("console", (m) => messages.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
  await page.goto("http://127.0.0.1:3013", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(12_000);
  // Trigger re-renders so react-scan has activity to visualize.
  await page.mouse.move(640, 400);
  await page.evaluate(() => {
    window.dispatchEvent(new Event("resize"));
  });
  await page.waitForTimeout(2_000);
  const probe = await page.evaluate(() => {
    const ids = [...document.querySelectorAll("[id]")].map((el) => el.id).filter((id) => id.toLowerCase().includes("scan") || id.toLowerCase().includes("grab"));
    const canvases = [...document.querySelectorAll("canvas")].map((c) => ({ id: c.id, cls: c.className, w: c.width }));
    const roots = [...document.querySelectorAll("body > *")].map((el) => `${el.tagName}#${el.id || "-"}.${String(el.className).slice(0, 40)}`);
    return { ids, canvases, bodyChildren: roots };
  });
  console.log(JSON.stringify({ probe, messages }, null, 2));
} finally {
  await browser.close();
}
