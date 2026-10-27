// family.ts — the family account modal: sign-up/sign-in, check-in codes, child profiles,
// parent tools, per-device progress sync. Talks to a backend through the small `Backend` interface
// so the game never touches the network directly.
import { gradesFromState, SUBJECT_NAME } from "../game/grades";
import { parentGrade, setParentGrade, gradeName } from "../game/grade";

export interface User { uid: string; email: string | null; verified: boolean }
export interface Profile { family: string; name: string; role: string; color: string; salt?: string; hash?: string; updated: number }
export interface KidDoc { id: string; name: string; age: number; grade: number; salt: string; hash: string; created: number; color: string; icon: string; login_email?: string | null }
export interface KidSession { family: string; kid: KidDoc }
export interface DataRow { json: string; updated: number }

export interface Backend {
  signUp(email: string, pw: string): Promise<User>;
  signIn(email: string, pw: string): Promise<User>;
  signOut(): Promise<void>;
  reset(email: string): Promise<void>;
  verifyEmail(): Promise<void>;
  onUser(cb: (u: User | null) => void): void;
  profile(uid: string): Promise<Profile | null>;
  saveProfile(uid: string, p: Profile): Promise<void>;
  kids(uid: string): Promise<KidDoc[]>;
  saveKid(uid: string, k: KidDoc): Promise<void>;
  deleteKid(uid: string, kid: string): Promise<void>;
  deleteAccount(uid: string): Promise<void>;
  getData(uid: string, kid: string, key: string): Promise<DataRow | null>;
  putData(uid: string, kid: string, key: string, json: string): Promise<void>;
  classmates?(uid: string, kid: string): Promise<{ id: string; name: string; spec: unknown }[]>;
  getShowcase?(uid: string, kid: string): Promise<{ visible: boolean } | null>;
  setShowcase?(uid: string, kid: string, v: { visible: boolean }): Promise<void>;
  getNet?(uid: string, kid: string): Promise<{ open: boolean; visible: boolean } | null>;
  setNet?(uid: string, kid: string, v: { open?: boolean; visible?: boolean }): Promise<void>;
  createKidLogin?(kid: string, local: string, pw: string): Promise<string>;
  setKidPassword?(kid: string, pw: string): Promise<void>;
  removeKidLogin?(kid: string): Promise<void>;
  signInKid?(addr: string, pw: string): Promise<KidSession>;
  kidLogin?(): Promise<KidSession | null>;
}

/* ---------------- local state ---------------- */
const LS_MODE = "unify.family.local", GUEST_BACKUP = "unify.family.guestBackup";
const SYNC = ["unify.progress.v1", "unify.avatar", "unify.locker", "unify.dorm.room", "unify.stamps", "unify.weekly", "unify.buddy"];
let B: Backend, USER: User | null = null, KIDS: KidDoc[] = [], activeKid: string | null = null;
let root: HTMLElement, panel: HTMLElement, btn: HTMLButtonElement;
let PROFILE: Profile | null = null, PROFILE_LOADED = false, kidLogin = false, kidSigningIn = false;
let syncMsg = "";

const COLORS = ["#E07A66", "#4F91C7", "#1F9A78", "#E8A33D", "#8E7CC3", "#C4553A", "#2E86C1", "#D4536A"];
const ICONS = ["🦊", "🐻", "🐰", "🦁", "🐸", "🐼", "🦄", "🐯", "🦉", "🐳"];
const ROLES = ["Mom", "Dad", "Grandma", "Grandpa", "Guardian"];

