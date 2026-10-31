/** Family accounts. A PARENT signs up (email + password); children are profiles under the parent (a nickname, a grade band and a 4-digit PIN).
 *  Children never give an email address. The parent signs in once on a device; kids then pick their profile and type their PIN, and their progress,
 *  avatar, grades and phone data follow them to any device the parent signs in on. Guests can still play with nothing saved online.
 *  Locker PHOTOS never leave the device. The backend is swappable (window.__FAMILY_BACKEND) so the whole flow can be tested without a cloud back end. */
import { gradesFromState } from "../src/hall3d/lockerui";
import { isMainAccount, parentGrade, setParentGrade } from "../src/class3d/gradeband";
import { SUBJECT_NAME } from "../src/game/progress";

interface User { uid: string; email: string | null; verified: boolean }
interface KidDoc { id: string; name: string; age: string; salt: string; hash: string; created: number; color?: string; icon?: string; grade?: number; login_email?: string | null }
/** what a child's own sign-in resolves to: the family it belongs to and the one child row it may see */
interface KidSession { family: string; kid: KidDoc }
/** the parent/family profile, stored on the family document itself */
interface Profile { family: string; name: string; role: string; color: string; salt?: string; hash?: string; updated: number }
interface Backend {
  onUser(cb: (u: User | null) => void): void; signUp(e: string, p: string): Promise<User>; signIn(e: string, p: string): Promise<User>; reset(e: string): Promise<void>; signOut(): Promise<void>; verifyEmail(): Promise<void>;
  profile(uid: string): Promise<Profile | null>; saveProfile(uid: string, p: Profile): Promise<void>;
  kids(uid: string): Promise<KidDoc[]>; saveKid(uid: string, k: KidDoc): Promise<void>; deleteKid(uid: string, id: string): Promise<void>;
  getData(uid: string, kid: string, key: string): Promise<{ json: string; at: number } | null>; setData(uid: string, kid: string, key: string, json: string, at: number): Promise<void>; deleteAccount(uid: string): Promise<void>;
  /** classmate showcases: this child's row (or null), an upsert of any of its fields, and every visible showcase at school */
  getShowcase?(uid: string, kid: string): Promise<{ visible: boolean } | null>; setShowcase?(uid: string, kid: string, row: { name?: string; json?: string; visible?: boolean }): Promise<void>; showcases?(): Promise<{ key: string; name: string; json: string }[]>;
  /** optional: a child's own sign-in (rpc kid_login_*, my_kid_login) and the parent's chat switches on net_users */
  createKidLogin?(kid: string, local: string, password: string): Promise<string>; setKidPassword?(kid: string, password: string): Promise<void>; removeKidLogin?(kid: string): Promise<void>;
  signInKid?(email: string, password: string): Promise<KidSession>; kidLogin?(): Promise<KidSession | null>;
  getNet?(uid: string, kid: string): Promise<{ open: boolean; visible: boolean } | null>; setNet?(uid: string, kid: string, patch: { open?: boolean; visible?: boolean }): Promise<void>;
}
const SYNC = ["unify.social.v1", "unify.progress.v1", "unify.curapp.v1", "unify.locker.v1", "unify.assess.on", "flip.chats", "flip.unread", "flip.reminders", "flip.events", "flip.homework", "unify.opendoor.v1", "unify.dorm.v1", "unify.pet.v1", "unify.quests.v1", "unify.dormrewards.v1"];
const FKEY = "unify.family.v1", GUEST_BACKUP = "unify.guest.backup.v1", STASH = "unify.locker.pics.";
interface Local { mode?: "guest" | "family"; kid?: string; kidName?: string }
const lget = (): Local => { try { return JSON.parse(localStorage.getItem(FKEY) || "{}"); } catch { return {}; } };
const lset = (v: Local) => { try { localStorage.setItem(FKEY, JSON.stringify(v)); } catch { /* private mode */ } };
const sdoc = (k: string) => k.replace(/\./g, "_");

