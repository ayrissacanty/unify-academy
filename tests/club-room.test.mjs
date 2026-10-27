// 3D club room + stamp card: layout rules, the real page (tables, popup, join/leave, hub), and the Today panel stamp card. npm run build && node tests/club-room.test.mjs
import http from "node:http"; import path from "node:path"; import os from "node:os"; import { mkdtemp, readFile } from "node:fs/promises"; import { build } from "esbuild"; import { chromium } from "playwright";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), PORT = process.env.CR_PORT || "8876";
let bad = 0; const t = (n, c, v = "") => { console.log((c ? "PASS  " : "FAIL  ") + n + (v ? "  " + v : "")); if (!c) bad++; };
const dir = await mkdtemp(path.join(os.tmpdir(), "cr-")), out = path.join(dir, "c.mjs");
await build({ entryPoints: [path.join(ROOT, "src/clubs3d/ClubRoom3D.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", define: { "import.meta.url": '"file:///x"' } });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { seats, clubsOn, DAY_NAMES } = await import(out);
const s6 = seats(6); t("one seat per club, tables never touch (table width 2.7)", s6.length === 6 && s6.every((a, i) => s6.every((b, j) => i === j || Math.hypot(a.x - b.x, a.z - b.z) > 2.75)));
t("seats stay inside the room and leave the front open", s6.every((p) => Math.abs(p.x) < 8 && p.z < -0.3 && p.z > -8)); t("one club sits in the middle", seats(1)[0].x === 0);
t("day names line up with Date.getDay()", DAY_NAMES[0] === "Sunday" && DAY_NAMES[3] === "Wednesday");
t("Wednesday has more than one club, Saturday none", clubsOn(3).length >= 2 && clubsOn(6).length === 0);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };
const srv = http.createServer(async (q, r) => { try { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!f.startsWith(ROOT)) throw 0; const b = await readFile(f); r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise((ok) => srv.listen(+PORT, "127.0.0.1", ok));
const b = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
await p.addInitScript(() => { if (!localStorage.getItem("unify.lessoncounts.v1")) { localStorage.setItem("unify.lessoncounts.v1", JSON.stringify({ math: 20, ela: 10 })); localStorage.setItem("unify.progress.v1", JSON.stringify({ done: { math: ["a", "b", "c", "d", "e"], science: ["x"] } })); } });
await p.goto(`http://127.0.0.1:${PORT}/clubs3d.html`); await p.waitForSelector("#game canvas", { timeout: 90000 }); await p.waitForFunction(() => window.__clubs, null, { timeout: 30000 });
const n = await p.$$eval("#list button", (e) => e.length); t("a keyboard-friendly list has every club", n >= 5, String(n));
t("page has the club room canvas", (await p.$$("#game canvas")).length === 1);
if (process.env.CR_SHOT) await p.screenshot({ path: process.env.CR_SHOT });
// open from the list
await p.click("#list button >> nth=0"); t("clicking a club opens its popup", await p.isVisible("#pop") && (await p.textContent("#pT")).length > 3, await p.textContent("#pT"));
t("popup says when it meets", /Meets on \w+day/.test(await p.textContent("#pM")), await p.textContent("#pM"));
await p.click("#pJoin"); t("join works and the list shows membership", (await p.textContent("#pJoin")).includes("Leave") && (await p.$$eval("#list button.on", (e) => e.length)) === 1);
const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("unify.clubs.v1")).mine.length); t("membership is saved on the device", saved === 1);
await p.click("#pJoin"); t("leave works", (await p.textContent("#pJoin")).includes("Join") && (await p.$$eval("#list button.on", (e) => e.length)) === 0);
await p.click("#pX"); t("close hides the popup", !(await p.isVisible("#pop")));
// pick in the 3D scene
const pt = await p.evaluate(() => window.__clubs.screenOf("garden")); t("a table has a place on screen", !!pt && pt.x > 0 && pt.x < 1280 && pt.y > 0 && pt.y < 800, JSON.stringify(pt));
await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(300); t("clicking the table in 3D opens that club", await p.isVisible("#pop") && /Garden/.test(await p.textContent("#pT")), await p.textContent("#pT"));
await p.keyboard.press("Escape"); t("Escape closes it", !(await p.isVisible("#pop")));
// hub: open clubs & meetings, and the Today stamp card
await p.click("#list button >> nth=0"); await p.click("#pOpen"); await p.waitForSelector(".hb.show", { timeout: 10000 }); t("Open clubs & meetings opens the clubs tab", /clubs/i.test(await p.textContent(".hb-t")) && /(Go to|Attended|Join|meeting)/i.test(await p.textContent(".hb-body")));
await p.click(".hb-b >> text=Close"); await p.click("#bToday"); await p.waitForSelector(".hb.show"); const body = await p.textContent(".hb-body");
t("stamp card: known totals show stars and n/total", /Math\s*★★★☆☆☆☆☆☆☆\s*5\/20/.test(body), body.slice(body.indexOf("Your stamp card"), body.indexOf("Your stamp card") + 120));
t("stamp card: a subject with unknown total just says how many finished", /Science\s*1 finished/.test(body));
t("stamp card: untouched subjects are left out", !/History/.test(body.slice(body.indexOf("Your stamp card"), body.indexOf("Jump in"))));
t("Today panel links to Club Corner", /Club Corner/.test(body));
t("no script errors", errs.length === 0, errs[0] || ""); await b.close(); srv.close(); console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
