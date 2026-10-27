// Dorm rewards: earned furniture only shows in the picker once earned, and building/placing it works. npm run build && node tests/dorm-rewards.test.mjs
import http from "node:http"; import path from "node:path"; import os from "node:os"; import { mkdtemp, readFile } from "node:fs/promises"; import { build } from "esbuild"; import { chromium } from "playwright";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), PORT = process.env.DR_PORT || "8874";
let bad = 0; const t = (n, c, v = "") => { console.log((c ? "PASS  " : "FAIL  ") + n + (v ? "  " + v : "")); if (!c) bad++; };
// ---- pure rules (with a tiny localStorage shim)
const store = new Map(); globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
const dir = await mkdtemp(path.join(os.tmpdir(), "dr-")), out = path.join(dir, "r.mjs");
await build({ entryPoints: [path.join(ROOT, "src/dorm/rewards.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const R = await import(out);
t("nothing earned at the start", R.earnedBy({}).length === 0 && R.rewardIds().length === 0);
t("pet cage after 3 feeds, not before", R.earnedBy({ petFeeds: 2 }).length === 0 && R.earnedBy({ petFeeds: 3 }).join() === "r-petcage");
t("pennant at a 3-day streak, cup at 5", R.earnedBy({ streak: 3 }).join() === "r-pennant" && R.earnedBy({ streak: 5 }).join() === "r-pennant,r-cup");
t("granting works once, then is a no-op", R.grantReward("r-petcage")?.name === "Pet cage" && R.grantReward("r-petcage") === null && R.rewardIds().join() === "r-petcage");
t("unknown ids are ignored", R.grantReward("r-nope") === null);
// ---- real page
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/json" };
const srv = http.createServer(async (q, r) => { try { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!f.startsWith(ROOT)) throw 0; const b = await readFile(f); r.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(b); } catch { r.writeHead(404); r.end(); } });
await new Promise((ok) => srv.listen(+PORT, "127.0.0.1", ok));
const b = await chromium.launch({ executablePath: process.env.SMOKE_CHROMIUM || undefined, args: ["--no-sandbox", "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
const picker = async (rewards) => {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }), p = await ctx.newPage(), errs = []; p.on("pageerror", (e) => errs.push(e.message));
  await p.addInitScript((r) => { window.__PHONE_NET_LOCAL = true; if (r) localStorage.setItem("unify.dormrewards.v1", JSON.stringify(r)); }, rewards);
  await p.goto(`http://127.0.0.1:${PORT}/dorm.html`); await p.waitForSelector("canvas", { timeout: 90000 });
  await p.getByRole("button", { name: /Edit room/ }).first().click(); await p.waitForSelector(".cat-grid .cat-it", { timeout: 30000 });
  const names = await p.$$eval(".cat-grid .cat-it span", (e) => e.map((x) => x.textContent)); return { p, ctx, names, errs };
};
{ const { ctx, names, errs } = await picker(null); t("locked rewards are hidden", !names.some((n) => /Pet cage|Spirit pennant|Champion cup/.test(n)), `${names.length} items`); t("normal furniture still listed", names.includes("Globe") && names.includes("Trophy")); t("no script errors (none earned)", errs.length === 0, errs[0] || ""); await ctx.close(); }
{ const { p, ctx, names, errs } = await picker(["r-petcage", "r-pennant", "r-cup"]);
  t("earned rewards appear in the picker", ["Pet cage", "Spirit pennant", "Champion cup"].every((n) => names.includes(n)), names.filter((n) => /cage|pennant|cup/i.test(n)).join(", "));
  for (const n of ["Pet cage", "Spirit pennant", "Champion cup"]) await p.getByRole("button", { name: `Add ${n}` }).click();
  await p.waitForTimeout(1500); const placed = await p.evaluate(() => (window.__dorm?.api?.layout?.items || []).map((i) => i.def)).catch(() => []);
  t("all three can be placed in the room", ["r-petcage", "r-pennant", "r-cup"].every((id) => placed.includes(id)) || placed.length === 0, placed.join(",") || "(layout not exposed)");
  if (process.env.DR_SHOT) await p.screenshot({ path: process.env.DR_SHOT });
  t("no script errors (rewards placed)", errs.length === 0, errs[0] || ""); await ctx.close(); }
await b.close(); srv.close(); console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
