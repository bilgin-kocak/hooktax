// Records scripted takes of the live HookAtlas (https://bilgin-kocak.github.io/hooktax/) at real speed:
//   node tools/record.cjs [take ...]      (default: every take)
// Frames come from Chrome's screencast with their real timestamps, so each mp4 plays back at the speed it
// happened: nothing is sped up. A drawn cursor shows where the scripted mouse goes. Writes public/capture/<take>.mp4
// plus public/capture/<take>.json (when each step happened, in seconds from the first frame).
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const SITE = "https://bilgin-kocak.github.io/hooktax/";
const W = 1280, H = 720, DSF = 1.5; // 1920x1080 frames
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CURSOR = `(() => {
  const install = () => {
    if (document.getElementById("__cursor")) return;
    const c = document.createElement("div");
    c.id = "__cursor";
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 26 26"><path d="M3 2 L3 21 L8 16.4 L11.6 24.6 L15 23.2 L11.5 15.1 L18.3 15.1 Z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "-40px", top: "-40px", width: "26px", height: "26px", pointerEvents: "none", zIndex: 2147483647, transform: "translate(-3px,-2px)" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.left = e.clientX + "px"; c.style.top = e.clientY + "px"; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: e.clientX - 16 + "px", top: e.clientY - 16 + "px", width: "32px", height: "32px", borderRadius: "50%",
        border: "3px solid rgba(255,190,60,.95)", pointerEvents: "none", zIndex: 2147483646, transition: "transform .5s ease-out, opacity .5s ease-out" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = "scale(1.9)"; r.style.opacity = "0"; }));
      setTimeout(() => r.remove(), 700);
    }, true);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install); else install();
})();`;

let mouse = { x: W * 0.62, y: H * 0.78 };
/** An eased, human-paced move of the drawn cursor to the centre of `locator`, then a click. */
async function glideClick(page, locator, { ms = 750, click = true } = {}) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("no box for " + locator);
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const n = Math.max(12, Math.round(ms / 16));
  const from = { ...mouse };
  for (let i = 1; i <= n; i++) {
    const k = i / n, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await sleep(16);
  }
  mouse = to;
  if (click) {
    await sleep(140);
    await page.mouse.down();
    await sleep(90);
    await page.mouse.up();
  }
}

const textIs = (page, re, timeout = 90000) => page.waitForFunction((src) => new RegExp(src).test(document.body.innerText), re.source, { timeout });
async function smoothScrollTo(page, y, ms = 1800) {
  const y0 = await page.evaluate(() => scrollY);
  const n = Math.round(ms / 16);
  for (let i = 1; i <= n; i++) {
    const k = i / n, e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    await page.evaluate((v) => scrollTo(0, v), y0 + (y - y0) * e);
    await sleep(16);
  }
}
const topOf = (page, re) => page.evaluate((src) => {
  const el = [...document.querySelectorAll("h2,h3,h4,summary,p,th")].find((e) => new RegExp(src).test(e.textContent));
  return el ? el.getBoundingClientRect().top + scrollY : null;
}, re.source);