const lget = (): { mode?: string; kid?: string; kidName?: string } => { try { return JSON.parse(localStorage.getItem(LS_MODE) || "{}"); } catch { return {}; } };
const lset = (v: Record<string, unknown>) => { try { localStorage.setItem(LS_MODE, JSON.stringify({ ...lget(), ...v })); } catch { /* private */ } };
const readKey = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writeKey = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private */ } };
const anyLocal = () => SYNC.some((k) => readKey(k));
const clearLocal = (exceptKid: string | null) => { void exceptKid; for (const k of SYNC) try { localStorage.removeItem(k); } catch { /* private */ } };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const rnd = (n: number) => { const a = "abcdefghijklmnopqrstuvwxyz0123456789"; let s = ""; const b = crypto.getRandomValues(new Uint8Array(n)); for (let i = 0; i < n; i++) s += a[b[i] % a.length]; return s; };
async function hashPin(salt: string, pin: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`unify.${salt}.${pin}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const bandOf = (grade: number) => (grade <= 2 ? 0 : grade <= 5 ? 1 : grade <= 8 ? 2 : 3);
const gradeOf = (k: KidDoc) => k.grade;
const gradeLabel = (k: KidDoc) => gradeName(gradeOf(k));
const kidColor = (k: KidDoc, i: number) => k.color || COLORS[i % COLORS.length];
const isMainAccount = () => !!USER && !kidLogin;

/* ---------------- tiny DOM helpers ---------------- */
function E(tag: string, cls: string, parent: HTMLElement, text?: string): HTMLElement {
  const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; parent.appendChild(el); return el;
}
function card(title: string) { panel.innerHTML = ""; E("h1", "fm-t", panel, title); }
function bubble(parent: HTMLElement, o: { color: string; icon?: string; name: string }) {
  const b = E("i", "fm-bub", parent, o.icon || o.name.slice(0, 1).toUpperCase()) as HTMLElement;
  b.style.background = o.color; return b;
}
function swatches(parent: HTMLElement, label: string, opts: string[], cur: string, isColor: boolean, cb: (v: string) => void) {
  E("div", "fm-lab", parent, label); const row = E("div", "fm-sw", parent);
  for (const v of opts) {
    const b = E("button", "fm-s" + (v === cur ? " on" : ""), row, isColor ? "" : v);
    if (isColor) (b as HTMLElement).style.background = v;
    b.onclick = () => { row.querySelectorAll(".fm-s").forEach((x) => x.classList.remove("on")); b.classList.add("on"); cb(v); };
  }
}
function gradeSelect(parent: HTMLElement, cur: number): HTMLSelectElement {
  E("div", "fm-lab", parent, "Grade"); const s = E("select", "fm-in", parent) as HTMLSelectElement;
  for (let g = 0; g <= 12; g++) { const o = E("option", "", s, gradeName(g)); o.setAttribute("value", String(g)); }
  s.value = String(cur); return s;
}

/* ---------------- open/close ---------------- */
function open() { root.classList.add("show"); if (!USER) welcome("up"); else if (kidLogin) void kidHome(); else void checkin(); }
function close() { root.classList.remove("show"); }
function paintBtn() {
  const name = lget().kidName;
  btn.textContent = USER ? (kidLogin && name ? `👪 ${name}` : "👪 Family") : parentGrade() == null ? "👪 Set grade" : `👪 Grade ${parentGrade() === 0 ? "K" : parentGrade()}`;
}

/* ---------------- sync: push local progress up, pull cloud progress down ---------------- */
async function pushNow(): Promise<void> {
  if (!B || !USER || !activeKid) return;
  for (const key of SYNC) { const v = readKey(key); if (v) await B.putData(USER.uid, activeKid, key, v); }
}
async function pull(uid: string, kid: string, force: boolean): Promise<boolean> {
  let changed = false;
  for (const key of SYNC) {
    const d = await B.getData(uid, kid, key).catch(() => null);
    if (!d) continue;
    const cur = readKey(key);
    if (force || !cur || cur !== d.json) { writeKey(key, d.json); changed = changed || cur !== d.json; }
  }
  return changed;
}
async function activate(kid: KidDoc | null, importLocal = false): Promise<void> {
  if (!kid) { activeKid = null; lset({ kid: null, kidName: null }); paintBtn(); return; }
  if (importLocal && anyLocal()) await pushNow();
  activeKid = kid.id; lset({ mode: "family", kid: kid.id, kidName: kid.name });
  if (await pull(USER!.uid, kid.id, true)) location.reload();
  paintBtn();
}
async function refreshClassmates(): Promise<void> {
  if (!B?.classmates || !USER || !activeKid) return;
  try { const list = await B.classmates(USER.uid, activeKid); writeKey("unify.classmates", JSON.stringify(list)); } catch { /* offline */ }
}

/* ---------------- the screens ---------------- */
function welcome(tab: "in" | "up" | "kid" = "up") {
  card("UNIFY Academy family account");
  E("p", "", panel, "A parent signs up once. Children get their own profile with a PIN, so kids never need an email address, and their progress follows them to any device.");
  const tabs = E("div", "fm-tab", panel); const t1 = E("button", "fm-b" + (tab === "up" ? " on" : ""), tabs, "Create account"), t2 = E("button", "fm-b" + (tab === "in" ? " on" : ""), tabs, "Sign in"); t1.onclick = () => welcome("up"); t2.onclick = () => welcome("in");
  const t3 = E("button", "fm-b" + (tab === "kid" ? " on" : ""), tabs, "Student sign-in"); t3.onclick = () => welcome("kid");
  if (tab === "kid") {
    E("p", "fm-sm", panel, "For students who are not with a parent: type the academy address and password a parent made for you.");
    E("div", "fm-lab", panel, "Your academy address"); const ke = E("input", "fm-in", panel) as HTMLInputElement; ke.type = "email"; ke.placeholder = "name.xxxx@unify.mail"; ke.autocomplete = "username";
    E("div", "fm-lab", panel, "Password"); const kp = E("input", "fm-in", panel) as HTMLInputElement; kp.type = "password"; kp.autocomplete = "current-password";
    const ker = E("div", "fm-err", panel), kg = E("button", "fm-b pri", panel, "Sign in");
    const kgo = async () => {
      const addr = ke.value.trim().toLowerCase(); if (!addr || !kp.value) { ker.textContent = "Type your academy address and your password."; return; } if (!B.signInKid) { ker.textContent = "Student sign-in isn't available here."; return; }
      ker.textContent = ""; kg.setAttribute("disabled", ""); kidSigningIn = true;
      try { await enterKid(await B.signInKid(addr, kp.value), addr); } catch (e) { kidSigningIn = false; ker.textContent = errText(e); kg.removeAttribute("disabled"); }
    };
    kg.onclick = () => void kgo(); kp.onkeydown = (e) => { if (e.key === "Enter") void kgo(); }; return;
  }
  const em = E("input", "fm-in", panel) as HTMLInputElement; em.type = "email"; em.placeholder = "Parent email"; em.autocomplete = "email"; const pw = E("input", "fm-in", panel) as HTMLInputElement; pw.type = "password"; pw.placeholder = "Password (6+ characters)"; pw.autocomplete = tab === "up" ? "new-password" : "current-password";
  let consent: HTMLInputElement | null = null; if (tab === "up") { const l = E("label", "fm-sm", panel); consent = E("input", "", l) as HTMLInputElement; consent.type = "checkbox"; l.appendChild(document.createTextNode(" I am a parent or guardian (18 or older) and I let my child use UNIFY Academy. We save only the nickname, avatar and progress I enter, under my account. No ads, no tracking, no photos online.")); }
  const err = E("div", "fm-err", panel), go = E("button", "fm-b pri", panel, tab === "up" ? "Create parent account" : "Sign in");
  const run = async (fn: () => Promise<User>) => { err.textContent = ""; go.setAttribute("disabled", ""); try { USER = await fn(); PROFILE_LOADED = false; PROFILE = null; route(); } catch (e) { err.textContent = errText(e); } go.removeAttribute("disabled"); };
  go.onclick = () => { if (tab === "up" && !consent!.checked) { err.textContent = "Please confirm you are a parent or guardian."; return; } if (!em.value.trim() || pw.value.length < 6) { err.textContent = "Enter an email and a password of at least 6 characters."; return; } void run(() => (tab === "up" ? B.signUp(em.value.trim(), pw.value) : B.signIn(em.value.trim(), pw.value))); };
  const row = E("div", "fm-row", panel); if (tab === "in") { const f = E("button", "fm-b", row, "Forgot password"); f.onclick = async () => { if (!em.value.trim()) { err.textContent = "Type your email first."; return; } try { await B.reset(em.value.trim()); err.style.color = "#2f7a4c"; err.textContent = "Check your email for a reset link."; } catch (e) { err.textContent = errText(e); } }; }
  const gu = E("button", "fm-b", row, "Just try it (guest, nothing saved online)"); gu.onclick = () => { if (lget().mode !== "family") lset({ mode: "guest" }); close(); paintBtn(); };
}
function route() { if (!USER) { welcome("up"); return; } void (async () => { try { PROFILE = await B.profile(USER!.uid); } catch { PROFILE = null; } PROFILE_LOADED = true; if (!PROFILE || !PROFILE.hash) parentSetup(false); else profiles(); })(); }

/** parent-only actions ask for the parent PIN first (when the parent set one), once per visit */
function gate(next: () => void) {
  if (unlocked()) { next(); return; }
  card("Parent PIN"); E("p", "fm-sm", panel, "Parents only. Type your parent PIN to continue."); const pin = E("input", "fm-in fm-pin", panel) as HTMLInputElement; pin.type = "password"; pin.inputMode = "numeric"; pin.maxLength = 4; pin.autocomplete = "off"; const err = E("div", "fm-err", panel), row = E("div", "fm-row", panel);
  const go = E("button", "fm-b go", row, "Unlock"), back = E("button", "fm-b", row, "Back"); back.onclick = () => profiles();
  const tryIt = async () => { if (!/^\d{4}$/.test(pin.value) || (await hashPin(PROFILE!.salt!, pin.value)) !== PROFILE!.hash) { err.textContent = "That's not the parent PIN."; pin.value = ""; return; } sessionStorage.setItem("unify.family.unlock", "1"); next(); };
  go.onclick = tryIt; pin.onkeydown = (e) => { if (e.key === "Enter") void tryIt(); }; setTimeout(() => pin.focus(), 50);
}
const unlocked = () => !PROFILE?.hash || sessionStorage.getItem("unify.family.unlock") === "1";

/* ---------------- a child who signs in alone: the sign-in itself is the check-in (no PIN) ---------------- */
function applyKid(s: KidSession, email: string) {
  USER = { uid: s.family, email, verified: true }; kidLogin = true; KIDS = [s.kid]; activeKid = s.kid.id; setRole("kid");
  lset({ mode: "family", kid: s.kid.id, kidName: s.kid.name });
  try { localStorage.setItem("unify.family.link", JSON.stringify({ uid: s.family, kid: s.kid.id, band: s.kid.age, grade: gradeOf(s.kid), kidLogin: true })); setParentGrade(gradeOf(s.kid)); } catch { /* private mode */ }
}
async function enterKid(s: KidSession, email: string): Promise<void> {
  if (lget().mode !== "family" && anyLocal()) { const g: Record<string, string | null> = {}; for (const k of SYNC) g[k] = readKey(k); writeKey(GUEST_BACKUP, JSON.stringify(g)); }   // never lose guest progress
  clearLocal(activeKid); applyKid(s, email); await pull(s.family, s.kid.id, true); location.reload();
}
async function kidSignOut() {
  try { await pushNow(); await B.signOut(); } catch { /* offline */ }
  clearLocal(activeKid); setRole(null); USER = null; activeKid = null; kidLogin = false; try { localStorage.removeItem("unify.family.link"); } catch { /* private mode */ }
  lset({ mode: "guest" }); location.reload();
}
function copyText(t: string, b: HTMLElement) { const done = () => { const o = b.textContent; b.textContent = "Copied"; setTimeout(() => { b.textContent = o; }, 1500); }; if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done(); }
const openMail = () => { try { window.parent.postMessage({ type: "unify:open-app", app: "mail" }, "*"); } catch { /* no parent */ } window.dispatchEvent(new CustomEvent("unify:open-app", { detail: { app: "mail" } })); };

/* ---------------- check-in: shown whenever the app is opened; a child types their code, or the parent types the parent code ---------------- */
const role = () => sessionStorage.getItem("unify.family.ci");
const setRole = (r: string | null) => { if (r) sessionStorage.setItem("unify.family.ci", r); else sessionStorage.removeItem("unify.family.ci"); if (r !== "parent") sessionStorage.removeItem("unify.family.unlock"); };
/** is this code already used by the parent or another child? (codes must be unique so one code means one person) */
async function codeTaken(code: string, exceptKid?: string): Promise<boolean> {
  if (PROFILE?.hash && (await hashPin(PROFILE.salt!, code)) === PROFILE.hash) return true;
  for (const k of KIDS) if (k.id !== exceptKid && (await hashPin(k.salt, code)) === k.hash) return true; return false;
}
const codeBox = (parent: HTMLElement, ph = "Your code") => { const i = E("input", "fm-in fm-pin", parent) as HTMLInputElement; i.type = "password"; i.inputMode = "numeric"; i.maxLength = 4; i.placeholder = ph; i.autocomplete = "off"; return i; };
const bottomBar = (items: [string, () => void][]) => { const b = E("div", "fm-bot", panel); for (const [t, f] of items) { const x = E("button", "fm-b", b, t); x.onclick = f; } };

async function checkin() {
  if (kidLogin) { void kidHome(); return; }
  root.classList.add("show"); card("Check in"); E("p", "fm-sm", panel, "Loading…");
  if (!PROFILE_LOADED) { try { PROFILE = await B.profile(USER!.uid); } catch { PROFILE = null; } PROFILE_LOADED = true; }
  try { KIDS = await B.kids(USER!.uid); } catch { KIDS = []; }
  card(PROFILE?.family ? `${PROFILE.family}: check in` : "Check in"); E("p", "", panel, "Type your code to check in. Children use their own code. Parents use the parent code.");
  const w = E("div", "fm-row", panel); w.style.justifyContent = "center"; KIDS.slice(0, 12).forEach((k, i) => { const b = E("i", "", w, k.icon || k.name.slice(0, 1).toUpperCase()); b.style.cssText = `background:${kidColor(k, i)};width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;color:#fff`; b.title = k.name; });
  const code = codeBox(panel), err = E("div", "fm-err", panel), go = E("button", "fm-b pri", panel, "Check in");
  const run = async () => {
    if (!/^\d{4}$/.test(code.value)) { err.textContent = "Type your 4 numbers."; return; } go.setAttribute("disabled", ""); err.textContent = "";
    const kid = await (async () => { for (const k of KIDS) if ((await hashPin(k.salt, code.value)) === k.hash) return k; return null; })();
    if (kid) { setRole("kid"); err.style.color = "#2f7a4c"; err.textContent = `Welcome, ${kid.name}!`; try { if (activeKid === kid.id) { close(); paintBtn(); } else await activate(kid); } catch (e) { err.style.color = ""; err.textContent = errText(e); go.removeAttribute("disabled"); } return; }
    if (PROFILE?.hash && (await hashPin(PROFILE.salt!, code.value)) === PROFILE.hash) { setRole("parent"); sessionStorage.setItem("unify.family.unlock", "1"); profiles(); return; }
    err.textContent = "That code isn't right. Try again."; code.value = ""; go.removeAttribute("disabled"); };
  go.onclick = () => void run(); code.oninput = () => { if (code.value.length === 4) void run(); }; code.onkeydown = (e) => { if (e.key === "Enter") void run(); }; setTimeout(() => code.focus(), 60);
  if (!PROFILE?.hash) { const pn = E("div", "fm-sm", panel, "No parent code is set yet. "); const pb = E("button", "fm-b", pn, "I'm the parent"); pb.onclick = () => { setRole("parent"); profiles(); }; }
  bottomBar([["Switch account", async () => { setRole(null); sessionStorage.removeItem("unify.family.skipsetup"); PROFILE = null; PROFILE_LOADED = false; await activate(null); await B.signOut(); }], ["Play as guest", () => { lset({ mode: "guest" }); setRole(null); void activate(null); }]]);
}

