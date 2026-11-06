// Screenshots of the live HookAtlas for the ETHGlobal submission: node tools/screens.cjs <outdir>
// 1920x1080 PNGs (a 1280x720 viewport at 1.5x, dark theme), taken from https://bilgin-kocak.github.io/hooktax/.
const { chromium } = require("playwright");
const path = require("path");

const SITE = "https://bilgin-kocak.github.io/hooktax/";
const out = process.argv[2] || "../docs/media/screenshots";
const has = (page, re) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout: 90000 });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: "dark" });
  const page = await ctx.newPage();

  // The default view: its "Measured take" column is today's take for these hooks (none of them was upgrade-probed).
  await page.goto(SITE);
  await has(page, /11,242 hooks match/);
  await page.locator("details.querybox summary").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(out, "1-hookatlas-11242-hooks-arkiv-query.png") });

  await page.goto(SITE + "#/hook/0x676E38B66A7547FF685549E4Ad88134aC62200cC");
  await has(page, /Measured take today/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "2-hook-card-measured-take.png") });

  await page.goto(SITE + "#/hook/0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf");
  await has(page, /upgradeAndCall/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "3-hook-card-worst-case-proved.png") });

  await page.goto(SITE + "#/demo");
  await has(page, /SneakyFeeHook/);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, "4-worst-case-demo-from-arkiv.png") });

  // 5 and 6 are frames of the video without captions: node tools/shot.mjs <bundle> <out.png> 92.2 | 174.6
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
