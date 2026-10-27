/** UNIFY Academy: My Dorm furniture catalogue. Everything is built ONLY through style.mat() and merged per material (few draw calls).
 *  Conventions: origin = centre of the footprint on the floor, +z = the front of the item, y up. Wall items: back at -d/2, bottom at y. */
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { FurnitureCat, FurnitureDef, MatKind, MatOpts, Style } from "./types";

type V3 = [number, number, number];
export interface FurnitureDefX extends FurnitureDef {
  /** default bottom height for wall items */ y0?: number;
  /** earned, not bought: only listed in the picker once unlocked (see rewards.ts) */ reward?: boolean;
  /** may overlap others (backpack on a chair) */ soft?: boolean;
  /** free height below (loft bed): collisions only count above this */ under?: number;
}
export interface MS { k: MatKind; c: string; o?: MatOpts }
export const mk = (k: MatKind, c: string, o?: MatOpts): MS => ({ k, c, o });
const wood = (c: string) => mk("wood", c), fab = (c: string) => mk("fabric", c), pla = (c: string) => mk("plastic", c), pap = (c: string) => mk("paper", c);
const met = (c: string) => mk("metal", c, { metal: 0.5, rough: 0.4 }), lea = (c: string) => mk("leather", c), clo = (c: string) => mk("cloth", c), knit = (c: string) => mk("knit", c);
const emi = (c: string, i = 1.3) => mk("emissive", c, { emissive: c, emissiveIntensity: i });
const gla = (c: string, op = 0.28) => mk("glass", c, { transparent: true, opacity: op, rough: 0.08 });
const paint = (c: string) => mk("metal", c, { metal: 0.15, rough: 0.5 });

/* ------------------------------------------------------------------ colour + canvas helpers */
const _c = new THREE.Color(), _h = { h: 0, s: 0, l: 0 };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
export function shade(c: string, dl: number, ds = 0, dh = 0): string {
  _c.set(c); _c.getHSL(_h, THREE.SRGBColorSpace);
  _c.setHSL((((_h.h + dh) % 1) + 1) % 1, clamp01(_h.s + ds), clamp01(_h.l + dl), THREE.SRGBColorSpace); return "#" + _c.getHexString(THREE.SRGBColorSpace);
}
export const mix = (a: string, b: string, t: number) => { _c.set(a).lerp(new THREE.Color(b), t); return "#" + _c.getHexString(THREE.SRGBColorSpace); };
/** second colour that goes with c (hue shift) */
const acc = (c: string, k = 1) => shade(c, 0, 0.1, 0.5 * k > 1 ? 0.25 : 0.33 * k);
export const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const cvs = (w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
  const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!];
};
export const canvasTex = (c: HTMLCanvasElement) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
export const rrect = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
};
const FONT = "system-ui, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
const mark = (m: THREE.Material) => { m.userData.own = true; return m; };

/* ------------------------------------------------------------------ material cache (shared per style) */
const matCache = new WeakMap<Style, Map<string, THREE.Material>>();
export function getMat(s: Style, m: MS): THREE.Material {
  const o = m.o;
  if (o && (o.map || o.normalMap)) return mark(s.mat(m.k, m.c, o));
  let mp = matCache.get(s); if (!mp) matCache.set(s, (mp = new Map()));
  const key = m.k + "|" + m.c + "|" + (o ? JSON.stringify(o) : "");
  let x = mp.get(key); if (!x) mp.set(key, (x = s.mat(m.k, m.c, o)));
  return x;
}
/** dispose cached materials of a style (call when the dorm is disposed) */
export function releaseMaterials(s: Style) { const mp = matCache.get(s); if (mp) { mp.forEach((m) => m.dispose()); mp.clear(); } if (glowTex) { glowTex.dispose(); glowTex = null; } }
export function disposeTree(o: THREE.Object3D) {
  o.traverse((n) => {
    const m = n as THREE.Mesh; if (m.geometry) m.geometry.dispose();
    const mat = (m as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) for (const x of Array.isArray(mat) ? mat : [mat]) if (x.userData.own) { (x as THREE.MeshStandardMaterial).map?.dispose(); x.dispose(); }
  });
}

/* ------------------------------------------------------------------ geometry builder: collects parts, merges per material */
interface O { r?: V3; s?: V3 }
const tM = new THREE.Matrix4(), tQ = new THREE.Quaternion(), tE = new THREE.Euler(0, 0, 0, "YXZ"), tS = new THREE.Vector3(), tP = new THREE.Vector3();
export class B {
  g = new THREE.Group();
  private parts = new Map<string, { m: MS; geos: THREE.BufferGeometry[] }>();
  constructor(readonly s: Style) {}
  add(geo: THREE.BufferGeometry, m: MS, p: V3, o?: O) {
    tE.set(o?.r?.[0] ?? 0, o?.r?.[1] ?? 0, o?.r?.[2] ?? 0, "YXZ"); tQ.setFromEuler(tE);
    tM.compose(tP.set(p[0], p[1], p[2]), tQ, tS.set(o?.s?.[0] ?? 1, o?.s?.[1] ?? 1, o?.s?.[2] ?? 1)); geo.applyMatrix4(tM);
    const key = m.k + "|" + m.c + "|" + (m.o ? JSON.stringify(m.o) : "");
    let part = this.parts.get(key); if (!part) this.parts.set(key, (part = { m, geos: [] }));
    part.geos.push(geo); return this;
  }
  /** rounded box; (x, y=BOTTOM, z) */
  box(w: number, h: number, d: number, x: number, y: number, z: number, m: MS, rad = 0.015, o?: O) {
    const r = Math.min(rad, w / 2, h / 2, d / 2) * 0.98;
    return this.add(r < 0.003 ? new THREE.BoxGeometry(w, h, d) : new RoundedBoxGeometry(w, h, d, Math.min(w, h, d) < 0.06 ? 1 : 2, r), m, [x, y + h / 2, z], o);
  }
  /** upright cylinder; y = BOTTOM */
  cyl(rt: number, rb: number, h: number, x: number, y: number, z: number, m: MS, o?: O, seg = 18) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), m, [x, y + h / 2, z], o); }
  /** cylinder centred at (x,y,z) lying along an axis */
  cylH(r: number, len: number, x: number, y: number, z: number, m: MS, axis: "x" | "z" = "x", seg = 14) {
    return this.add(new THREE.CylinderGeometry(r, r, len, seg), m, [x, y, z], { r: axis === "x" ? [0, 0, Math.PI / 2] : [Math.PI / 2, 0, 0] });
  }
  sph(r: number, x: number, y: number, z: number, m: MS, o?: O, seg = 14) { return this.add(new THREE.SphereGeometry(r, seg, Math.max(5, seg * 0.7 | 0)), m, [x, y, z], o); }
  /** capsule centred at (x,y,z), along y unless rotated */
  cap(r: number, len: number, x: number, y: number, z: number, m: MS, o?: O) { return this.add(new THREE.CapsuleGeometry(r, len, 3, 8), m, [x, y, z], o); }
  lathe(pts: [number, number][], x: number, y: number, z: number, m: MS, o?: O, seg = 22) { return this.add(new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), seg), m, [x, y, z], o); }
  tor(R: number, r: number, x: number, y: number, z: number, m: MS, o?: O, arc = Math.PI * 2) { return this.add(new THREE.TorusGeometry(R, r, 8, 22, arc), m, [x, y, z], o); }
  cone(r: number, h: number, x: number, y: number, z: number, m: MS, o?: O, seg = 12) { return this.add(new THREE.ConeGeometry(r, h, seg), m, [x, y + h / 2, z], o); }
  /** merge everything collected into the group (one mesh per material) */
  done(cast = true): THREE.Group {
    this.parts.forEach((p) => {
      if (p.geos.some((x) => !x.index) && p.geos.some((x) => x.index)) p.geos = p.geos.map((x) => { if (!x.index) return x; const n = x.toNonIndexed(); x.dispose(); return n; });
      const geo = p.geos.length === 1 ? p.geos[0] : mergeGeometries(p.geos, false);
      if (!geo) { for (const x of p.geos) this.mesh(x, p.m, cast); return; }
      if (p.geos.length > 1) p.geos.forEach((x) => x.dispose());
      this.mesh(geo, p.m, cast);
    });
    this.parts.clear(); return this.g;
  }
  private mesh(geo: THREE.BufferGeometry, m: MS, cast: boolean) {
    geo.computeBoundingSphere(); const me = new THREE.Mesh(geo, getMat(this.s, m)); me.castShadow = cast && m.k !== "glass" && m.k !== "emissive" && geo.boundingSphere!.radius > 0.2; me.receiveShadow = true; this.g.add(me); return me;
  }
}
type UD = Record<string, any>;
const ud = (o: THREE.Object3D) => o.userData as UD;
const place = <T extends THREE.Object3D>(o: T, x: number, y: number, z: number, ry = 0) => { o.position.set(x, y, z); o.rotation.y = ry; return o; };

/* ------------------------------------------------------------------ glow sprites (string lights, neon, lamps) */
let glowTex: THREE.CanvasTexture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const [c, g] = cvs(64, 64); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(0.25, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return (glowTex = canvasTex(c));
}
/** additive glow dots, brighter at night */
function addGlow(g: THREE.Object3D, pts: V3[], color: string, size: number, day = 0.25) {
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3));
  const m = mark(new THREE.PointsMaterial({ map: glowTexture(), color, size, sizeAttenuation: true, transparent: true, opacity: day, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  const p = new THREE.Points(geo, m); p.frustumCulled = false; g.add(p);
  const u = ud(g); (u.glows ||= []).push({ m, day });
  u.setNight = (n: number) => { for (const e of u.glows) e.m.opacity = e.day + (1 - e.day) * n; };
  return p;
}
export const nightFactor = (h: number) => (h >= 5.5 && h <= 19.5 ? 0 : h >= 20.5 || h <= 4.5 ? 1 : h < 5.5 ? 5.5 - h : h - 19.5);

/** a flat label / picture on a plane (transparent background allowed) */
function planeTex(s: Style, w: number, h: number, tex: THREE.Texture, o: MatOpts = {}, kind: MatKind = "paper") {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mark(s.mat(kind, "#ffffff", { map: tex, ...o }))); m.receiveShadow = true; return m;
}
const emissiveTex = (s: Style, w: number, h: number, tex: THREE.Texture, i = 0.9, tr = false) => planeTex(s, w, h, tex, { emissive: 0xffffff, emissiveIntensity: i, transparent: tr }, "screen");

/* ------------------------------------------------------------------ polaroids / photos */
const loadImg = (url: string) => new Promise<HTMLImageElement | null>((res) => {
  const im = new Image(); im.crossOrigin = "anonymous"; im.onload = () => res(im); im.onerror = () => res(null); im.src = url;
});
const PASTEL = ["#FFB3C7", "#B5DEFF", "#FFE29A", "#B9F0D0", "#D6C2FF", "#FFC9A8", "#A8E6E0", "#F7A8A8", "#C9E4A0", "#F9D6F2", "#FFD1A1", "#A9C9FF"];
function drawDoodle(g: CanvasRenderingContext2D, kind: number, cx: number, cy: number, r: number) {
  g.fillStyle = "rgba(255,255,255,.85)"; g.strokeStyle = "rgba(255,255,255,.9)"; g.lineWidth = r * 0.12; g.beginPath();
  if (kind % 3 === 0) { for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 - Math.PI / 2, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.closePath(); g.fill(); }
  else if (kind % 3 === 1) { g.moveTo(cx, cy + r * 0.8); g.bezierCurveTo(cx - r * 1.3, cy - r * 0.1, cx - r * 0.5, cy - r * 1.1, cx, cy - r * 0.35); g.bezierCurveTo(cx + r * 0.5, cy - r * 1.1, cx + r * 1.3, cy - r * 0.1, cx, cy + r * 0.8); g.fill(); }
  else { g.arc(cx, cy, r * 0.5, 0, 7); g.fill(); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); } }
}
/** polaroid card centred at (cx,cy) with rotation; image cover-fit cropped into the square window */
function drawPolaroid(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, rot: number, img: HTMLImageElement | null, idx: number, tape: string) {
  g.save(); g.translate(cx, cy); g.rotate(rot);
  g.shadowColor = "rgba(0,0,0,.28)"; g.shadowBlur = w * 0.06; g.shadowOffsetY = w * 0.025; g.fillStyle = "#fffdf7"; rrect(g, -w / 2, -h / 2, w, h, w * 0.02); g.fill(); g.shadowColor = "transparent";
  const m = w * 0.07, iw = w - m * 2, ih = iw, ix = -w / 2 + m, iy = -h / 2 + m;
  g.save(); g.beginPath(); g.rect(ix, iy, iw, ih); g.clip();
  if (img && img.naturalWidth) {
    const s = Math.max(iw / img.naturalWidth, ih / img.naturalHeight), dw = img.naturalWidth * s, dh = img.naturalHeight * s;
    g.drawImage(img, ix + (iw - dw) / 2, iy + (ih - dh) / 2, dw, dh);
  } else {
    const gr = g.createLinearGradient(ix, iy, ix + iw, iy + ih); const c0 = PASTEL[idx % PASTEL.length]; gr.addColorStop(0, c0); gr.addColorStop(1, shade(c0, -0.12, 0.1, 0.06));
    g.fillStyle = gr; g.fillRect(ix, iy, iw, ih); drawDoodle(g, idx, ix + iw / 2, iy + ih / 2, iw * 0.2);
  }
  g.restore();
  g.fillStyle = "rgba(60,60,80,.35)"; for (let i = 0; i < 2; i++) { g.fillRect(-w / 2 + m + i * w * 0.05, iy + ih + (h - ih - m * 2) * 0.55 + i * w * 0.05, w * (0.55 - i * 0.2), w * 0.018); }
  g.fillStyle = tape; g.globalAlpha = 0.8; g.save(); g.translate(0, -h / 2 + 2); g.rotate(((idx * 37) % 9 - 4) * 0.05); g.fillRect(-w * 0.13, -w * 0.045, w * 0.26, w * 0.09); g.restore(); g.globalAlpha = 1;
  g.restore();
}
const TAPES = ["#ffe27a", "#ff9ec2", "#8fe3d4", "#b9a6ff"];

/* ------------------------------------------------------------------ catalogue plumbing */
export const CATALOG: FurnitureDefX[] = [];
type Build = (s: Style, c: string, v: number) => THREE.Object3D;
type Extra = Partial<Pick<FurnitureDefX, "wall" | "flat" | "surface" | "variants" | "core" | "y0" | "soft" | "under" | "reward">>;
function D(id: string, name: string, cat: FurnitureCat, size: V3, colors: string[], ex: Extra, build: Build) {
  CATALOG.push({ id, name, cat, size, colors, ...ex, build });
}
const VIV = ["#E8567C", "#4F91C7", "#F2B138", "#3FB68B", "#8D6BD4", "#F28C4E", "#2BB5C9", "#E25D4D"];
const WOOD = ["#C98F58", "#8A5A3A", "#E8C99A", "#F4EBDD", "#5B3A29", "#D9A066", "#7FA38A", "#3D4A5C"];
const SOFT = ["#FFB3C7", "#B5DEFF", "#FFE29A", "#B9F0D0", "#D6C2FF", "#FFC9A8", "#A8E6E0", "#F7A8A8"];
const NEUT = ["#F4EBDD", "#D8D2C4", "#9AA5B1", "#3D4A5C", "#2B2F3A", "#FFFFFF", "#C98F58", "#8A5A3A"];
const GREEN = ["#3FB68B", "#2E9E5B", "#6DBE45", "#1F8A70", "#8FD16A", "#4CAF50"];
const shadowOf = (o: THREE.Object3D) => o;