/* ---------------- Supabase backend (supabase-js loads from the CDN only when needed) ---------------- */
function supabaseBackend(): Backend {
  const cl = (): Promise<any> => (window as any).__supa();
  const U = (u: any): User => ({ uid: u.id, email: u.email ?? null, verified: !!u.email_confirmed_at });
  const fail = (e: any): never => { const err: any = new Error(e?.message || "Something went wrong"); err.code = e?.code || e?.error_code || e?.message; throw err; };
  const ok = <T,>(r: { data: T; error: any }): T => { if (r.error) fail(r.error); return r.data; };
  return {
    onUser(cb) { cl().then((c) => { c.auth.onAuthStateChange((_ev: string, s: any) => cb(s?.user && !s.user.is_anonymous ? U(s.user) : null)); }).catch(() => cb(null)); },
    async signUp(e, p) { const c = await cl(); const r = await c.auth.signUp({ email: e, password: p, options: { emailRedirectTo: location.origin + location.pathname } }); if (r.error) fail(r.error); if (!r.data.session) { const err: any = new Error("Check your email to confirm, then sign in."); err.code = "confirm-email"; throw err; } return U(r.data.user); },
    async signIn(e, p) { const c = await cl(); const r = await c.auth.signInWithPassword({ email: e, password: p }); if (r.error) fail(r.error); return U(r.data.user); },
    async reset(e) { const c = await cl(); ok(await c.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname })); },
    async signOut() { const c = await cl(); await c.auth.signOut(); },
    async verifyEmail() { const c = await cl(); const u = (await c.auth.getUser()).data.user; if (u?.email) ok(await c.auth.resend({ type: "signup", email: u.email })); },
    async profile(uid) { const c = await cl(); const r = ok(await c.from("families").select("profile").eq("uid", uid).maybeSingle()) as any; return r?.profile ?? null; },
    async saveProfile(uid, p) { const c = await cl(); ok(await c.from("families").upsert({ uid, profile: p, updated_at: new Date().toISOString() })); },
    async kids(uid) { const c = await cl(); const r = ok(await c.from("kids").select("*").eq("family", uid).order("created")) as any[]; return r.map(({ family: _f, ...k }) => k as KidDoc); },
    async saveKid(uid, k) {
      const c = await cl(); ok(await c.from("families").upsert({ uid })); const { login_email: _l, ...row } = k;      // login_email is set by the server only
      let r = await c.from("kids").upsert({ family: uid, ...row });
      if (r.error && (r.error.code === "42703" || r.error.code === "PGRST204" || /grade/i.test(r.error.message || ""))) { const { grade: _g, ...old } = row; r = await c.from("kids").upsert({ family: uid, ...old }); }   // before the migration: no grade column yet
      ok(r);
    },
    async deleteKid(uid, id) { const c = await cl(); ok(await c.from("kids").delete().eq("family", uid).eq("id", id)); },
    async getData(uid, kid, key) { const c = await cl(); const r = ok(await c.from("kid_data").select("json,at").eq("family", uid).eq("kid", kid).eq("key", key).maybeSingle()) as any; return r ? { json: r.json, at: Number(r.at) } : null; },
    async setData(uid, kid, key, json, at) { const c = await cl(); ok(await c.from("kid_data").upsert({ family: uid, kid, key, json, at })); },
    async getShowcase(uid, kid) { const c = await cl(); const r = ok(await c.from("showcases").select("visible").eq("family", uid).eq("kid", kid).maybeSingle()) as any; return r ? { visible: !!r.visible } : null; },
    async setShowcase(uid, kid, row) { const c = await cl(); ok(await c.from("showcases").upsert({ family: uid, kid, ...row })); },
    async showcases() { const c = await cl(); const r = ok(await c.from("showcases").select("family,kid,name,json").eq("visible", true).neq("json", "")) as any[]; return r.map((x) => ({ key: x.family + "/" + x.kid, name: x.name, json: x.json })); },
    async createKidLogin(kid, local, password) { const c = await cl(); return ok(await c.rpc("kid_login_create", { p_kid: kid, p_local: local, p_password: password })) as string; },
    async setKidPassword(kid, password) { const c = await cl(); ok(await c.rpc("kid_login_password", { p_kid: kid, p_password: password })); },
    async removeKidLogin(kid) { const c = await cl(); ok(await c.rpc("kid_login_remove", { p_kid: kid })); },
    async kidLogin() { const c = await cl(); const r = ok(await c.rpc("my_kid_login")) as any[] | null; const x = r?.[0]; return x ? { family: x.family, kid: { id: x.kid, name: x.name, age: x.age, grade: x.grade ?? undefined, color: x.color ?? undefined, icon: x.icon ?? undefined, login_email: x.email, salt: "", hash: "", created: 0 } } : null; },
    async signInKid(email, password) {
      const c = await cl(); const r = await c.auth.signInWithPassword({ email, password }); if (r.error) fail(r.error);
      const s = await (this as Backend).kidLogin!(); if (!s) { await c.auth.signOut(); const err: any = new Error("not a student"); err.code = "not-kid"; throw err; } return s;
    },
    async getNet(uid, kid) { const c = await cl(); const r = ok(await c.from("net_users").select("open,visible").eq("id", `${uid}_${kid}`).maybeSingle()) as any; return r ? { open: !!r.open, visible: r.visible !== false } : null; },
    async setNet(uid, kid, patch) { const c = await cl(); ok(await c.from("net_users").update(patch).eq("id", `${uid}_${kid}`)); },
    /** removes the family, children and any people-network profiles. (The sign-in itself can be removed by the owner in the Supabase dashboard.) */
    async deleteAccount(uid) { const c = await cl(); ok(await c.from("net_users").delete().eq("owner", uid)); ok(await c.from("phone_state").delete().eq("uid", uid)); ok(await c.from("families").delete().eq("uid", uid)); await c.auth.signOut(); },
  };
}

