// Parent weekly summary: pure rules, plus a syntax check of the parent page script. node tests/weekly.test.mjs
import os from "node:os"; import path from "node:path"; import fs from "node:fs"; import { mkdtemp } from "node:fs/promises"; import { build } from "esbuild";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), dir = await mkdtemp(path.join(os.tmpdir(), "wk-")), out = path.join(dir, "w.mjs");
await build({ entryPoints: [path.join(ROOT, "src/game/weekly.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const { weekly } = await import(out);
let bad = 0; const t = (n, c, v = "") => { console.log((c ? "PASS  " : "FAIL  ") + n + (v ? "  " + v : "")); if (!c) bad++; };
const today = new Date(2026, 9, 21, 10); // Wed 21 Oct 2026
const empty = weekly({}, today); t("no data: gentle nudge, no crash", empty.days === 0 && /No classes picked/.test(empty.lines[0]) && empty.lines.length === 1);
t("garbage input is ignored", weekly({ progress: "{{nope", quests: 5, pet: [], rewards: "x" }, today).lines.length === 1);
const prog = { done: { math: ["a", "b", "c"], ela: ["x"] }, days: { "2026-10-21": { math: { min: 540 } }, "2026-10-19": { ela: { min: 600 }, "math-extra": { min: 700 } }, "2026-10-01": { science: { min: 600 } } } };
const w = weekly({ progress: JSON.stringify(prog), quests: { day: "2026-10-21", done: ["a", "b"], streak: 4, lastDone: "2026-10-21", spirit: { week: "w", pts: 30 } }, pet: { name: "Waffles", kind: "hamster", streak: 3, total: 5 }, rewards: ["r-petcage", "bogus"] }, today);
t("counts only the last 7 days", w.days === 2 && !w.subjects.includes("Science"), `${w.days} days, ${w.subjects.join("/")}`);
t("lists lessons finished, most in Math", w.lessonTotal === 4 && w.lessons[0].subject === "Math");
t("streak + pet + reward lines", w.streak === 4 && /4 days in a row/.test(w.lines.join(" ")) && /Waffles/.test(w.lines.join(" ")) && /Pet cage/.test(w.lines.join(" ")) && !/bogus/.test(w.lines.join(" ")));
t("old streak does not show", weekly({ quests: { day: "2026-09-01", done: [], streak: 9, lastDone: "2026-09-01" } }, today).streak === 0);
t("no scores, grades or rankings in the text", !/(grade|score|rank|behind|failed|\bF\b|%)/i.test(w.lines.join(" ")), w.lines.join(" | "));
t("pet name is capped and kept plain", weekly({ pet: { name: "x".repeat(40), kind: "rabbit", total: 1 } }, today).pet.name.length === 14);
// parent page: inline module scripts must still parse
const html = fs.readFileSync(path.join(ROOT, "parent.html"), "utf8"); const mods = [...html.matchAll(/<script type="module">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
let ok = mods.length >= 2; for (const m of mods) { try { await build({ stdin: { contents: m, loader: "js" }, write: false, format: "esm", logLevel: "silent" }); } catch (e) { ok = false; console.log(String(e).slice(0, 300)); } }
t("parent page scripts parse", ok, `${mods.length} module scripts`); t("parent page loads the summary bundle", /<script src="demo\/dist\/weekly\.js"><\/script>/.test(html) && /week\(uid,k,cardFor\(k\)\)/.test(html));
console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