const TAKES = {
  // HookAtlas: the full list, two filters, the Arkiv query behind the view, the curl.
  async atlas(page, mark) {
    await page.goto(SITE);
    await textIs(page, /11,242 hooks match/); mark("all");
    await sleep(2600);
    await glideClick(page, page.getByRole("button", { name: "Can change swap amounts", exact: true }));
    mark("click-swap");
    await textIs(page, /8,716 hooks match/); mark("swap");
    await sleep(2200);
    await glideClick(page, page.getByRole("button", { name: "Upgradeable", exact: true }));
    mark("click-upgradeable");
    await textIs(page, /\b35 hooks match/); mark("both");
    await sleep(2400);
    await glideClick(page, page.locator("details.querybox summary"));
    mark("query-open");
    await sleep(3200);
    await glideClick(page, page.getByRole("button", { name: /Copy curl/ }));
    mark("curl-copied");
    await sleep(2600);
    const curl = await page.evaluate(() => navigator.clipboard.readText());
    const query = await page.locator("details.querybox pre").innerText();
    fs.writeFileSync("public/capture/atlas-query.json", JSON.stringify({ query, curl }, null, 2) + "\n");
  },
  // A real measured hook: the HookTax card, then the fork measurements.
  async hook676e(page, mark) {
    await page.goto(SITE + "#/hook/0x676E38B66A7547FF685549E4Ad88134aC62200cC");
    await textIs(page, /Measured take today/); mark("card");
    await sleep(4200);
    const y = await topOf(page, /^Fork measurements/);
    if (y !== null) { await smoothScrollTo(page, y - 90); mark("measurements"); }
    await sleep(4200);
  },
  // A real hook whose worst case was proved on a fork (authority upgrade).
  async hook7074(page, mark) {
    await page.goto(SITE + "#/hook/0x7074e4a0f9c1Ae1073c7E6Fc7D07A843ecFD3fFf");
    await textIs(page, /Demonstrated worst case/); mark("card");
    await textIs(page, /upgradeAndCall|authority upgrade/); mark("demonstrated");
    await sleep(9800);
    const y = await topOf(page, /^Fork measurements/);
    if (y !== null) { await smoothScrollTo(page, y - 90); mark("measurements"); }
    await sleep(3800);
  },
  // The measured-take table: every live SimResult on Arkiv.
  async measured(page, mark) {
    await page.goto(SITE + "#/measured");
    await textIs(page, /Fork block/); await page.waitForSelector("tbody tr"); mark("table");
    await sleep(3000);
    await smoothScrollTo(page, 520, 2600); mark("scrolled");
    await sleep(2500);
  },
};

async function record(name) {
  const raw = path.join("capture-raw", name);
  fs.rmSync(raw, { recursive: true, force: true });
  fs.mkdirSync(raw, { recursive: true });
  fs.mkdirSync("public/capture", { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DSF, colorScheme: "dark" });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(SITE).origin });
  await ctx.addInitScript(CURSOR);
  const page = await ctx.newPage();
  await page.goto("about:blank");
  await page.evaluate(() => { document.documentElement.style.background = "#14130f"; });
  const cdp = await ctx.newCDPSession(page);
  const frames = [];
  const writes = [];
  cdp.on("Page.screencastFrame", (f) => {
    const file = `f${String(frames.length).padStart(5, "0")}.jpg`;
    frames.push({ file, t: f.metadata.timestamp });
    writes.push(fs.promises.writeFile(path.join(raw, file), Buffer.from(f.data, "base64")));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 93, maxWidth: W * DSF, maxHeight: H * DSF, everyNthFrame: 1 });
  const marks = {};
  const t0 = Date.now() / 1000;
  await TAKES[name](page, (k) => { marks[k] = Date.now() / 1000; });
  const tEnd = Date.now() / 1000;
  await cdp.send("Page.stopScreencast");
  await Promise.all(writes);
  await browser.close();

  // Frames carry real timestamps: each one is shown until the next arrives (variable frame rate -> 30 fps).
  const first = frames[0].t;
  let list = "ffconcat version 1.0\n";
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : tEnd;
    list += `file ${f.file}\nduration ${Math.max(0.001, next - f.t).toFixed(4)}\n`;
  });
  list += `file ${frames[frames.length - 1].file}\n`;
  fs.writeFileSync(path.join(raw, "list.ffconcat"), list);
  execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", path.join(raw, "list.ffconcat"),
    "-vf", "fps=30,scale=1920:1080:flags=lanczos,format=yuv420p", "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-movflags", "+faststart",
    `public/capture/${name}.mp4`], { stdio: "inherit" });
  const rel = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, +(v - first).toFixed(3)]));
  const meta = { frames: frames.length, duration: +(tEnd - first).toFixed(3), startedAt: new Date(t0 * 1000).toISOString(), marks: rel };
  fs.writeFileSync(`public/capture/${name}.json`, JSON.stringify(meta, null, 2) + "\n");
  console.log(name, JSON.stringify(meta));
}

(async () => {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAKES);
  for (const n of names) await record(n);
})().catch((e) => { console.error(e); process.exit(1); });
