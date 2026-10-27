// Lesson stamps: text, milestones, the stamp bar. node tests/stamps.test.mjs
import os from "node:os"; import path from "node:path"; import { mkdtemp } from "node:fs/promises"; import { build } from "esbuild";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), dir = await mkdtemp(path.join(os.tmpdir(), "st-")), out = path.join(dir, "s.mjs");
await build({ entryPoints: [path.join(ROOT, "src/game/stamps.ts")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const { stampFor, stampBar } = await import(out);
let bad = 0; const t = (n, c, v = "") => { console.log((c ? "PASS  " : "FAIL  ") + n + (v ? "  " + v : "")); if (!c) bad++; };
t("first stamp reads well", stampFor("Math", 1, 20).text === "🏅 Stamp 1 of 20 in Math!" && !stampFor("Math", 1, 20).milestone);
t("5th is a milestone", stampFor("Math", 5, 20).milestone && /milestone/i.test(stampFor("Math", 5, 20).text));
t("near the end shows how many are left", /Only 2 to go/.test(stampFor("ELA", 18, 20).text));
t("last lesson is celebrated", stampFor("ELA", 20, 20).milestone && /finished every lesson/.test(stampFor("ELA", 20, 20).text));
t("never says n > total", stampFor("ELA", 25, 20).of === 25);
t("a one-lesson subject is not 'finished every lesson'", !/every lesson/.test(stampFor("Life Lessons", 1, 1).text));
t("bar fills with progress", stampBar(0, 20) === "☆☆☆☆☆☆☆☆☆☆" && stampBar(10, 20) === "★★★★★☆☆☆☆☆" && stampBar(20, 20) === "★★★★★★★★★★" && stampBar(99, 20).length === 10);
console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