/* ================================================================== BEDS */
D("loft", "Loft bed", "bed", [2.0, 1.0, 1.92], ["#2F6FB5", "#E8567C", "#3FB68B", "#F2B138", "#8D6BD4", "#2B2F3A", "#FFFFFF", "#F28C4E"], { core: true, under: 1.38 }, (s, c) => {
  const b = new B(s), fr = paint(c), dk = fr, bl = acc(c), bl2 = shade(bl, 0.18);
  for (const x of [-0.955, 0.955]) for (const z of [-0.455, 0.455]) b.box(0.07, 1.92, 0.07, x, 0, z, fr, 0.025);
  b.box(1.98, 0.1, 0.05, 0, 1.3, -0.47, dk, 0.012); b.box(1.98, 0.1, 0.05, 0, 1.3, 0.47, dk, 0.012);
  b.box(0.05, 0.1, 0.9, -0.97, 1.3, 0, dk, 0.012); b.box(0.05, 0.1, 0.9, 0.97, 1.3, 0, dk, 0.012);
  b.box(1.9, 0.03, 0.9, 0, 1.4, 0, wood("#E8C99A"), 0.008);
  b.box(1.88, 0.17, 0.88, 0, 1.43, 0, fab("#FBF6EC"), 0.06);
  b.box(1.12, 0.07, 0.92, 0.34, 1.55, 0, fab(bl), 0.035); b.box(0.1, 0.075, 0.93, -0.2, 1.55, 0, fab(bl2), 0.03);
  for (let i = 0; i < 5; i++) b.box(0.012, 0.076, 0.93, 0.05 + i * 0.22, 1.55, 0, fab(bl2), 0.004);
  b.box(0.42, 0.11, 0.3, -0.68, 1.6, 0.16, fab(bl2), 0.05, { r: [0, 0.08, 0] }); b.box(0.42, 0.11, 0.3, -0.68, 1.6, -0.2, fab(bl2), 0.05, { r: [0, -0.06, 0] });
  b.sph(0.02, -0.68, 1.715, 0.16, fab(bl2), undefined, 8); b.sph(0.02, -0.68, 1.715, -0.2, fab(bl2), undefined, 8);
  b.box(1.94, 0.3, 0.025, 0, 1.63, -0.465, wood("#E8C99A"), 0.01); b.box(0.025, 0.3, 0.9, -0.965, 1.63, 0, wood("#E8C99A"), 0.01);
  b.box(1.45, 0.035, 0.035, -0.22, 1.66, 0.465, fr, 0.012); b.box(1.45, 0.035, 0.035, -0.22, 1.84, 0.465, fr, 0.012);
  for (let i = 0; i < 6; i++) b.box(0.03, 0.2, 0.03, -0.9 + i * 0.28, 1.66, 0.465, fr, 0.01);
  b.box(0.035, 0.035, 0.9, 0.955, 1.88, 0, fr, 0.012); // top rail at the ladder end
  for (const x of [0.58, 0.86]) b.cap(0.02, 1.52, x, 0.76, 0.56, fr, { r: [-0.12, 0, 0] });
  for (let i = 0; i < 6; i++) { const y = 0.28 + i * 0.22; b.cylH(0.014, 0.3, 0.72, y, 0.57 - (y - 0.76) * 0.12, wood("#E8C99A"), "x"); }
  b.tor(0.03, 0.008, -0.955, 1.94, 0.455, met("#C9CED6"), { r: [Math.PI / 2, 0, 0] });
  const pts: V3[] = [];
  for (let i = 0; i < 11; i++) { const x = -0.88 + i * 0.15, y = 1.8 - Math.sin((i / 10) * Math.PI) * 0.07; b.sph(0.016, x, y, 0.5, emi("#FFC857", 1.6), undefined, 8); pts.push([x, y, 0.5]); }
  const g = b.done(); addGlow(g, pts, "#FFC857", 0.12, 0.2); return g;
});
D("bed", "Single bed", "bed", [1.0, 2.0, 0.6], ["#4F91C7", "#E8567C", "#3FB68B", "#F2B138", "#8D6BD4", "#F4EBDD"], { surface: 0.6 }, (s, c) => {
  const b = new B(s), fr = wood("#C98F58");
  b.box(0.98, 0.28, 1.96, 0, 0.1, 0, fr, 0.03); b.box(0.98, 0.65, 0.06, 0, 0, -0.97, fr, 0.03); b.box(0.98, 0.4, 0.06, 0, 0, 0.97, fr, 0.03);
  b.box(0.9, 0.2, 1.84, 0, 0.36, 0.01, fab("#FBF6EC"), 0.07);
  b.box(0.92, 0.07, 1.2, 0, 0.53, 0.35, fab(c), 0.035); b.box(0.92, 0.075, 0.14, 0, 0.53, -0.24, fab(shade(c, 0.2)), 0.03);
  b.box(0.5, 0.12, 0.32, -0.12, 0.56, -0.74, fab(acc(c)), 0.055); b.box(0.38, 0.12, 0.28, 0.2, 0.56, -0.72, fab(shade(c, 0.3)), 0.055, { r: [0, 0.15, 0] });
  return b.done();
});
D("daybed", "Daybed", "bed", [0.95, 1.95, 0.8], ["#F2B138", "#E8567C", "#4F91C7", "#3FB68B", "#8D6BD4", "#2B2F3A"], { surface: 0.52 }, (s, c) => {
  const b = new B(s), fr = paint(shade(c, -0.15));
  for (const x of [-0.45, 0.45]) for (const z of [-0.9, 0.9]) b.cap(0.03, 0.15, x, 0.1, z, fr);
  b.box(0.95, 0.12, 1.95, 0, 0.14, 0, fr, 0.04); b.box(0.95, 0.5, 0.1, 0, 0.14, -0.92, fab(c), 0.06); b.box(0.1, 0.4, 1.9, -0.43, 0.14, 0, fab(c), 0.06);
  b.box(0.8, 0.2, 1.75, 0.05, 0.26, 0, fab(shade(c, 0.35, -0.2)), 0.07);
  for (let i = 0; i < 3; i++) b.box(0.34, 0.3, 0.14, -0.1 + (i % 2) * 0.1, 0.4, -0.7 + i * 0.35, fab(acc(c, i + 1)), 0.06, { r: [0, 0, 0.1 * (i - 1)] });
  return b.done();
});

/* ================================================================== DESKS */
D("desk", "Desk", "desk", [1.6, 0.6, 0.75], ["#E8C99A", "#F4EBDD", "#C98F58", "#8A5A3A", "#3D4A5C", "#FFFFFF", "#7FA38A", "#E8567C"], { core: true, surface: 0.75 }, (s, c) => {
  const b = new B(s), top = wood(c), body = wood(shade(c, -0.08)), fr = wood(shade(c, 0.1));
  b.box(1.6, 0.04, 0.6, 0, 0.71, 0, top, 0.015); b.box(0.04, 0.7, 0.56, -0.77, 0.01, 0, body, 0.01);
  b.box(0.42, 0.7, 0.56, 0.57, 0.01, 0, body, 0.012); b.box(1.15, 0.45, 0.02, -0.17, 0.26, -0.27, body, 0.006);
  const hc = [VIV[1], VIV[0], VIV[2]];
  for (let i = 0; i < 3; i++) { b.box(0.38, 0.19, 0.02, 0.57, 0.06 + i * 0.22, 0.285, fr, 0.01); b.cylH(0.011, 0.12, 0.57, 0.18 + i * 0.22, 0.31, mk("metal", hc[i], { metal: 0.5, rough: 0.3 }), "x", 8); }
  return b.done();
});
D("desk2", "Study table", "desk", [1.2, 0.6, 0.74], ["#F4EBDD", "#E8C99A", "#2B2F3A", "#3FB68B", "#F2B138", "#4F91C7"], { surface: 0.74 }, (s, c) => {
  const b = new B(s), m = met(shade(c, -0.3, 0.1));
  b.box(1.2, 0.035, 0.6, 0, 0.705, 0, wood(c), 0.017);
  for (const x of [-0.55, 0.55]) for (const z of [-0.25, 0.25]) b.cap(0.014, 0.66, x, 0.35, z, m, { r: [z * 0.2, 0, -x * 0.25] });
  b.box(1.0, 0.04, 0.03, 0, 0.5, 0, m, 0.01); return b.done();
});
D("deskshelf", "Desk shelf", "desk", [0.9, 0.24, 0.5], ["#F4EBDD", "#C98F58", "#E8567C", "#4F91C7", "#3FB68B", "#F2B138"], {}, (s, c) => {
  const b = new B(s), w = wood(c), r = rng(5);
  for (const x of [-0.435, 0.435]) b.box(0.03, 0.5, 0.24, x, 0, 0, w, 0.01);
  b.box(0.9, 0.03, 0.24, 0, 0.47, 0, w, 0.01); b.box(0.9, 0.03, 0.24, 0, 0.24, 0, w, 0.01); b.box(0.9, 0.03, 0.24, 0, 0, 0, w, 0.01);
  let x = -0.4; for (let i = 0; i < 9; i++) { const bw = 0.03 + r() * 0.03, bh = 0.14 + r() * 0.08; b.box(bw, bh, 0.17, x + bw / 2, 0.03, 0, pap(VIV[i % 8]), 0.004); x += bw + 0.004; if (x > 0.15) break; }
  b.cap(0.04, 0.05, 0.3, 0.29, 0, pla(acc(c)), { s: [1, 1, 1] }); b.cyl(0.05, 0.04, 0.09, 0.2, 0.27, 0.0, pla(shade(c, -0.1)), undefined, 12);
  return b.done();
});

/* ================================================================== SEATS */
D("chair", "Desk chair", "seat", [0.5, 0.5, 0.92], ["#E8567C", "#4F91C7", "#F2B138", "#3FB68B", "#8D6BD4", "#2B2F3A", "#F28C4E", "#2BB5C9"], { core: true }, (s, c) => {
  const b = new B(s), dk = met("#2F3640"), f = fab(c), f2 = fab(shade(c, -0.12));
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b.cap(0.016, 0.2, Math.sin(a) * 0.1, 0.085, Math.cos(a) * 0.1, dk, { r: [Math.PI / 2 - 0.1, a, 0] }); b.sph(0.027, Math.sin(a) * 0.205, 0.03, Math.cos(a) * 0.205, pla("#20242C"), { s: [1, 1, 1] }, 8); }
  b.cyl(0.03, 0.035, 0.3, 0, 0.1, 0, met("#C9CED6"), undefined, 10); b.cyl(0.05, 0.05, 0.05, 0, 0.38, 0, dk, undefined, 10);
  b.box(0.46, 0.09, 0.46, 0, 0.42, 0.02, f, 0.04); b.box(0.42, 0.04, 0.42, 0, 0.5, 0.02, f2, 0.02);
  b.box(0.42, 0.42, 0.07, 0, 0.55, -0.2, f, 0.04, { r: [-0.12, 0, 0] }); b.box(0.36, 0.3, 0.02, 0, 0.62, -0.17, f2, 0.02, { r: [-0.12, 0, 0] });
  b.box(0.04, 0.2, 0.04, -0.23, 0.5, 0, dk, 0.012); b.box(0.04, 0.2, 0.04, 0.23, 0.5, 0, dk, 0.012);
  b.box(0.05, 0.035, 0.28, -0.23, 0.68, 0, f2, 0.015); b.box(0.05, 0.035, 0.28, 0.23, 0.68, 0, f2, 0.015);
  return b.done();
});
D("beanbag", "Beanbag", "seat", [0.9, 0.9, 0.6], ["#8D6BD4", "#E8567C", "#F2B138", "#2BB5C9", "#3FB68B", "#F28C4E", "#4F91C7", "#2B2F3A"], {}, (s, c) => {
  const b = new B(s), f = fab(c);
  b.sph(0.45, 0, 0.26, 0, f, { s: [1, 0.62, 1] }, 20); b.sph(0.3, 0, 0.45, -0.1, f, { s: [1, 0.7, 0.9] }, 16); b.sph(0.22, 0.12, 0.5, -0.15, fab(shade(c, 0.05)), { s: [1, 0.5, 1] }, 12);
  b.tor(0.34, 0.014, 0, 0.5, 0.0, fab(shade(c, -0.15)), { r: [Math.PI / 2, 0, 0], s: [1, 1, 1] });
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; b.cap(0.008, 0.18, Math.sin(a) * 0.38, 0.22, Math.cos(a) * 0.38, fab(shade(c, -0.15)), { r: [Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5] }); }
  b.cap(0.04, 0.12, 0, 0.6, 0.18, fab(shade(c, -0.1)), { r: [Math.PI / 2, 0, 0] });
  return b.done();
});
D("armchair", "Armchair", "seat", [0.85, 0.8, 0.85], ["#F2B138", "#E8567C", "#4F91C7", "#3FB68B", "#8D6BD4", "#F28C4E", "#2B2F3A", "#F4EBDD"], {}, (s, c) => {
  const b = new B(s), f = fab(c), l = wood("#8A5A3A");
  for (const x of [-0.34, 0.34]) for (const z of [-0.3, 0.3]) b.cone(0.03, 0.22, x, 0, z, l, { r: [0, 0, 0], s: [1, -1, 1] });
  b.box(0.85, 0.22, 0.78, 0, 0.16, 0, f, 0.07); b.box(0.64, 0.14, 0.62, 0, 0.36, 0.06, fab(shade(c, 0.07)), 0.06);
  b.box(0.85, 0.5, 0.2, 0, 0.3, -0.29, f, 0.09, { r: [-0.12, 0, 0] }); b.box(0.16, 0.34, 0.74, -0.35, 0.3, 0, f, 0.07); b.box(0.16, 0.34, 0.74, 0.35, 0.3, 0, f, 0.07);
  b.box(0.4, 0.28, 0.1, 0.1, 0.46, -0.1, fab(acc(c)), 0.05, { r: [-0.2, 0.2, 0.15] });
  return b.done();
});
D("cushion", "Floor cushion", "seat", [0.6, 0.6, 0.16], ["#F28C4E", "#E8567C", "#2BB5C9", "#F2B138", "#8D6BD4", "#3FB68B", "#4F91C7", "#FFB3C7"], {}, (s, c) => {
  const b = new B(s); b.cyl(0.3, 0.3, 0.12, 0, 0.02, 0, fab(c), undefined, 28); b.tor(0.29, 0.05, 0, 0.08, 0, fab(shade(c, 0.05)), { r: [Math.PI / 2, 0, 0] });
  b.sph(0.03, 0, 0.145, 0, fab(shade(c, -0.2)), undefined, 8); b.tor(0.18, 0.007, 0, 0.145, 0, fab(shade(c, -0.15)), { r: [Math.PI / 2, 0, 0] }); return b.done();
});
D("stool", "Stool", "seat", [0.4, 0.4, 0.5], ["#F2B138", "#E8567C", "#4F91C7", "#3FB68B", "#F4EBDD", "#2B2F3A"], {}, (s, c) => {
  const b = new B(s); b.cyl(0.19, 0.19, 0.07, 0, 0.43, 0, fab(c), undefined, 24);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * 6.283 + 0.7; b.cap(0.018, 0.4, Math.sin(a) * 0.12, 0.21, Math.cos(a) * 0.12, wood("#C98F58"), { r: [Math.cos(a) * 0.15, 0, -Math.sin(a) * 0.15] }); }
  b.tor(0.15, 0.01, 0, 0.17, 0, wood("#C98F58"), { r: [Math.PI / 2, 0, 0] }); return b.done();
});
D("bench", "Bench", "seat", [1.2, 0.4, 0.46], ["#C98F58", "#8A5A3A", "#F4EBDD", "#3D4A5C", "#7FA38A", "#E8567C"], { surface: 0.46 }, (s, c) => {
  const b = new B(s), w = wood(c); b.box(1.2, 0.06, 0.4, 0, 0.4, 0, w, 0.02);
  for (const x of [-0.5, 0.5]) { b.box(0.06, 0.4, 0.34, x, 0, 0, w, 0.015); } b.box(1.0, 0.04, 0.03, 0, 0.12, 0, w, 0.01);
  b.box(0.5, 0.05, 0.34, -0.25, 0.46, 0, knit(acc(c)), 0.02, { r: [0, 0.05, 0] }); return b.done();
});

