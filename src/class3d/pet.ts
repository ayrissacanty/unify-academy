/** The class pet: a small friend that lives in a play pen in the corner of the classroom.
 *  The student picks a pet and names it once. Feeding it once a day keeps it happy (a missed day or two makes it hungry, never sad forever).
 *  Everything is kept on this device ("unify.pet.v1"). Feeding fires a `unify:petfed` event so other features (rewards) can listen. */
import * as THREE from "three";
import { Quests } from "../game/quests";
import { grantReward, earnedBy } from "../dorm/rewards";

export type PetKind = "rabbit" | "hamster" | "turtle" | "guinea";
export interface PetState { name: string; kind: PetKind; fed: string; streak: number; total: number }
export const PET_KEY = "unify.pet.v1";
export const PET_KINDS: { kind: PetKind; icon: string; label: string }[] = [
  { kind: "rabbit", icon: "🐰", label: "Rabbit" }, { kind: "hamster", icon: "🐹", label: "Hamster" }, { kind: "turtle", icon: "🐢", label: "Turtle" }, { kind: "guinea", icon: "🐹", label: "Guinea pig" },
];
const COLORS: Record<PetKind, { body: string; belly: string; ear: string }> = {
  rabbit: { body: "#F1E6D8", belly: "#FFFFFF", ear: "#F4B6B6" }, hamster: { body: "#E3B070", belly: "#FFF1D6", ear: "#E89A8C" },
  turtle: { body: "#8DBF7A", belly: "#CFE6B8", ear: "#6A9A5A" }, guinea: { body: "#B88454", belly: "#F0D9B5", ear: "#D9A07A" },
};
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + "T12:00:00") - Date.parse(a + "T12:00:00")) / 86400000);