/** a child's own profile: change nickname, icon and color, change their code, see their own report card */
async function kidHome() {
  const k = KIDS.find((x) => x.id === activeKid) ?? (USER ? (await B.kids(USER.uid).catch(() => [])).find((x: KidDoc) => x.id === activeKid) : null); if (!k) { open(); return; }
  root.classList.add("show"); let color = k.color || COLORS[0], icon = k.icon || ICONS[0]; card(`${k.name}'s profile`);
  const w = E("div", "fm-who", panel); bubble(w, { color, icon: k.icon, name: k.name }); E("div", "fm-sm", w, `${gradeLabel(k)} · ${syncMsg || "Your progress is saved"}`);
  let prog: any = null; try { prog = JSON.parse(readKey("unify.progress.v1") || "null"); } catch { /* none */ }
  const g = gradesFromState(prog), t = E("table", "fm-tb", panel), hd = E("tr", "", t); ["Class", "Lessons", "Grade"].forEach((h) => E("th", "", hd, h)); for (const x of g) { const r = E("tr", "", t); E("td", "", r, SUBJECT_NAME[x.subject]); E("td", "", r, `${x.done} of ${x.total}`); E("td", "", r, x.letter).style.fontWeight = "700"; }
  if (kidLogin) {
    E("div", "fm-lab", panel, "My academy address (it is also my mailbox)"); const ar = E("div", "fm-row", panel), ad = E("b", "", ar, k.login_email || ""); ad.id = "fmAddr";
    const cp = E("button", "fm-b", ar, "Copy"); cp.onclick = () => copyText(k.login_email || "", cp); const mb = E("button", "fm-b go", ar, "Open my mail"); mb.onclick = openMail;
    E("p", "fm-sm", panel, "Ask the main account to change your grade. You can change your nickname, icon, colour and code."); bottomBar([["Close", close], ["Sign out", () => void kidSignOut()]]); return;
  }
  E("div", "fm-lab", panel, "My nickname"); const nm = E("input", "fm-in", panel) as HTMLInputElement; nm.maxLength = 14; nm.value = k.name;
  E("p", "fm-sm", panel, `You are in ${gradeLabel(k)}. Only the main account can change your grade.`);
  swatches(panel, "My icon", ICONS, icon, false, (v) => { icon = v; }); swatches(panel, "My color", COLORS, color, true, (v) => { color = v; });
  const err = E("div", "fm-err", panel), row = E("div", "fm-row", panel), save = E("button", "fm-b pri", row, "Save changes"), cc = E("button", "fm-b", row, "Change my code"), cl = E("button", "fm-b", row, "Close"); cl.onclick = close;
  save.onclick = async () => { const name = nm.value.trim().slice(0, 14); if (!name) { err.textContent = "Type a nickname."; return; } if (KIDS.some((x) => x.id !== k.id && x.name.toLowerCase() === name.toLowerCase())) { err.textContent = "Someone in your family already has that nickname."; return; }
    try { k.name = name; k.color = color; k.icon = icon; await B.saveKid(USER!.uid, k); lset({ ...lget(), kidName: name }); paintBtn(); err.style.color = "#2f7a4c"; err.textContent = "Saved."; } catch (e) { err.style.color = ""; err.textContent = errText(e); } };
  cc.onclick = () => { card("Change my code"); const o = codeBox(panel, "My code now"), n1 = codeBox(panel, "New code"), n2 = codeBox(panel, "New code again"), e2 = E("div", "fm-err", panel), r2 = E("div", "fm-row", panel), ok = E("button", "fm-b pri", r2, "Change it"), bk = E("button", "fm-b", r2, "Back"); bk.onclick = () => void kidHome();
    ok.onclick = async () => { if ((await hashPin(k.salt, o.value)) !== k.hash) { e2.textContent = "That's not your code."; return; } if (!/^\d{4}$/.test(n1.value) || n1.value !== n2.value) { e2.textContent = "The new code is 4 numbers, typed twice the same."; return; } if (await codeTaken(n1.value, k.id)) { e2.textContent = "That code is taken. Pick a different one."; return; }
      try { k.salt = rnd(8); k.hash = await hashPin(k.salt, n1.value); await B.saveKid(USER!.uid, k); void kidHome(); } catch (e) { e2.textContent = errText(e); } }; };
  bottomBar([["Switch account", () => { setRole(null); void checkin(); }]]);
}