/* ================================================================== STORAGE */
D("wardrobe", "Wardrobe", "storage", [1.0, 0.6, 2.0], ["#F2B138", "#E8567C", "#3FB68B", "#4F91C7", "#8D6BD4", "#F4EBDD", "#2BB5C9", "#F28C4E"], { core: true }, (s, c) => {
  const g = new THREE.Group(), b = new B(s), inn = wood("#F4EBDD"), wd = wood(shade(c, -0.05));
  const t = 0.03;
  b.box(t, 1.94, 0.58, -0.485, 0.06, 0, wd, 0.008); b.box(t, 1.94, 0.58, 0.485, 0.06, 0, wd, 0.008); b.box(1.0, 0.06, 0.6, 0, 1.94, 0, wd, 0.012); b.box(0.97, 0.08, 0.56, 0, 0, 0, wood(shade(c, -0.25)), 0.01);
  b.box(0.94, 1.86, 0.02, 0, 0.08, -0.29, inn, 0.004); b.box(0.94, 0.03, 0.54, 0, 1.64, 0, inn, 0.005); b.box(0.94, 0.03, 0.54, 0, 0.64, 0, inn, 0.005);
  b.cylH(0.012, 0.94, 0, 1.52, -0.02, met("#C9CED6"), "x", 8);
  const cols = ["#E8567C", "#4F91C7", "#F2B138", "#E8567C", "#4F91C7", "#F2B138"];
  for (let i = 0; i < 6; i++) {
    const x = (i % 2 ? 0.23 : -0.23), z = 0.11 - Math.floor(i / 2) * 0.11, col = cols[i], y = 0.82;
    b.box(0.3, 0.52, 0.035, x, y, z, clo(col), 0.02); b.cap(0.04, 0.16, x - 0.19, y + 0.37, z, clo(col), { r: [0, 0, 0.6] }); b.cap(0.04, 0.16, x + 0.19, y + 0.37, z, clo(col), { r: [0, 0, -0.6] });
    b.box(0.2, 0.012, 0.012, x, y + 0.56, z, met("#C9CED6"), 0.004); b.tor(0.02, 0.005, x, y + 0.59, z, met("#C9CED6"), undefined, 4.5);
  }
  for (let i = 0; i < 5; i++) b.box(0.3, 0.05 + (i % 2) * 0.01, 0.34, i < 3 ? -0.25 : 0.2, 1.67 + (i < 3 ? i : i - 3) * 0.06, -0.05, clo(cols[(i + 2) % 3]), 0.02);
  for (let i = 0; i < 2; i++) { b.box(0.9, 0.24, 0.025, 0, 0.1 + i * 0.26 - 0.0, 0.265, wood(shade(c, 0.05)), 0.01); b.cylH(0.011, 0.14, 0, 0.22 + i * 0.26, 0.29, met("#C9CED6"), "x", 8); }
    g.add(b.done());
  const doors: THREE.Group[] = [];
  for (const sg of [-1, 1]) {
    const piv = new THREE.Group(), d = new B(s), dc = wood(c);
    const x0 = -sg * 0.245; d.box(0.49, 1.86, 0.03, x0, 0.1, 0, dc, 0.012); d.box(0.36, 1.48, 0.012, x0, 0.28, 0.018, wood(shade(c, 0.1)), 0.008);
    d.sph(0.022, -sg * 0.44, 1.0, 0.045, met("#FFD27A")); d.cap(0.008, 0.02, -sg * 0.44, 1.0, 0.025, met("#FFD27A"), { r: [Math.PI / 2, 0, 0] });
    piv.add(d.done()); piv.position.set(sg * 0.495, 0, 0.3); g.add(piv); doors.push(piv);
  }
  const u = ud(g); u.openAmount = 0;
  u.tick = () => { const o = u.openAmount, e = o * o * (3 - 2 * o); doors[0].rotation.y = -1.95 * e; doors[1].rotation.y = 1.95 * e; };
  return g;
});
D("bookshelf", "Bookshelf", "storage", [0.9, 0.32, 1.5], ["#C98F58", "#F4EBDD", "#8A5A3A", "#E8567C", "#3D4A5C", "#7FA38A", "#F2B138", "#4F91C7"], { surface: 1.5 }, (s, c) => {
  const b = new B(s), w = wood(c), r = rng(11);
  b.box(0.04, 1.5, 0.32, -0.43, 0, 0, w, 0.01); b.box(0.04, 1.5, 0.32, 0.43, 0, 0, w, 0.01); b.box(0.9, 0.04, 0.32, 0, 1.46, 0, w, 0.01); b.box(0.9, 0.06, 0.3, 0, 0, 0, w, 0.01); b.box(0.86, 1.4, 0.015, 0, 0.05, -0.15, wood(shade(c, -0.1)), 0.003);
  for (let i = 1; i < 4; i++) b.box(0.86, 0.03, 0.3, 0, i * 0.36, 0, w, 0.008);
  for (let sh = 0; sh < 4; sh++) {
    let x = -0.4; const y = 0.06 + sh * 0.36 + (sh ? 0 : 0.0);
    while (x < 0.4) {
      if (sh === 2 && x > 0.1) { b.cyl(0.05, 0.04, 0.14, 0.26, y + 0.01, 0, mk("plastic", VIV[1]), undefined, 10); for (let k = 0; k < 3; k++) b.cap(0.012, 0.14, 0.25 + k * 0.015, y + 0.22, 0, mk("plastic", GREEN[0]), { r: [0, 0, (k - 1) * 0.4] }); break; }
      const bw = 0.025 + r() * 0.035, bh = 0.2 + r() * 0.1; if (x + bw > 0.41) break; const col = VIV[(r() * 4) | 0];
      b.box(bw, bh, 0.2, x + bw / 2, y + 0.0, 0.0, pap(col), 0.004); b.box(bw * 0.7, 0.012, 0.201, x + bw / 2, y + bh * 0.6, 0, pap("#FFFFFF"), 0.001); x += bw + 0.003;
      if (r() < 0.07) x += 0.1;
    }
  }
  return b.done();
});
D("chest", "Chest of drawers", "storage", [0.8, 0.45, 0.9], ["#F4EBDD", "#C98F58", "#E8567C", "#3FB68B", "#4F91C7", "#F2B138", "#8D6BD4", "#2B2F3A"], { surface: 0.9 }, (s, c) => {
  const b = new B(s), w = wood(c);
  b.box(0.8, 0.05, 0.45, 0, 0.85, 0, wood(shade(c, 0.1)), 0.015); b.box(0.78, 0.8, 0.43, 0, 0.06, 0, w, 0.012); for (const x of [-0.34, 0.34]) for (const z of [-0.18, 0.18]) b.cone(0.03, 0.06, x, 0, z, w, { s: [1, -1, 1] });
  for (let i = 0; i < 4; i++) { b.box(0.7, 0.17, 0.02, 0, 0.1 + i * 0.19, 0.225, wood(shade(c, 0.06)), 0.01); b.sph(0.02, 0, 0.185 + i * 0.19, 0.25, mk("metal", VIV[(i + 2) % 8], { metal: 0.4, rough: 0.3 }), undefined, 8); }
  return b.done();
});
D("cubes", "Cube shelves", "storage", [0.8, 0.34, 1.1], ["#F4EBDD", "#2BB5C9", "#E8567C", "#F2B138", "#3FB68B", "#2B2F3A"], { surface: 1.1 }, (s, c) => {
  const b = new B(s), w = wood(c), r = rng(3);
  for (let i = 0; i < 4; i++) b.box(0.8, 0.03, 0.34, 0, i * 0.355, 0, w, 0.008); b.box(0.03, 1.1, 0.34, -0.385, 0, 0, w, 0.008); b.box(0.03, 1.1, 0.34, 0.385, 0, 0, w, 0.008); b.box(0.03, 1.1, 0.34, 0, 0, 0, w, 0.008); b.box(0.76, 1.1, 0.015, 0, 0, -0.16, wood(shade(c, -0.1)), 0.003);
  for (let rI = 0; rI < 3; rI++) for (let cI = 0; cI < 2; cI++) { const x = -0.19 + cI * 0.38, y = 0.03 + rI * 0.355; if ((rI + cI) % 2 === 0) { b.box(0.3, 0.27, 0.28, x, y, 0.02, fab(VIV[(rI * 2 + cI) % 8]), 0.04); b.box(0.2, 0.04, 0.005, x, y + 0.12, 0.165, pap("#FFFFFF"), 0.002); } else { let bx = x - 0.15; for (let k = 0; k < 5; k++) { const bw = 0.03 + r() * 0.02, bh = 0.18 + r() * 0.07; b.box(bw, bh, 0.2, bx + bw / 2, y, 0, pap(VIV[(k + rI + 3) % 8]), 0.004); bx += bw + 0.004; } } }
  return b.done();
});
D("shoerack", "Shoe rack", "storage", [0.7, 0.3, 0.5], ["#7FA38A", "#C98F58", "#F4EBDD", "#3D4A5C", "#E8567C", "#F2B138"], {}, (s, c) => {
  const b = new B(s), w = wood(c);
  for (let i = 0; i < 3; i++) b.box(0.7, 0.025, 0.3, 0, i * 0.2 + 0.02, 0, w, 0.008); for (const x of [-0.335, 0.335]) b.box(0.03, 0.5, 0.3, x, 0, 0, w, 0.008);
  for (let i = 0; i < 3; i++) for (let k = 0; k < 2; k++) { const x = -0.17 + k * 0.34, y = i * 0.2 + 0.045, col = VIV[(i * 2 + k) % 8]; b.box(0.12, 0.035, 0.26, x, y, 0, pla("#FFFFFF"), 0.015); b.sph(0.065, x, y + 0.04, -0.03, fab(col), { s: [1, 0.7, 1.7] }, 10); b.box(0.09, 0.012, 0.03, x, y + 0.07, 0.04, pap("#FFFFFF"), 0.004); }
  return b.done();
});
D("bin", "Laundry basket", "storage", [0.45, 0.45, 0.6], ["#F2B138", "#E8567C", "#3FB68B", "#4F91C7", "#8D6BD4", "#F4EBDD", "#2B2F3A", "#F28C4E"], {}, (s, c) => {
  const b = new B(s); b.lathe([[0, 0], [0.18, 0], [0.22, 0.58], [0.2, 0.58], [0.16, 0.02]], 0, 0, 0, fab(c), undefined, 24); b.tor(0.22, 0.014, 0, 0.58, 0, fab(shade(c, -0.1)), { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) b.tor(0.2, 0.008, 0, 0.12 + i * 0.12, 0, fab(shade(c, -0.1)), { r: [Math.PI / 2, 0, 0] });
  b.tor(0.03, 0.008, -0.215, 0.5, 0, fab(shade(c, -0.1)), { r: [0, Math.PI / 2, 0] }); b.tor(0.03, 0.008, 0.215, 0.5, 0, fab(shade(c, -0.1)), { r: [0, Math.PI / 2, 0] });
  b.box(0.3, 0.07, 0.25, 0, 0.56, 0, clo("#FFFFFF"), 0.03, { r: [0, 0.3, 0.1] }); b.box(0.2, 0.06, 0.2, 0.05, 0.6, 0.02, clo(acc(c)), 0.03, { r: [0, 0.7, -0.15] });
  return b.done();
});
D("crates", "Milk crates", "storage", [0.4, 0.4, 0.56], ["#4F91C7", "#E8567C", "#F2B138", "#3FB68B", "#8D6BD4", "#F28C4E"], { surface: 0.56 }, (s, c) => {
  const b = new B(s);
  for (let k = 0; k < 2; k++) { const y = k * 0.28, p = pla(k ? acc(c) : c); b.box(0.38, 0.02, 0.38, 0, y, 0, p, 0.006); for (const [sx, sz, w, d] of [[0, 0.18, 0.38, 0.02], [0, -0.18, 0.38, 0.02], [0.18, 0, 0.02, 0.34], [-0.18, 0, 0.02, 0.34]]) { b.box(w, 0.26, d, sx, y, sz, p, 0.006); } for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) b.box(0.03, 0.27, 0.03, x, y, z, p, 0.008); b.box(0.2, 0.06, 0.02, 0, y + 0.18, 0.19, pla("#171A21"), 0.01); }
  return b.done();
});
D("floatshelf", "Floating shelf", "storage", [0.8, 0.2, 0.2], ["#C98F58", "#F4EBDD", "#E8567C", "#3FB68B", "#8D6BD4", "#2B2F3A"], { wall: true, y0: 1.4, surface: 0.04 }, (s, c) => {
  const b = new B(s), r = rng(8); b.box(0.8, 0.04, 0.2, 0, 0, 0, wood(c), 0.012); b.box(0.74, 0.03, 0.02, 0, -0.03, -0.09, wood(shade(c, -0.1)), 0.006);
  let x = -0.35; for (let i = 0; i < 5; i++) { const bw = 0.03 + r() * 0.03, bh = 0.12 + r() * 0.06; b.box(bw, bh, 0.12, x + bw / 2, 0.04, -0.02, pap(VIV[(i * 3 + 1) % 8]), 0.004); x += bw + 0.004; }
  b.cyl(0.04, 0.03, 0.07, 0.25, 0.04, 0, mk("plastic", VIV[2]), undefined, 10); for (let k = 0; k < 3; k++) b.sph(0.03, 0.25 + (k - 1) * 0.03, 0.14 + (k % 2) * 0.03, 0, fab(GREEN[k]), { s: [1, 1.2, 1] }, 8);
  return b.done();
});
D("corkboard", "Cork board", "storage", [0.9, 0.04, 0.6], ["#D9A066", "#C98F58", "#E8C99A", "#8A5A3A", "#7FA38A", "#3D4A5C"], { wall: true, y0: 1.2 }, (s, c) => {
  const b = new B(s), r = rng(21); b.box(0.9, 0.6, 0.04, 0, 0, 0, wood(shade(c, -0.25)), 0.012); b.box(0.84, 0.54, 0.02, 0, 0.03, 0.01, mk("paper", c, { rough: 1 }), 0.004);
  for (let i = 0; i < 7; i++) { const x = -0.33 + (i % 4) * 0.22 + r() * 0.04, y = 0.07 + Math.floor(i / 4) * 0.25 + r() * 0.08, col = PASTEL[(i * 3) % 12]; b.box(0.15, 0.17, 0.003, x + 0.075, y, 0.022 + (i % 2) * 0.001, pap(col), 0.001, { r: [0, 0, (r() - 0.5) * 0.4] }); b.sph(0.011, x + 0.075, y + 0.15, 0.027, pla(VIV[i % 2]), undefined, 8); }
  return b.done();
});
D("backpack", "Backpack", "storage", [0.34, 0.2, 0.44], ["#F28C4E", "#E8567C", "#4F91C7", "#3FB68B", "#8D6BD4", "#F2B138", "#2B2F3A", "#2BB5C9"], { core: true, soft: true }, (s, c) => {
  const b = new B(s), f = clo(c), f2 = clo(shade(c, -0.12)), st = pla(shade(c, -0.3));
  b.box(0.32, 0.38, 0.16, 0, 0.02, 0, f, 0.07); b.box(0.28, 0.22, 0.07, 0, 0.04, 0.1, f2, 0.04); b.box(0.2, 0.015, 0.005, 0, 0.2, 0.138, met("#FFD27A"), 0.003); b.cap(0.012, 0.03, 0.09, 0.17, 0.14, met("#FFD27A"));
  b.box(0.22, 0.12, 0.005, 0, 0.12, 0.138, pap("#FFF7E0"), 0.004); b.add(new THREE.CircleGeometry(0.03, 5), mk("plastic", "#E8567C"), [0, 0.12, 0.142]);
  b.tor(0.05, 0.01, 0, 0.42, 0, st, undefined, Math.PI); b.box(0.04, 0.3, 0.02, -0.08, 0.0, -0.1, st, 0.01, { r: [0.1, 0, 0] }); b.box(0.04, 0.3, 0.02, 0.08, 0.0, -0.1, st, 0.01, { r: [0.1, 0, 0] });
  b.cap(0.035, 0.1, -0.18, 0.18, 0.02, f2, undefined); b.cap(0.035, 0.1, 0.18, 0.18, 0.02, f2); b.tor(0.02, 0.004, 0.12, 0.17, 0.14, met("#C9CED6")); b.sph(0.02, 0.12, 0.13, 0.14, pla("#FFD27A"), undefined, 8);
  return b.done();
});

