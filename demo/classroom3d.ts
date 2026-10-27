import { buddySay, BUDDY_NAME } from "../src/game/buddy";
import { stampFor, stampBar, saveLessonCounts } from "../src/game/stamps";
import { Classroom3D, type CamMode } from "../src/class3d/Classroom3D";
import { Director } from "../src/class3d/director";
import { ALL_LESSONS, CURRICULUM, type LessonDef } from "../src/class3d/curriculum";
import { bandLessons, gradeLesson, gradesLabel, parentGrade, studentBand } from "../src/class3d/gradeband";
import { Progress, SUBJECT_NAME } from "../src/game/progress";
import { openTimes } from "../src/game/timesui";
import { Placement, runPlacement } from "../src/game/placement";
import { BAND_LABEL } from "../src/class3d/catchup";
import { ClassroomLife } from "../src/game/classroom";
import { ChatPanel, Journal } from "../src/hall3d/chatui";
import { AvatarCreator } from "../src/hall3d/avatarui";
import { Social } from "../src/hall3d/social";
import { toLook } from "../src/hall3d/avatar";
import { TEACHER_BY_SUBJECT } from "../src/hall3d/roster";
import { Packs } from "../src/class3d/packs";
import { openTextbook, openElectives, openPacks } from "../src/class3d/curriculumui";
import { openPic } from "../src/game/wallart";
import { openLab as openLabUI } from "../src/class3d/labs";
import { voice } from "../src/class3d/voice";
import { STAFF, ROSTER } from "../src/hall3d/roster";
import type { Subject } from "../src/game/types";

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const SUBJECTS: Subject[] = ["math", "ela", "science", "history", "careers", "life"];
const room = new Classroom3D($("game")); (window as any).__room = room;
const chat = new ChatPanel(document.body), journal = new Journal(document.body), creator = new AvatarCreator(document.body);
let curRef = "";
let lesson: LessonDef = CURRICULUM.math[0], subject: Subject = "math", lastAtt: number[] = [], startTok = 0;

/* ---- paper grain overlay (same as the hallway) ---- */
(() => { const c = document.createElement("canvas"); c.width = c.height = 256; const x = c.getContext("2d")!, d = x.createImageData(256, 256);
  for (let i = 0; i < d.data.length; i += 4) { const v = 226 + Math.random() * 29; d.data[i] = v; d.data[i + 1] = v * 0.965; d.data[i + 2] = v * 0.9; d.data[i + 3] = 255; }
  x.putImageData(d, 0, 0); $("paper").style.backgroundImage = `url(${c.toDataURL()})`; })();

/* ---- teacher questions, hand raising and memory (shared with the Phaser auditorium) ---- */
const life = new ClassroomLife({
  seated: () => room.seatedDefs(), setHand: (id, up) => room.setHand(id, up), playerHand: (up) => room.setPlayerHand(up),
  playerSeated: () => true, playerLook: () => ({ ...toLook(Social.profile.avatar, 11), tag: false }),
  onSpeech: (sp, text) => { const d = [...STAFF, ...ROSTER].find((x) => x.name === sp.name); return d ? voice.speak(d, text) : Promise.resolve(); },
  react: (k) => room.react(k as any),
}, document.body); life.auto = false; (window as any).__life = life;
life.onState = (st) => { $("bHand").classList.toggle("on", st.handUp); $("bHand").textContent = st.handUp ? "Hand up" : "Raise hand (H)"; };
$("bHand").onclick = () => life.raiseHand();
/* ---- study buddy: hints, never answers (nudge, then strategy, then ask for help, then teach-it-back prompts) ---- */
let buddyPress = 0; const bBuddy = document.createElement("button"); bBuddy.id = "bBuddy"; bBuddy.type = "button"; bBuddy.className = $("bHand").className; bBuddy.textContent = "💡 Need a hint?"; bBuddy.title = `${BUDDY_NAME} gives hints, not answers`; $("bHand").after(bBuddy);
bBuddy.onclick = () => { ui.caption(BUDDY_NAME, buddySay(subject, lesson.title, buddyPress++), 14000); };
const bV = $("bVoice"); const paintV = () => { bV.textContent = voice.enabled ? "🔊 Voice on" : "🔇 Voice off"; bV.classList.toggle("on", voice.enabled); }; bV.onclick = () => { voice.enabled = !voice.enabled; paintV(); }; if (!voice.available) bV.style.display = "none"; paintV();

