const { chromium } = require("playwright-core");

const WEB_APP =
  "https://script.google.com/macros/s/AKfycbx-XBKX5WcoBIHgHss2uQ_RXRodMLoCO8qjBbDql32XO2RdfFSsBphKBUHgkf0SUdC7/exec";
const PROFILE = "/tmp/owlistic-chrome-default";

async function clickIfVisible(page, patterns) {
  for (const pattern of patterns) {
    const btn = page.getByRole("button", { name: pattern });
    if (await btn.count()) {
      await btn.first().click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE, {
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: false,
    viewport: { width: 1280, height: 900 },
    args: ["--no-first-run", "--disable-blink-features=AutomationControlled"]
  });
  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(60000);

  await page.goto(WEB_APP + "?action=ensureScheduleColumns", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);

  for (let i = 0; i < 8; i++) {
    const body = await page.content();
    if (body.includes('"action":"ensureScheduleColumns"') || body.includes('"sheetColumns":32')) {
      console.log("authorized", body.slice(0, 200));
      await context.close();
      return;
    }
    await clickIfVisible(page, [/Allow/i, /^Continue$/i, /^Authorize/i, /^Review permissions/i, /^Go to/i]);
    await page.waitForTimeout(2000);
  }

  await page.screenshot({ path: "/tmp/owlistic-auth-failed.png", fullPage: true });
  console.log("auth not confirmed; url=", page.url());
  await context.close();
  process.exit(2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
