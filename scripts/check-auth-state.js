const { chromium } = require("playwright-core");
const fs = require("fs");

const PROFILE = "/tmp/owlistic-chrome-default";
const URLS = [
  "https://script.google.com/d/1dmMe-TWbycvlYcrTxUuHzWalWepeMGh8qJb9dOnqyGJxWbN9IkR29hgh/edit",
  "https://script.google.com/macros/s/AKfycbx-XBKX5WcoBIHgHss2uQ_RXRodMLoCO8qjBbDql32XO2RdfFSsBphKBUHgkf0SUdC7/exec?action=ensureScheduleColumns",
  "https://docs.google.com/spreadsheets/d/1nZuMePQFJA9lCQ6C48d9MUC3Fwn00ao6Kilap5rbFfQ/edit"
];

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    viewport: { width: 1400, height: 900 },
    args: ["--no-first-run"]
  });
  const page = await context.newPage();
  for (const url of URLS) {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForTimeout(5000);
    const text = await page.locator("body").innerText().catch(() => "");
    console.log("\n===", url, "===");
    console.log("title:", await page.title());
    console.log("final:", page.url());
    console.log(text.slice(0, 1200).replace(/\s+/g, " "));
  }
  await page.screenshot({ path: "/tmp/owlistic-auth-state.png", fullPage: true });
  await context.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
