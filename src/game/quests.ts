import { Social } from "../hall3d/social";
import { Progress } from "./progress";
import { stampsToday, stampGoal } from "./stamps";

/* quests.ts — tiny daily quests shown on the hub. Each quest checks live game state;
   completing one toasts and pays a sticker. No server, all local. */

export interface Quest { id: string; icon: string; label: string; goal: number; progress: () => number; reward: string }

const k = (id: string) => `unify.quest.${id}.${new Date().toDateString()}`;
const done = (id: string) => { try { return localStorage.getItem(k(id)) === "1"; } catch { return false; } };
const finish = (id: string) => { try { localStorage.setItem(k(id), "1"); } catch { /* private */ } };

export const QUESTS: Quest[] = [
  { id: "class", icon: "🏫", label: "Finish a class", goal: 1, reward: "Sticker", progress: () => Progress.todayCount() },
  { id: "stamps", icon: "🌟", label: "Earn today's stamps", goal: stampGoal(), reward: "Star", progress: () => stampsToday() },
  { id: "buddy", icon: "👋", label: "Say hi to your buddy", goal: 1, reward: "Heart", progress: () => (Social.buddyGreeted() ? 1 : 0) },
  { id: "pet", icon: "🐾", label: "Feed the class pet", goal: 1, reward: "Treat", progress: () => (Social.petFed() ? 1 : 0) },
];

/** quests ready to turn in right now */
export function questReady(): Quest[] {
  return QUESTS.filter((q) => !done(q.id) && q.progress() >= q.goal);
}
/** turn in every ready quest; returns the rewards handed out */
export function questClaim(): string[] {
  const out: string[] = [];
  for (const q of questReady()) { finish(q.id); out.push(q.reward); }
  return out;
}
/** one-line summary for the hub chip */
export function questLine(): string {
  const left = QUESTS.filter((q) => !done(q.id));
  if (!left.length) return "All quests done today!";
  const q = left[0];
  return `${q.icon} ${q.label} (${Math.min(q.progress(), q.goal)}/${q.goal})`;
}
