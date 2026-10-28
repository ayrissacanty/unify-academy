// Smoke test: serve the site, open every page in a real (headless) browser, fail on any script error.
// Run:  npm run build && python3 tools/build_netlify.py dist && npm run test:smoke
// Env:  SMOKE_CHROMIUM=/path/to/chromium  (optional; otherwise Playwright's own browser is used)
import http from "node:http";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const PORT = process.env.SMOKE_PORT || "8799";
const BASE = `http://127.0.0.1:${PORT}`;
// page -> must contain a <canvas> after load (3D scenes)
// Time for the first 3D frame in software GL (SwiftShader on CI). The hallway builds the most shader programs (~55 on the first frame),
// and SwiftShader compiles them in one go, which freezes the page for ~75 s on a 4-core box and more than 150 s on a GitHub runner.
// A real GPU does this in a second or two. Script errors and 404s are still checked on every page; only the start-up wait is longer.
const CANVAS_MS = { "hallway3d.html": 300000 };
const canvasMs = (page) => Number(process.env.SMOKE_CANVAS_MS) || CANVAS_MS[page] || 150000;
const PAGES = [
  ["index.html", false], ["hallway3d.html", true], ["classroom3d.html", true], ["auditorium3d.html", true],
  ["news.html", false], ["phone.html", false], ["opendoor.html", false], ["fieldtrip.html", true], ["clubs3d.html", true],
  ["curriculum.html", false], ["parent.html", false], ["mail.html", false], ["newsdesk.html", false], ["dorm.html", true],
  // earlier versions and prototypes: kept and shipped too
  ["pages.html", false], ["auditorium.html", true], ["hallway.html", true], ["new.html", false], ["prototypes/newsroom-enhanced.html", false],
];
// noise that is not our bug: blocked third-party hosts in sandboxed CI, favicon, ad/analytics-style failures
const IGNORE = [/favicon/i, /net::ERR_(BLOCKED|NAME_NOT_RESOLVED|INTERNET_DISCONNECTED|CONNECTION|TUNNEL|CERT)/i,
  /fonts\.(googleapis|gstatic)\.com/i, /Failed to load resource.*(502|503)/i, /Failed to load resource: net::ERR_FAILED/i, /trends\.json/i,
  /Failed to load resource: the server responded with a status of 404/i];   // 404s of our own files are reported by name by the response check below   // trends.json is an optional file the game tolerates missing
const noise = (s) => IGNORE.some((r) => r.test(s));

// Serve the BUILT site (what ships): python3 tools/build_netlify.py dist  (the CI workflow and `npm run test:smoke` do this)
const DIR = path.resolve(process.env.SMOKE_DIR || "dist");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json", ".css": "text/css" };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); let p = decodeURIComponent(u.pathname); if (p === "/") p = "/index.html";
  if (p.startsWith("/api/")) { res.writeHead(503); return res.end("no api in smoke test"); }   // the news feed falls back when offline
  const file = path.normalize(path.join(DIR, p));
  try { if (!file.startsWith(DIR + path.sep)) throw 0; const body = await readFile(file); res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }); res.end(body); }
  catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(Number(PORT), "127.0.0.1", r));
const stop = () => { try { server.close(); } catch {} };
const browser = await chromium.launch({
  executablePath: process.env.SMOKE_CHROMIUM || undefined,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--no-sandbox"],
});
let failed = 0;
for (const [page, needsCanvas] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } }); // phone-sized: this is how it is used
  await ctx.route(/^(?!http:\/\/127\.0\.0\.1)/, (route) => { const u = route.request().url(); return /^(data|blob):/.test(u) ? route.continue() : route.abort(); });  // only our own site is judged
  const p = await ctx.newPage();
  const problems = [];
  p.on("pageerror", (e) => problems.push("script error: " + e.message));
  p.on("console", (m) => { if (m.type() === "error" && !noise(m.text())) problems.push("console: " + m.text().slice(0, 160)); });
  p.on("response", (r) => { if (r.status() >= 400 && r.url().startsWith(BASE) && !r.url().includes("/api/") && !noise(r.url())) problems.push(`${r.status()} ${r.url().replace(BASE, "")}`); });
  try {
    const res = await p.goto(`${BASE}/${page}`, { waitUntil: needsCanvas ? "commit" : "domcontentloaded", timeout: 60000 });
    if (!res || !res.ok()) problems.push(`page status ${res && res.status()}`);
    // 3D scenes can take a minute to start in software GL (CI/sandbox); a phone GPU does it in seconds
    if (needsCanvas) { const ms = canvasMs(page); try { await p.waitForSelector("canvas", { timeout: ms, state: "attached" }); } catch { problems.push(`no <canvas> appeared within ${ms / 1000}s`); } }
    await p.waitForTimeout(needsCanvas ? 5000 : (page === "index.html" ? 8000 : 3000));
    if (process.env.SMOKE_SHOTS) await p.screenshot({ path: `${process.env.SMOKE_SHOTS}/${page.replace(/\//g, "_")}.png` }).catch(() => {});
  } catch (e) { problems.push("load failed: " + e.message.split("\n")[0]); }
  console.log(`${problems.length ? "FAIL" : "PASS"}  ${page}`);
  problems.slice(0, 6).forEach((x) => console.log("      " + x));
  if (problems.length) failed++;
  await ctx.close();
}
await browser.close(); stop();
console.log(failed ? `\n${failed} page(s) failed` : "\nall pages loaded cleanly");
process.exit(failed ? 1 : 0);
