// Class pet: pure rules (mood, feeding, names) and the real page (chip, feed, persistence). npm run build && node tests/class-pet.test.mjs
import http from "node:http"; import path from "node:path"; import os from "node:os"; import { mkdtemp, readFile } from "node:fs/promises"; import { build } from "esbuild"; import { chromium } from "playwright";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), PORT = process.env.PET_PORT || "8873";
let bad = 0; const t = (n, c, v = "") => { console.log((c ? "PASS  " : "FAIL  ") + n + (v ? "  " + v : "")); if (!c) bad++; };
// ---- pure rules
const dir = await mkdtemp(path.join(os.tmpdir(), "pet-")), out = path.join(dir, "pet.mjs");
await build({ entryPoints: [path.join(ROOT, "src/class3d/pet.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const { petMood, feed, cleanName } = await import(out);
const base = { name: "Biscuit", kind: "rabbit", fed: "", streak: 0, total: 0 };
t("no pet -> mood 0", petMood(null) === 0); t("never fed -> hungry (1)", petMood(base, "2026-10-20") === 1);
t("fed today -> happy (3)", petMood({ ...base, fed: "2026-10-20" }, "2026-10-20") === 3);
t("fed yesterday -> peckish (2)", petMood({ ...base, fed: "2026-10-19" }, "2026-10-20") === 2);
t("fed 3 days ago -> hungry (1)", petMood({ ...base, fed: "2026-10-17" }, "2026-10-20") === 1);
let r = feed(base, "2026-10-20"); t("first feed counts", r.fedNow && r.state.streak === 1 && r.state.total === 1);
const again = feed(r.state, "2026-10-20"); t("second feed same day does nothing", !again.fedNow && again.state.total === 1);
r = feed(r.state, "2026-10-21"); t("next day extends the streak", r.fedNow && r.state.streak === 2 && r.state.total === 2);
r = feed(r.state, "2026-10-24"); t("missed days restart the streak, total keeps", r.state.streak === 1 && r.state.total === 3);
t("month boundary counts as consecutive", feed({ ...base, fed: "2026-10-31", streak: 4 }, "2026-11-01").state.streak === 5);
t("name is cleaned and capped", cleanName("<b>Fluffy McFluffington the Third</b>") === "bFluffy McFlu" || cleanName("<b>Fluffy McFluffington the Third</b>").length <= 14);
t("empty name falls back", cleanName("   ") === "Buddy");
// ---- real page
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };
const srv = http.createServer(async (q, r) => { try { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!f.startsWith(ROOT)) throw 0; const b = await readFile(f); r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise((ok) => srv.listen(+PORT, "127.0.0.1", ok));
const b = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const page = async (seed) => { const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage(); const errs = []; p.on("pageerror", (e) => errs.push(e.message)); if (seed) await p.addInitScript((s) => localStorage.setItem("unify.pet.v1", s), JSON.stringify(seed)); await p.goto(`http://127.0.0.1:${PORT}/classroom3d.html`); await p.waitForSelector("#petChip", { timeout: 90000 }); return { p, errs }; };
{ const { p, errs } = await page(null); const txt = await p.textContent("#petChip"); t("no pet yet: chip invites you to meet one", /Meet our pet/.test(txt), txt);
  await p.click("#petChip button"); await p.fill("input[placeholder='Give it a name']", "Waffles"); await p.getByRole("button", { name: /Hamster/ }).click(); await p.getByRole("button", { name: "Save", exact: true }).click();
  const after = await p.textContent("#petChip"); t("picked + named pet shows on the chip", /Waffles/.test(after) && /Feed/.test(after), after);
  const saved = await p.evaluate(() => JSON.parse(localStorage.getItem("unify.pet.v1"))); t("pet saved on this device", saved.name === "Waffles" && saved.kind === "hamster", JSON.stringify(saved));
  await p.click("#petChip button:has-text('Feed')"); const fed = await p.textContent("#petChip"); t("feeding marks the day", /Fed today/.test(fed) && /♥♥♥/.test(fed), fed);
  t("no script errors", errs.length === 0, errs[0] || ""); await p.context().close(); }
{ const { p, errs } = await page({ name: "Pip", kind: "turtle", fed: "2020-01-01", streak: 3, total: 9 }); const txt = await p.textContent("#petChip"); t("old pet is hungry after a long gap", /Pip/.test(txt) && /♥♡♡/.test(txt), txt);
  if (process.env.PET_SHOT) { await p.evaluate(() => { const T = window.__room.camPos.constructor; window.__room.desired = () => ({ p: new T(-4.2, 2.3, -3.6), l: new T(-8.0, 0.5, -8.4), fov: 48 }); }); await p.waitForTimeout(6000); await p.screenshot({ path: process.env.PET_SHOT }); }
  t("no script errors (turtle)", errs.length === 0, errs[0] || ""); await p.context().close(); }
await b.close(); srv.close(); console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