/** the parent and family profile: shown right after sign-up, and any time from "My profile" */
function parentSetup(edit: boolean) {
  const cur = PROFILE; let color = cur?.color || COLORS[0], role = cur?.role || "Mom";
  card(edit ? "My family profile" : "Set up your family");
  if (!edit) E("p", "", panel, "Tell us about your family. Only you can see this. Then add each child, as many as you like.");
  E("div", "fm-lab", panel, "Family name"); const fam = E("input", "fm-in", panel) as HTMLInputElement; fam.placeholder = "The Rivera family"; fam.maxLength = 40; fam.value = cur?.family || "";
  E("div", "fm-lab", panel, "Your name"); const nm = E("input", "fm-in", panel) as HTMLInputElement; nm.placeholder = "Your first name"; nm.maxLength = 30; nm.value = cur?.name || "";
  E("div", "fm-lab", panel, "You are the…"); const rs = E("select", "fm-in", panel) as HTMLSelectElement; ROLES.forEach((r) => { const o = E("option", "", rs, r); o.setAttribute("value", r); }); rs.value = role; rs.onchange = () => { role = rs.value; };
  swatches(panel, "Your color", COLORS, color, true, (v) => { color = v; });
  E("div", "fm-lab", panel, cur?.hash ? "Parent code (leave empty to keep it)" : "Parent code, 4 numbers. You type it at check-in to open the family screen.");
  const p1 = E("input", "fm-in fm-pin", panel) as HTMLInputElement, p2 = E("input", "fm-in fm-pin", panel) as HTMLInputElement; for (const [i, ph] of [[p1, "PIN"], [p2, "PIN again"]] as const) { i.type = "password"; i.inputMode = "numeric"; i.maxLength = 4; i.placeholder = ph; i.autocomplete = "off"; i.style.letterSpacing = "6px"; }
  const err = E("div", "fm-err", panel), row = E("div", "fm-row", panel), save = E("button", "fm-b pri", row, edit ? "Save" : "Save and add children");
  save.onclick = async () => {
    if (!fam.value.trim() || !nm.value.trim()) { err.textContent = "Please type your family name and your name."; return; }
    if ((!cur?.hash || p1.value || p2.value) && (!/^\d{4}$/.test(p1.value) || p1.value !== p2.value)) { err.textContent = "The parent code is 4 numbers, typed twice the same."; return; }
    if (p1.value && KIDS.length && await codeTaken(p1.value)) { err.textContent = "A child already uses that code. Pick a different one."; return; }
    save.setAttribute("disabled", "");
    try { const p: Profile = { family: fam.value.trim(), name: nm.value.trim(), role, color, updated: Date.now() };
      if (cur?.hash) { p.salt = cur.salt; p.hash = cur.hash; } if (p1.value) { p.salt = rnd(8); p.hash = await hashPin(p.salt, p1.value); sessionStorage.setItem("unify.family.unlock", "1"); setRole("parent"); }
      await B.saveProfile(USER!.uid, p); PROFILE = p; PROFILE_LOADED = true; paintBtn(); if (edit) profiles(); else if (!KIDS.length) addKid(true); else profiles(); }
    catch (e) { err.textContent = errText(e); save.removeAttribute("disabled"); } };
  const back = E("button", "fm-b", row, edit ? "Back" : "Skip for now"); back.onclick = () => { if (!edit) sessionStorage.setItem("unify.family.skipsetup", "1"); profiles(); };
}