/* ---------------- state helpers ---------------- */
const readKey = (k: string): string | null => { try { return localStorage.getItem(k); } catch { return null; } };
const writeKey = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* full */ } };
/** what goes to the cloud: the synced keys, with locker PHOTOS removed */
function snapshot(): Record<string, string> { const o: Record<string, string> = {}; for (const k of SYNC) { let v = readKey(k); if (v == null) continue; if (k === "unify.locker.v1") { try { const j = JSON.parse(v); for (const id of Object.keys(j.d || {})) j.d[id].pics = []; v = JSON.stringify(j); } catch { continue; } } o[k] = v; } return o; }
const anyLocal = () => SYNC.some((k) => readKey(k) != null);
function clearLocal(kid: string | null) { if (kid) { const l = readKey("unify.locker.v1"); if (l) writeKey(STASH + kid, l); } for (const k of SYNC) writeKey(k, null); }
/** put a kid's saved locker photos back when the same locker is loaded on this device again */
function restoreStash(kid: string) { const s = readKey(STASH + kid), cur = readKey("unify.locker.v1"); if (!s || !cur) return; try { const a = JSON.parse(s), b = JSON.parse(cur); if (a.mine === b.mine && b.mine != null) { const id = String(b.mine); if (a.d?.[id] && b.d?.[id] && !(b.d[id].pics || []).length) b.d[id].pics = a.d[id].pics || []; writeKey("unify.locker.v1", JSON.stringify(b)); } } catch { /* ignore */ } }
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");
const rnd = (n = 8) => hex(crypto.getRandomValues(new Uint8Array(n)).buffer);
const hashPin = async (salt: string, pin: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin)));