/** pure helpers (tested without a browser) */
export function petMood(s: PetState | null, today = dayKey()): 0 | 1 | 2 | 3 {
  if (!s) return 0; if (!s.fed) return 1; const gap = daysBetween(s.fed, today); return gap <= 0 ? 3 : gap === 1 ? 2 : 1;
}
export function feed(s: PetState, today = dayKey()): { state: PetState; fedNow: boolean } {
  if (s.fed === today) return { state: s, fedNow: false };
  const gap = s.fed ? daysBetween(s.fed, today) : 99;
  return { state: { ...s, fed: today, streak: gap === 1 ? s.streak + 1 : 1, total: s.total + 1 }, fedNow: true };
}
export const cleanName = (n: string) => n.replace(/[^\p{L}\p{N} '-]/gu, "").trim().slice(0, 14) || "Buddy";
export function loadPet(): PetState | null {
  try { const o = JSON.parse(localStorage.getItem(PET_KEY) || "null"); if (!o || !PET_KINDS.some((k) => k.kind === o.kind)) return null; return { name: cleanName(String(o.name || "")), kind: o.kind, fed: typeof o.fed === "string" ? o.fed : "", streak: +o.streak || 0, total: +o.total || 0 }; } catch { return null; }
}
const savePet = (s: PetState) => { try { localStorage.setItem(PET_KEY, JSON.stringify(s)); } catch { /* private mode */ } };

export class ClassPet {
  group = new THREE.Group(); private body = new THREE.Group(); private state: PetState | null = loadPet(); private target = new THREE.Vector3(); private wait = 1; private hop = 0; private t = 0;
  private label: THREE.Sprite | null = null; private chip: HTMLElement; private pen: { x: number; z: number; w: number; d: number; y: number };
  constructor(scene: THREE.Scene, pen: { x: number; z: number; w: number; d: number; y: number }, host: HTMLElement = document.body) {
    this.pen = pen; this.buildPen(); scene.add(this.group); this.chip = this.makeChip(host);
    this.group.position.set(pen.x, pen.y, pen.z); this.group.add(this.body); this.body.position.y = 0.04; this.pickTarget();
    if (this.state) this.buildPet(); this.paint();
  }
  private mat = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85 });
  private buildPen() {
    const { w, d } = this.pen, g = new THREE.Group(), wood = this.mat("#B9854F"), straw = this.mat("#EBD48A");
    const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), straw); floor.position.y = 0.02; floor.receiveShadow = true; g.add(floor);
    for (const [sx, sz, sw, sd] of [[0, -d / 2, w, 0.06], [0, d / 2, w, 0.06], [-w / 2, 0, 0.06, d], [w / 2, 0, 0.06, d]] as const) { const r = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.28, sd), wood); r.position.set(sx, 0.16, sz); r.castShadow = true; g.add(r); }
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.06, 14), this.mat("#E07A66")); bowl.position.set(w / 2 - 0.22, 0.07, -d / 2 + 0.22); g.add(bowl);
    this.group.add(g);
  }
  private ball(r: number, c: string, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.mat(c)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; this.body.add(m); return m; }
  private buildPet() {
    this.body.clear(); if (!this.state) return; const k = this.state.kind, c = COLORS[k];
    if (k === "turtle") { this.ball(0.17, c.body, 0, 0.12, 0, 1.2, 0.7, 1); this.ball(0.17, c.ear, 0, 0.17, 0, 1, 0.8, 0.9); this.ball(0.07, c.body, 0.2, 0.11, 0); for (const sx of [-1, 1]) for (const sz of [-1, 1]) this.ball(0.04, c.body, sx * 0.1, 0.03, sz * 0.09); }
    else {
      this.ball(0.16, c.body, 0, 0.17, 0, 1.15, 0.9, 0.95); this.ball(0.11, c.belly, 0.04, 0.12, 0, 1, 0.8, 0.9); this.ball(0.105, c.body, 0.19, 0.24, 0);
      const ear = (z: number) => { if (k === "rabbit") this.ball(0.04, c.ear, 0.17, 0.44, z, 0.7, 3.2, 0.7); else this.ball(0.04, c.ear, 0.18, 0.34, z, 1, 1, 0.5); }; ear(0.06); ear(-0.06);
      this.ball(0.035, "#2a2a30", 0.27, 0.27, 0.05); this.ball(0.035, "#2a2a30", 0.27, 0.27, -0.05); this.ball(0.03, "#E58B8B", 0.3, 0.23, 0);
      this.ball(k === "rabbit" ? 0.05 : 0.04, "#fff", -0.19, 0.17, 0);
    }
    this.label?.removeFromParent(); const cv = document.createElement("canvas"); cv.width = 256; cv.height = 64; const x = cv.getContext("2d")!; x.font = "700 30px 'Trebuchet MS',sans-serif"; x.textAlign = "center"; x.fillStyle = "rgba(255,255,255,.92)"; x.beginPath(); x.roundRect(8, 6, 240, 50, 22); x.fill(); x.fillStyle = "#3b3552"; x.fillText(this.state.name, 128, 42);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(0.9, 0.225, 1); sp.position.set(0, 0.7, 0); sp.renderOrder = 20; this.body.add(sp); this.label = sp;
  }
  private pickTarget() { const p = this.pen; this.target.set((Math.random() - 0.5) * (p.w - 0.6), 0, (Math.random() - 0.5) * (p.d - 0.6)); }
  tick(dt: number) {
    if (!this.state) return; this.t += dt; const mood = petMood(this.state), off = this.body.position; let walking = false;
    if ((this.wait -= dt) <= 0) {
      const dx = this.target.x - off.x, dz = this.target.z - off.z, dist = Math.hypot(dx, dz), sp = (this.state.kind === "turtle" ? 0.12 : 0.35) * (mood === 1 ? 0.6 : 1);
      if (dist < 0.04) { this.wait = 1.5 + Math.random() * 3; this.pickTarget(); } else { const st = Math.min(dist, sp * dt); off.x += (dx / dist) * st; off.z += (dz / dist) * st; this.body.rotation.y = Math.atan2(-dz, dx); walking = true; }
    }
    this.hop = Math.max(0, this.hop - dt * 1.6);
    off.y = 0.04 + (walking ? Math.abs(Math.sin(this.t * (this.state.kind === "turtle" ? 2 : 7))) * 0.015 : 0) + Math.sin(Math.min(1, this.hop) * Math.PI) * 0.22;
  }
  private paint() {
    const s = this.state, mood = petMood(s), hearts = "♥".repeat(mood) + "♡".repeat(3 - mood), ic = s ? PET_KINDS.find((k) => k.kind === s.kind)!.icon : "🐾";
    this.chip.innerHTML = ""; const mk = (txt: string, fn: () => void, title: string) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.title = title; b.onclick = fn; Object.assign(b.style, { font: "inherit", border: "0", borderRadius: "10px", padding: "4px 9px", background: "#fff", color: "#3b3552", cursor: "pointer" }); return b; };
    if (!s) { this.chip.append(Object.assign(document.createElement("span"), { textContent: "🐾 Class pet" }), mk("Meet our pet", () => this.choose(), "Pick a pet and give it a name")); return; }
    const fedToday = s.fed === dayKey(); this.chip.append(Object.assign(document.createElement("span"), { textContent: `${ic} ${s.name}  ${hearts}`, title: mood === 3 ? "Happy!" : mood === 2 ? "A little peckish" : "Hungry" }), mk(fedToday ? "Fed today ✓" : "Feed", () => this.doFeed(), fedToday ? "Come back tomorrow" : "Give some food"), mk("✎", () => this.choose(), "Rename or change pet"));
    if (s.streak > 1) this.chip.append(Object.assign(document.createElement("span"), { textContent: `🔥${s.streak}`, title: `${s.streak} days in a row` }));
  }
  private doFeed() { if (!this.state) return; const r = feed(this.state); this.state = r.state; savePet(this.state); if (r.fedNow) { this.hop = 1; dispatchEvent(new CustomEvent("unify:petfed", { detail: { name: this.state.name, streak: this.state.streak, total: this.state.total } })); try { Quests.track("pet"); } catch { /* quests are optional */ } for (const id of earnedBy({ petFeeds: this.state.total })) grantReward(id); } this.paint(); }
  private choose() {
    const old = this.state, wrap = document.createElement("div"); Object.assign(wrap.style, { position: "fixed", inset: "0", zIndex: "60", background: "rgba(40,30,60,.45)", display: "grid", placeItems: "center", font: "600 15px 'Trebuchet MS',sans-serif" });
    const card = document.createElement("div"); Object.assign(card.style, { background: "#FFF6EA", color: "#3b3552", borderRadius: "18px", padding: "18px 20px", width: "min(340px,92vw)", boxShadow: "0 10px 30px rgba(0,0,0,.3)" }); wrap.append(card);
    let kind: PetKind = old?.kind ?? "rabbit"; card.innerHTML = `<div style="font-size:18px;margin-bottom:10px">${old ? "Change your class pet" : "Meet your class pet!"}</div>`;
    const row = document.createElement("div"); Object.assign(row.style, { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }); const btns: HTMLButtonElement[] = [];
    for (const k of PET_KINDS) { const b = document.createElement("button"); b.type = "button"; b.textContent = `${k.icon} ${k.label}`; Object.assign(b.style, { font: "inherit", border: "2px solid transparent", borderRadius: "12px", padding: "6px 10px", background: "#fff", cursor: "pointer" }); b.onclick = () => { kind = k.kind; btns.forEach((x, i) => (x.style.borderColor = PET_KINDS[i].kind === kind ? "#E07A66" : "transparent")); }; btns.push(b); row.append(b); }
    btns.forEach((x, i) => (x.style.borderColor = PET_KINDS[i].kind === kind ? "#E07A66" : "transparent")); card.append(row);
    const inp = document.createElement("input"); inp.maxLength = 14; inp.placeholder = "Give it a name"; inp.value = old?.name ?? ""; Object.assign(inp.style, { font: "inherit", width: "100%", boxSizing: "border-box", padding: "8px 10px", borderRadius: "10px", border: "2px solid #E5D5BF", marginBottom: "12px" }); card.append(inp);
    const go = document.createElement("button"), no = document.createElement("button"); go.textContent = "Save"; no.textContent = "Cancel"; for (const b of [go, no]) Object.assign(b.style, { font: "inherit", border: "0", borderRadius: "12px", padding: "8px 14px", marginRight: "8px", cursor: "pointer", background: b === go ? "#E07A66" : "#fff", color: b === go ? "#fff" : "#3b3552" });
    no.onclick = () => wrap.remove(); go.onclick = () => { this.state = { name: cleanName(inp.value), kind, fed: old?.fed ?? "", streak: old?.streak ?? 0, total: old?.total ?? 0 }; savePet(this.state); this.buildPet(); this.paint(); wrap.remove(); };
    card.append(go, no); document.body.append(wrap); inp.focus();
  }
  private makeChip(host: HTMLElement) {
    const c = document.createElement("div"); c.id = "petChip"; Object.assign(c.style, { position: "absolute", zIndex: "30", left: "10px", bottom: "calc(36px + env(safe-area-inset-bottom,0px))", display: "flex", alignItems: "center", gap: "8px", padding: "6px 10px", borderRadius: "14px", background: "rgba(255,246,234,.94)", color: "#3b3552", font: "600 13px 'Trebuchet MS',sans-serif", boxShadow: "0 2px 8px rgba(0,0,0,.18)" }); host.appendChild(c); return c;
  }
}
