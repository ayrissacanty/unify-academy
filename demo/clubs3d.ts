import { ClubRoom3D, DAY_NAMES } from "../src/clubs3d/ClubRoom3D";
import { CLUBS, Clubs, type Club } from "../src/game/community";
import { openHub } from "../src/hall3d/hubui";

const $ = (id: string) => document.getElementById(id)!;
const room = new ClubRoom3D($("game")); (window as any).__clubs = room;
let cur: Club | null = null;
const today = new Date().getDay();

function close() { $("pop").classList.remove("show"); cur = null; }
function show(c: Club) {
  cur = c; const mine = Clubs.mine().some((x) => x.id === c.id), meets = c.day === today;
  $("pT").textContent = `${c.icon} ${c.name}`; $("pB").textContent = c.blurb;
  $("pM").textContent = `Meets on ${DAY_NAMES[c.day]}s${meets ? ", and that is today!" : "."}`; $("pP").textContent = `Prize for taking part: ${c.prize}`;
  const j = $("pJoin") as HTMLButtonElement; j.textContent = mine ? "Leave this club" : "Join this club"; j.className = mine ? "" : "go";
  $("pop").classList.add("show"); j.focus();
}
function paintList() {
  const mine = new Set(Clubs.mine().map((c) => c.id)), nav = $("list"); nav.innerHTML = "";
  for (const c of CLUBS) { const b = document.createElement("button"); b.type = "button"; b.className = mine.has(c.id) ? "on" : ""; b.append(`${c.icon} ${c.name}`); const d = document.createElement("span"); d.className = "d"; d.textContent = c.day === today ? "today" : DAY_NAMES[c.day].slice(0, 3); b.append(d); b.setAttribute("aria-label", `${c.name}, meets ${DAY_NAMES[c.day]}${mine.has(c.id) ? ", you are a member" : ""}`); b.onclick = () => show(c); nav.append(b); }
}
room.onPick = (c) => { if (c) show(c); else close(); };
$("pJoin").onclick = () => { if (!cur) return; const mine = Clubs.mine().some((x) => x.id === cur!.id); if (mine) Clubs.leave(cur.id); else Clubs.join(cur.id); room.refresh(); paintList(); show(cur); };
$("pOpen").onclick = () => { if (cur && !Clubs.mine().some((x) => x.id === cur!.id)) { Clubs.join(cur.id); room.refresh(); paintList(); } close(); openHub({ onClose: () => { room.refresh(); paintList(); } }, "Friends & clubs"); };
$("pX").onclick = close; addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
$("bToday").onclick = () => openHub({ onClose: () => { room.refresh(); paintList(); } }, "Today");
$("bBack").onclick = () => { if (parent !== window) parent.postMessage({ type: "unify:stage-exit" }, "*"); else if (history.length > 1) history.back(); else location.href = "hallway3d.html"; };
setTimeout(() => ($("hint").style.display = "none"), 9000); paintList();