/* ---------------- UI ---------------- */
const CSS = `
#fam{position:fixed;inset:0;z-index:120;display:none;align-items:center;justify-content:center;background:rgba(40,30,30,.55);font-family:var(--ui,"Fredoka","Trebuchet MS",system-ui,sans-serif);color:var(--ink,#4A3B3F)}#fam.show{display:flex}
.fm-p{width:min(520px,94vw);max-height:92vh;overflow:auto;background:var(--kraft,#F3E7CF);border:1px solid rgba(255,255,255,.75);border-radius:16px;box-shadow:0 3px 0 var(--edge,#C9B28A),0 14px 34px rgba(60,40,30,.45);padding:16px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
.fm-p h2{font-size:21px;margin:0;font-weight:600}.fm-p p{margin:0;font-size:14px;line-height:1.4}.fm-sm{font-size:12px;color:var(--soft,#8A7A70)}
.fm-b{font:inherit;font-size:15px;padding:8px 14px;border-radius:11px;border:1px solid rgba(255,255,255,.8);background:#FFF9F0;color:inherit;cursor:pointer;box-shadow:0 2px 0 var(--edge,#C9B28A);min-height:40px}.fm-b.pri{background:var(--acc,#E07A66);color:#fff;box-shadow:0 2px 0 #b95a48}.fm-b.go{background:#4E8A64;color:#fff;box-shadow:0 2px 0 #35674a}.fm-b:disabled{opacity:.55}.fm-b:active{transform:translateY(2px);box-shadow:none}
.fm-in{font:inherit;font-size:16px;padding:9px 11px;border-radius:10px;border:1px solid var(--edge,#C9B28A);background:#fff;width:100%;box-sizing:border-box}
.fm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.fm-err{color:#a8322a;font-size:14px;min-height:18px}
.fm-kid{display:flex;align-items:center;gap:12px;background:#FFF9F0;border-radius:12px;padding:10px 12px;border:1px solid rgba(74,59,63,.15)}.fm-kid i{width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:600;font-size:20px;color:#fff}.fm-kid b{flex:1;font-size:17px}
.fm-pin{letter-spacing:12px;text-align:center;font-size:28px}.fm-tab{display:flex;gap:6px}.fm-tab .fm-b.on{background:var(--acc,#E07A66);color:#fff}
.fm-sw{display:flex;gap:7px;flex-wrap:wrap}.fm-sw button{width:34px;height:34px;border-radius:50%;border:3px solid transparent;cursor:pointer;font-size:18px;padding:0;background:#fff}.fm-sw button.on{border-color:var(--ink,#4A3B3F)}.fm-bot{margin-top:6px;padding-top:10px;border-top:1px solid rgba(74,59,63,.2);display:flex;gap:8px;flex-wrap:wrap;justify-content:center}.fm-lab{font-size:12px;color:var(--soft,#8A7A70);margin-bottom:-4px}.fm-who{display:flex;align-items:center;gap:10px}.fm-who i{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-style:normal;font-weight:600;color:#fff}
.fm-tb{width:100%;border-collapse:collapse}.fm-tb td,.fm-tb th{padding:5px 6px;text-align:left;border-bottom:1px solid rgba(74,59,63,.15);font-size:14px}
`;
const E = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", parent?: HTMLElement, text = "") => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; parent?.appendChild(e); return e; };
const COLORS = ["#E07A66", "#4F91C7", "#5E9C72", "#B8A8DA", "#EAB94E", "#C98569"];
const errText = (e: any): string => { const c = e?.code || e?.message || String(e); return ({
  "confirm-email": "Almost there! Check your email and tap the confirm link, then come back and sign in.", invalid_credentials: "Wrong email or password.", user_already_exists: "There's already an account with that email. Try signing in.", email_exists: "There's already an account with that email. Try signing in.", weak_password: "Use a longer password (at least 6 characters).", email_not_confirmed: "Please confirm your email first (check your inbox), then sign in.", over_email_send_rate_limit: "Too many emails were sent just now. Please wait a few minutes and try again.", over_request_rate_limit: "Too many tries. Please wait a moment.", validation_failed: "That doesn't look right. Please check your email and password.", provider_disabled: "Google sign-in isn't switched on yet. (Owner: Supabase dashboard, Authentication, Providers, Google.)", signup_disabled: "Sign-ups are switched off right now.",
  "auth/operation-not-allowed": "That sign-in method isn't switched on yet. (Owner: Supabase dashboard, Authentication, Providers.)", "auth/email-already-in-use": "There's already an account with that email. Try signing in.", "auth/invalid-email": "That email doesn't look right.", "auth/weak-password": "Use a password with at least 6 characters.",
  "auth/invalid-credential": "Wrong email or password.", "auth/wrong-password": "Wrong email or password.", "auth/user-not-found": "No account with that email.", "auth/too-many-requests": "Too many tries. Wait a minute and try again.", "auth/unauthorized-domain": "This web address isn't authorized for sign-in yet. (Owner: add it under Authentication, Settings, Authorized domains.)",
  "auth/popup-closed-by-user": "The Google window was closed.", "auth/network-request-failed": "No internet connection.", "permission-denied": "The cloud refused that. (Owner: check the Supabase row-level security policies.)", "auth/requires-recent-login": "For safety, sign out, sign in again, and then try once more.",
  "not-kid": "That isn't a student sign-in. Parents sign in on the other tab." } as Record<string, string>)[c] ?? ({ "Parents only.": "Parents only.", "This child already has a sign-in.": "This child already has a sign-in.", "The password needs 8 to 72 characters.": "The password needs 8 to 72 characters.", "That child is not in your family.": "That child is not in your family.", "Academy addresses are created by a parent from the family screen.": "Academy addresses are created by a parent from the family screen." } as Record<string, string>)[e?.message] ?? (e?.message && /^(P\d|\d{5}$|PGRST)/.test(String(c)) ? e.message : `Something went wrong (${c}).`); };