/* ================================================================== TECH */
function drawDesktop(g: CanvasRenderingContext2D, w: number, h: number) {
  const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, "#3d6bff"); bg.addColorStop(0.55, "#9b5cff"); bg.addColorStop(1, "#ff8fb1"); g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(255,255,255,.12)"; g.beginPath(); g.arc(w * 0.82, h * 0.28, h * 0.32, 0, 7); g.fill(); g.beginPath(); g.arc(w * 0.1, h * 0.9, h * 0.4, 0, 7); g.fill();
  g.fillStyle = "rgba(255,255,255,.28)"; g.fillRect(0, 0, w, 26); g.fillStyle = "#fff"; g.font = `800 17px ${FONT}`; g.textBaseline = "middle"; g.fillText("UNIFY", 12, 14); g.font = `600 14px ${FONT}`; g.textAlign = "right"; g.fillText("Mon 9:41", w - 12, 14); g.textAlign = "center";
  const apps: [string, string][] = [["Mail", "#ff5d73"], ["News", "#3da5ff"], ["Messages", "#34c98b"], ["Games", "#9b5cff"], ["Keyboard", "#ffa32e"]];
  const sz = 72, gap = (w - 40 - sz * 5) / 4;
  apps.forEach(([n, col], i) => {
    const x = 20 + i * (sz + gap), y = 70; g.fillStyle = "rgba(0,0,0,.2)"; rrect(g, x + 2, y + 4, sz, sz, 18); g.fill(); g.fillStyle = col; rrect(g, x, y, sz, sz, 18); g.fill();
    g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineWidth = 5; const cx = x + sz / 2, cy = y + sz / 2;
    if (i === 0) { g.lineWidth = 4; rrect(g, cx - 22, cy - 15, 44, 30, 5); g.stroke(); g.beginPath(); g.moveTo(cx - 20, cy - 12); g.lineTo(cx, cy + 4); g.lineTo(cx + 20, cy - 12); g.stroke(); }
    if (i === 1) { rrect(g, cx - 22, cy - 22, 44, 44, 6); g.fill(); g.fillStyle = col; g.fillRect(cx - 16, cy - 16, 32, 8); g.fillRect(cx - 16, cy - 2, 14, 14); g.fillRect(cx + 2, cy - 2, 14, 4); g.fillRect(cx + 2, cy + 8, 14, 4); }
    if (i === 2) { rrect(g, cx - 24, cy - 20, 48, 33, 14); g.fill(); g.beginPath(); g.moveTo(cx - 10, cy + 10); g.lineTo(cx - 14, cy + 24); g.lineTo(cx + 4, cy + 12); g.fill(); g.fillStyle = col; for (let k = -1; k <= 1; k++) { g.beginPath(); g.arc(cx + k * 12, cy - 4, 3.5, 0, 7); g.fill(); } }
    if (i === 3) { rrect(g, cx - 26, cy - 14, 52, 30, 14); g.fill(); g.fillStyle = col; g.fillRect(cx - 17, cy - 3, 12, 4); g.fillRect(cx - 13, cy - 7, 4, 12); g.beginPath(); g.arc(cx + 10, cy - 2, 3.5, 0, 7); g.arc(cx + 18, cy + 4, 3.5, 0, 7); g.fill(); }
    if (i === 4) { for (let r = 0; r < 3; r++) for (let k = 0; k < 4; k++) { if (r === 2 && (k === 0 || k === 3)) continue; rrect(g, cx - 25 + k * 13 + (r === 2 ? 0 : 0), cy - 18 + r * 14, r === 2 ? 24 : 11, 10, 3); g.fill(); if (r === 2) break; } }
    g.fillStyle = "#fff"; g.font = `700 13px ${FONT}`; g.fillText(n, cx, y + sz + 16);
  });
  g.fillStyle = "rgba(255,255,255,.35)"; rrect(g, w / 2 - 105, h - 46, 210, 34, 17); g.fill(); for (let i = 0; i < 5; i++) { g.fillStyle = apps[i][1]; rrect(g, w / 2 - 92 + i * 38, h - 41, 24, 24, 7); g.fill(); }
  g.fillStyle = "rgba(255,255,255,.9)"; rrect(g, w * 0.55, 190, 190, 52, 10); g.fill(); g.fillStyle = "#2b2f3a"; g.textAlign = "left"; g.font = `800 13px ${FONT}`; g.fillText("Today", w * 0.55 + 12, 205); g.font = `600 12px ${FONT}`; g.fillText("Homework due: Science lab", w * 0.55 + 12, 225);
}
D("computer", "Computer", "tech", [0.7, 0.5, 0.52], ["#EDEFF5", "#2B2F3A", "#E8567C", "#4F91C7", "#3FB68B", "#F2B138", "#8D6BD4", "#F28C4E"], { core: true }, (s, c) => {
  const g = new THREE.Group(), b = new B(s), body = pla(c), dk = pla("#262B36"), kc = pla(shade(c, c === "#2B2F3A" ? 0.12 : -0.05));
  b.cyl(0.1, 0.11, 0.015, 0, 0, -0.1, body, undefined, 24); b.box(0.05, 0.17, 0.035, 0, 0.01, -0.12, body, 0.015); b.box(0.62, 0.37, 0.035, 0, 0.15, -0.1, body, 0.02);
  b.box(0.44, 0.014, 0.15, -0.03, 0, 0.12, kc, 0.008, { r: [-0.04, 0, 0] });
  for (let r = 0; r < 4; r++) for (let k = 0; k < 12; k++) { if (r === 3 && k > 1 && k < 10) continue; b.box(0.028, 0.008, 0.026, -0.225 + k * 0.0335 + (r === 3 ? 0.03 : 0), 0.0185, 0.07 + r * 0.032, pla(r === 0 && k === 0 ? "#E8567C" : "#FFFFFF"), 0.003, { r: [-0.04, 0, 0] }); }
  b.box(0.22, 0.008, 0.026, -0.03, 0.0185, 0.2, pla("#FFFFFF"), 0.003, { r: [-0.04, 0, 0] });
  b.box(0.2, 0.004, 0.17, 0.28, 0, 0.12, pla(acc(c === "#EDEFF5" ? "#4F91C7" : c)), 0.002); b.sph(0.03, 0.28, 0.02, 0.13, body, { s: [0.9, 0.55, 1.4] }, 12); b.sph(0.006, 0.28, 0.046, 0.115, pla("#E8567C"), undefined, 6);
  g.add(b.done());
  const [cv, cx] = cvs(512, 320); drawDesktop(cx, 512, 320); const tex = canvasTex(cv);
  const scr = emissiveTex(s, 0.585, 0.335, tex, 0.95); scr.position.set(0, 0.3185, -0.0795); g.add(scr);
  const hb = new B(s); hb.tor(0.075, 0.009, 0, 0, 0, pla("#F28C4E"), { r: [Math.PI / 2, 0, 0] }, Math.PI); hb.cylH(0.03, 0.025, -0.075, 0.02, 0, pla("#F28C4E"), "x", 16); hb.cylH(0.03, 0.025, 0.075, 0.02, 0, pla("#F28C4E"), "x", 16); hb.cylH(0.022, 0.03, -0.075, 0.02, 0, pla("#262B36"), "x", 16); hb.cylH(0.022, 0.03, 0.075, 0.02, 0, pla("#262B36"), "x", 16);
  const hp = hb.done(); hp.position.set(-0.28, 0.0, 0.0); hp.scale.setScalar(0.9); hp.rotation.set(0, 0.3, 0); hp.position.y = 0.0; g.add(hp);
  ud(g).tex = tex; return g;
});
D("speaker", "Speaker", "tech", [0.16, 0.16, 0.26], ["#2B2F3A", "#E8567C", "#4F91C7", "#F2B138", "#3FB68B", "#F4EBDD"], {}, (s, c) => {
  const b = new B(s); b.box(0.16, 0.26, 0.16, 0, 0, 0, pla(c), 0.04); b.cyl(0.055, 0.055, 0.01, 0, 0.04, 0.08, pla("#171A21"), { r: [Math.PI / 2, 0, 0] }); b.sph(0.03, 0, 0.1, 0.082, pla(shade(c, 0.3)), { s: [1, 1, 0.3] }, 10);
  b.cylH(0.05, 0.012, 0, 0.17, 0.082, pla("#171A21"), "z"); b.cylH(0.018, 0.014, 0, 0.17, 0.084, pla(shade(c, 0.3)), "z"); b.cylH(0.058, 0.012, 0, 0.065, 0.082, pla("#171A21"), "z"); b.cylH(0.025, 0.014, 0, 0.065, 0.084, pla(shade(c, 0.3)), "z"); return b.done();
});
D("minifridge", "Mini fridge", "tech", [0.5, 0.5, 0.85], ["#F4EBDD", "#E8567C", "#4F91C7", "#3FB68B", "#F2B138", "#8D6BD4"], { surface: 0.85 }, (s, c) => {
  const b = new B(s), p = paint(c); b.box(0.5, 0.85, 0.5, 0, 0.03, 0, p, 0.04); b.box(0.5, 0.02, 0.01, 0, 0.55, 0.255, pla("#171A21"), 0.004); b.box(0.025, 0.2, 0.03, -0.2, 0.62, 0.27, met("#C9CED6"), 0.01); b.box(0.025, 0.12, 0.03, -0.2, 0.3, 0.27, met("#C9CED6"), 0.01);
  for (const x of [-0.2, 0.2]) b.cyl(0.02, 0.02, 0.03, x, 0, -0.2, pla("#171A21"), undefined, 8); b.box(0.06, 0.08, 0.005, 0.1, 0.7, 0.26, pap("#FFE29A"), 0.002, { r: [0, 0, 0.2] }); b.sph(0.02, 0.15, 0.4, 0.262, pla("#E8567C"), { s: [1, 1, 0.4] }, 8); return b.done();
});
D("kettle", "Kettle", "tech", [0.22, 0.2, 0.24], ["#E8567C", "#F4EBDD", "#4F91C7", "#3FB68B", "#F2B138", "#2B2F3A"], {}, (s, c) => {
  const b = new B(s); b.cyl(0.095, 0.1, 0.02, 0, 0, 0, pla("#2B2F3A")); b.lathe([[0, 0], [0.09, 0], [0.095, 0.05], [0.075, 0.17], [0.04, 0.2], [0, 0.2]], 0, 0.02, 0, paint(c));
  b.sph(0.02, 0, 0.23, 0, pla("#2B2F3A"), undefined, 8); b.cone(0.02, 0.1, 0.1, 0.1, 0, paint(c), { r: [0, 0, -1.1] }, 8); b.tor(0.05, 0.011, -0.095, 0.13, 0, pla("#2B2F3A"), { r: [0, 0, 0.3] }, Math.PI * 1.2); return b.done();
});
D("console", "Game console", "tech", [0.34, 0.24, 0.07], ["#F4EBDD", "#2B2F3A", "#4F91C7", "#E8567C", "#3FB68B", "#8D6BD4"], {}, (s, c) => {
  const b = new B(s); b.box(0.28, 0.06, 0.2, -0.02, 0, -0.02, pla(c), 0.03); b.box(0.15, 0.004, 0.012, -0.02, 0.058, -0.05, pla("#171A21"), 0.001); b.sph(0.007, 0.07, 0.06, 0.06, emi("#3FB68B", 2), undefined, 6);
  b.box(0.1, 0.03, 0.06, 0.1, 0, 0.1, pla(shade(c, -0.1, 0.1)), 0.014); b.cap(0.02, 0.04, 0.07, 0.03, 0.1, pla("#2B2F3A"), { r: [0, 0, 1.57] }); b.sph(0.005, 0.13, 0.042, 0.09, pla("#E8567C"), undefined, 6); b.sph(0.005, 0.145, 0.042, 0.105, pla("#F2B138"), undefined, 6); return b.done();
});
D("tv", "TV", "tech", [0.9, 0.2, 0.62], ["#171A21", "#F4EBDD", "#E8567C", "#4F91C7", "#3FB68B", "#F2B138"], {}, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.box(0.9, 0.52, 0.04, 0, 0.1, 0, pla(c), 0.015); b.box(0.3, 0.015, 0.16, 0, 0, 0, pla(c), 0.006); b.box(0.06, 0.1, 0.03, 0, 0, -0.01, pla(c), 0.01); g.add(b.done());
  const [cv, cx] = cvs(512, 288); const gr = cx.createLinearGradient(0, 0, 512, 288); gr.addColorStop(0, "#ff7eb3"); gr.addColorStop(1, "#7aa2ff"); cx.fillStyle = gr; cx.fillRect(0, 0, 512, 288); cx.fillStyle = "rgba(255,255,255,.9)"; cx.font = `800 48px ${FONT}`; cx.textAlign = "center"; cx.fillText("GAME ON", 256, 150);
  cx.fillStyle = "#ffe27a"; for (let i = 0; i < 5; i++) { cx.beginPath(); cx.arc(100 + i * 78, 210, 18, 0, 7); cx.fill(); }
  const tex = canvasTex(cv), sc = emissiveTex(s, 0.86, 0.48, tex, 0.9); sc.position.set(0, 0.36, 0.021); g.add(sc); ud(g).tex = tex; return g;
});
D("fan", "Desk fan", "tech", [0.22, 0.14, 0.3], ["#4F91C7", "#E8567C", "#F4EBDD", "#3FB68B", "#F2B138", "#2B2F3A"], {}, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.cyl(0.07, 0.08, 0.025, 0, 0, 0, pla("#2B2F3A"), undefined, 16); b.cap(0.012, 0.14, 0, 0.1, 0, pla(c)); b.cylH(0.03, 0.06, 0, 0.19, 0, pla(c), "z");
  b.tor(0.1, 0.006, 0, 0.19, 0.04, met("#C9CED6")); b.tor(0.06, 0.004, 0, 0.19, 0.04, met("#C9CED6")); b.tor(0.03, 0.004, 0, 0.19, 0.04, met("#C9CED6")); for (let i = 0; i < 6; i++) b.add(new THREE.BoxGeometry(0.003, 0.2, 0.003), met("#C9CED6"), [0, 0.19, 0.04], { r: [0, 0, (i / 6) * Math.PI] }); g.add(b.done());
  const bl = new B(s); for (let i = 0; i < 3; i++) bl.sph(0.045, Math.cos((i / 3) * 6.283) * 0.05, Math.sin((i / 3) * 6.283) * 0.05, 0, pla(shade(c, 0.2)), { s: [1, 1.5, 0.15], r: [0, 0, (i / 3) * 6.283] }, 8); const bg = bl.done(); bg.position.set(0, 0.19, 0.045); g.add(bg);
  ud(g).tick = (dt: number) => { bg.rotation.z -= dt * 14; }; return g;
});
D("headphones", "Headphones", "tech", [0.2, 0.2, 0.06], ["#F28C4E", "#E8567C", "#4F91C7", "#3FB68B", "#2B2F3A", "#8D6BD4"], {}, (s, c) => {
  const b = new B(s); b.tor(0.075, 0.009, 0, 0.02, 0, pla(c), { r: [Math.PI / 2, 0, 0] }, Math.PI); b.cylH(0.032, 0.03, -0.075, 0.04, 0, pla(c), "x", 16); b.cylH(0.032, 0.03, 0.075, 0.04, 0, pla(c), "x", 16); return b.done();
});

