/** Dorm rewards: special furniture that is earned (not bought) by looking after the class pet and by finishing daily quests.
 *  The dorm picker only lists a reward once it has been earned; a reward that is already placed in a room stays there.
 *  Kept on this device ("unify.dormrewards.v1"). Nothing is ever taken away. */
export interface DormReward { id: string; name: string; how: string }
export const DORM_REWARDS: DormReward[] = [
  { id: "r-petcage", name: "Pet cage", how: "Feed the class pet 3 times" },
  { id: "r-pennant", name: "Spirit pennant", how: "Finish daily quests 3 days in a row" },
  { id: "r-cup", name: "Champion cup", how: "Finish daily quests 5 days in a row" },
];
const KEY = "unify.dormrewards.v1";
export const rewardIds = (): string[] => { try { const a = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a.filter((x) => DORM_REWARDS.some((r) => r.id === x)) : []; } catch { return []; } };
export const hasReward = (id: string) => rewardIds().includes(id);
/** earn a reward; returns it when it is new (and tells other pages), or null when already owned or unknown */
export function grantReward(id: string): DormReward | null {
  const r = DORM_REWARDS.find((x) => x.id === id); if (!r || hasReward(id)) return null;
  try { localStorage.setItem(KEY, JSON.stringify([...rewardIds(), id])); } catch { return null; }
  try { dispatchEvent(new CustomEvent("unify:dorm-reward", { detail: r })); } catch { /* none */ }
  announce(r); return r;
}
/** what a given progress level has earned (pure, used by the hooks and the tests) */
export const earnedBy = (p: { petFeeds?: number; streak?: number }): string[] => [...((p.petFeeds ?? 0) >= 3 ? ["r-petcage"] : []), ...((p.streak ?? 0) >= 3 ? ["r-pennant"] : []), ...((p.streak ?? 0) >= 5 ? ["r-cup"] : [])];
/** a small thank-you note on whichever page earned it */
function announce(r: DormReward) {
  if (typeof document === "undefined") return; const d = document.createElement("div"); d.textContent = `🎁 New dorm item: ${r.name}! Find it in My Dorm, under Add furniture.`;
  Object.assign(d.style, { position: "fixed", left: "50%", top: "18px", transform: "translateX(-50%)", zIndex: "80", maxWidth: "90vw", padding: "10px 16px", borderRadius: "14px", background: "#FFF6EA", color: "#3b3552", font: "600 14px 'Trebuchet MS',sans-serif", boxShadow: "0 4px 16px rgba(0,0,0,.25)", textAlign: "center" });
  document.body.appendChild(d); setTimeout(() => d.remove(), 7000);
}
