// Full-size stills without captions (for screenshots): node tools/shot.mjs <bundle> <out.png> <seconds>
import { openBrowser, renderStill, selectComposition } from "@remotion/renderer";

const [bundle, output, s] = process.argv.slice(2);
const browserExecutable = "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const inputProps = { stills: true };
const browser = await openBrowser("chrome", { browserExecutable });
const composition = await selectComposition({ serveUrl: bundle, id: "HookTax", inputProps, puppeteerInstance: browser, browserExecutable });
await renderStill({ composition, serveUrl: bundle, frame: Math.round(Number(s) * composition.fps), output, inputProps, puppeteerInstance: browser,
  browserExecutable, imageFormat: "png" });
await browser.close({ silent: true });
console.log("wrote", output);