/* ================================================================== DECOR */
D("folder", "Grades folder", "decor", [0.28, 0.36, 0.04], ["#F2C879", "#E8567C", "#4F91C7", "#3FB68B", "#8D6BD4", "#F28C4E", "#F4EBDD", "#2BB5C9"], { core: true }, (s, c) => {
  const g = new THREE.Group(), b = new B(s), m = pap(c), d = pap(shade(c, -0.08));
  b.box(0.27, 0.012, 0.34, 0, 0, 0, d, 0.004); b.box(0.255, 0.014, 0.325, 0, 0.011, 0.002, pap("#FFFDF7"), 0.002); b.box(0.27, 0.014, 0.34, 0, 0.024, 0, m, 0.005);
  b.box(0.11, 0.014, 0.034, -0.05, 0.001, -0.185, d, 0.007); b.box(0.11, 0.014, 0.034, -0.05, 0.024, -0.185, m, 0.007);
  g.add(b.done());
  const [cv, cx] = cvs(256, 330); cx.clearRect(0, 0, 256, 330); cx.textAlign = "center"; cx.textBaseline = "middle";
  cx.fillStyle = "rgba(255,255,255,.9)"; rrect(cx, 30, 100, 196, 70, 10); cx.fill(); cx.fillStyle = "#2b2f3a"; cx.font = `900 44px ${FONT}`; cx.fillText("GRADES", 128, 136);
  cx.strokeStyle = "#e8567c"; cx.lineWidth = 7; cx.beginPath(); cx.arc(180, 240, 36, 0, 7); cx.stroke(); cx.fillStyle = "#e8567c"; cx.font = `900 40px ${FONT}`; cx.fillText("A+", 180, 242);
  cx.fillStyle = "#ffd23f"; for (let k = 0; k < 3; k++) { cx.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 - 1.57, r = i % 2 ? 7 : 17; cx.lineTo(60 + k * 28 + Math.cos(a) * r, 240 + Math.sin(a) * r); } cx.fill(); }
  const tex = canvasTex(cv), top = planeTex(s, 0.27, 0.34, tex, { transparent: true }); top.rotation.x = -Math.PI / 2; top.position.set(0, 0.0395, 0); g.add(top);
  const [cv2, c2] = cvs(160, 56); c2.fillStyle = shade(c, 0.12); c2.fillRect(0, 0, 160, 56); c2.fillStyle = "#2b2f3a"; c2.font = `900 30px ${FONT}`; c2.textAlign = "center"; c2.textBaseline = "middle"; c2.fillText("GRADES", 80, 30);
  const tab = planeTex(s, 0.11, 0.034, canvasTex(cv2)); tab.rotation.x = -Math.PI / 2; tab.position.set(-0.05, 0.0315, -0.185); g.add(tab); return g;
});
D("binder", "Homework binder", "decor", [0.3, 0.36, 0.06], ["#3B7DD8", "#E8567C", "#3FB68B", "#8D6BD4", "#F2B138", "#2BB5C9", "#F28C4E", "#2B2F3A"], { core: true }, (s, c) => {
  const g = new THREE.Group(), b = new B(s), m = pla(c), d = pla(shade(c, -0.12));
  b.box(0.3, 0.06, 0.36, 0, 0, 0, m, 0.012); b.box(0.04, 0.062, 0.36, -0.13, 0, 0, d, 0.012); b.box(0.255, 0.04, 0.34, 0.015, 0.008, 0.0, pap("#FFFDF7"), 0.003, { r: [0, 0, 0] });
  for (let i = 0; i < 3; i++) { b.tor(0.03, 0.006, -0.13, 0.03, -0.12 + i * 0.12, met("#C9CED6"), { r: [0, Math.PI / 2, 0] }, Math.PI * 1.6); }
  b.cylH(0.006, 0.34, -0.108, 0.058, 0, met("#C9CED6"), "z", 8);
  b.box(0.01, 0.075, 0.36, 0.153, 0, 0, d, 0.003);
  b.box(0.1, 0.02, 0.05, 0.18, 0.02, -0.12, pla("#FFD23F"), 0.008); b.box(0.1, 0.02, 0.05, 0.2, 0.02, 0.0, pla("#FFD23F"), 0.008); b.box(0.1, 0.02, 0.05, 0.18, 0.02, 0.12, pla("#FFD23F"), 0.008);
  g.add(b.done());
  const [cv, cx] = cvs(256, 300); cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillStyle = "#fffdf7"; rrect(cx, 30, 60, 196, 120, 14); cx.fill(); cx.fillStyle = shade(c, -0.15); cx.font = `900 27px ${FONT}`; cx.fillText("HOMEWORK", 128, 98);
  cx.strokeStyle = "#cfd4dc"; cx.lineWidth = 3; for (let i = 0; i < 2; i++) { cx.beginPath(); cx.moveTo(52, 132 + i * 22); cx.lineTo(204, 132 + i * 22); cx.stroke(); }
  cx.fillStyle = "#ffd23f"; cx.beginPath(); for (let i = 0; i < 10; i++) { const a = (i / 10) * 6.283 - 1.57, r = i % 2 ? 12 : 30; cx.lineTo(128 + Math.cos(a) * r, 235 + Math.sin(a) * r); } cx.fill();
  const tex = canvasTex(cv), top = planeTex(s, 0.26, 0.31, tex, { transparent: true }); top.rotation.x = -Math.PI / 2; top.position.set(0.01, 0.0615, 0); g.add(top);
  const [c3, x3] = cvs(200, 64); x3.fillStyle = "#fff"; x3.fillRect(0, 0, 200, 64); x3.fillStyle = "#2b2f3a"; x3.font = `900 30px ${FONT}`; x3.textAlign = "center"; x3.textBaseline = "middle"; x3.fillText("HOMEWORK", 100, 34);
  const tb = planeTex(s, 0.062, 0.02, canvasTex(c3)); tb.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); tb.position.set(0.186, 0.0315, 0.0); g.add(tb); return g;
});
D("globe", "Globe", "decor", [0.26, 0.26, 0.34], ["#4F91C7", "#E8567C", "#F2B138", "#3FB68B", "#F4EBDD", "#8D6BD4"], {}, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.cyl(0.07, 0.09, 0.03, 0, 0, 0, wood("#8A5A3A")); b.cap(0.01, 0.12, 0, 0.1, 0, met("#FFD27A")); b.tor(0.13, 0.008, 0, 0.26, 0, met("#FFD27A"), { r: [0, 0, 0.4] }, Math.PI); g.add(b.done());
  const [cv, cx] = cvs(256, 128); cx.fillStyle = c; cx.fillRect(0, 0, 256, 128); const r = rng(7); cx.fillStyle = "#6DBE45"; for (let i = 0; i < 14; i++) { cx.beginPath(); cx.ellipse(r() * 256, 20 + r() * 88, 12 + r() * 26, 8 + r() * 16, r() * 3, 0, 7); cx.fill(); } cx.fillStyle = "#fff"; cx.fillRect(0, 0, 256, 8); cx.fillRect(0, 120, 256, 8);
  const sp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), mark(s.mat("plastic", "#ffffff", { map: canvasTex(cv), rough: 0.4 }))); sp.position.set(0, 0.26, 0); sp.rotation.z = 0.4; sp.castShadow = true; g.add(sp);
  ud(g).tick = (dt: number) => { sp.rotation.y += dt * 0.25; }; return g;
});
/* ------------------------------------------------------------------ earned rewards (see rewards.ts) */
D("r-petcage", "Pet cage", "decor", [0.5, 0.36, 0.42], ["#E8C99A", "#F4EBDD", "#E8567C", "#4F91C7", "#3FB68B", "#F2B138"], { reward: true, surface: 0.4 }, (s, c) => {
  const b = new B(s), bar = met(c), base = wood("#8A5A3A"); b.box(0.5, 0.05, 0.36, 0, 0, 0, base, 0.01); b.box(0.5, 0.03, 0.36, 0, 0.37, 0, base, 0.01);
  for (const x of [-0.23, -0.115, 0, 0.115, 0.23]) { b.cyl(0.006, 0.006, 0.32, x, 0.05, 0.165, bar, undefined, 6); b.cyl(0.006, 0.006, 0.32, x, 0.05, -0.165, bar, undefined, 6); }
  for (const z of [-0.12, 0, 0.12]) { b.cyl(0.006, 0.006, 0.32, 0.245, 0.05, z, bar, undefined, 6); b.cyl(0.006, 0.006, 0.32, -0.245, 0.05, z, bar, undefined, 6); }
  b.cyl(0.07, 0.07, 0.02, 0.1, 0.05, 0, wood("#EBD48A"), undefined, 14); b.sph(0.055, -0.1, 0.1, 0, pla("#F1E6D8"), { s: [1.2, 0.9, 1] }); b.tor(0.1, 0.007, -0.1, 0.17, 0, bar, { r: [Math.PI / 2, 0, 0] }); return b.done();
});
D("r-pennant", "Spirit pennant", "decor", [0.7, 0.04, 0.4], ["#E8604C", "#4F91C7", "#5FB37A", "#EAB94E", "#8E7CC3", "#2B2F3A"], { reward: true, wall: true, y0: 1.45 }, (s, c) => {
  const b = new B(s), cloth = clo(c); b.cylH(0.012, 0.74, 0, 0.38, 0, wood("#8A5A3A"), "x", 8);
  b.box(0.62, 0.34, 0.012, 0, 0.04, 0, cloth, 0.004); b.box(0.5, 0.2, 0.012, 0.05, 0.1, 0.006, clo("#FFFFFF"), 0.004); b.box(0.16, 0.16, 0.012, -0.16, 0.12, 0.012, cloth, 0.004); b.box(0.16, 0.04, 0.012, 0.05, 0.18, 0.012, cloth, 0.004);
  b.sph(0.02, -0.37, 0.38, 0, met("#FFD27A"), undefined, 8); b.sph(0.02, 0.37, 0.38, 0, met("#FFD27A"), undefined, 8); return b.done();
});
D("r-cup", "Champion cup", "decor", [0.24, 0.24, 0.42], ["#FFC857", "#C9CED6", "#E8A24A", "#F4EBDD", "#8D6BD4", "#3FB68B"], { reward: true, surface: 0.4 }, (s, c) => {
  const b = new B(s), m = met(c); b.box(0.22, 0.04, 0.22, 0, 0, 0, wood("#5B3A29"), 0.01); b.box(0.16, 0.06, 0.16, 0, 0.04, 0, wood("#8A5A3A"), 0.01); b.cyl(0.02, 0.035, 0.1, 0, 0.1, 0, m, undefined, 14);
  b.lathe([[0, 0], [0.04, 0], [0.09, 0.1], [0.11, 0.19], [0.105, 0.2], [0, 0.2]], 0, 0.2, 0, m, undefined, 22); b.tor(0.07, 0.012, -0.12, 0.38, 0, m, { r: [0, 0, 0] }, Math.PI); b.tor(0.07, 0.012, 0.12, 0.38, 0, m, { r: [0, 0, 0] }, Math.PI);
  b.box(0.08, 0.03, 0.006, 0, 0.055, 0.084, met("#FFE9A8"), 0.001); return b.done();
});

D("trophy", "Trophy", "decor", [0.16, 0.16, 0.3], ["#FFC857", "#C9CED6", "#E8A24A", "#F4EBDD", "#8D6BD4", "#3FB68B"], {}, (s, c) => {
  const b = new B(s), m = met(c); b.box(0.14, 0.03, 0.14, 0, 0, 0, wood("#5B3A29"), 0.008); b.box(0.1, 0.04, 0.1, 0, 0.03, 0, wood("#8A5A3A"), 0.008); b.cyl(0.015, 0.025, 0.08, 0, 0.07, 0, m, undefined, 12);
  b.lathe([[0, 0], [0.025, 0], [0.06, 0.07], [0.07, 0.12], [0.065, 0.13], [0, 0.13]], 0, 0.15, 0, m, undefined, 20); b.tor(0.045, 0.008, -0.07, 0.24, 0, m, { r: [0, 0, 0] }, Math.PI); b.tor(0.045, 0.008, 0.07, 0.24, 0, m, { r: [0, 0, Math.PI] }, Math.PI);
  b.box(0.05, 0.02, 0.003, 0, 0.04, 0.052, met("#FFE9A8"), 0.001); return b.done();
});
D("plushie", "Plushie", "decor", [0.22, 0.2, 0.26], ["#F2B138", "#FFB3C7", "#B9F0D0", "#D6C2FF", "#FFFFFF", "#8A5A3A"], { variants: 3 }, (s, c, v) => {
  const b = new B(s), f = fab(c), f2 = fab(shade(c, 0.22)), eye = pla("#20242C");
  b.sph(0.085, 0, 0.1, 0, f, { s: [1, 1.05, 0.9] }, 14); b.sph(0.07, 0, 0.21, 0.01, f, undefined, 14); b.sph(0.045, 0, 0.19, 0.06, f2, { s: [1, 0.8, 0.7] }, 10);
  b.sph(0.01, -0.025, 0.225, 0.065, eye, undefined, 6); b.sph(0.01, 0.025, 0.225, 0.065, eye, undefined, 6); b.sph(0.012, 0, 0.205, 0.092, pla("#E8567C"), undefined, 6);
  b.cap(0.022, 0.06, -0.09, 0.1, 0.02, f, { r: [0, 0, 0.8] }); b.cap(0.022, 0.06, 0.09, 0.1, 0.02, f, { r: [0, 0, -0.8] }); b.sph(0.03, -0.05, 0.02, 0.05, f, undefined, 8); b.sph(0.03, 0.05, 0.02, 0.05, f, undefined, 8);
  if (v === 0) { b.sph(0.03, -0.055, 0.27, 0, f, undefined, 8); b.sph(0.03, 0.055, 0.27, 0, f, undefined, 8); }
  else if (v === 1) { b.cap(0.02, 0.1, -0.03, 0.31, 0, f, { r: [0, 0, 0.12] }); b.cap(0.02, 0.1, 0.03, 0.31, 0, f, { r: [0, 0, -0.12] }); b.sph(0.014, 0, 0.06, -0.085, f2, undefined, 8); }
  else { b.cone(0.03, 0.05, -0.05, 0.26, 0, f, { r: [0, 0, 0.3] }, 6); b.cone(0.03, 0.05, 0.05, 0.26, 0, f, { r: [0, 0, -0.3] }, 6); b.cap(0.012, 0.12, 0, 0.04, -0.1, f, { r: [1.2, 0, 0] }); }
  return b.done();
});
D("fishtank", "Fish tank", "decor", [0.5, 0.3, 0.36], ["#2BB5C9", "#E8567C", "#3FB68B", "#F2B138", "#8D6BD4", "#4F91C7"], {}, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.box(0.5, 0.03, 0.3, 0, 0, 0, pla("#2B2F3A"), 0.01); b.box(0.46, 0.04, 0.26, 0, 0.03, 0, mk("rug", "#E8D7B0"), 0.01); b.box(0.5, 0.025, 0.3, 0, 0.335, 0, pla("#2B2F3A"), 0.01);
  b.box(0.1, 0.1, 0.08, -0.12, 0.07, -0.03, pla(c), 0.01); b.cone(0.06, 0.07, -0.12, 0.17, -0.03, pla(shade(c, -0.1)), undefined, 4); b.box(0.025, 0.04, 0.005, -0.12, 0.07, 0.013, pla("#20242C"), 0.002);
  for (let i = 0; i < 4; i++) { b.cap(0.012, 0.1 + i * 0.03, 0.14 + i * 0.02, 0.15, -0.05 + (i % 2) * 0.05, fab(GREEN[i]), { r: [0, 0, (i - 1.5) * 0.15] }); }
  b.box(0.46, 0.2, 0.26, 0, 0.07, 0, gla("#8FE0FF", 0.28), 0.006); g.add(b.done());
  const fb = new B(s), fish: THREE.Group[] = [];
  const cols = ["#FF8A3D", "#FFD23F", "#FF5D73"]; for (let i = 0; i < 3; i++) { const f = new B(s); f.sph(0.02, 0, 0, 0, pla(cols[i]), { s: [1.5, 1, 0.6] }, 8); f.cone(0.016, 0.03, -0.035, -0.013, 0, pla(cols[i]), { r: [0, 0, 1.57] }, 4); f.sph(0.005, 0.02, 0.006, 0.01, pla("#20242C"), undefined, 5); const fg = f.done(); fish.push(fg); fb.g.add(fg); }
  fb.g.position.set(0, 0.17, 0); g.add(fb.done());
  ud(g).tick = (_dt: number, t: number) => { for (let i = 0; i < 3; i++) { const a = t * (0.5 + i * 0.13) + i * 2.1, f = fish[i]; f.position.set(Math.cos(a) * 0.17, Math.sin(a * 1.7) * 0.03 + i * 0.03 - 0.03, Math.sin(a) * 0.07); f.rotation.y = Math.atan2(-Math.cos(a) * 0.07, -Math.sin(a) * 0.17) + Math.PI; } };
  return g;
});
D("snowglobe", "Snow globe", "decor", [0.14, 0.14, 0.18], ["#B5DEFF", "#FFB3C7", "#FFE29A", "#B9F0D0", "#D6C2FF", "#F4EBDD"], {}, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.cyl(0.055, 0.065, 0.04, 0, 0, 0, pla(shade(c, -0.3, 0.2)), undefined, 16); b.cone(0.025, 0.06, 0, 0.04, 0, fab("#2E9E5B"), undefined, 8); b.cone(0.02, 0.05, 0, 0.07, 0, fab("#3FB68B"), undefined, 8); b.sph(0.075, 0, 0.115, 0, gla(c, 0.25), undefined, 18); g.add(b.done());
  const pts: V3[] = []; const r = rng(2); for (let i = 0; i < 24; i++) pts.push([(r() - 0.5) * 0.1, 0.07 + r() * 0.1, (r() - 0.5) * 0.1]);
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.Float32BufferAttribute(pts.flat(), 3)); const p = new THREE.Points(geo, mark(new THREE.PointsMaterial({ color: "#fff", size: 0.008, sizeAttenuation: true }))); g.add(p);
  ud(g).tick = (dt: number) => { p.rotation.y += dt * 0.6; }; return g;
});
D("lavalamp", "Lava lamp", "decor", [0.12, 0.12, 0.36], ["#FF5D8F", "#8D6BD4", "#2BB5C9", "#F2B138", "#3FB68B", "#F28C4E"], {}, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.cyl(0.04, 0.055, 0.08, 0, 0, 0, met("#2B2F3A"), undefined, 16); b.lathe([[0.035, 0], [0.055, 0.03], [0.04, 0.2], [0.025, 0.25], [0.02, 0.255]], 0, 0.08, 0, gla(shade(c, 0.2), 0.35), undefined, 18); b.cone(0.03, 0.04, 0, 0.32, 0, met("#2B2F3A"), undefined, 16);
  b.lathe([[0, 0], [0.03, 0], [0.05, 0.03], [0.036, 0.19], [0.02, 0.24], [0, 0.24]], 0, 0.085, 0, emi(c, 0.6), undefined, 14); g.add(b.done());
  const bl = new B(s); for (let i = 0; i < 3; i++) bl.sph(0.017 + i * 0.004, 0, 0, 0, emi(shade(c, 0.25), 1.3), undefined, 10); const bg = bl.done(); g.add(bg);
  ud(g).tick = (_d: number, t: number) => { for (let i = 0; i < 3; i++) { const m = bg.children[i] as THREE.Mesh | undefined; if (m) m.position.set(Math.sin(t * 0.7 + i) * 0.012, 0.13 + (Math.sin(t * 0.4 + i * 2.1) * 0.5 + 0.5) * 0.15, 0); } };
  return g;
});
D("clock", "Wall clock", "decor", [0.34, 0.06, 0.34], ["#F4EBDD", "#2B2F3A", "#E8567C", "#F2B138", "#4F91C7", "#3FB68B"], { wall: true, y0: 1.9 }, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.cyl(0.17, 0.17, 0.04, 0, 0, 0, pla(c), { r: [Math.PI / 2, 0, 0] }, 28); b.tor(0.165, 0.014, 0, 0, 0.0, pla(shade(c, -0.25, 0.1)), undefined); g.add(b.done()); g.children.forEach((m) => m.position.y += 0.17);
  const [cv, cx] = cvs(256, 256); cx.fillStyle = "#fffdf7"; cx.beginPath(); cx.arc(128, 128, 128, 0, 7); cx.fill(); cx.fillStyle = "#2b2f3a"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = `800 30px ${FONT}`; for (let i = 1; i <= 12; i++) { const a = (i / 12) * 6.283 - 1.57; cx.fillText(String(i), 128 + Math.cos(a) * 100, 130 + Math.sin(a) * 100); }
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.155, 32), mark(s.mat("paper", "#ffffff", { map: canvasTex(cv) }))); face.position.set(0, 0.17, 0.021); g.add(face);
  const hb = new B(s), hh = new THREE.Group(), mh = new THREE.Group(); hb.box(0.012, 0.075, 0.006, 0, 0, 0, pla("#2B2F3A"), 0.003); hb.box(0.008, 0.115, 0.004, 0, 0, 0.007, pla("#E8567C"), 0.002);
  const hands = hb.done(); const hm = hands.children[0], mm = hands.children[1]; hh.add(hm); mh.add(mm); const pv = new THREE.Group(); pv.add(hh, mh); pv.position.set(0, 0.17, 0.027); g.add(pv);
  ud(g).tick = () => { const d = new Date(); mh.rotation.z = -(d.getMinutes() / 60) * 6.283; hh.rotation.z = -(((d.getHours() % 12) + d.getMinutes() / 60) / 12) * 6.283; }; return g;
});
D("picframe", "Photo frame", "decor", [0.2, 0.12, 0.27], ["#C98F58", "#F4EBDD", "#E8567C", "#4F91C7", "#F2B138", "#2B2F3A", "#3FB68B", "#8D6BD4"], { variants: 2 }, (s, c, v) => {
  const g = new THREE.Group(), b = new B(s), w = wood(c);
  const fg = new THREE.Group(), fb = new B(s); fb.box(0.2, 0.26, 0.02, 0, 0, 0, w, v ? 0.05 : 0.012); fb.box(0.012, 0.15, 0.02, 0, 0, -0.04, w, 0.004, { r: [0.3, 0, 0] }); fg.add(fb.done()); fg.rotation.x = -0.2; fg.position.set(0, 0.0, 0.0);
  const [cv, cx] = cvs(256, 300); cx.fillStyle = "#fffdf7"; cx.fillRect(0, 0, 256, 300); drawPolaroid(cx, 128, 150, 236, 280, 0, null, 3, "rgba(0,0,0,0)");
  const tex = canvasTex(cv); const ph = planeTex(s, 0.16, 0.2, tex); ph.position.set(0, 0.13, 0.0115); fg.add(ph); g.add(fg);
  ud(g).photo = { cv, cx, tex }; ud(g).setPhoto = async (url: string | null, i = 0) => { const im = url ? await loadImg(url) : null; cx.fillStyle = "#fffdf7"; cx.fillRect(0, 0, 256, 300); drawPolaroid(cx, 128, 150, 236, 280, 0, im, i, "rgba(0,0,0,0)"); tex.needsUpdate = true; };
  return g;
});
D("books", "Book stack", "decor", [0.24, 0.18, 0.16], ["#E8567C", "#4F91C7", "#F2B138", "#3FB68B", "#8D6BD4", "#F28C4E"], {}, (s, c) => {
  const b = new B(s), r = rng(4); let y = 0; for (let i = 0; i < 5; i++) { const h = 0.025 + r() * 0.02, col = i ? VIV[(i * 3) % 8] : c; b.box(0.2 + r() * 0.04, h, 0.15, (r() - 0.5) * 0.03, y, 0, pap(col), 0.006, { r: [0, (r() - 0.5) * 0.5, 0] }); b.box(0.185, h - 0.008, 0.14, 0.004, y + 0.004, 0.005, pap("#FFFDF7"), 0.002, { r: [0, 0, 0] }); y += h; }
  b.cap(0.015, 0.03, 0.04, y + 0.015, 0, pla("#E8567C"), { r: [0, 0, 1.57] }); return b.done();
});

