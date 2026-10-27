/** Lesson stamps: finishing a lesson earns a stamp in that subject's stamp card. The card has a stamp for every lesson, and the 5th, 10th and 20th
 *  stamp in a subject is a milestone with a little cheer. Pure text rules; counts come from Progress.doneCount. */
export interface Stamp { n: number; of: number; text: string; milestone: boolean }
export const MILESTONES = [5, 10, 20, 40];
export function stampFor(subjectName: string, n: number, of: number): Stamp {
  const total = Math.max(of, n), milestone = MILESTONES.includes(n) || (n === total && total > 1);
  const left = total - n, tail = n === total && total > 1 ? " You finished every lesson in this subject!" : milestone ? " A milestone. Great work!" : left > 0 && left <= 3 ? ` Only ${left} to go.` : "";
  return { n, of: total, milestone, text: `🏅 Stamp ${n} of ${total} in ${subjectName}!${tail}` };
}
export const stampBar = (n: number, of: number, width = 10): string => { const t = Math.max(1, of), f = Math.min(width, Math.round((Math.min(n, t) / t) * width)); return "★".repeat(f) + "☆".repeat(width - f); };

/** how many lessons each subject really has: the classroom loads the lesson packs and saves the totals so other pages (the Today panel) can show them */
const CKEY = "unify.lessoncounts.v1";
export const saveLessonCounts = (c: Record<string, number>) => { try { localStorage.setItem(CKEY, JSON.stringify(c)); } catch { /* private mode */ } };
export const readLessonCounts = (): Record<string, number> => { try { const o = JSON.parse(localStorage.getItem(CKEY) || "{}"); return o && typeof o === "object" ? Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([, v]) => Number.isFinite(Number(v)) && Number(v) > 0).map(([k, v]) => [k, Math.floor(Number(v))])) : {}; } catch { return {}; } };