/* ---- captions + steps ---- */
let capT = 0;
const cap = $("cap");
const ui = {
  caption(who: string, text: string, ms: number) { cap.innerHTML = ""; const b = document.createElement("b"); b.textContent = who + ":"; cap.append(b, document.createTextNode(" " + text)); cap.classList.add("show"); clearTimeout(capT); capT = window.setTimeout(() => cap.classList.remove("show"), ms + 400); },
  clearCaption() { clearTimeout(capT); cap.classList.remove("show"); },
  step(label: string, i: number, n: number) { $("steps").textContent = `Step ${i} of ${n}: ${label}`; },
  labReady(_l: LessonDef["lab"]) { $("bLab").classList.add("on"); $("moreDot").classList.add("on"); },
  async ask(kind: "teacher" | "npc") { await life.askNow(kind); },
  speak(def: any, text: string) { return voice.speak(def, text); },
  done(l: LessonDef) {
    if (l.elective) { Progress.completeExtra(l.subject as Subject, l.id); this.caption("Class", `Elective lesson done: ${l.title}. Open More, then Textbook, to read more, or Electives to pick another.`, 10000); return; }
    if (l.extra) { Progress.completeExtra(l.subject as Subject, l.id); paintExtra(); const pl = Placement.plan(l.subject as Subject); this.caption("Class", pl?.next ? `Extra lesson done! Next extra lesson: ${pl.next.title}. Your regular class is still waiting.` : "Extra lessons done: you are caught up with your class!", 10000); return; }
    const list = bandLessons(CURRICULUM[l.subject]);
    const next = Progress.complete(l.subject, l.id, list.length); const stamp = stampFor(SUBJECT_NAME[l.subject as Subject], Progress.doneCount(l.subject as Subject), list.length); room.refreshBoard(); const b = $("bNext"); b.hidden = false; b.textContent = `Next lesson: ${list[next].title}`; $("moreDot").classList.add("on"); this.caption("Class", `${stamp.text} ${stampBar(stamp.n, stamp.of)} Lesson complete! The next lesson is open: ${list[next].title}. Open More and choose Next lesson to get ahead.`, 12000);
  },
  book(ref: string) { curRef = ref; $("bBook").classList.add("on"); $("moreDot").classList.add("on"); },
  setTitle(t: string) { $("ltitle").textContent = t; },
};
const director = new Director(room, ui); (window as any).__dir = director;