/* ================================================================== WALL */
function drawCollage(g: CanvasRenderingContext2D, w: number, h: number, imgs: (HTMLImageElement | null)[], bg: string) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  g.fillStyle = "rgba(0,0,0,.035)"; const rr = rng(9); for (let i = 0; i < 500; i++) g.fillRect(rr() * w, rr() * h, 3, 3);
  const cols = 4, rows = 3, cw = w / cols, ch = h / rows, pw = cw * 0.8, ph = pw * 1.2;
  for (let i = 0; i < 12; i++) { const cx = (i % cols + 0.5) * cw + (rr() - 0.5) * cw * 0.06, cy = (Math.floor(i / cols) + 0.5) * ch + (rr() - 0.5) * ch * 0.04; drawPolaroid(g, cx, cy, pw, Math.min(ph, ch * 0.92), (rr() - 0.5) * 0.16, imgs[i] ?? null, i, TAPES[i % 4]); }
}
D("collage", "Collage frame", "wall", [1.2, 0.06, 0.9], ["#C98F58", "#F4EBDD", "#2B2F3A", "#E8567C", "#4F91C7", "#3FB68B", "#F2B138", "#8D6BD4"], { core: true, wall: true, y0: 1.1 }, (s, c) => {
  const g = new THREE.Group(), fb = new B(s);
  fb.box(1.2, 0.06, 0.08, 0, 0.82, 0, wood(c), 0.02); fb.box(1.2, 0.06, 0.08, 0, 0, 0, wood(c), 0.02); fb.box(0.08, 0.9, 0.06, -0.56, 0, 0, wood(c), 0.02); fb.box(0.08, 0.9, 0.06, 0.56, 0, 0, wood(c), 0.02); fb.box(1.08, 0.78, 0.02, 0, 0.06, -0.02, wood(shade(c, -0.2)), 0.004);
  fb.sph(0.016, 0, 0.97, 0, met("#C9CED6"), undefined, 8); g.add(fb.done());
  const [cv, cx] = cvs(1280, 900); const imgs: (HTMLImageElement | null)[] = new Array(12).fill(null); drawCollage(cx, 1280, 900, imgs, "#F6EFE3");
  const tex = canvasTex(cv); tex.anisotropy = 8; const pl = planeTex(s, 1.08, 0.76, tex); pl.position.set(0, 0.45, 0.012); g.add(pl);
  let pend = false; const redraw = () => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; drawCollage(cx, 1280, 900, imgs, "#F6EFE3"); tex.needsUpdate = true; }); };
  let ver = 0; ud(g).setPhotos = (urls: string[]) => { const my = ++ver; for (let i = 0; i < 12; i++) { imgs[i] = null; const u = urls[i]; if (u) loadImg(u).then((im) => { if (my === ver) { imgs[i] = im; redraw(); } }); } redraw(); };
  ud(g).tex = tex; ud(g).slots = 12; return g;
});
function drawPoster(g: CanvasRenderingContext2D, w: number, h: number, v: number, c: string) {
  const c1 = c, c2 = shade(c, 0.2, 0, 0.12), c3 = shade(c, -0.2, 0, -0.12), c4 = shade(c, 0.35, -0.2, 0.5);
  const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, c2); bg.addColorStop(1, c1); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.textAlign = "center"; g.textBaseline = "middle";
  if (v === 0) { g.fillStyle = "#fff3b0"; g.beginPath(); g.arc(w / 2, h * 0.4, w * 0.22, 0, 7); g.fill(); g.fillStyle = c3; g.beginPath(); g.moveTo(0, h * 0.75); g.lineTo(w * 0.3, h * 0.45); g.lineTo(w * 0.55, h * 0.7); g.lineTo(w * 0.78, h * 0.5); g.lineTo(w, h * 0.75); g.lineTo(w, h); g.lineTo(0, h); g.fill(); g.fillStyle = "#fff"; g.font = `900 ${w * 0.17}px ${FONT}`; g.fillText("EXPLORE", w / 2, h * 0.88); }
  else if (v === 1) { g.fillStyle = c4; g.beginPath(); g.arc(w * 0.3, h * 0.3, w * 0.2, 0, 7); g.fill(); g.fillStyle = c3; g.fillRect(w * 0.45, h * 0.15, w * 0.4, w * 0.4); g.fillStyle = "#ffd23f"; g.beginPath(); g.moveTo(w * 0.2, h * 0.75); g.lineTo(w * 0.5, h * 0.45); g.lineTo(w * 0.8, h * 0.75); g.fill(); g.strokeStyle = "#fff"; g.lineWidth = 8; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(w * 0.1, h * (0.82 + i * 0.03)); g.quadraticCurveTo(w * 0.3, h * (0.78 + i * 0.03), w * 0.5, h * (0.82 + i * 0.03)); g.stroke(); } }
  else if (v === 2) { g.fillStyle = "#12163a"; g.fillRect(0, 0, w, h); const r = rng(3); g.fillStyle = "#fff"; for (let i = 0; i < 60; i++) { g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, 7); g.fill(); } const pg = g.createRadialGradient(w * 0.4, h * 0.4, 10, w * 0.5, h * 0.45, w * 0.3); pg.addColorStop(0, c4); pg.addColorStop(1, c1); g.fillStyle = pg; g.beginPath(); g.arc(w * 0.5, h * 0.45, w * 0.28, 0, 7); g.fill(); g.strokeStyle = "#ffd23f"; g.lineWidth = 7; g.beginPath(); g.ellipse(w * 0.5, h * 0.45, w * 0.42, w * 0.1, -0.35, 0, 7); g.stroke(); g.fillStyle = "#fff"; g.font = `800 ${w * 0.1}px ${FONT}`; g.fillText("SPACE CLUB", w / 2, h * 0.9); }
  else if (v === 3) { for (let i = 0; i < 6; i++) { g.fillStyle = [c3, c1, c2, "#ffd23f", "#ff6b8a", "#4dd0b1"][i]; g.fillRect(0, h * 0.1 + i * h * 0.07, w, h * 0.07); } g.fillStyle = "#fff"; g.font = `900 ${w * 0.22}px ${FONT}`; g.fillText("LEARN", w / 2, h * 0.7); g.font = `700 ${w * 0.08}px ${FONT}`; g.fillText("every day", w / 2, h * 0.84); }
  else if (v === 4) { g.lineWidth = 10; for (let i = 0; i < 9; i++) { g.strokeStyle = i % 2 ? c4 : c3; g.beginPath(); for (let x = 0; x <= w; x += 10) g.lineTo(x, h * (0.2 + i * 0.08) + Math.sin(x / w * 6.283 * 2 + i) * 22); g.stroke(); } g.fillStyle = "#fff"; g.font = `800 ${w * 0.1}px ${FONT}`; g.fillText("flow state", w / 2, h * 0.92); }
  else { g.fillStyle = "#fff8e8"; g.fillRect(0, 0, w, h); for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; g.fillStyle = [c1, c2, "#ffd23f", "#ff6b8a", c3, "#4dd0b1", c4][i]; g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * w * 0.17, h * 0.4 + Math.sin(a) * w * 0.17, w * 0.1, w * 0.17, a + 1.57, 0, 7); g.fill(); } g.fillStyle = "#ffd23f"; g.beginPath(); g.arc(w / 2, h * 0.4, w * 0.08, 0, 7); g.fill(); g.strokeStyle = "#3FB68B"; g.lineWidth = 8; g.beginPath(); g.moveTo(w / 2, h * 0.55); g.lineTo(w / 2, h * 0.85); g.stroke(); g.fillStyle = c3; g.font = `900 ${w * 0.1}px ${FONT}`; g.fillText("KEEP CURIOUS", w / 2, h * 0.93); }
}
D("poster", "Poster", "wall", [0.6, 0.03, 0.85], ["#E8567C", "#4F91C7", "#F2B138", "#3FB68B", "#8D6BD4", "#F28C4E", "#2BB5C9", "#E25D4D"], { wall: true, y0: 1.2, variants: 6 }, (s, c, v) => {
  const g = new THREE.Group(), b = new B(s); b.box(0.6, 0.85, 0.01, 0, 0, 0, pap("#FFFDF7"), 0.003); for (const x of [-0.27, 0.27]) b.box(0.07, 0.025, 0.014, x, 0.82, 0.002, pap("#FFE27A"), 0.004, { r: [0, 0, x * 0.5] }); g.add(b.done());
  const [cv, cx] = cvs(384, 544); drawPoster(cx, 384, 544, v % 6, c); const p = planeTex(s, 0.56, 0.8, canvasTex(cv)); p.position.set(0, 0.425, 0.0055); g.add(p); return g;
});
D("pennant", "Pennants", "wall", [0.9, 0.03, 0.4], ["#E8567C", "#F2B138", "#3FB68B", "#4F91C7", "#8D6BD4", "#F28C4E"], { wall: true, y0: 1.7 }, (s, c) => {
  const b = new B(s); const cols = [c, acc(c), "#FFC857", "#3FB68B", "#4F91C7"]; b.cylH(0.004, 0.9, 0, 0.395, 0, pla("#8A5A3A"), "x", 6);
  for (let i = 0; i < 5; i++) { const sh = new THREE.Shape(); sh.moveTo(-0.07, 0); sh.lineTo(0.07, 0); sh.lineTo(0, -0.3); sh.closePath(); b.add(new THREE.ShapeGeometry(sh), mk("cloth", cols[i], { side: THREE.DoubleSide }), [-0.36 + i * 0.18, 0.395, 0.004]);  }
  return b.done();
});
D("stringlights", "String lights", "wall", [2.4, 0.04, 0.3], ["#FFC857", "#FF8FB1", "#8FE3D4", "#B9A6FF", "#FFFFFF", "#FFA45E"], { wall: true, y0: 2.2 }, (s, c) => {
  const b = new B(s), pts: V3[] = []; const n = 17;
  for (let i = 0; i < n; i++) { const t = i / (n - 1), x = -1.15 + t * 2.3, y = 0.3 - Math.sin(t * Math.PI * 3) * 0.0 - Math.abs(Math.sin(t * Math.PI * 3)) * 0.13 - 0.0; if (i % 1 === 0) { b.sph(0.017, x, y - 0.02, 0.03, emi(i % 3 === 1 ? shade(c, 0.1, 0, 0.1) : c, 1.8), undefined, 8); pts.push([x, y - 0.02, 0.03]); } b.cylH(0.003, 0.15, x, y + 0.0, 0.015, pla("#2E3A33"), "x", 4); b.sph(0.006, x, 0.3, 0.01, met("#C9CED6"), undefined, 6); }
  const g = b.done(); addGlow(g, pts, c, 0.14, 0.3); return g;
});
D("wallshelf", "Wall shelf", "wall", [0.6, 0.18, 0.3], ["#F4EBDD", "#C98F58", "#E8567C", "#3FB68B", "#4F91C7", "#F2B138"], { wall: true, y0: 1.5, surface: 0.04 }, (s, c) => {
  const b = new B(s); b.box(0.6, 0.035, 0.18, 0, 0.06, 0, wood(c), 0.01); for (const x of [-0.22, 0.22]) b.box(0.025, 0.1, 0.12, x, -0.04 + 0.04, -0.03, met("#C9CED6"), 0.006, { r: [0, 0, 0] });
  b.cap(0.04, 0.06, 0.2, 0.15, 0, pla(VIV[1])); b.box(0.04, 0.12, 0.1, -0.2, 0.095, 0, pap(VIV[0]), 0.004); b.box(0.04, 0.14, 0.1, -0.15, 0.095, 0, pap(VIV[2]), 0.004); b.box(0.04, 0.1, 0.1, -0.1, 0.095, 0, pap(VIV[3]), 0.004); return b.done();
});
D("mirror", "Full-length mirror", "wall", [0.5, 0.06, 1.6], ["#C98F58", "#F4EBDD", "#2B2F3A", "#E8567C", "#F2B138", "#8D6BD4", "#3FB68B", "#4F91C7"], { core: true, wall: true, y0: 0.15 }, (s, c) => {
  const g = new THREE.Group(), fb = new B(s), w = wood(c);
  fb.box(0.5, 0.06, 0.05, 0, 0, 0.0, w, 0.02); fb.box(0.5, 0.06, 0.05, 0, 1.54, 0, w, 0.02); fb.box(0.06, 1.6, 0.05, -0.22, 0, 0, w, 0.02); fb.box(0.06, 1.6, 0.05, 0.22, 0, 0, w, 0.02); fb.box(0.38, 1.46, 0.02, 0, 0.07, -0.01, wood(shade(c, -0.25)), 0.003);
  fb.cap(0.02, 0.1, -0.15, 0.08, 0.03, mk("metal", "#FFD27A", { metal: 0.5 }), undefined); g.add(fb.done());
  const [cv, cx] = cvs(128, 512); const gr = cx.createLinearGradient(0, 0, 128, 512); gr.addColorStop(0, "#f3fbff"); gr.addColorStop(0.5, "#cdeaf7"); gr.addColorStop(1, "#e8f6ff"); cx.fillStyle = gr; cx.fillRect(0, 0, 128, 512);
  cx.fillStyle = "rgba(255,255,255,.7)"; cx.beginPath(); cx.moveTo(10, 0); cx.lineTo(60, 0); cx.lineTo(10, 180); cx.fill(); cx.beginPath(); cx.moveTo(70, 0); cx.lineTo(90, 0); cx.lineTo(20, 260); cx.lineTo(10, 260); cx.fill();
  cx.fillStyle = "rgba(120,150,170,.18)"; cx.fillRect(0, 330, 128, 182);
  const m = emissiveTex(s, 0.38, 1.46, canvasTex(cv), 0.55); m.position.set(0, 0.8, 0.0165); g.add(m); return g;
});
D("calendar", "Calendar", "wall", [0.3, 0.02, 0.4], ["#FFFFFF", "#FFE29A", "#B5DEFF", "#FFB3C7", "#B9F0D0", "#D6C2FF"], { wall: true, y0: 1.5 }, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.box(0.3, 0.4, 0.01, 0, 0, 0, pap(c), 0.004); b.box(0.3, 0.08, 0.012, 0, 0.32, 0.001, pap("#E8567C"), 0.004); b.sph(0.01, 0, 0.395, 0.01, met("#C9CED6"), undefined, 6); g.add(b.done());
  const [cv, cx] = cvs(240, 320); cx.fillStyle = "#2b2f3a"; cx.font = `800 20px ${FONT}`; cx.textAlign = "center"; cx.fillText("SEPTEMBER", 120, 40); cx.font = `600 18px ${FONT}`; for (let i = 0; i < 30; i++) { const col = i % 7, row = Math.floor(i / 7); cx.fillStyle = i === 11 ? "#e8567c" : "#555"; if (i === 11) { cx.beginPath(); cx.arc(30 + col * 30, 118 + row * 40 - 6, 14, 0, 7); cx.fill(); cx.fillStyle = "#fff"; } cx.fillText(String(i + 1), 30 + col * 30, 118 + row * 40); }
  const p = planeTex(s, 0.28, 0.3, canvasTex(cv), { transparent: true }); p.position.set(0, 0.15, 0.0055); g.add(p); return g;
});
D("whiteboard", "Whiteboard", "wall", [0.9, 0.04, 0.6], ["#FFFFFF", "#F4EBDD", "#B5DEFF", "#FFE29A", "#B9F0D0", "#FFB3C7"], { wall: true, y0: 1.2 }, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.box(0.9, 0.6, 0.03, 0, 0, 0, met("#C9CED6"), 0.012); b.box(0.84, 0.54, 0.01, 0, 0.03, 0.01, pla(c), 0.006); b.box(0.5, 0.03, 0.05, 0, -0.03, 0.02, met("#C9CED6"), 0.01); b.cylH(0.01, 0.1, -0.15, -0.0, 0.05, pla("#E8567C"), "x", 8); b.cylH(0.01, 0.1, -0.02, 0.0, 0.05, pla("#4F91C7"), "x", 8); g.add(b.done());
  const [cv, cx] = cvs(512, 340); cx.strokeStyle = "#4f91c7"; cx.lineWidth = 6; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(30, 60); cx.bezierCurveTo(80, 20, 120, 100, 170, 50); cx.stroke(); cx.fillStyle = "#e8567c"; cx.font = `800 36px ${FONT}`; cx.fillText("TO DO", 30, 140); cx.fillStyle = "#333"; cx.font = `600 28px ${FONT}`; cx.fillText("[x] math sheet", 30, 190); cx.fillText("[ ] science lab", 30, 235); cx.fillText("[ ] read ch. 4", 30, 280);
  cx.strokeStyle = "#3fb68b"; cx.beginPath(); cx.arc(400, 90, 40, 0, 7); cx.moveTo(400, 130); cx.lineTo(400, 230); cx.moveTo(400, 160); cx.lineTo(350, 200); cx.moveTo(400, 160); cx.lineTo(450, 200); cx.stroke();
  const p = planeTex(s, 0.84, 0.54, canvasTex(cv), { transparent: true }); p.position.set(0, 0.3, 0.0165); g.add(p); return g;
});
/* window with a living campus view */
function skyAt(h: number): [string, string] {
  const K: [number, string, string][] = [[0, "#0b1030", "#1d2a5c"], [5, "#0e1535", "#2a3470"], [6.5, "#5d6fd6", "#ffb184"], [8.5, "#4fa8ff", "#bfe6ff"], [16, "#4fa8ff", "#bfe6ff"], [18, "#a96fd0", "#ff9a62"], [19.5, "#2b2f6e", "#e0668a"], [21, "#0b1030", "#1d2a5c"], [24, "#0b1030", "#1d2a5c"]];
  let i = 0; while (i < K.length - 2 && h > K[i + 1][0]) i++; const a = K[i], b2 = K[i + 1], t = clamp01((h - a[0]) / (b2[0] - a[0]));
  return [mix(a[1], b2[1], t), mix(a[2], b2[2], t)];
}
function drawView(g: CanvasRenderingContext2D, w: number, h: number, hour: number) {
  const [top, bot] = skyAt(hour), night = nightFactor(hour), gr = g.createLinearGradient(0, 0, 0, h * 0.7); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const r = rng(12); if (night > 0.2) { g.fillStyle = `rgba(255,255,255,${night})`; for (let i = 0; i < 50; i++) { g.beginPath(); g.arc(r() * w, r() * h * 0.5, 0.8 + r() * 1.4, 0, 7); g.fill(); } }
  const ang = ((hour - 6) / 12) * Math.PI; if (hour > 6 && hour < 18) { g.fillStyle = "#fff3b0"; g.beginPath(); g.arc(w * (0.1 + 0.8 * (hour - 6) / 12), h * (0.5 - Math.sin(ang) * 0.38), 22, 0, 7); g.fill(); } else { const mh = (hour + 6) % 24; g.fillStyle = "#f4f1e0"; g.beginPath(); g.arc(w * (0.1 + 0.8 * (mh - 6) / 12 % 1), h * 0.2, 17, 0, 7); g.fill(); g.fillStyle = top; g.beginPath(); g.arc(w * (0.1 + 0.8 * (mh - 6) / 12 % 1) + 7, h * 0.2 - 4, 15, 0, 7); g.fill(); }
  if (night < 0.7) { g.fillStyle = `rgba(255,255,255,${0.85 - night})`; for (let i = 0; i < 4; i++) { const x = (r() * w * 1.2), y = 30 + r() * 80; g.beginPath(); g.ellipse(x, y, 45, 14, 0, 0, 7); g.ellipse(x + 25, y - 8, 30, 14, 0, 0, 7); g.ellipse(x - 26, y - 4, 26, 11, 0, 0, 7); g.fill(); } }
  const sh = (c: string) => mix(c, night > 0.5 ? "#0b1030" : "#ffffff", night > 0.5 ? 0.6 : 0.0);
  g.fillStyle = sh("#6f7fb0"); g.beginPath(); g.moveTo(0, h * 0.62); for (let x = 0; x <= w; x += 20) g.lineTo(x, h * 0.58 - Math.sin(x * 0.02) * 12); g.lineTo(w, h * 0.7); g.lineTo(0, h * 0.7); g.fill();
  g.fillStyle = sh("#b5654a"); g.fillRect(w * 0.08, h * 0.45, w * 0.36, h * 0.25); g.fillStyle = sh("#8f4a38"); g.fillRect(w * 0.08, h * 0.43, w * 0.36, 8);
  const win = night > 0.4 ? "#ffd27a" : "#9ed0f0"; for (let i = 0; i < 6; i++) for (let k = 0; k < 2; k++) { g.fillStyle = (i * 3 + k) % 4 === 0 && night > 0.4 ? "#3a3f66" : win; g.fillRect(w * 0.1 + i * w * 0.055, h * 0.48 + k * 38, 14, 22); }
  g.fillStyle = sh("#c9b79a"); g.fillRect(w * 0.6, h * 0.2, w * 0.1, h * 0.5); g.fillStyle = sh("#a2432f"); g.beginPath(); g.moveTo(w * 0.58, h * 0.2); g.lineTo(w * 0.65, h * 0.06); g.lineTo(w * 0.72, h * 0.2); g.fill();
  g.fillStyle = night > 0.4 ? "#ffe9a8" : "#fffdf0"; g.beginPath(); g.arc(w * 0.65, h * 0.3, 15, 0, 7); g.fill(); g.strokeStyle = "#333"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(w * 0.65, h * 0.3); g.lineTo(w * 0.65, h * 0.3 - 10); g.moveTo(w * 0.65, h * 0.3); g.lineTo(w * 0.65 + 7, h * 0.3 + 3); g.stroke();
  const lg = g.createLinearGradient(0, h * 0.68, 0, h); lg.addColorStop(0, sh("#58b947")); lg.addColorStop(1, sh("#2f8f4a")); g.fillStyle = lg; g.fillRect(0, h * 0.68, w, h * 0.32);
  g.strokeStyle = sh("#e8d9b0"); g.lineWidth = 16; g.beginPath(); g.moveTo(w * 0.35, h); g.quadraticCurveTo(w * 0.5, h * 0.8, w * 0.65, h * 0.7); g.stroke();
  for (let i = 0; i < 8; i++) { const x = (i * 0.13 + 0.03) * w + (i % 2) * 14, y = h * (0.66 + (i % 3) * 0.04), rad = 24 + (i % 3) * 8; g.fillStyle = sh("#6b4a2a"); g.fillRect(x - 3, y, 6, 30); g.fillStyle = sh(["#2e9e5b", "#3fb68b", "#f28c4e", "#e8567c"][i % 4 === 3 ? 2 : i % 3]); g.beginPath(); g.arc(x, y - 4, rad, 0, 7); g.arc(x - rad * 0.6, y + 8, rad * 0.7, 0, 7); g.arc(x + rad * 0.6, y + 8, rad * 0.7, 0, 7); g.fill(); }
  if (night > 0.3) for (const x of [0.3, 0.52, 0.8]) { g.fillStyle = "#333"; g.fillRect(w * x - 2, h * 0.78, 4, 40); const lg2 = g.createRadialGradient(w * x, h * 0.78, 0, w * x, h * 0.78, 40); lg2.addColorStop(0, `rgba(255,220,140,${night})`); lg2.addColorStop(1, "rgba(255,220,140,0)"); g.fillStyle = lg2; g.fillRect(w * x - 40, h * 0.78 - 40, 80, 80); }
}
D("window", "Window", "wall", [1.2, 0.14, 1.3], ["#FFB3C7", "#B5DEFF", "#FFE29A", "#B9F0D0", "#D6C2FF", "#E8567C", "#3FB68B", "#F28C4E"], { core: true, wall: true, y0: 0.95 }, (s, c) => {
  const g = new THREE.Group(), b = new B(s), fr = wood("#FBF6EC");
  b.box(1.2, 0.07, 0.1, 0, 0, 0, fr, 0.02); b.box(1.2, 0.07, 0.1, 0, 1.15, 0, fr, 0.02); b.box(0.07, 1.22, 0.1, -0.565, 0, 0, fr, 0.02); b.box(0.07, 1.22, 0.1, 0.565, 0, 0, fr, 0.02); b.box(0.04, 1.1, 0.07, 0, 0.07, 0, fr, 0.01); b.box(1.06, 0.04, 0.07, 0, 0.62, 0, fr, 0.01);
  b.box(1.36, 0.045, 0.2, 0, -0.04, 0.05, fr, 0.015);
  const cur = fab(c), cur2 = fab(shade(c, -0.1)); b.cylH(0.012, 1.5, 0, 1.3, 0.1, met("#FFD27A"), "x", 8); b.sph(0.025, -0.76, 1.3, 0.1, met("#FFD27A"), undefined, 8); b.sph(0.025, 0.76, 1.3, 0.1, met("#FFD27A"), undefined, 8);
  for (const sg of [-1, 1]) for (let i = 0; i < 4; i++) b.cap(0.04, 1.05 - (i % 2) * 0.03, sg * (0.68 + i * 0.045 - 0.03 * 0), 0.65, 0.115 + (i % 2) * 0.012, i % 2 ? cur2 : cur, { r: [0, 0, sg * 0.03] });
  b.tor(0.03, 0.01, 0.57, 0.62, 0.12, fab(shade(c, 0.1)), { r: [0, 0, 0] }, 6.2);
  b.box(0.2, 0.14, 0.1, -0.35, 0.0, 0.1, pla(VIV[1]), 0.02, { r: [0, 0, 0] }); for (let k = 0; k < 4; k++) b.cap(0.015, 0.12, -0.38 + k * 0.025, 0.2, 0.1, fab(GREEN[k % 3]), { r: [0, 0, (k - 1.5) * 0.25] });
  g.add(b.done());
  const [cv, cx] = cvs(512, 560); drawView(cx, 512, 560, 13); const tex = canvasTex(cv); const v = emissiveTex(s, 1.06, 1.15, tex, 0.95); v.position.set(0, 0.07 + 0.575, -0.02); g.add(v);
  let last = -99; ud(g).setHour = (h: number) => { if (Math.abs(h - last) < 0.2) return; last = h; drawView(cx, 512, 560, h); tex.needsUpdate = true; }; return g;
});
D("door", "Door", "wall", [0.9, 0.12, 2.05], ["#B5733C", "#8A5A3A", "#E8567C", "#3FB68B", "#4F91C7", "#F2B138", "#8D6BD4", "#F4EBDD"], { core: true, wall: true, y0: 0 }, (s, c) => {
  const g = new THREE.Group(), b = new B(s), fr = wood("#FBF6EC"); b.box(0.9, 0.06, 0.12, 0, 1.99, 0, fr, 0.015); b.box(0.06, 2.05, 0.12, -0.42, 0, 0, fr, 0.015); b.box(0.06, 2.05, 0.12, 0.42, 0, 0, fr, 0.015);
  b.box(0.78, 1.98, 0.05, 0, 0, 0.0, wood(c), 0.012); b.box(0.5, 0.7, 0.012, 0, 1.15, 0.03, wood(shade(c, 0.08)), 0.01); b.box(0.5, 0.7, 0.012, 0, 0.25, 0.03, wood(shade(c, 0.08)), 0.01);
  b.sph(0.035, 0.3, 1.0, 0.07, met("#FFD27A")); b.cylH(0.009, 0.06, 0.3, 1.0, 0.045, met("#FFD27A"), "z", 8); b.sph(0.012, 0, 1.65, 0.03, met("#C9CED6"), { s: [1, 1, 0.5] }, 8);
  b.box(0.2, 0.12, 0.01, -0.17, 1.82, 0.04, pap("#FFF7E0"), 0.004, { r: [0, 0, 0.04] });
  for (let i = 0; i < 2; i++) b.cap(0.012, 0.05, -0.28 + i * 0.1, 1.5, 0.07, met("#C9CED6"), { r: [Math.PI / 2, 0, 0] });
  g.add(b.done());
  const [cv, cx] = cvs(256, 160); cx.fillStyle = "#fff7e0"; cx.fillRect(0, 0, 256, 160); cx.fillStyle = "#e8567c"; cx.font = `900 46px ${FONT}`; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText("MY DORM", 128, 62); cx.fillStyle = "#555"; cx.font = `600 22px ${FONT}`; cx.fillText("knock first!", 128, 118);
  const p = planeTex(s, 0.2, 0.125, canvasTex(cv)); p.position.set(-0.17, 1.82 + 0.06, 0.0455); p.rotation.z = 0.04; g.add(p); return g;
});

