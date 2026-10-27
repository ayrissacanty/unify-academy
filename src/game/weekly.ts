/** The weekly summary for parents: a short, kind, plain-language look at what a child did, built only from data the child's device already syncs
 *  (progress, daily quests, class pet, earned dorm rewards). It never ranks or compares children and never shows scores as grades. */
import { SUBJECT_NAME, type Subject } from "./progress";
export interface WeekRaw { progress?: any; quests?: any; pet?: any; rewards?: any }
export interface Week { days: number; subjects: string[]; lessons: { subject: string; n: number }[]; lessonTotal: number; questsToday: number; streak: number; spiritPts: number; pet: { name: string; kind: string; streak: number; total: number } | null; rewards: string[]; lines: string[] }
const dk = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const obj = (v: any) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const parse = (v: any) => { if (typeof v === "string") { try { return JSON.parse(v); } catch { return null; } } return v; };
const nm = (s: string) => (SUBJECT_NAME as Record<string, string>)[s] ?? s.replace(/^./, (c) => c.toUpperCase());
const RW: Record<string, string> = { "r-petcage": "Pet cage", "r-pennant": "Spirit pennant", "r-cup": "Champion cup" };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export function weekly(raw: WeekRaw, today = new Date()): Week {
  const pr = obj(parse(raw.progress)), qs = obj(parse(raw.quests)), pet = obj(parse(raw.pet)), rw = parse(raw.rewards);
  const last7 = new Set<string>(); for (let i = 0; i < 7; i++) last7.add(dk(new Date(today.getFullYear(), today.getMonth(), today.getDate() - i)));
  const days = obj(pr.days), active = Object.keys(days).filter((d) => last7.has(d) && Object.keys(obj(days[d])).length > 0), subj = new Set<string>();
  for (const d of active) for (const k of Object.keys(obj(days[d]))) subj.add(nm(k.replace("-extra", "")));
  const done = obj(pr.done), lessons = Object.keys(done).map((s) => ({ subject: nm(s), n: Array.isArray(done[s]) ? done[s].length : 0 })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n), lessonTotal = lessons.reduce((n, x) => n + x.n, 0);
  const qToday = qs.day === dk(today) && Array.isArray(qs.done) ? qs.done.length : 0, yest = dk(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1));
  const streak = qs.lastDone === dk(today) || qs.lastDone === yest ? Math.max(0, +qs.streak || 0) : 0, spiritPts = qs.spirit && qs.spirit.week ? Math.max(0, +qs.spirit.pts || 0) : 0;
  const p = pet && typeof pet.name === "string" && pet.name ? { name: String(pet.name).slice(0, 14), kind: String(pet.kind || ""), streak: Math.max(0, +pet.streak || 0), total: Math.max(0, +pet.total || 0) } : null;
  const rewards = (Array.isArray(rw) ? rw : []).map((id: string) => RW[id]).filter(Boolean);
  const lines: string[] = [];
  lines.push(active.length ? `Joined class on ${plural(active.length, "day")} this week${subj.size ? ` (${[...subj].join(", ")})` : ""}.` : "No classes picked this week yet. A quick visit is a nice way to start.");
  if (lessonTotal) lines.push(`${plural(lessonTotal, "lesson")} finished so far${lessons.length ? `, most in ${lessons[0].subject}` : ""}.`);
  if (streak >= 2) lines.push(`Daily quest streak: ${streak} days in a row.`); else if (qToday) lines.push(`Finished ${plural(qToday, "daily quest")} today.`);
  if (p) lines.push(p.total ? `Looks after the class pet ${p.name}${p.streak >= 2 ? `, fed ${p.streak} days in a row` : ""}.` : `Has met the class pet ${p.name}.`);
  if (rewards.length) lines.push(`Earned for the dorm: ${rewards.join(", ")}.`);
  return { days: active.length, subjects: [...subj], lessons, lessonTotal, questsToday: qToday, streak, spiritPts, pet: p, rewards, lines };
}