let B: Backend, USER: User | null = null, KIDS: KidDoc[] = [], root: HTMLElement, panel: HTMLElement, btn: HTMLButtonElement;
let PROFILE: Profile | null = null, PROFILE_LOADED = false, kidLogin = false, kidSigningIn = false;
let activeKid: string | null = null, lastPushed: Record<string, string> = {}, pushing = false, syncMsg = "";

/** the classmate showcase: this child's locker decor, avatar and claimed locker number. Never photos. */
function showcaseJson(): string | null {
  try {
    const soc = JSON.parse(readKey("unify.social.v1") || "{}"), lk = JSON.parse(readKey("unify.locker.v1") || "null");
    const mine = Number.isInteger(lk?.mine) ? lk.mine : null, d = mine != null ? lk?.d?.[String(mine)] : null;
    // the avatar is shared without its closet and favourites (they are private and large); the dorm layout is shared without photos
    let avatar: Record<string, unknown> | null = null; if (soc?.profile?.avatar) { const a: Record<string, unknown> = { ...soc.profile.avatar }; delete a.closet; delete a.favs; avatar = a; }
    let dorm: { items?: unknown[]; photos?: unknown; note?: unknown } | null = null; try { const dj = JSON.parse(readKey("unify.dorm.v1") || "null"); if (dj && typeof dj === "object" && Array.isArray(dj.items)) { dorm = { ...dj }; delete dorm!.photos; } } catch { /* no dorm yet */ }
    const o: Record<string, unknown> = { slot: mine, avatar, stickers: Array.isArray(d?.stickers) ? d.stickers.slice(0, 14) : [], note: typeof d?.note === "string" ? d.note.slice(0, 140) : "", theme: typeof d?.theme === "string" ? d.theme : "", dorm };
    let j = JSON.stringify(o);
    // keep the whole showcase under 20,000 characters: trim the dorm from the end (the student's own additions come last), then drop it
    while (j.length > 20000 && dorm && Array.isArray(dorm.items) && dorm.items.length > 8) { dorm.items = dorm.items.slice(0, Math.max(8, dorm.items.length - 6)); j = JSON.stringify(o); }
    if (j.length > 20000) { o.dorm = null; j = JSON.stringify(o); }
    if (j.length > 20000) { o.stickers = []; o.note = ""; j = JSON.stringify(o); }
    return j;
  } catch { return null; }
}
let lastShowcase = "";
/** publish this child's showcase when it changed (the parent's visible switch is never overwritten here) */
async function publishShowcase(): Promise<void> {
  if (!B.setShowcase || !USER || !activeKid) return;
  const json = showcaseJson(); if (json == null) return;
  const name = lget().kidName || "Student", sig = activeKid + "|" + name + "|" + json;
  if (sig === lastShowcase) return;
  await B.setShowcase(USER.uid, activeKid, { name, json }); lastShowcase = sig;
}
/** fetch the other families' visible showcases and hand them to the hall's locker model */
async function refreshClassmates(): Promise<void> {
  if (!B.showcases) return;
  let rows: { key: string; name: string; json: string }[] = [];
  if (USER) { try { rows = (await B.showcases()).filter((r) => r.key !== USER!.uid + "/" + activeKid); } catch { return; } }
  (window as any).__classmates = rows; window.dispatchEvent(new CustomEvent("unify:classmates", { detail: rows }));
}
async function pushNow(): Promise<void> {
  if (!USER || !activeKid || pushing) return; pushing = true;
  try { const s = snapshot(), at = Date.now(); for (const k of Object.keys(s)) if (lastPushed[k] !== s[k]) { await B.setData(USER.uid, activeKid, k, s[k], at); lastPushed[k] = s[k]; } await publishShowcase(); localStorage.setItem("unify.family.at." + activeKid, String(at)); syncMsg = "Saved " + new Date(at).toLocaleTimeString(); }
  catch (e) { syncMsg = "Couldn't save: " + errText(e); } pushing = false; paintBtn();
}
/** copy a kid's cloud data over this device's data. force = take everything; otherwise only documents newer than the last time this device synced */
async function pull(uid: string, kid: string, force: boolean): Promise<boolean> {
  const seen = force ? 0 : Number(readKey("unify.family.at." + kid) || 0); let changed = false, newest = seen;
  for (const k of SYNC) { const d = await B.getData(uid, kid, k); if (d && d.at > seen) { if (readKey(k) !== d.json) changed = true; writeKey(k, d.json); newest = Math.max(newest, d.at); } }
  if (newest > seen) writeKey("unify.family.at." + kid, String(newest)); restoreStash(kid); return changed;
}
const paintBtn = () => {
  if (!(window as any).__SUPABASE && !(window as any).__FAMILY_BACKEND && !USER) {
    const g = parentGrade();
    btn.textContent = !isMainAccount() ? (g == null ? "👪 Grade" : `👪 Grade ${g === 0 ? "K" : g}`) : (g == null ? "👪 Set grade" : `👪 Grade ${g === 0 ? "K" : g}`);
    btn.title = isMainAccount() ? "You are the main account. You set the grade." : "Only the main account can change the grade.";
    return;
  }
  btn.textContent = activeKid ? `👪 ${lget().kidName ?? "Family"}` : USER ? "👪 Who's playing?" : "👪 Sign in"; btn.title = activeKid ? syncMsg || "Family account" : "Family accounts: save your progress and use it on any device";
};