/* ================================================================== FLOOR (rugs) */
const rugBase = (id: string, name: string, size: V3, cols: string[], build: Build) => D(id, name, "floor", size, cols, { flat: true }, build);
const RUGC = ["#E8567C", "#4F91C7", "#F2B138", "#3FB68B", "#8D6BD4", "#2BB5C9", "#F28C4E", "#F4EBDD"];
rugBase("ruground", "Round rug", [1.8, 1.8, 0.02], RUGC, (s, c) => { const b = new B(s); const rings = [[0.9, c], [0.72, shade(c, 0.22)], [0.56, acc(c)], [0.4, shade(c, 0.3)], [0.22, shade(c, -0.1)]] as [number, string][]; rings.forEach(([r, col], i) => b.cyl(r, r, 0.012 + i * 0.002, 0, 0, 0, mk("rug", col), undefined, 40)); b.tor(0.9, 0.008, 0, 0.01, 0, mk("rug", shade(c, -0.12)), { r: [Math.PI / 2, 0, 0] }); return b.done(); });
rugBase("rugrect", "Rectangle rug", [1.6, 1.1, 0.02], RUGC, (s, c) => { const b = new B(s), r = mk("rug", c); b.box(1.6, 0.014, 1.1, 0, 0, 0, r, 0.006); b.box(1.38, 0.016, 0.88, 0, 0, 0, mk("rug", shade(c, 0.25)), 0.005); b.box(1.2, 0.018, 0.7, 0, 0, 0, mk("rug", acc(c)), 0.005); for (let i = 0; i < 16; i++) for (const sg of [-1, 1]) b.box(0.014, 0.01, 0.05, -0.75 + i * 0.1, 0, sg * 0.57, mk("rug", "#F4EBDD"), 0); return b.done(); });
rugBase("rugshag", "Shaggy rug", [1.5, 1.5, 0.04], RUGC, (s, c) => { const b = new B(s), r = rng(6); b.cyl(0.7, 0.7, 0.025, 0, 0, 0, mk("rug", c), undefined, 28); const f = mk("rug", shade(c, 0.04)); for (let i = 0; i < 160; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * 0.66; b.sph(0.04, Math.cos(a) * d, 0.03, Math.sin(a) * d, i % 3 ? f : mk("rug", shade(c, -0.04)), { s: [1, 0.45, 1] }, 6); } return b.done(); });
rugBase("rugpattern", "Patterned rug", [1.7, 1.2, 0.02], RUGC, (s, c) => {
  const g = new THREE.Group(), [cv, cx] = cvs(512, 360); cx.fillStyle = shade(c, 0.3); cx.fillRect(0, 0, 512, 360); const d = shade(c, -0.1), a = acc(c);
  for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) { const px = 40 + x * 72, py = 30 + y * 74; cx.fillStyle = (x + y) % 2 ? d : a; cx.beginPath(); cx.moveTo(px, py - 30); cx.lineTo(px + 34, py); cx.lineTo(px, py + 30); cx.lineTo(px - 34, py); cx.fill(); cx.fillStyle = "#fff"; cx.beginPath(); cx.arc(px, py, 6, 0, 7); cx.fill(); }
  cx.strokeStyle = c; cx.lineWidth = 16; cx.strokeRect(8, 8, 496, 344);
  const m = planeTex(s, 1.7, 1.2, canvasTex(cv), {}, "rug"); m.rotation.x = -Math.PI / 2; m.position.y = 0.012; g.add(m); const b = new B(s); b.box(1.7, 0.01, 1.2, 0, 0, 0, mk("rug", c), 0.004); g.add(b.done()); return g;
});