/* ---- the lesson follows the grade a parent set. Same grade shares it. A different grade in this room does not. ---- */
function showGradeLogic(title: string | null) {
  const card = $("gradeCard"), mine = parentGrade(), band = studentBand();
  card.hidden = false;
  const who = $("gradeWho"); who.innerHTML = "";
  if (mine == null || !title) {
    $("gradeHead").textContent = "No grade yet";
    $("gradeLine").textContent = "Only the main account can set a grade. Until then this room has no lesson. A classmate with a grade still sees theirs.";
    return;
  }
  const label = mine === 0 ? "K" : String(mine);
  $("gradeHead").textContent = `Grade ${label} sees this lesson`;
  $("gradeLine").textContent = `${title}. Same grade in this room sees it too. A different grade sits here, but their lesson stays hidden.`;
  const seen = new Map<string, number>();
  for (const d of room.seatedDefs()) {
    const same = gradesLabel(d.grade) === band;
    const key = d.grade + (same ? "s" : "o");
    if ((seen.get(key) ?? 0) >= 2) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
    const li = document.createElement("li");
    li.className = same ? "same" : "other";
    li.textContent = same ? `${d.name} · grade ${d.grade} · sees this lesson` : `${d.name} · grade ${d.grade} · own lesson, hidden`;
    who.appendChild(li);
  }
}
function needGrade() {
  director.stop(); ui.setTitle("Grade not set"); $("steps").textContent = "";
  $("subj").textContent = "The main account sets the grade";
  showGradeLogic(null);
  ui.caption("Class", "Only the main account can choose the grade. You can still sit here. A classmate in another grade sees their own lesson, not yours.", 20000);
}
async function start(s: Subject, att: number[] = lastAtt) {
  const tok = ++startTok; lastAtt = att; subject = s; const band = studentBand(); const list = band ? bandLessons(CURRICULUM[s], band) : [];
  const today = gradeLesson(list);
  if (!today) { needGrade(); return; }
  if (Progress.assessOn && !Progress.assessment()) { room.inputLocked = true; await runPlacement(); room.inputLocked = false; if (tok !== startTok) return; }
  begin(today, att);
}
/** run one lesson: a regular one, or an extra (catch-up) lesson that sits beside regular classes */
function begin(l: LessonDef, att: number[] = lastAtt) {
  lesson = l; subject = l.subject as Subject; buddyPress = 0; const mine = parentGrade(); $("subj").textContent = (l.elective ? "Elective · " + l.elective : l.extra ? "Extra · " + SUBJECT_NAME[subject] : SUBJECT_NAME[subject]) + (mine != null ? ` · grade ${mine === 0 ? "K" : mine}` : "") + " · only your grade"; curRef = l.bookRef ?? ""; $("bBook").classList.remove("on"); ($("bLab") as HTMLButtonElement).hidden = !l.lab.id;
  room.assign(att); life.stop(); life.lesson = lesson; chat.close(); $("bLab").classList.remove("on"); $("moreDot").classList.remove("on"); ($("bNext") as HTMLButtonElement).hidden = true; room.auto = true; markCam("auto"); room.refreshBoard(subject); paintExtra(); showGradeLogic(l.title);
  void director.run(lesson); void life.start(subject);
}
/** the extra lesson button: shows this student's next catch-up lesson for this class, if their assessment found a gap */
function paintExtra() { const b = $("bExtra") as HTMLButtonElement, pl = Placement.plan(subject); if (!pl || !pl.next) { b.hidden = true; return; } b.hidden = false; b.textContent = `Extra lesson: ${pl.next.title} (${pl.remaining.length} left)`; b.title = `Catch-up for ${BAND_LABEL[pl.level]} to ${BAND_LABEL[pl.expected]}. Your regular class is not affected.`; $("moreDot").classList.add("on"); }
$("bSkip").onclick = () => director.skip();
const menus = [$("camMenu"), $("moreMenu")], toggleMenu = (m: HTMLElement) => { const open = !m.classList.contains("show"); menus.forEach((x) => x.classList.remove("show")); m.classList.toggle("show", open); };
$("bCam").onclick = () => toggleMenu($("camMenu")); $("bMore").onclick = () => toggleMenu($("moreMenu"));
document.addEventListener("pointerdown", (e) => { if (!(e.target as HTMLElement).closest(".menu, #bCam, #bMore")) menus.forEach((x) => x.classList.remove("show")); });
menus.forEach((m) => m.addEventListener("click", (e) => { if ((e.target as HTMLElement).closest("button")) setTimeout(() => m.classList.remove("show"), 0); }));
$("bNext").onclick = () => { void start(subject); };
$("bTimes").onclick = () => { room.inputLocked = true; openTimes({ focus: subject }); };
addEventListener("unify:times-closed", () => { room.inputLocked = false; });
const paintAssess = () => { $("bAssess").textContent = `Ask new students: ${Progress.assessOn ? "on" : "off (demo)"}`; };
$("bAssess").onclick = () => { Progress.assessOn = !Progress.assessOn; paintAssess(); ui.caption("Class", Progress.assessOn ? "New students will be asked to take the assessment before their first class." : "Assessment is off for this demo: classes start right away.", 5000); }; paintAssess();
$("bTake").onclick = async () => { room.inputLocked = true; const r = await runPlacement(); room.inputLocked = false; paintExtra(); if (r) ui.caption("Class", "Your starting points are saved. Extra lessons are in the More menu.", 6000); };
$("bExtra").onclick = () => { const pl = Placement.plan(subject); if (pl?.next) begin(pl.next); };
$("bBook").onclick = () => { room.inputLocked = true; openTextbook($("labHost"), { subject, lesson, ref: curRef || undefined, onClose: () => { room.inputLocked = false; } }); };
$("bElect").onclick = () => { room.inputLocked = true; openElectives($("labHost"), { subject, onPick: (l) => begin(l), onClose: () => { room.inputLocked = false; } }); };
$("bPacks").onclick = () => { room.inputLocked = true; openPacks($("labHost"), { onClose: () => { room.inputLocked = false; } }); };
$("bFriends").onclick = () => journal.toggle(); $("bAvatar").onclick = () => creator.show(); $("bCloset").onclick = () => creator.show("Closet"); creator.onSave = () => room.rebuildPlayer(); Social.onChange(() => { try { room.rebuildPlayer(); } catch { /* not ready */ } });