/** switch the device to a kid (or to guest): save the current one, swap the local data, then reload so every part of the game re-reads it */
async function activate(kid: KidDoc | null, importLocal = false): Promise<void> {
  try { const kd = kid ?? null; if (kd && USER) { localStorage.setItem("unify.family.link", JSON.stringify({ uid: USER.uid, kid: kd.id, band: (kd as any).age ?? (kd as any).band ?? "hs", grade: gradeOf(kd) })); setParentGrade(gradeOf(kd)); } else localStorage.removeItem("unify.family.link"); } catch { /* private mode */ }
  if (USER && activeKid) await pushNow();
  const before = lget();
  if (kid && USER) {
    if (before.mode !== "family" && anyLocal()) { const g: Record<string, string | null> = {}; for (const k of SYNC) g[k] = readKey(k); writeKey(GUEST_BACKUP, JSON.stringify(g)); }   // never lose guest progress
    const carry: Record<string, string | null> = {}; if (importLocal) for (const k of SYNC) carry[k] = readKey(k);
    clearLocal(activeKid);
    if (importLocal) { for (const k of SYNC) if (carry[k] != null) writeKey(k, carry[k]); } else await pull(USER.uid, kid.id, true);
    lset({ mode: "family", kid: kid.id, kidName: kid.name });
  } else { clearLocal(activeKid); try { const g = JSON.parse(readKey(GUEST_BACKUP) || "{}"); for (const k of SYNC) if (g[k] != null) writeKey(k, g[k]); } catch { /* ignore */ } lset({ mode: "guest" }); }
  location.reload();
}

function open() { root.classList.add("show"); route(); }
function close() { root.classList.remove("show"); }
const card = (title: string) => { panel.innerHTML = ""; E("h2", "", panel, title); };

