/** The "Today" panel: daily quests + streak + Spirit Meter, this week's event (join it your way or skip it), your collection (locker + Chat Chow items),
 *  look & sound settings (decorations, local weather, quiet mode) and a grown-ups tab (time, friends, blocks, approved hosts, limits). */
import { World, THEMES, describe, enableLocal, disableLocal, themeOf } from "../game/world";
import { Events, EVENTS, eventThisWeek, type EventDef } from "../game/events";
import { Cosm, ITEMS, type Slot } from "../game/cosmetics";
import { Quests, todays, SPIRIT_GOAL } from "../game/quests";
import { Safety, parentUnlocked } from "../game/safety";
import { communityTab } from "./communityui";
import { Progress, ALL_SUBJECTS, SUBJECT_NAME } from "../game/progress";
import { CURRICULUM } from "../class3d/curriculum";
import { stampBar, readLessonCounts } from "../game/stamps";
import { loadPet, petMood } from "../class3d/pet";
const CSS = `.hb{position:fixed;inset:0;z-index:70;background:rgba(74,59,63,.45);display:none;align-items:center;justify-content:center;font-family:"Fredoka","Trebuchet MS",system-ui,sans-serif;color:#4A3B3F}.hb.show{display:flex}
.hb-p{background:#F3E7CF;border:1px solid #fff;border-radius:20px;box-shadow:0 3px 0 #C9B28A,0 18px 36px rgba(0,0,0,.4);width:min(720px,96vw);max-height:92vh;display:flex;flex-direction:column;overflow:hidden}
.hb-h{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid #C9B28A}.hb-h h2{font-size:20px;flex:1}.hb-t{display:flex;gap:6px;padding:8px 12px;flex-wrap:wrap}
.hb-b{font:inherit;font-size:14px;background:#FFF9F0;border:1px solid #fff;border-radius:11px;padding:6px 12px;min-height:36px;cursor:pointer;box-shadow:0 2px 0 #C9B28A;color:#4A3B3F}.hb-b.on{background:#E07A66;color:#fff}.hb-b.go{background:#5FB37A;color:#fff}.hb-b.sm{min-height:30px;font-size:12px;padding:3px 9px}
.hb-body{padding:6px 14px 16px;overflow:auto}.hb-body h3{font-size:15px;margin:10px 0 4px}.hb-card{background:#FFF9F0;border-radius:14px;padding:10px 12px;margin:6px 0;box-shadow:0 2px 0 #C9B28A}.hb-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.hb-bar{height:12px;border-radius:99px;background:#E7D7B6;overflow:hidden}.hb-bar i{display:block;height:100%;background:linear-gradient(90deg,#EAB94E,#E8604C)}.hb small{color:#8A7A70}
.hb-q{display:flex;gap:10px;align-items:center}.hb-q .ic{font-size:26px}.hb-q.done{opacity:.6}.hb-q.done b:after{content:" ✔";color:#2f7a4c}
.hb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}.hb-it{background:#FFF9F0;border-radius:12px;padding:8px;text-align:center;font-size:12px;box-shadow:0 2px 0 #C9B28A;cursor:pointer;border:2px solid transparent}.hb-it.eq{border-color:#E07A66}.hb-it.lock{opacity:.4;cursor:default}.hb-it .art{font-size:28px;display:block;height:38px;line-height:38px;border-radius:8px;margin-bottom:3px}
.hb select,.hb input[type=text]{font:inherit;font-size:14px;padding:6px 8px;border-radius:9px;border:1px solid #C9B28A;background:#fff;color:#4A3B3F}.hb label{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:14px}.hb-toast{position:fixed;left:50%;top:70px;transform:translateX(-50%);z-index:90;background:#5FB37A;color:#fff;border-radius:14px;padding:10px 16px;font-weight:600;box-shadow:0 8px 20px rgba(0,0,0,.3);font-family:"Fredoka",sans-serif;max-width:92vw;text-align:center}`;
const E = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", parent?: HTMLElement, text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent?.appendChild(e); return e; };
let root: HTMLElement | null = null, styled = false;
export interface HubHooks { openGames?: () => void; openTrip?: () => void; goTo?: (k: string) => void; onClose?: () => void; applyTheme?: () => void }
export function toast(msg: string) { const t = E("div", "hb-toast", document.body, msg); setTimeout(() => t.remove(), 3800); }
// celebrate finished quests anywhere in the game
if (typeof addEventListener === "function") addEventListener("unify:quest-done", (e: any) => { const r = e.detail; toast(`⭐ Quest done: ${r.quest.text}! +${r.spirit} spirit${r.item ? ` · You got: ${r.item.art} ${r.item.name}` : ""}${r.streak > 1 ? ` · ${r.streak}-day streak!` : ""}`); });

