/** Daily quests, a streak and the weekly Spirit Meter. Three small, friendly quests a day; finishing one earns a locker or Chat Chow item and spirit points.
 *  Everything is kind and optional: no timers, no losing things, and a missed day just restarts the streak counter. */
import { Cosm, type Item } from "./cosmetics";
import { eventThisWeek } from "./events";
import { grantReward, earnedBy } from "../dorm/rewards";
export interface Template { id: string; ev: string; n: number; text: string; icon: string }
export const TEMPLATES: Template[] = [
  { id: "talk3", ev: "talk", n: 3, text: "Chat with 3 different people", icon: "💬" }, { id: "talk1", ev: "talk", n: 1, text: "Say hello to someone new", icon: "👋" },
  { id: "emote2", ev: "emote", n: 2, text: "Use 2 emotes (high five, dance, thumbs up…)", icon: "🙌" }, { id: "lesson1", ev: "lesson", n: 1, text: "Finish a lesson step in any class", icon: "📘" },
  { id: "chow", ev: "chow", n: 1, text: "Sit at Chat Chow and join the table talk", icon: "🍽️" }, { id: "locker", ev: "locker", n: 1, text: "Decorate or visit a locker", icon: "🔒" },
  { id: "assembly", ev: "assembly", n: 1, text: "Go to morning assembly", icon: "🎤" }, { id: "opendoor", ev: "opendoor", n: 1, text: "Peek into The Open Door classroom", icon: "🚪" },
  { id: "game", ev: "game", n: 1, text: "Play a practice mini-game", icon: "🎮" }, { id: "trip", ev: "trip", n: 1, text: "Take a VR field trip", icon: "🥽" },
  { id: "pet", ev: "pet", n: 1, text: "Feed the class pet", icon: "🐾" }, { id: "kind", ev: "kind", n: 1, text: "Do something kind (cheer someone up, say thanks)", icon: "💖" }, { id: "event", ev: "event", n: 1, text: "Join this week's event", icon: "🎉" }, { id: "club", ev: "club", n: 1, text: "Go to a club meeting", icon: "🎒" },
];
const KEY = "unify.quests.v1";
interface St { day: string; prog: Record<string, number>; done: string[]; streak: number; lastDone: string; spirit: { week: string; pts: number }; talked: string[]; earned: string[] }
const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const wk = (d = new Date()) => String(Math.floor((d.getTime() / 864e5 + 3) / 7));
const blank = (): St => ({ day: dayKey(), prog: {}, done: [], streak: 0, lastDone: "", spirit: { week: wk(), pts: 0 }, talked: [], earned: [] });
const read = (): St => { let s = blank(); try { s = { ...s, ...(JSON.parse(localStorage.getItem(KEY) || "null") || {}) }; } catch { /* default */ } if (s.day !== dayKey()) { s.day = dayKey(); s.prog = {}; s.done = []; s.talked = []; } if (s.spirit.week !== wk()) s.spirit = { week: wk(), pts: 0 }; return s; };
const write = (s: St) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };
export const SPIRIT_GOAL = 60;
/** three quests for today: the same for everyone on a given day, so friends can compare */
export function todays(): Template[] {
  const d = Math.floor(Date.now() / 864e5), pool = TEMPLATES.filter((t) => t.id !== "event" && t.id !== "trip"), ev = eventThisWeek(), extra = ev.live ? TEMPLATES.find((t) => t.id === "event")! : null;
  const out: Template[] = []; let i = (d * 7) % pool.length; while (out.length < (extra ? 2 : 3)) { const t = pool[i % pool.length]; if (!out.some((o) => o.ev === t.ev)) out.push(t); i += 5; }
  if (extra) out.push(extra); return out;
}
export interface Reward { quest: Template; item: Item | null; spirit: number; streak: number }
export const Quests = {
  state: read,
  streak() { const s = read(); const y = dayKey(new Date(Date.now() - 864e5)); return s.lastDone === dayKey() || s.lastDone === y ? s.streak : 0; },
  progress(t: Template) { return Math.min(t.n, read().prog[t.id] ?? 0); },
  isDone(t: Template) { return read().done.includes(t.id); },
  /** something happened (talk, emote, lesson, chow, locker, assembly, opendoor, game, trip, kind, event). `key` de-duplicates (e.g. a different NPC each time). */
  track(ev: string, key?: string): Reward[] {
    const s = read(), got: Reward[] = [];
    if (ev === "talk" && key) { if (s.talked.includes(key)) return []; s.talked.push(key); }
    for (const t of todays()) {
      if (t.ev !== ev || s.done.includes(t.id)) continue; s.prog[t.id] = (s.prog[t.id] ?? 0) + 1;
      if (s.prog[t.id] >= t.n) {
        s.done.push(t.id); const y = dayKey(new Date(Date.now() - 864e5)); if (s.lastDone !== dayKey()) { s.streak = s.lastDone === y ? s.streak + 1 : 1; s.lastDone = dayKey(); }
        const pts = 10 + Math.min(10, s.streak * 2); s.spirit.pts += pts; const item = Cosm.reward(s.streak >= 5 ? 3 : s.streak >= 2 ? 2 : 1); if (item) s.earned.push(item.id);
        got.push({ quest: t, item, spirit: pts, streak: s.streak });
      }
    }
    write(s); for (const id of earnedBy({ streak: got.length ? s.streak : 0 })) grantReward(id);
    for (const r of got) { try { dispatchEvent(new CustomEvent("unify:quest-done", { detail: r })); } catch { /* none */ } }
    return got;
  },
  spirit() { const s = read(); return { pts: s.spirit.pts, goal: SPIRIT_GOAL, full: s.spirit.pts >= SPIRIT_GOAL }; },
};