async function route() {
  if (kidLogin) { void kidHome(); return; }
  if (!USER) { welcome(); return; }
  if (!PROFILE_LOADED) { card("One moment…"); try { PROFILE = await B.profile(USER.uid); } catch { PROFILE = null; } PROFILE_LOADED = true; }
  if (!PROFILE && !sessionStorage.getItem("unify.family.skipsetup")) parentSetup(false); else if (!role()) void checkin(); else profiles();
}
const ICONS = ["🦊", "🐼", "🦄", "🐯", "🐸", "🦉", "🐙", "🚀", "⚽", "🎨", "🎸", "🌟"];
const AGE_NAME: Record<string, string> = { k2: "Grades K-2", g35: "Grades 3-5", g68: "Grades 6-8", hs: "High school" };
const gradeName = (g: number) => (g === 0 ? "Kindergarten" : "Grade " + g);
const bandOf = (g: number) => (g <= 2 ? "k2" : g <= 5 ? "g35" : g <= 8 ? "g68" : "hs");
const gradeOf = (k: { grade?: number | null; age: string }) => (typeof k.grade === "number" ? k.grade : ({ k2: 1, g35: 4, g68: 7, hs: 10 } as Record<string, number>)[k.age] ?? 4);
const gradeLabel = (k: KidDoc) => (typeof k.grade === "number" ? gradeName(k.grade) : AGE_NAME[k.age] ?? "");
function gradeSelect(parent: HTMLElement, cur: number) { const s = E("select", "fm-in", parent) as HTMLSelectElement; s.setAttribute("aria-label", "Grade"); for (let g = 0; g <= 12; g++) { const o = E("option", "", s, gradeName(g)); o.setAttribute("value", String(g)); } s.value = String(cur); return s; }
const ROLES = ["Mom", "Dad", "Guardian", "Grandparent", "Other"];
const bubble = (parent: HTMLElement, o: { color: string; icon?: string; name: string }) => { const i = E("i", "", parent, o.icon || o.name.slice(0, 1).toUpperCase()); i.style.background = o.color; return i; };
const kidColor = (k: KidDoc, i: number) => k.color || COLORS[i % COLORS.length];
/** pick one swatch from a list (colors or icons) */
function swatches(parent: HTMLElement, label: string, items: string[], cur: string, isColor: boolean, set: (v: string) => void) {
  E("div", "fm-lab", parent, label); const w = E("div", "fm-sw", parent);
  items.forEach((v) => { const b = E("button", v === cur ? "on" : "", w, isColor ? "" : v); b.type = "button"; if (isColor) b.style.background = v; b.setAttribute("aria-label", v); b.onclick = () => { set(v); w.querySelectorAll("button").forEach((x) => x.classList.remove("on")); b.classList.add("on"); }; });
}
const unlocked = () => !PROFILE?.hash || sessionStorage.getItem("unify.family.unlock") === "1";
/** parent-only actions ask for the parent PIN first (when the parent set one), once per visit */
function gate(next: () => void) {
  if (unlocked()) { next(); return; }
  card("Parent PIN"); E("p", "fm-sm", panel, "Parents only. Type your parent PIN to continue."); const pin = E("input", "fm-in fm-pin", panel) as HTMLInputElement; pin.type = "password"; pin.inputMode = "numeric"; pin.maxLength = 4; pin.autocomplete = "off"; const err = E("div", "fm-err", panel), row = E("div", "fm-row", panel);
  const go = E("button", "fm-b go", row, "Unlock"), back = E("button", "fm-b", row, "Back"); back.onclick = () => profiles();
  const tryIt = async () => { if (!/^\d{4}$/.test(pin.value) || (await hashPin(PROFILE!.salt!, pin.value)) !== PROFILE!.hash) { err.textContent = "That's not the parent PIN."; pin.value = ""; return; } sessionStorage.setItem("unify.family.unlock", "1"); next(); };
  go.onclick = tryIt; pin.onkeydown = (e) => { if (e.key === "Enter") void tryIt(); }; setTimeout(() => pin.focus(), 50);
}

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