/* ---- camera buttons ---- */
const camBtns = Array.from(document.querySelectorAll<HTMLElement>("[data-cam]"));
function markCam(k: string) { camBtns.forEach((b) => b.classList.toggle("on", b.dataset.cam === k)); }
camBtns.forEach((b) => b.addEventListener("click", () => { const k = b.dataset.cam!; if (k === "auto") { room.auto = true; room.setMode("follow"); } else room.setMode(k as CamMode, true); markCam(k); }));
addEventListener("keydown", (e) => { if ((e.target as HTMLElement)?.tagName === "INPUT") return; const k = e.key.toLowerCase(); if (k === "n") director.skip(); });

/* ---- people ---- */
room.onTapStudent = (d) => { if (!chat.isOpen) chat.open(d, { place: "class", kind: "class", period: lesson.title, clock: "" }); };
room.onTapTeacher = () => { life.raiseHand(); };
room.onHover = (label, x, y) => { const t = $("tip"); if (!label) { t.style.display = "none"; return; } t.textContent = label; t.style.display = "block"; t.style.left = x + 14 + "px"; t.style.top = y + 14 + "px"; };
const openLab = () => { if ($("labHost").classList.contains("show")) return; room.inputLocked = true; openLabUI($("labHost"), lesson, room.seatedDefs(), () => { room.inputLocked = false; }); };
(window as any).__openLab = openLab;
room.onTapPic = (pid) => { room.inputLocked = true; openPic(pid, { lesson: lesson.title, onClose: () => { room.inputLocked = false; } }); };
room.onTapDemo = openLab; $("bLab").onclick = openLab;

/* ---- shell integration ---- */
let wanted: string | null = params.get("subject"), wantedAtt: number[] = [];
addEventListener("message", (e) => { const d = e.data; if (d && d.type === "unify:lesson" && SUBJECTS.includes(d.subject)) start(d.subject, Array.isArray(d.attendees) ? d.attendees.filter((x: any) => Number.isInteger(x)) : []); else if (d && d.type === "unify:exit") { director.stop(); life.stop(); } });
start(SUBJECTS.includes(wanted as Subject) ? (wanted as Subject) : "math").catch((e) => console.error("lesson start failed", e));
const ready = Packs.loadBundled();
ready.then(() => saveLessonCounts(Object.fromEntries(Object.keys(CURRICULUM).map((k) => [k, CURRICULUM[k as Subject].length])))).catch(() => {});
parent !== window && parent.postMessage({ type: "unify:auditorium-ready" }, "*");
void ALL_LESSONS; void TEACHER_BY_SUBJECT;
import { VIDEO_BY_ID } from "../src/class3d/videos"; (window as any).__vids = VIDEO_BY_ID;
(window as any).__labs = { open: (id: string, cfg?: string) => { const l = ALL_LESSONS.find((x) => x.lab.id === id && (!cfg || x.lab.cfg === cfg))!; openLabUI($("labHost"), l, room.seatedDefs(), () => {}); return l.title; } };
