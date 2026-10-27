// The moment of the day: same for everyone on a day, rotates, never repeats on consecutive days, all texts are kid-safe and short.
import os from "node:os"; import path from "node:path"; import { mkdtemp } from "node:fs/promises"; import { build } from "esbuild";
const ROOT = path.resolve(new URL("..", import.meta.url).pathname), dir = await mkdtemp(path.join(os.tmpdir(), "mom-")), out = path.join(dir, "m.mjs");
await build({ entryPoints: [path.join(ROOT, "src/hall3d/daily.ts")], bundle: true, format: "esm", outfile: out, logLevel: "silent" });
const { MOMENTS, momentFor } = await import(out);
let bad = 0; const t = (n, c, v = "") => { console.log((c ? "PASS  " : "FAIL  ") + n + (v ? "  " + v : "")); if (!c) bad++; };
t("has plenty of moments", MOMENTS.length >= 12, String(MOMENTS.length)); t("ids are unique", new Set(MOMENTS.map((m) => m.id)).size === MOMENTS.length);
t("every moment is short and complete", MOMENTS.every((m) => m.icon && m.title && m.text.length > 20 && m.text.length < 140));
t("nothing scary or grown-up", !MOMENTS.some((m) => /\b(kill|die|dead|blood|gun|war|fire drill|drug|hate)\b/i.test(m.title + " " + m.text)));
let repeat = 0, seen = new Set(); for (let i = 0; i < 400; i++) { const a = momentFor(new Date(2026, 0, 1 + i)), b = momentFor(new Date(2026, 0, 2 + i)); if (a.id === b.id) repeat++; seen.add(a.id); }
t("never the same two days in a row", repeat === 0); t("every moment gets used", seen.size === MOMENTS.length);
t("same day gives the same moment", momentFor(new Date(2026, 9, 20, 8)).id === momentFor(new Date(2026, 9, 20, 23)).id);
console.log(bad ? `\n${bad} FAILED` : "\nall passed"); process.exit(bad ? 1 : 0);