async function profiles() {
  if (kidLogin) { void kidHome(); return; }
  card(PROFILE?.family || `Who's playing?`); const u = USER!;
  if (PROFILE) { const w = E("div", "fm-who", panel); bubble(w, { color: PROFILE.color, name: PROFILE.name }); E("div", "fm-sm", w, `${PROFILE.name} (${PROFILE.role}) · ${u.email ?? "signed in"}`); } else E("div", "fm-sm", panel, u.email ?? "Signed in");
  if (!u.verified && u.email) { const v = E("div", "fm-sm", panel, "Please check your email and verify it. "); const r = E("button", "fm-b", v, "Send again"); r.onclick = async () => { try { await B.verifyEmail(); r.textContent = "Sent"; } catch (e) { r.textContent = errText(e); } }; }
  const list = E("div", "", panel); list.style.cssText = "display:flex;flex-direction:column;gap:8px"; const msg = E("div", "fm-err", panel);
  try { KIDS = await B.kids(u.uid); } catch (e) { msg.textContent = errText(e); KIDS = []; }
  E("h2", "", list, KIDS.length ? `Who's playing? (${KIDS.length} ${KIDS.length === 1 ? "child" : "children"})` : "Add your first child");
  if (!KIDS.length) E("p", "", list, "No children yet. Add as many profiles as you need, one for each child.");
  KIDS.forEach((k, i) => { const r = E("div", "fm-kid", list); bubble(r, { color: kidColor(k, i), icon: k.icon, name: k.name }); const nb = E("div", "", r); nb.style.flex = "1"; E("b", "", nb, k.name); E("div", "fm-sm", nb, gradeLabel(k) + (k.login_email ? " · own sign-in" : "")); const p = E("button", "fm-b go", r, activeKid === k.id ? "Playing" : "Play"); p.onclick = () => (role() === "parent" ? void (async () => { try { setRole("parent"); await activate(k); } catch (e) { msg.textContent = errText(e); } })() : pinPad(k)); const m = E("button", "fm-b", r, "Parent tools"); m.onclick = () => gate(() => void tools(k)); });
  const row = E("div", "fm-row", panel); const add = E("button", "fm-b pri", row, KIDS.length ? "Add another child" : "Add a child"); add.onclick = () => gate(() => addKid());
  if (KIDS.length) { const ov = E("button", "fm-b", row, "Family overview"); ov.onclick = () => gate(() => void overview()); }
  const mp = E("button", "fm-b", row, "My profile"); mp.onclick = () => gate(() => parentSetup(true));
  const cl = E("button", "fm-b", row, "Close"); cl.onclick = close;
  E("div", "fm-sm", panel, "Each child has their own 4-digit code to check in, and you have the parent code. Codes are different for everyone.");
  bottomBar([["Switch account", () => { setRole(null); void checkin(); }]]);
}

/** every child at a glance: lessons done and grade per class */
async function overview() {
  card(`${PROFILE?.family || "Family"} overview`); const body = E("div", "", panel), msg = E("div", "fm-err", panel); const back = E("button", "fm-b", panel, "Back"); back.onclick = () => profiles();
  E("p", "fm-sm", body, "Loading…"); const rows: { k: KidDoc; g: ReturnType<typeof gradesFromState> }[] = [];
  try { for (const k of KIDS) { let prog: any = null; const d = await B.getData(USER!.uid, k.id, "unify.progress.v1"); prog = d ? JSON.parse(d.json) : null; if (activeKid === k.id) { try { prog = JSON.parse(readKey("unify.progress.v1") || "null") ?? prog; } catch { /* keep cloud copy */ } } rows.push({ k, g: gradesFromState(prog) }); } } catch (e) { msg.textContent = errText(e); }
  body.innerHTML = ""; const t = E("table", "fm-tb", body), hd = E("tr", "", t); ["Child", ...Object.values(SUBJECT_NAME).slice(0, 0), "Lessons done", "Best class", "Needs work"].forEach((h) => E("th", "", hd, h));
  for (const { k, g } of rows) { const r = E("tr", "", t); E("td", "", r, `${k.icon ?? ""} ${k.name}`.trim()); const done = g.reduce((a, x) => a + x.done, 0), tot = g.reduce((a, x) => a + x.total, 0); E("td", "", r, `${done} of ${tot}`); const sc = g.filter((x) => x.labPct != null).sort((a, b) => (b.labPct ?? 0) - (a.labPct ?? 0)); E("td", "", r, sc.length ? `${SUBJECT_NAME[sc[0].subject]} (${sc[0].letter})` : "none yet"); E("td", "", r, sc.length > 1 ? SUBJECT_NAME[sc[sc.length - 1].subject] : "none yet"); }
  if (!rows.length) E("p", "fm-sm", body, "No progress saved yet.");
}

