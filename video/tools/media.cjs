// Renders the submission logo (512x512) and cover (1920x1080) from docs/media/src: node tools/media.cjs
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const SRC = path.resolve(__dirname, "../../docs/media/src");
const OUT = path.resolve(__dirname, "../../docs/media");
(async () => {
  const browser = await chromium.launch();
  const svg = fs.readFileSync(path.join(SRC, "logo.svg"), "utf8");
  let p = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await p.screenshot({ path: path.join(OUT, "logo.png"), omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
  if (fs.existsSync(path.join(SRC, "cover.html"))) {
    p = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await p.goto("file://" + path.join(SRC, "cover.html"));
    await p.waitForTimeout(400);
    await p.screenshot({ path: path.join(OUT, "cover.png") });
  }
  await browser.close();
  console.log("ok");
})();