export function openHub(hooks: HubHooks, startTab = "Today") {
  if (!styled) { styled = true; const s = document.createElement("style"); s.textContent = CSS; document.head.appendChild(s); }
  root ??= E("div", "hb", document.body); const R = root; R.innerHTML = ""; R.classList.add("show"); R.onkeydown = (e) => e.stopPropagation(); R.onpointerdown = (e) => e.stopPropagation();
  const P = E("div", "hb-p", R), H = E("div", "hb-h", P); E("h2", "", H, "⭐ Today at UNIFY"); const tabsEl = E("div", "hb-t", P), body = E("div", "hb-body", P);
  const close = () => { R.classList.remove("show"); R.innerHTML = ""; hooks.onClose?.(); }; E("button", "hb-b", H, "Close").onclick = close; R.onclick = (e) => { if (e.target === R) close(); };
  let tab = startTab; const TABS = ["Today", "Event", "Friends & clubs", "Collection", "Look & sound", "Grown-ups"];
  const draw = () => { tabsEl.innerHTML = ""; body.innerHTML = ""; for (const t of TABS) { const b = E("button", "hb-b" + (t === tab ? " on" : ""), tabsEl, t); b.onclick = () => { tab = t; draw(); }; } ({ Today: today, Event: event, Collection: collection, "Look & sound": look, "Grown-ups": grownups, "Friends & clubs": communityTab } as any)[tab](body, draw, hooks); };
  draw();
}
function today(b: HTMLElement, _redraw: () => void, hooks: HubHooks) {
  const ev = eventThisWeek(), sp = Quests.spirit(), st = Quests.streak();
  const top = E("div", "hb-card", b); E("b", "", top, Events.banner()); const row = E("div", "hb-row", top); row.style.marginTop = "6px"; E("small", "", row, describe());
  const sc = E("div", "hb-card", b); E("b", "", sc, `Spirit Meter ${sp.pts}/${SPIRIT_GOAL}`); const bar = E("div", "hb-bar", sc); E("i", "", bar).style.width = `${Math.min(100, (sp.pts / SPIRIT_GOAL) * 100)}%`; E("small", "", sc, sp.full ? "Full! Everyone's spirit lit up Friday's show. 🎭" : "Finish quests to fill the meter this week. A full meter makes Friday Showtime extra special.");
  E("small", "", sc, `Streak: ${st} day${st === 1 ? "" : "s"} 🔥 (a missed day just starts a fresh streak, nothing is lost)`).style.display = "block";
  E("h3", "", b, "Today's quests");
  for (const t of todays()) { const done = Quests.isDone(t), c = E("div", "hb-card hb-q" + (done ? " done" : ""), b); E("span", "ic", c, t.icon); const x = E("div", "", c); E("b", "", x, t.text); E("small", "", x, `${Quests.progress(t)}/${t.n}`).style.display = "block"; }
  stampCard(b);
  E("h3", "", b, "Jump in"); const r = E("div", "hb-row", b);
  E("button", "hb-b go", r, "🎒 Club Corner").onclick = () => { window.open("clubs3d.html", "_blank"); };
  if (hooks.openGames) E("button", "hb-b go", r, "🎮 Practice games").onclick = () => { hooks.openGames!(); };
  E("button", "hb-b go", r, "📚 Curriculum app").onclick = () => { window.open("curriculum.html", "_blank"); };
  if (hooks.openTrip) E("button", "hb-b go", r, "🥽 VR field trip").onclick = () => { hooks.openTrip!(); };
  if (hooks.goTo) { E("button", "hb-b", r, "🚪 The Open Door").onclick = () => hooks.goTo!("open"); E("button", "hb-b", r, "🎭 Auditorium").onclick = () => hooks.goTo!("news"); }
  void ev;
}
/** the stamp card: one row per subject, a star for every tenth of the lessons finished, plus the class pet's mood */
function stampCard(b: HTMLElement) {
  E("h3", "", b, "Your stamp card"); const card = E("div", "hb-card", b), counts = readLessonCounts(); let any = false;
  for (const s of ALL_SUBJECTS) {
    const n = Progress.doneCount(s), total = Math.max(counts[s] ?? 0, CURRICULUM[s]?.length ?? 0);
    const known = !!counts[s]; if (!known && !n) continue; any = true; const row = E("div", "hb-row", card); row.style.justifyContent = "space-between"; E("b", "", row, SUBJECT_NAME[s]);
    E("span", "", row, known ? `${stampBar(n, total)}  ${Math.min(n, total)}/${total}` : `${n} finished`).title = `${n} lesson${n === 1 ? "" : "s"} finished`;
  }
  if (!any) E("small", "", card, "Finish a lesson to earn your first stamp.");
  const pet = loadPet(); if (pet) { const m = petMood(pet), r = E("div", "hb-row", card); r.style.marginTop = "6px"; E("small", "", r, `🐾 ${pet.name} is ${m === 3 ? "happy" : m === 2 ? "a little peckish" : "hungry"} ${"♥".repeat(m)}${"♡".repeat(3 - m)}. Feed it in the classroom.`); }
}
function choiceRow(parent: HTMLElement, label: string, opts: { id: string; label: string; color?: string; emoji?: string }[], cur: string | undefined, set: (id: string) => void) {
  E("h3", "", parent, label); const r = E("div", "hb-row", parent); for (const o of opts) { const b = E("button", "hb-b" + (o.id === cur ? " on" : ""), r, `${o.emoji ?? ""} ${o.label}`.trim()); if (o.color) b.style.borderLeft = `8px solid ${o.color}`; b.onclick = () => set(o.id); }
}
function event(b: HTMLElement, redraw: () => void) {
  const t = eventThisWeek(), d: EventDef = t.def, me = Events.mine(d.id), out = Events.optedOut(d.id);
  const c = E("div", "hb-card", b); E("b", "", c, `${d.icon} ${d.name}`); E("div", "", c, d.blurb); E("small", "", c, t.live ? "It's on right now (Wednesday to Friday)." : `Starts in ${t.startsIn} day${t.startsIn === 1 ? "" : "s"}. You can get your look ready now.`);
  E("div", "", b, "").style.height = "2px";
  const sel = { team: me?.team, acc: me?.acc, role: me?.role };
  if (d.teams) choiceRow(b, "Pick your colour or team", d.teams, sel.team, (id) => { sel.team = id; Events.adopt(d.id, sel); redraw(); });
  if (d.accessories) choiceRow(b, "Pick an accessory (or none)", d.accessories, sel.acc, (id) => { sel.acc = id; Events.adopt(d.id, sel); redraw(); });
  if (d.roles) choiceRow(b, "How do you want to join in?", d.roles, sel.role, (id) => { sel.role = id; Events.adopt(d.id, sel); redraw(); });
  const r = E("div", "hb-row", b); r.style.marginTop = "10px";
  const join = E("button", "hb-b go", r, me ? "✔ You're in (tap to update)" : "Join this event"); join.onclick = () => { Events.adopt(d.id, sel); Quests.track("event"); toast(`You joined ${d.name}!`); redraw(); };
  const skip = E("button", "hb-b" + (out ? " on" : ""), r, out ? "Skipping this one" : "Skip this event"); skip.onclick = () => { Events.optOut(d.id); redraw(); };
  E("small", "", b, "Events are always optional. Lessons and friends carry on as usual either way. Quiet mode (in Look & sound) turns the whole school's event outfits off.").style.display = "block";
  E("h3", "", b, "Coming up"); const up = E("div", "hb-row", b); for (const e of EVENTS) { const x = E("span", "hb-b sm", up, `${e.icon} ${e.name}`); if (e.id === d.id) x.classList.add("on"); }
}
const SLOT_NAMES: Record<Slot, string> = { wall: "Locker wallpaper", light: "Locker lights", magnet: "Locker magnets (up to 6)", plate: "Locker name plate", cloth: "Chat Chow table cloth", flag: "Chat Chow flag", crew: "Chat Chow crew name" };
function collection(b: HTMLElement, redraw: () => void) {
  const s = Cosm.state(); E("small", "", b, `You own ${s.own.length} of ${ITEMS.length} items. Earn more from daily quests. Tap an item to use it.`).style.display = "block";
  const name = E("div", "hb-card", b); E("b", "", name, "Your Chat Chow crew name"); const row = E("div", "hb-row", name); const inp = E("input", "", row) as HTMLInputElement; inp.type = "text"; inp.maxLength = 18; inp.value = Cosm.crewName(); const sv = E("button", "hb-b sm", row, "Save"); sv.onclick = () => { Cosm.setCrewName(inp.value); toast("Crew name saved. Sit at a Chat Chow table to see it!"); redraw(); };
  for (const slot of Object.keys(SLOT_NAMES) as Slot[]) {
    E("h3", "", b, SLOT_NAMES[slot]); const g = E("div", "hb-grid", b);
    for (const it of ITEMS.filter((i) => i.slot === slot)) { const own = s.own.includes(it.id), eq = slot === "magnet" ? (s.eq.magnets ?? []).includes(it.id) : (s.eq as any)[slot] === it.id; const c = E("div", "hb-it" + (eq ? " eq" : "") + (own ? "" : " lock"), g); const a = E("span", "art", c, own ? it.art : "🔒"); if (own && it.color && it.color !== "rainbow") a.style.background = it.color; if (own && it.color === "rainbow") a.style.background = "linear-gradient(90deg,#f26b5b,#ffd23f,#7bd389,#6aa9f0,#b8a8da)"; E("div", "", c, own ? it.name : "Earn from quests"); if (own) c.onclick = () => { Cosm.equip(it.id); redraw(); }; }
  }
}
function look(b: HTMLElement, redraw: () => void, hooks: HubHooks) {
  const P = World.prefs;
  E("h3", "", b, "Decorations"); const sel = E("select", "", b) as HTMLSelectElement; for (const [id, name] of [["auto", "Auto: follow the season and dates"], ["off", "No decorations"], ...THEMES.map((t) => [t.id, t.name])]) { const o = E("option", "", sel, name); o.value = id; if (id === P.decor) o.selected = true; } sel.onchange = () => { World.set({ decor: sel.value }); hooks.applyTheme?.(); redraw(); };
  const th = themeOf(); if (th) E("small", "", b, `Now showing: ${th.name}. ${th.mood}.`).style.display = "block";
  E("h3", "", b, "Weather & place"); const lbl = E("label", "", b), cb = E("input", "", lbl) as HTMLInputElement; cb.type = "checkbox"; cb.checked = P.local; E("span", "", lbl, "Match the weather and season where we live");
  cb.onchange = async () => { if (cb.checked) { const ok = await enableLocal(); if (!ok) { cb.checked = false; toast("Couldn't get your location. The school will follow the date instead."); } } else disableLocal(); hooks.applyTheme?.(); redraw(); };
  E("small", "", b, P.local ? `Using about (${P.lat}, ${P.lon}), rounded to roughly 11 km and kept only on this device. Weather is fetched from Open-Meteo.` : "Off. The school follows the date and your time zone. Turning this on asks your browser for your location once; only a rounded spot is saved on this device.").style.display = "block";
  const tg = (k: "weatherFx" | "sound" | "music" | "quiet", text: string) => { const l = E("label", "", b), c = E("input", "", l) as HTMLInputElement; c.type = "checkbox"; c.checked = !!(World.prefs as any)[k]; E("span", "", l, text); c.onchange = () => { World.set({ [k]: c.checked } as any); hooks.applyTheme?.(); }; };
  E("h3", "", b, "Buttons"); { const l = E("label", "", b), c = E("input", "", l) as HTMLInputElement; c.type = "checkbox"; try { c.checked = localStorage.getItem("unify.ui.always") === "1"; } catch { /* none */ } E("span", "", l, "Keep buttons visible (otherwise double-tap the scene to show them)"); c.onchange = () => { try { localStorage.setItem("unify.ui.always", c.checked ? "1" : "0"); } catch { /* none */ } dispatchEvent(new CustomEvent("unify:ui-pref")); }; E("small", "", b, "Buttons are small and hide themselves so the lesson, the hallway and the mood stay front and centre. Pressing Tab also shows them.").style.display = "block"; }
  E("h3", "", b, "Sound & motion"); tg("sound", "Sounds (footsteps, bell, crowd, weather)"); tg("music", "Soft background tune"); tg("weatherFx", "Show rain, snow, leaves and petals"); tg("quiet", "Quiet mode: no event outfits or party effects");
}
function grownups(b: HTMLElement, redraw: () => void) {
  if (!parentUnlocked()) { E("div", "hb-card", b, "This tab is for parents and guardians. Unlock Parent mode with your PIN on the check-in screen (or tick the grown-up box in The Open Door), then come back."); return; }
  const s = Safety.state();
  const c = E("div", "hb-card", b); E("b", "", c, "Time at school"); E("div", "", c, `Today: ${Safety.minutesToday()} min · Last 7 days: ${Safety.minutesWeek()} min`);
  const r = E("div", "hb-row", c); E("span", "", r, "Daily reminder after"); const lim = E("select", "", r) as HTMLSelectElement; for (const m of [0, 20, 30, 45, 60, 90, 120]) { const o = E("option", "", lim, m ? `${m} min` : "no limit"); o.value = String(m); if (m === s.limitMin) o.selected = true; } lim.onchange = () => { Safety.setLimit(+lim.value); redraw(); };
  const fr = E("div", "hb-card", b); E("b", "", fr, "Friends and chats"); let npc = 0, real: string[] = []; try { const m = JSON.parse(localStorage.getItem("unify.social.v1") || "{}").mem ?? {}; npc = Object.values(m).filter((x: any) => x.fr >= 20).length; const talks = JSON.parse(localStorage.getItem("unify.social.v1") || "{}").profile?.stats?.talks ?? 0; E("div", "", fr, `Buddies at school (20+ friendship): ${npc} · Conversations so far: ${talks}`); } catch { /* none */ }
  try { const chats = JSON.parse(localStorage.getItem("flip.chats") || "{}"); real = Object.keys(chats).filter((k) => k.startsWith("u:")); } catch { /* none */ }
  E("div", "", fr, `Real-person chats on the phone: ${real.length}`); E("small", "", fr, "Real chats follow the grade-band and family rules. Message text is not shown here; open the phone together to read it.");
  const bl = E("div", "hb-card", b); E("b", "", bl, "Blocked handles"); if (!s.blocked.length) E("small", "", bl, "None"); for (const h of s.blocked) { const rr = E("div", "hb-row", bl); E("span", "", rr, "@" + h); E("button", "hb-b sm", rr, "Unblock").onclick = () => { Safety.unblock(h); redraw(); }; }
  const add = E("div", "hb-row", bl); const bi = E("input", "", add) as HTMLInputElement; bi.type = "text"; bi.placeholder = "handle to block"; E("button", "hb-b sm", add, "Block").onclick = () => { if (bi.value.trim()) { Safety.block(bi.value.trim().replace(/^@/, ""), "blocked by parent"); redraw(); } };
  const hs = E("div", "hb-card", b); E("b", "", hs, "Live-class hosts (real people teaching in The Open Door)"); const names = Object.keys(s.hosts); if (!names.length) E("small", "", hs, "None yet. When a class lists a live host, you'll approve them here before kids can join.");
  for (const n of names) { const rr = E("div", "hb-row", hs); E("span", "", rr, `${n}: ${s.hosts[n] === "ok" ? "approved" : "not allowed"}`); E("button", "hb-b sm", rr, s.hosts[n] === "ok" ? "Revoke" : "Approve").onclick = () => { Safety.setHost(n, s.hosts[n] === "ok" ? "no" : "ok"); redraw(); }; }
  E("small", "", b, "Real people teach as an animated avatar. Cameras are turned off for everyone: only voices and avatars are shared.").style.display = "block";
}