function pinPad(k: KidDoc) {
  card(`Hi ${k.name}! Type your PIN`); const pin = E("input", "fm-in fm-pin", panel) as HTMLInputElement; pin.type = "password"; pin.inputMode = "numeric"; pin.maxLength = 4; pin.autocomplete = "off"; const err = E("div", "fm-err", panel); const row = E("div", "fm-row", panel);
  const go = E("button", "fm-b go", row, "Let's go"); const back = E("button", "fm-b", row, "Back"); back.onclick = () => profiles();
  const tryIt = async () => { if (!/^\d{4}$/.test(pin.value)) { err.textContent = "Type your 4 numbers."; return; } if ((await hashPin(k.salt, pin.value)) !== k.hash) { err.textContent = "That's not the right PIN."; pin.value = ""; return; } go.setAttribute("disabled", ""); err.textContent = "Loading your game…"; try { await activate(k); } catch (e) { err.textContent = errText(e); go.removeAttribute("disabled"); } };
  go.onclick = tryIt; pin.onkeydown = (e) => { if (e.key === "Enter") void tryIt(); }; setTimeout(() => pin.focus(), 50);
}

function addKid(first = false) {
  let color = COLORS[KIDS.length % COLORS.length], icon = ICONS[KIDS.length % ICONS.length];
  card(first ? "Add your first child" : "Add a child"); E("p", "fm-sm", panel, "Use a nickname or first name only. No last names, no email.");
  const nm = E("input", "fm-in", panel) as HTMLInputElement; nm.placeholder = "Nickname"; nm.maxLength = 14;
  const ag = gradeSelect(panel, 4);
  swatches(panel, "Pick an icon", ICONS, icon, false, (v) => { icon = v; }); swatches(panel, "Pick a color", COLORS, color, true, (v) => { color = v; });
  const p1 = E("input", "fm-in fm-pin", panel) as HTMLInputElement, p2 = E("input", "fm-in fm-pin", panel) as HTMLInputElement; for (const [i, ph] of [[p1, "Child's code (4 numbers)"], [p2, "Code again"]] as const) { i.type = "password"; i.inputMode = "numeric"; i.maxLength = 4; i.placeholder = ph; i.autocomplete = "off"; i.style.letterSpacing = "6px"; }
  const l = E("label", "fm-sm", panel), imp = E("input", "", l) as HTMLInputElement; imp.type = "checkbox"; l.appendChild(document.createTextNode(" Start from the progress already saved on this device")); imp.disabled = !anyLocal() || KIDS.length > 0; if (imp.disabled) l.style.opacity = ".5";
  const err = E("div", "fm-err", panel), row = E("div", "fm-row", panel), save = E("button", "fm-b pri", row, "Create and play"), more = E("button", "fm-b pri", row, "Save and add another"), back = E("button", "fm-b", row, "Back"); back.onclick = () => profiles();
  const make = async (play: boolean) => {
    const name = nm.value.trim().slice(0, 14); if (!name) { err.textContent = "Type a nickname."; return; } if (KIDS.some((k) => k.name.toLowerCase() === name.toLowerCase())) { err.textContent = "You already have a child with that nickname."; return; } if (!/^\d{4}$/.test(p1.value)) { err.textContent = "The PIN is 4 numbers."; return; } if (p1.value !== p2.value) { err.textContent = "The two PINs don't match."; return; } if (await codeTaken(p1.value)) { err.textContent = "That code is already used in your family. Pick a different one."; return; }
    save.setAttribute("disabled", ""); more.setAttribute("disabled", "");
    try { const salt = rnd(8), kid: KidDoc = { id: "k" + rnd(6), name, age: bandOf(+ag.value), grade: +ag.value, salt, hash: await hashPin(salt, p1.value), created: Date.now(), color, icon }; await B.saveKid(USER!.uid, kid); KIDS.push(kid);
      if (play) { err.textContent = "Created!"; await activate(kid, imp.checked); } else { addKid(); const n = panel.querySelector(".fm-sm"); if (n) { n.textContent = `${name} is added. Add the next child.`; (n as HTMLElement).style.color = "#2f7a4c"; } } }
    catch (e) { err.textContent = errText(e); save.removeAttribute("disabled"); more.removeAttribute("disabled"); } };
  save.onclick = () => void make(true); more.onclick = () => void make(false);
  if (first) { const sk = E("div", "fm-sm", panel, "You can add more children any time from the family screen."); void sk; }
}

/** change a child's nickname, grade, icon and color */
function editKid(k: KidDoc) {
  let color = k.color || COLORS[0], icon = k.icon || ICONS[0];
  card(`Edit ${k.name}`); const nm = E("input", "fm-in", panel) as HTMLInputElement; nm.maxLength = 14; nm.value = k.name;
  const ag = gradeSelect(panel, gradeOf(k));
  swatches(panel, "Icon", ICONS, icon, false, (v) => { icon = v; }); swatches(panel, "Color", COLORS, color, true, (v) => { color = v; });
  const err = E("div", "fm-err", panel), row = E("div", "fm-row", panel), save = E("button", "fm-b pri", row, "Save"), back = E("button", "fm-b", row, "Back"); back.onclick = () => void tools(k);
  save.onclick = async () => { const name = nm.value.trim().slice(0, 14); if (!name) { err.textContent = "Type a nickname."; return; } if (KIDS.some((x) => x.id !== k.id && x.name.toLowerCase() === name.toLowerCase())) { err.textContent = "Another child already has that nickname."; return; }
    try { k.name = name; k.grade = +ag.value; k.age = bandOf(k.grade); k.color = color; k.icon = icon; await B.saveKid(USER!.uid, k); if (activeKid === k.id) { lset({ ...lget(), kidName: name }); setParentGrade(k.grade); } paintBtn(); void tools(k); } catch (e) { err.textContent = errText(e); } };
}

