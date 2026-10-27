/** Daily quests: three small, kind things to do each day. Finishing them fills a weekly Spirit Meter (Spirit Fridays 🎭).
 *  Kept on this device in "unify.quests.v1": { day, done[], streak, lastDone, spirit:{week,pts} }. */
export interface Quest { id: string; icon: string; text: string; n: number; event: string }
export const QUEST_POOL: Quest[] = [
  { id: "sayhi", icon: "👋", text: "Say hi to someone in the hallway", n: 1, event: "chat" },
  { id: "lesson", icon: "📚", text: "Finish one lesson", n: 1, event: "lesson" },
  { id: "buddy", icon: "💡", text: "Ask the study buddy for a hint", n: 1, event: "buddy" },
  { id: "pet", icon: "🐾", text: "Feed the class pet", n: 1, event: "pet" },
  { id: "kind", icon: "💛", text: "Give someone a compliment", n: 1, event: "compliment" },
  { id: "club", icon: "🎒", text: "Visit a club table in Club Corner", n: 1, event: "club" },
  { id: "read", icon: "📖", text: "Read a page of anything", n: 1, event: "read" },
  { id: "event", icon: "🎭", text: "Join this week's event your way", n: 1, event: "event" },
];
export const SPIRIT_GOAL = 100, DAY_SPIRIT = 10;
const KEY = "unify.quests.v1";
const dk = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const wk = (d = new Date()) => { const x = new Date(d); x.setDate(x.getDate() - x.getDay()); return dk(x); };
interface State { day: string; done: string[]; streak: number; lastDone: string; spirit: { week: string; pts: number } }
function load(): State {
  try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); const s: State = { day: typeof o.day === "string" ? o.day : "", done: Array.isArray(o.done) ? o.done.filter((x: any) => typeof x === "string") : [], streak: Math.max(0, +o.streak || 0), lastDone: typeof o.lastDone === "string" ? o.lastDone : "", spirit: { week: o.spirit?.week || "", pts: Math.max(0, +o.spirit?.pts || 0) } }; return s; } catch { return { day: "", done: [], streak: 0, lastDone: "", spirit: { week: "", pts: 0 } }; }
}
function save(s: State) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* none */ } }
function state(): State { const s = load(), today = dk(); if (s.day !== today) { s.day = today; s.done = []; } if (s.spirit.week !== wk()) s.spirit = { week: wk(), pts: 0 }; return s; }
/** the three quests for today: lessons always, plus two rotating (stable per day) */
export function todays(d = new Date()): Quest[] {
  const n = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5), pool = QUEST_POOL.filter((q) => q.id !== "lesson");
  const pick = [pool[n % pool.length], pool[(n + 3) % pool.length]];
  return [QUEST_POOL[1], ...pick].filter((q, i, a) => a.findIndex((x) => x.id === q.id) === i).slice(0, 3);
}
export const isDone = (q: Quest) => state().done.includes(q.id);
export const streak = () => { const s = state(), y = dk(new Date(Date.now() - 864e5)); return s.lastDone === dk() || s.lastDone === y ? s.streak : 0; };
export const spirit = () => ({ pts: state().spirit.pts, full: state().spirit.pts >= SPIRIT_GOAL });
export const progress = (q: Quest) => (isDone(q) ? q.n : 0);
/** call when something happens in the game (chat, lesson finished, pet fed...). Finishing a quest fires unify:quest-done. */
export function track(event: string) {
  const s = state(), q = todays().find((x) => x.event === event && !s.done.includes(x.id)); if (!q) return;
  s.done.push(q.id); const firstOfDay = s.done.length === 1;
  if (firstOfDay) { const y = dk(new Date(Date.now() - 864e5)); s.streak = s.lastDone === y ? s.streak + 1 : s.lastDone === dk() ? s.streak : 1; s.lastDone = dk(); }
  s.spirit.pts = Math.min(SPIRIT_GOAL, s.spirit.pts + DAY_SPIRIT); save(s);
  try { dispatchEvent(new CustomEvent("unify:quest-done", { detail: { quest: q, streak: s.streak, spirit: DAY_SPIRIT, item: null } })); } catch { /* none */ }
}
export const Quests = { todays, isDone, streak, spirit, progress, track, SPIRIT_GOAL };