/* ================================================================== LIGHT */
D("floorlamp", "Floor lamp", "light", [0.36, 0.36, 1.6], ["#FFC857", "#E8567C", "#4F91C7", "#3FB68B", "#F4EBDD", "#8D6BD4"], {}, (s, c) => {
  const b = new B(s); b.cyl(0.15, 0.17, 0.03, 0, 0, 0, met("#2B2F3A")); b.cap(0.012, 1.1, 0, 0.58, 0, met("#2B2F3A")); b.lathe([[0.1, 0], [0.18, 0.28], [0.17, 0.3], [0.09, 0.02]], 0, 1.2, 0, mk("emissive", c, { emissive: c, emissiveIntensity: 0.9, side: THREE.DoubleSide }), undefined, 24); b.sph(0.035, 0, 1.38, 0, emi("#FFF2C2", 2), undefined, 8);
  const g = b.done(); addGlow(g, [[0, 1.35, 0]], "#FFC857", 0.7, 0.18); return g;
});
D("desklamp", "Desk lamp", "light", [0.26, 0.2, 0.42], ["#F2B138", "#E8567C", "#4F91C7", "#3FB68B", "#F4EBDD", "#2B2F3A", "#8D6BD4", "#2BB5C9"], {}, (s, c) => {
  const b = new B(s), m = paint(c); b.cyl(0.07, 0.08, 0.02, 0, 0, 0, m, undefined, 16); b.cap(0.01, 0.2, 0, 0.12, 0, m, { r: [0, 0, 0.35] }); b.cap(0.01, 0.2, 0.07, 0.3, 0, m, { r: [0, 0, -0.5] }); b.sph(0.016, 0, 0.21, 0, m, undefined, 8);
  b.lathe([[0.03, 0], [0.09, 0.11], [0.085, 0.115], [0.025, 0.01]], 0.1, 0.27, 0, mk("emissive", shade(c, 0.1), { emissive: c, emissiveIntensity: 0.5, side: THREE.DoubleSide }), { r: [0, 0, -0.6] }, 20); b.sph(0.02, 0.13, 0.24, 0, emi("#FFF2C2", 2), undefined, 8);
  const g = b.done(); addGlow(g, [[0.13, 0.24, 0]], "#FFC857", 0.35, 0.18); return g;
});
D("fairyjar", "Fairy-light jar", "light", [0.12, 0.12, 0.18], ["#FFC857", "#FF8FB1", "#8FE3D4", "#B9A6FF", "#FFFFFF", "#FFA45E"], {}, (s, c) => {
  const b = new B(s), pts: V3[] = []; b.lathe([[0.001, 0], [0.05, 0], [0.058, 0.08], [0.04, 0.14], [0.035, 0.15]], 0, 0, 0, gla("#fff", 0.2), undefined, 14); b.cyl(0.04, 0.04, 0.025, 0, 0.15, 0, wood("#C98F58"), undefined, 12);
  const r = rng(9); for (let i = 0; i < 9; i++) { const p: V3 = [(r() - 0.5) * 0.07, 0.02 + r() * 0.11, (r() - 0.5) * 0.07]; b.sph(0.008, p[0], p[1], p[2], emi(c, 2), undefined, 6); pts.push(p); }
  const g = b.done(); addGlow(g, pts, c, 0.07, 0.35); return g;
});
D("neon", "Neon sign", "light", [0.7, 0.05, 0.28], ["#FF4FA3", "#3DE0FF", "#FFE14F", "#7CFF8B", "#B58CFF", "#FF8A3D"], { wall: true, y0: 1.9 }, (s, c) => {
  const g = new THREE.Group(), b = new B(s); b.box(0.7, 0.28, 0.012, 0, 0, 0, gla("#223", 0.45), 0.02); b.cap(0.006, 0.05, -0.3, 0.005, 0.01, met("#C9CED6")); b.cap(0.006, 0.05, 0.3, 0.005, 0.01, met("#C9CED6")); g.add(b.done());
  const [cv, cx] = cvs(512, 200); const draw = (t: string) => { cx.clearRect(0, 0, 512, 200); cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = `800 130px ${FONT}`; for (const [lw, col] of [[26, shade(c, -0.15) + "66"], [14, c + "aa"]] as [number, string][]) { cx.strokeStyle = col; cx.lineWidth = lw; cx.lineJoin = "round"; cx.strokeText(t, 256, 100); } cx.strokeStyle = "#fff"; cx.lineWidth = 5; cx.strokeText(t, 256, 100); };
  draw("UNIFY"); const tex = canvasTex(cv), p = planeTex(s, 0.66, 0.26, tex, { emissive: 0xffffff, emissiveIntensity: 1.3, transparent: true }, "emissive"); p.position.set(0, 0.14, 0.009); g.add(p);
  addGlow(g, [[-0.22, 0.14, 0.03], [0, 0.14, 0.03], [0.22, 0.14, 0.03]], c, 0.5, 0.3);
  ud(g).setText = (t: string) => { draw(t || "UNIFY"); tex.needsUpdate = true; }; return g;
});
D("nightlight", "Night light", "light", [0.1, 0.06, 0.1], ["#FFC857", "#FF8FB1", "#8FE3D4", "#B9A6FF", "#FFFFFF", "#FFA45E"], { wall: true, y0: 0.5 }, (s, c) => {
  const b = new B(s); b.box(0.08, 0.1, 0.02, 0, 0, 0, pla("#F4EBDD"), 0.008); b.sph(0.04, 0, 0.05, 0.03, emi(c, 1.6), { s: [1, 1, 0.8] }, 12); const g = b.done(); addGlow(g, [[0, 0.05, 0.06]], c, 0.3, 0.3); return g;
});

/* ================================================================== PLANTS */
const pot = (b: B, c: string, r: number, h: number) => { b.lathe([[0, 0], [r * 0.7, 0], [r, h], [r * 1.05, h], [r * 1.05, h * 1.05]], 0, 0, 0, mk("plastic", c, { rough: 0.7 })); b.cyl(r * 0.95, r * 0.95, 0.01, 0, h * 0.9, 0, mk("rug", "#5B3A29"), undefined, 16); };
D("monstera", "Monstera", "plant", [0.7, 0.7, 1.05], ["#E8567C", "#F4EBDD", "#F2B138", "#4F91C7", "#8D6BD4", "#C98F58", "#2B2F3A", "#3FB68B"], {}, (s, c) => {
  const b = new B(s), r = rng(1); pot(b, c, 0.14, 0.26);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283 + r(), lean = 0.12 + r() * 0.38, len = 0.45 + r() * 0.35, col = GREEN[i % 2]; const tx = Math.sin(a) * Math.sin(lean) * len, tz = Math.cos(a) * Math.sin(lean) * len, ty = 0.26 + Math.cos(lean) * len;
    b.cap(0.009, len, tx / 2, 0.26 + (ty - 0.26) / 2, tz / 2, mk("plastic", "#4F9D3F"), { r: [Math.sin(a) * 0 + tz * 1.6, 0, -tx * 1.6] }); const lf = mk("plastic", col, { rough: 0.5 });
    b.sph(1, tx, ty, tz, lf, { s: [0.13, 0.016, 0.1], r: [0, a, 0.0] }, 8); b.sph(1, tx + Math.sin(a) * 0.04, ty + 0.01, tz + Math.cos(a) * 0.04, mk("plastic", "#4F9D3F"), { s: [0.015, 0.01, 0.08], r: [0, a, 0] }, 5); }
  return b.done();
});
D("cactus", "Cactus", "plant", [0.24, 0.24, 0.5], ["#F2B138", "#E8567C", "#F4EBDD", "#4F91C7", "#3FB68B", "#8D6BD4"], {}, (s, c) => {
  const b = new B(s), gr = mk("plastic", "#3FA66B", { rough: 0.8 }); pot(b, c, 0.09, 0.14);
  b.cap(0.05, 0.2, 0, 0.3, 0, gr); b.cap(0.025, 0.08, 0.075, 0.28, 0, gr, { r: [0, 0, 0.3] }); b.cap(0.02, 0.09, 0.1, 0.34, 0, gr); b.cap(0.022, 0.07, -0.07, 0.25, 0, gr, { r: [0, 0, -0.3] }); b.cap(0.018, 0.07, -0.085, 0.3, 0, gr);
  for (let i = 0; i < 14; i++) { const a = i * 1.1; b.sph(0.005, Math.sin(a) * 0.05, 0.22 + (i % 5) * 0.04, Math.cos(a) * 0.05, pla("#FFF2C2"), undefined, 4); } b.sph(0.022, 0, 0.5, 0, pla("#FF5D8F"), undefined, 8); b.sph(0.01, 0, 0.52, 0, pla("#FFE14F"), undefined, 6); return b.done();
});
D("succulents", "Succulents", "plant", [0.32, 0.14, 0.2], ["#F4EBDD", "#E8567C", "#F2B138", "#4F91C7", "#8D6BD4", "#2B2F3A"], {}, (s, c) => {
  const b = new B(s); b.box(0.32, 0.07, 0.14, 0, 0, 0, pla(c), 0.025); b.box(0.29, 0.01, 0.11, 0, 0.065, 0, mk("rug", "#5B3A29"), 0.003);
  for (let k = 0; k < 3; k++) { const x = -0.09 + k * 0.09, col = [GREEN[0], "#7FCFC0", "#C98FD1"][k]; for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; b.sph(0.02, x + Math.sin(a) * 0.02, 0.1 + (i % 2) * 0.012, Math.cos(a) * 0.02, mk("plastic", i % 2 ? shade(col, 0.08) : col), { s: [0.55, 1.5, 0.55], r: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9] }, 6); } b.sph(0.012, x, 0.1, 0, mk("plastic", shade(col, 0.2)), undefined, 6); }
  return b.done();
});
D("hangplant", "Hanging plant", "plant", [0.3, 0.3, 0.9], ["#F4EBDD", "#E8567C", "#F2B138", "#4F91C7", "#8D6BD4", "#C98F58"], { wall: true, y0: 1.5 }, (s, c) => {
  const b = new B(s), r = rng(5); b.sph(0.02, 0, 0.88, -0.1, met("#C9CED6"), undefined, 8); b.cylH(0.01, 0.1, 0, 0.88, -0.05, wood("#8A5A3A"), "z", 6);
  for (const a of [0, 2.1, 4.2]) b.cap(0.004, 0.45, Math.sin(a) * 0.07, 0.66, 0.1 + Math.cos(a) * 0.07 - 0.1 * 0 - 0.1, fab("#F4EBDD"), { r: [Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12] });
  b.lathe([[0, 0], [0.08, 0], [0.11, 0.1], [0.1, 0.11]], 0, 0.44, 0, fab(c), undefined, 16);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * 6.283, l = 0.15 + r() * 0.3; b.cap(0.006, l, Math.sin(a) * 0.1, 0.44 - l / 2 + 0.02, Math.cos(a) * 0.1, mk("plastic", "#4F9D3F"), { r: [Math.cos(a) * 0.1, 0, -Math.sin(a) * 0.1] }); for (let k = 0; k < 3; k++) b.sph(0.03, Math.sin(a) * 0.1, 0.44 - (k + 0.6) * l / 3.5, Math.cos(a) * 0.1, mk("plastic", GREEN[(i + k) % 6]), { s: [1, 0.6, 1], r: [0, a, 0.5] }, 6); }
  return b.done();
});
D("fern", "Fern", "plant", [0.5, 0.5, 0.55], ["#3FB68B", "#F4EBDD", "#E8567C", "#F2B138", "#4F91C7", "#8D6BD4"], {}, (s, c) => {
  const b = new B(s), r = rng(10); pot(b, c, 0.12, 0.2);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * 6.283, l = 0.3 + r() * 0.22, tilt = 0.3 + r() * 0.4; for (let k = 1; k <= 5; k++) { const d = (k / 5) * l * Math.sin(tilt), y = 0.2 + (k / 5) * l * Math.cos(tilt) - (k / 5) * (k / 5) * 0.1; b.sph(0.03, Math.sin(a) * d, y, Math.cos(a) * d, mk("plastic", GREEN[(i + k) % 6]), { s: [1.4 - k * 0.15, 0.3, 0.5], r: [0, a + 1.57, 0] }, 5); } }
  return b.done();
});
D("snakeplant", "Snake plant", "plant", [0.3, 0.3, 0.9], ["#F2B138", "#F4EBDD", "#E8567C", "#4F91C7", "#3FB68B", "#2B2F3A"], {}, (s, c) => {
  const b = new B(s), r = rng(15); pot(b, c, 0.12, 0.22);
  for (let i = 0; i < 9; i++) { const a = (i / 9) * 6.283, d = 0.04 + r() * 0.04, h = 0.35 + r() * 0.35; const col = i % 2 ? "#2E8B57" : "#3FA66B"; b.sph(1, Math.sin(a) * d, 0.22 + h / 2, Math.cos(a) * d, mk("plastic", col, { rough: 0.55 }), { s: [0.025, h / 2, 0.012], r: [0, a, Math.sin(a) * 0.1] }, 8); b.sph(1, Math.sin(a) * d, 0.22 + h / 2, Math.cos(a) * d + 0.0, mk("plastic", "#C9E27A"), { s: [0.005, h / 2 - 0.02, 0.0135], r: [0, a, Math.sin(a) * 0.1] }, 5); }
  return b.done();
});