async function tools(k: KidDoc) {
  card(`${k.name}: parent tools`); const body = E("div", "", panel); const msg = E("div", "fm-err", panel); const back = E("button", "fm-b", panel, "Back"); back.onclick = () => profiles();
  let prog: any = null; try { const d = await B.getData(USER!.uid, k.id, "unify.progress.v1"); prog = d ? JSON.parse(d.json) : null; } catch (e) { msg.textContent = errText(e); }
  if (activeKid === k.id) { try { prog = JSON.parse(readKey("unify.progress.v1") || "null") ?? prog; } catch { /* keep cloud copy */ } }
  E("h2", "", body, "Report card"); const g = gradesFromState(prog), t = E("table", "fm-tb", body), hd = E("tr", "", t); ["Class", "Lessons", "Labs", "Grade"].forEach((h) => E("th", "", hd, h));
  for (const x of g) { const r = E("tr", "", t); E("td", "", r, SUBJECT_NAME[x.subject]); E("td", "", r, `${x.done} of ${x.total}`); E("td", "", r, x.labPct == null ? "none yet" : `${Math.round(x.labPct * 100)}%`); E("td", "", r, x.letter).style.fontWeight = "700"; }
  const days = prog?.days ? Object.keys(prog.days).sort() : []; E("p", "fm-sm", body, days.length ? `Last class planned: ${days[days.length - 1]}` : "No classes planned yet.");
  const row = E("div", "fm-row", body);
  const ed = E("button", "fm-b", row, "Edit profile"); ed.onclick = () => editKid(k);
  if (B.getShowcase && B.setShowcase) {                                    // classmates can see this child's locker (on by default)
    let vis = true; try { vis = (await B.getShowcase(USER!.uid, k.id))?.visible ?? true; } catch { /* keep the default */ }
    const label = () => `Classmates can see ${k.name}'s locker: ${vis ? "On" : "Off"}`;
    const sw = E("button", "fm-b", row, label()); sw.title = "Shows the locker's stickers, door colour, note and avatar. Never photos.";
    sw.onclick = async () => { const next = !vis; try { await B.setShowcase!(USER!.uid, k.id, { visible: next }); vis = next; sw.textContent = label(); } catch (e) { msg.textContent = errText(e); } };
  }
  const rp = E("button", "fm-b", row, "Change code"); rp.onclick = () => { const n = prompt("New 4-digit code for " + k.name); if (n && /^\d{4}$/.test(n)) void (async () => { if (await codeTaken(n, k.id)) { msg.style.color = ""; msg.textContent = "That code is already used in your family."; return; } k.salt = rnd(8); k.hash = await hashPin(k.salt, n); await B.saveKid(USER!.uid, k); msg.style.color = "#2f7a4c"; msg.textContent = "Code changed."; })(); else if (n) msg.textContent = "A code is 4 numbers."; };
  const rm = E("button", "fm-b", row, "Delete this profile"); rm.onclick = async () => { if (!confirm(`Delete ${k.name} and all of their saved progress? This cannot be undone.`)) return; try { await B.deleteKid(USER!.uid, k.id); if (activeKid === k.id) { clearLocal(null); lset({ mode: "family" }); activeKid = null; } profiles(); } catch (e) { msg.textContent = errText(e); } };
  const da = E("button", "fm-b", row, "Delete my account and everything"); da.onclick = async () => { if (!confirm("Delete the parent account, every child profile and all saved data? This cannot be undone.")) return; try { await B.deleteAccount(USER!.uid); clearLocal(null); lset({ mode: "guest" }); location.reload(); } catch (e) { msg.textContent = errText(e); } };
  loginSection(body, k, msg); await netSection(body, k, msg);
}

/* ---------------- parent tools: own sign-in, chat switches, live chats ---------------- */
function loginSection(parent: HTMLElement, k: KidDoc, msg: HTMLElement) {
  if (!B.createKidLogin) return; const w = E("div", "", parent); w.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:12px";
  const say = (t: string, good = false) => { msg.style.color = good ? "#2f7a4c" : ""; msg.textContent = t; };
  const pwFields = () => {
    const a = E("input", "fm-in", w) as HTMLInputElement, b = E("input", "fm-in", w) as HTMLInputElement; a.type = b.type = "password"; a.placeholder = "Password (8 or more characters)"; b.placeholder = "Password again"; a.autocomplete = b.autocomplete = "new-password"; a.maxLength = b.maxLength = 72;
    const l = E("label", "fm-sm", w), c = E("input", "", l) as HTMLInputElement; c.type = "checkbox"; l.appendChild(document.createTextNode(" Show the password")); c.onchange = () => { a.type = b.type = c.checked ? "text" : "password"; };
    return () => (a.value.length < 8 || a.value.length > 72 ? (say("The password needs 8 to 72 characters."), null) : a.value !== b.value ? (say("The two passwords don't match."), null) : a.value);
  };
  const show = () => {
    w.innerHTML = ""; E("h2", "", w, "Own sign-in");
    if (!k.login_email) { E("p", "fm-sm", w, `${k.name} can sign in alone on their own device. This is optional.`); E("button", "fm-b", w, `Give ${k.name} their own sign-in`).onclick = create; return; }
    E("b", "", w, k.login_email).id = "fmLoginAddr"; const r = E("div", "fm-row", w), cp = E("button", "fm-b", r, "Copy address"); cp.onclick = () => copyText(k.login_email!, cp);
    E("button", "fm-b", r, "Change password").onclick = change;
    E("button", "fm-b", r, "Remove sign-in").onclick = async () => { if (!confirm(`Remove ${k.name}'s sign-in? ${k.name} will no longer be able to sign in alone, and the academy mailbox is deleted.`)) return; try { await B.removeKidLogin!(k.id); k.login_email = null; say("Sign-in removed.", true); show(); } catch (e) { say(errText(e)); } };
  };
  const create = () => {
    w.innerHTML = ""; E("h2", "", w, `${k.name}'s own sign-in`); E("div", "fm-lab", w, "Name part of the address (optional)"); const lo = E("input", "fm-in", w) as HTMLInputElement; lo.maxLength = 20; lo.value = k.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const get = pwFields(), r = E("div", "fm-row", w), ok = E("button", "fm-b pri", r, "Create sign-in"); E("button", "fm-b", r, "Cancel").onclick = show;
    ok.onclick = async () => { const pw = get(); if (!pw) return; ok.setAttribute("disabled", ""); try { const ad = await B.createKidLogin!(k.id, lo.value.trim(), pw); k.login_email = ad; say(""); done(ad, pw); } catch (e) { say(errText(e)); ok.removeAttribute("disabled"); } };
  };
  const done = (ad: string, pw: string) => {
    w.innerHTML = ""; E("h2", "", w, `${k.name}'s sign-in`); E("b", "", w, ad).id = "fmLoginAddr";
    E("p", "", w, "The password is the one you just chose. Write it down and keep it safe."); const r = E("div", "fm-row", w), c1 = E("button", "fm-b", r, "Copy address"), c2 = E("button", "fm-b", r, "Copy password"); c1.onclick = () => copyText(ad, c1); c2.onclick = () => copyText(pw, c2);
    E("p", "fm-sm", w, `This address is also ${k.name}'s UNIFY mailbox. It only works inside the academy.`); E("button", "fm-b go", w, "Done").onclick = show;
  };
  const change = () => {
    w.innerHTML = ""; E("h2", "", w, `New password for ${k.name}`); const get = pwFields(), r = E("div", "fm-row", w), ok = E("button", "fm-b pri", r, "Change password"); E("button", "fm-b", r, "Cancel").onclick = show;
    ok.onclick = async () => { const pw = get(); if (!pw) return; try { await B.setKidPassword!(k.id, pw); say("Password changed.", true); show(); } catch (e) { say(errText(e)); } };
  };
  show();
}
async function netSection(parent: HTMLElement, k: KidDoc, msg: HTMLElement) {
  const w = E("div", "", parent); w.style.cssText = "display:flex;flex-direction:column;gap:8px;margin-top:12px"; E("h2", "", w, "Chat and visibility");
  if (B.getNet && B.setNet) {
    let st: { open: boolean; visible: boolean } | null = null; try { st = await B.getNet(USER!.uid, k.id); } catch { /* keep disabled */ }
    const mk = (name: string, key: "open" | "visible") => { const b = E("button", "fm-b", w), paint = () => { b.textContent = `${name}: ${st && st[key] ? "On" : "Off"}`; }; paint(); b.disabled = !st;
      b.onclick = async () => { if (!st) return; const next = !st[key]; try { await B.setNet!(USER!.uid, k.id, { [key]: next }); st[key] = next; paint(); } catch (e) { msg.style.color = ""; msg.textContent = errText(e); } }; };
    mk("Chat with other families", "open"); mk("Seen by other students at school", "visible");
    if (!st) E("div", "fm-sm", w, `Available after ${k.name} has opened Messages once`);
    E("div", "fm-sm", w, "Students can chat with students in their own grade or one grade above or below, and only when both families have this on. Everyone else can only send emotes.");
  }
  E("button", "fm-b", w, "Live chats").onclick = () => { window.open("parent.html?live=1", "_blank"); };
}

function localGrade() {
  const g = parentGrade();
  if (!isMainAccount()) {
    card("Your grade");
    E("p", "", panel, g == null ? "The main account has not set your grade yet. You can't choose it yourself." : `You are in ${gradeName(g)}. Only the main account can change it.`);
    const back = E("button", "fm-b", panel, "Close"); back.onclick = () => close(); return;
  }
  card("Set the student's grade");
  E("p", "", panel, "You are the main account, so you can set this. A student on their own profile cannot. Students can share a classroom, and each one only sees the lesson for their grade.");
  const ag = gradeSelect(panel, g ?? 4);
  const row = E("div", "fm-row", panel), go = E("button", "fm-b pri", row, "Save grade"), back = E("button", "fm-b", row, "Close");
  back.onclick = () => close();
  go.onclick = () => { setParentGrade(+ag.value); close(); paintBtn(); };
}

/* ---------------- start ---------------- */
function start() {
  const st = document.createElement("style"); st.textContent = CSS; document.head.appendChild(st);
  root = E("div", "", document.body); root.id = "fam"; panel = E("div", "fm-p", root); root.addEventListener("keydown", (e) => e.stopPropagation()); root.addEventListener("click", (e) => { if (e.target === root && (USER || lget().mode)) close(); });
  const nav = document.querySelector("nav"), phone = document.getElementById("tPhone"); btn = E("button", "") as HTMLButtonElement; btn.id = "tFam"; if (nav && phone) nav.insertBefore(btn, phone.nextSibling); else document.body.appendChild(btn); btn.onclick = () => { if (USER && role() === "kid" && activeKid) void kidHome(); else if (USER && !role()) void checkin(); else open(); };
  activeKid = lget().mode === "family" ? lget().kid ?? null : null; paintBtn();
  if (!(window as any).__SUPABASE && !(window as any).__FAMILY_BACKEND) { btn.textContent = parentGrade() == null ? "👪 Set grade" : `👪 Grade ${parentGrade() === 0 ? "K" : parentGrade()}`; btn.onclick = () => localGrade(); return; }       // no cloud: the account holder still sets the grade on this device
  B = (window as any).__FAMILY_BACKEND ?? supabaseBackend();
  B.onUser(async (u) => {
    if (kidSigningIn) return;
    if (u && /@unify\.mail$/i.test(u.email || "")) {                          // a child's own sign-in: never a parent
      try { const s = B.kidLogin ? await B.kidLogin() : null; if (s) { applyKid(s, u.email!); if (await pull(s.family, s.kid.id, false) && !sessionStorage.getItem("unify.family.reloaded")) { sessionStorage.setItem("unify.family.reloaded", "1"); location.reload(); return; } } else { USER = null; kidLogin = false; } } catch { /* offline: keep playing */ }
      void refreshClassmates(); paintBtn(); return;
    }
    if (kidLogin) { kidLogin = false; KIDS = []; activeKid = null; setRole(null); }
    if ((u?.uid ?? null) !== (USER?.uid ?? null)) { PROFILE = null; PROFILE_LOADED = false; }
    USER = u;
    if (u && activeKid) { try { KIDS = await B.kids(u.uid); if (!KIDS.some((k) => k.id === activeKid)) { clearLocal(null); lset({ mode: "family" }); activeKid = null; } else if (await pull(u.uid, activeKid, false) && !sessionStorage.getItem("unify.family.reloaded")) { sessionStorage.setItem("unify.family.reloaded", "1"); location.reload(); return; } } catch { /* offline: keep playing */ } }
    if (!u && activeKid) activeKid = null;                                  // signed out elsewhere: stop syncing, keep playing locally
    void refreshClassmates();
    paintBtn(); if (u && !role()) { void checkin(); return; } if (!u && lget().mode === "family") { open(); return; } if (!lget().mode) lset({ mode: "guest" });
  });
  setInterval(() => { if (document.visibilityState === "visible" && activeKid) void pushNow(); }, 15000);
  setInterval(() => { if (document.visibilityState === "visible") void refreshClassmates(); }, 60000);
  addEventListener("pagehide", () => { void pushNow(); }); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") void pushNow(); });
  (window as any).__family = { open, pushNow, get kid() { return activeKid; }, get user() { return USER; } };
}
if (document.readyState === "loading") addEventListener("DOMContentLoaded", start); else start();
