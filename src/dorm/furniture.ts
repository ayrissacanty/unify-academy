// furniture.ts — the dorm room's furniture catalog, placement rules, and low-poly builders.
// Every piece is a small three.js group; the dorm scene (room.ts) asks this module to build and place them.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/* ---------------- catalog ---------------- */
export type FurnCat = "sleep" | "study" | "decor" | "play" | "nature";
export interface FurnDef {
  id: string;            // stable key saved in the room layout
  name: string;          // button label
  emo: string;           // picker emoji
  cat: FurnCat;
  w: number; d: number;  // floor footprint in meters (x by z)
  h: number;             // height, for the picker blurb
  wall?: boolean;        // hugs the back wall when placed
  desk?: boolean;        // counts as a desk (laptop sits here)
  seat?: boolean;        // the kid can sit on it
  rug?: boolean;         // lies flat, things can go on top
  build: (style: Style) => THREE.Group;
}
export interface Style { wall: string; floor: string; trim: string; fabric: string; wood: string; accent: string; lamp: string; pixar?: boolean }

const M = (color: string, rough = 0.9, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, round = 0) => {
  const g = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(round, Math.min(w, h, d) / 2 - 0.001)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
};
const cyl = (r0: number, r1: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12) => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
};
const sph = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0, wSeg = 12, hSeg = 9) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, wSeg, hSeg), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
};

/* ---------------- builders (each returns a group with its feet at y=0, centered on x/z) ---------------- */
function bed(s: Style) {
  const g = new THREE.Group();
  g.add(box(2.0, 0.28, 1.15, M(s.wood), 0, 0.24, 0, 0.04));
  g.add(box(1.95, 0.18, 1.08, M("#FFF6E8"), 0, 0.44, 0, 0.05));
  g.add(box(1.15, 0.1, 1.06, M(s.fabric), -0.38, 0.55, 0, 0.04));
  g.add(box(0.5, 0.1, 0.62, M("#FFFFFF"), 0.62, 0.55, 0, 0.05));
  g.add(box(0.1, 0.75, 1.15, M(s.wood), 1.0, 0.55, 0, 0.03));
  g.add(box(0.1, 0.5, 1.15, M(s.wood), -1.0, 0.42, 0, 0.03));
  return g;
}
function bunk(s: Style) {
  const g = new THREE.Group();
  for (const lvl of [0.55, 1.35]) {
    g.add(box(2.0, 0.14, 1.1, M(s.wood), 0, lvl, 0, 0.03));
    g.add(box(1.92, 0.14, 1.02, M("#FFF6E8"), 0, lvl + 0.14, 0, 0.04));
    g.add(box(0.95, 0.07, 0.98, M(lvl > 1 ? s.accent : s.fabric), -0.45, lvl + 0.24, 0, 0.03));
  }
  for (const [x, z] of [[-0.95, -0.5], [0.95, -0.5], [-0.95, 0.5], [0.95, 0.5]]) g.add(cyl(0.045, 0.045, 1.9, M(s.wood), x, 0.95, z));
  for (let i = 0; i < 4; i++) g.add(box(0.3, 0.05, 0.06, M(s.wood), -0.95, 0.35 + i * 0.35, 0.52));
  return g;
}
function desk(s: Style) {
  const g = new THREE.Group();
  g.add(box(1.4, 0.06, 0.7, M(s.wood), 0, 0.74, 0, 0.02));
  for (const [x, z] of [[-0.64, -0.3], [0.64, -0.3], [-0.64, 0.3], [0.64, 0.3]]) g.add(box(0.07, 0.72, 0.07, M(s.wood), x, 0.37, z));
  g.add(box(0.42, 0.34, 0.05, M("#26313F"), 0.18, 1.0, -0.18, 0.02));
  g.add(box(0.36, 0.22, 0.02, new THREE.MeshStandardMaterial({ color: "#9FD8FF", emissive: "#5EB4E8", emissiveIntensity: 0.55 }), 0.18, 1.0, -0.15));
  g.add(box(0.34, 0.05, 0.2, M(s.accent), -0.42, 0.8, 0.12));
  return g;
}
function chair(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.44, 0.05, 0.44, M(s.fabric), 0, 0.46, 0, 0.03));
  for (const [x, z] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.add(cyl(0.025, 0.025, 0.45, M(s.wood), x, 0.23, z));
  g.add(box(0.44, 0.5, 0.05, M(s.fabric), 0, 0.75, -0.2, 0.03));
  return g;
}
function beanbag(s: Style) {
  const g = new THREE.Group();
  const b = sph(0.42, M(s.fabric, 1), 0, 0.3, 0, 14, 10); b.scale.set(1.15, 0.75, 1.15); g.add(b);
  g.add(sph(0.16, M(s.accent, 1), 0.1, 0.48, 0.06, 9, 7));
  return g;
}
function bookshelf(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.9, 1.7, 0.3, M(s.wood), 0, 0.85, 0, 0.02));
  const cols = ["#E23B4A", "#2E86C1", "#1F9A78", "#F0B429", "#8E7CC3", "#E8833A"];
  for (let shelf = 0; shelf < 4; shelf++) {
    g.add(box(0.82, 0.03, 0.26, M("#6B4A33"), 0, 0.32 + shelf * 0.4, 0));
    let x = -0.36;
    for (let b = 0; b < 5 + (shelf % 2); b++) { const w = 0.05 + ((b * 7 + shelf) % 3) * 0.02; g.add(box(w, 0.26, 0.2, M(cols[(b + shelf * 3) % 6]), x, 0.47 + shelf * 0.4, 0)); x += w + 0.025; }
  }
  return g;
}
function dresser(s: Style) {
  const g = new THREE.Group();
  g.add(box(1.0, 0.85, 0.48, M(s.wood), 0, 0.45, 0, 0.02));
  for (let i = 0; i < 3; i++) { g.add(box(0.9, 0.2, 0.03, M(s.trim), 0, 0.22 + i * 0.26, 0.25)); g.add(cyl(0.02, 0.02, 0.04, M("#E8C56B", 0.5, 0.6), 0, 0.22 + i * 0.26, 0.28, 8)); }
  return g;
}
function wardrobe(s: Style) {
  const g = new THREE.Group();
  g.add(box(1.1, 1.95, 0.55, M(s.wood), 0, 0.99, 0, 0.02));
  g.add(box(0.02, 1.8, 0.02, M(s.trim), 0, 1.0, 0.28));
  g.add(cyl(0.025, 0.025, 0.05, M("#E8C56B", 0.5, 0.6), -0.08, 1.0, 0.29, 8));
  g.add(cyl(0.025, 0.025, 0.05, M("#E8C56B", 0.5, 0.6), 0.08, 1.0, 0.29, 8));
  return g;
}
function nightstand(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.5, 0.45, 0.42, M(s.wood), 0, 0.24, 0, 0.02));
  g.add(box(0.4, 0.12, 0.03, M(s.trim), 0, 0.3, 0.22));
  return g;
}
function lamp(s: Style) {
  const g = new THREE.Group();
  g.add(cyl(0.04, 0.06, 0.5, M(s.wood), 0, 0.25, 0));
  g.add(cyl(0.2, 0.28, 0.28, new THREE.MeshStandardMaterial({ color: s.lamp, emissive: s.lamp, emissiveIntensity: 0.5 }), 0, 0.62, 0));
  return g;
}
function floorlamp(s: Style) {
  const g = new THREE.Group();
  g.add(cyl(0.03, 0.05, 1.5, M("#3A3632"), 0, 0.75, 0));
  g.add(cyl(0.22, 0.3, 0.3, new THREE.MeshStandardMaterial({ color: s.lamp, emissive: s.lamp, emissiveIntensity: 0.55 }), 0, 1.6, 0));
  return g;
}
function rug(s: Style) {
  const g = new THREE.Group();
  const r = cyl(0.85, 0.85, 0.02, M(s.fabric, 1), 0, 0.012, 0, 24); r.receiveShadow = true; r.castShadow = false; g.add(r);
  const ring = cyl(0.6, 0.6, 0.021, M(s.accent, 1), 0, 0.013, 0, 24); ring.castShadow = false; g.add(ring);
  const dot = cyl(0.3, 0.3, 0.022, M(s.fabric, 1), 0, 0.014, 0, 20); dot.castShadow = false; g.add(dot);
  return g;
}
function plant(s: Style) {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.12, 0.26, M("#C4553A"), 0, 0.14, 0));
  g.add(sph(0.24, M("#2F9A56", 0.85), 0, 0.44, 0, 10, 8));
  g.add(sph(0.16, M("#3CB371", 0.85), 0.12, 0.6, 0.06, 8, 6));
  g.add(sph(0.14, M("#1F8A45", 0.85), -0.12, 0.56, -0.04, 8, 6));
  void s;
  return g;
}
function poster(s: Style) {
  const g = new THREE.Group();
  const cv = document.createElement("canvas"); cv.width = 128; cv.height = 176; const c = cv.getContext("2d")!;
  const grad = c.createLinearGradient(0, 0, 0, 176); grad.addColorStop(0, s.accent); grad.addColorStop(1, s.fabric);
  c.fillStyle = grad; c.fillRect(0, 0, 128, 176);
  c.fillStyle = "rgba(255,255,255,.85)"; c.font = "700 84px Georgia, serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("★", 64, 92);
  c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 6; c.strokeRect(6, 6, 116, 164);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const p = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.85), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
  p.position.y = 0.5; p.castShadow = false; g.add(p);
  return g;
}
function trophyShelf(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.9, 0.05, 0.24, M(s.wood), 0, 0.6, 0));
  for (const x of [-0.28, 0, 0.28]) {
    g.add(cyl(0.05, 0.07, 0.16, M("#F0B429", 0.35, 0.8), x, 0.71, 0));
    g.add(cyl(0.02, 0.02, 0.05, M("#C4922A", 0.4, 0.8), x, 0.62, 0));
  }
  return g;
}
function toybox(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.8, 0.42, 0.45, M(s.accent), 0, 0.22, 0, 0.04));
  g.add(box(0.84, 0.08, 0.49, M(s.fabric), 0, 0.47, 0, 0.03));
  g.add(sph(0.09, M("#E23B4A"), -0.2, 0.56, 0));
  g.add(box(0.14, 0.14, 0.14, M("#2E86C1"), 0.12, 0.58, 0.05, 0.02));
  return g;
}
function rocket(s: Style) {
  const g = new THREE.Group();
  g.add(cyl(0.16, 0.16, 0.62, M("#F4F1E8", 0.5), 0, 0.5, 0));
  g.add(cyl(0.0, 0.16, 0.28, M(s.accent, 0.5), 0, 0.95, 0));
  for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const f = box(0.04, 0.24, 0.16, M("#E23B4A"), Math.cos(a) * 0.17, 0.24, Math.sin(a) * 0.17); f.rotation.y = -a; g.add(f); }
  g.add(cyl(0.05, 0.09, 0.1, M("#F0B429"), 0, 0.14, 0));
  return g;
}
function telescope(s: Style) {
  const g = new THREE.Group();
  const tube = cyl(0.05, 0.06, 0.55, M("#4A5A6A", 0.4, 0.7), 0, 0.72, 0); tube.rotation.z = -0.7; g.add(tube);
  g.add(cyl(0.02, 0.02, 0.6, M(s.wood), -0.08, 0.3, 0.08));
  g.add(cyl(0.02, 0.02, 0.6, M(s.wood), 0.12, 0.3, 0.1));
  g.add(cyl(0.02, 0.02, 0.6, M(s.wood), 0, 0.3, -0.14));
  return g;
}
function easel(s: Style) {
  const g = new THREE.Group();
  for (const a of [-0.18, 0.18]) { const leg = cyl(0.02, 0.02, 1.1, M(s.wood), a * 1.4, 0.55, 0); leg.rotation.z = a; g.add(leg); }
  const back = cyl(0.02, 0.02, 1.0, M(s.wood), 0, 0.5, -0.18); back.rotation.x = 0.3; g.add(back);
  const cv = document.createElement("canvas"); cv.width = 96; cv.height = 128; const c = cv.getContext("2d")!;
  c.fillStyle = "#FFFCF4"; c.fillRect(0, 0, 96, 128); c.fillStyle = s.accent; c.beginPath(); c.arc(48, 52, 24, 0, 7); c.fill(); c.fillStyle = "#2E86C1"; c.fillRect(28, 88, 40, 24);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const art = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.6), new THREE.MeshStandardMaterial({ map: tex }));
  art.position.set(0, 0.72, 0.06); art.rotation.x = -0.08; g.add(art);
  return g;
}
function drum(s: Style) {
  const g = new THREE.Group();
  g.add(cyl(0.24, 0.24, 0.3, M(s.accent), 0, 0.3, 0, 16));
  g.add(cyl(0.25, 0.25, 0.02, M("#F8F2E2"), 0, 0.46, 0, 16));
  const s1 = cyl(0.012, 0.012, 0.3, M(s.wood), -0.1, 0.6, 0); s1.rotation.z = 0.5; g.add(s1);
  const s2 = cyl(0.012, 0.012, 0.3, M(s.wood), 0.1, 0.6, 0); s2.rotation.z = -0.5; g.add(s2);
  return g;
}
function basketball(s: Style) {
  const g = new THREE.Group();
  g.add(cyl(0.02, 0.02, 1.0, M("#4A4A52"), 0, 0.5, 0));
  g.add(box(0.5, 0.36, 0.03, M("#F8F2E2"), 0, 1.15, 0));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.015, 8, 18), M("#E85D3A", 0.5)); rim.rotation.x = Math.PI / 2; rim.position.set(0, 1.02, 0.14); rim.castShadow = true; g.add(rim);
  g.add(sph(0.11, M("#E8833A"), 0.3, 0.11, 0.2));
  void s;
  return g;
}
function dollhouse(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.8, 0.6, 0.3, M("#F2C7A0"), 0, 0.32, 0, 0.02));
  const roof = cyl(0.28, 0.28, 0.86, M("#C4553A"), 0, 0.72, 0, 3); roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 4; g.add(roof);
  g.add(box(0.12, 0.2, 0.02, M("#8FC9E8"), -0.18, 0.4, 0.16));
  g.add(box(0.12, 0.2, 0.02, M("#8FC9E8"), 0.18, 0.4, 0.16));
  g.add(box(0.12, 0.22, 0.02, M(s.wood), 0, 0.14, 0.16));
  return g;
}
function trainset(s: Style) {
  const g = new THREE.Group();
  const track = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.02, 6, 24), M("#8A8A92")); track.rotation.x = Math.PI / 2; track.position.y = 0.03; track.castShadow = true; g.add(track);
  const eng = box(0.16, 0.12, 0.1, M("#2E86C1"), 0.5, 0.08, 0, 0.02); g.add(eng);
  g.add(cyl(0.03, 0.03, 0.08, M("#26313F"), 0.52, 0.17, 0, 8));
  const car = box(0.12, 0.1, 0.09, M("#E23B4A"), 0.32, 0.07, 0.38, 0.02); car.rotation.y = 0.85; g.add(car);
  void s;
  return g;
}
function readingNook(s: Style) {
  const g = new THREE.Group();
  g.add(box(0.7, 0.06, 0.5, M(s.wood), 0, 0.5, 0, 0.02));
  g.add(box(0.66, 0.5, 0.06, M(s.wood), 0, 0.26, -0.22, 0.02));
  g.add(box(0.06, 0.5, 0.44, M(s.wood), -0.32, 0.26, 0, 0.02));
  const cush = sph(0.22, M(s.fabric, 1), 0, 0.58, 0.05, 10, 8); cush.scale.set(1.2, 0.55, 1); g.add(cush);
  g.add(box(0.2, 0.03, 0.26, M("#E23B4A"), 0.1, 0.66, 0.05, 0.01));
  return g;
}

/* ---------------- the catalog ---------------- */
export const FURNITURE: FurnDef[] = [
  { id: "bed", name: "Cozy bed", emo: "🛏️", cat: "sleep", w: 2.0, d: 1.15, h: 0.7, wall: true, build: bed },
  { id: "bunk", name: "Bunk bed", emo: "🛌", cat: "sleep", w: 2.0, d: 1.1, h: 1.9, wall: true, build: bunk },
  { id: "nightstand", name: "Nightstand", emo: "🕯️", cat: "sleep", w: 0.5, d: 0.42, h: 0.5, wall: true, build: nightstand },
  { id: "desk", name: "Study desk", emo: "💻", cat: "study", w: 1.4, d: 0.7, h: 0.8, wall: true, desk: true, build: desk },
  { id: "chair", name: "Desk chair", emo: "🪑", cat: "study", w: 0.44, d: 0.44, h: 1.0, seat: true, build: chair },
  { id: "bookshelf", name: "Bookshelf", emo: "📚", cat: "study", w: 0.9, d: 0.3, h: 1.7, wall: true, build: bookshelf },
  { id: "nook", name: "Reading nook", emo: "📖", cat: "study", w: 0.7, d: 0.5, h: 0.7, wall: true, seat: true, build: readingNook },
  { id: "easel", name: "Art easel", emo: "🎨", cat: "study", w: 0.5, d: 0.5, h: 1.1, build: easel },
  { id: "dresser", name: "Dresser", emo: "🗄️", cat: "sleep", w: 1.0, d: 0.48, h: 0.9, wall: true, build: dresser },
  { id: "wardrobe", name: "Wardrobe", emo: "🚪", cat: "sleep", w: 1.1, d: 0.55, h: 1.95, wall: true, build: wardrobe },
  { id: "beanbag", name: "Bean bag", emo: "🛋️", cat: "decor", w: 0.85, d: 0.85, h: 0.55, seat: true, build: beanbag },
  { id: "rug", name: "Round rug", emo: "⭕", cat: "decor", w: 1.7, d: 1.7, h: 0.02, rug: true, build: rug },
  { id: "lamp", name: "Table lamp", emo: "💡", cat: "decor", w: 0.35, d: 0.35, h: 0.75, build: lamp },
  { id: "floorlamp", name: "Floor lamp", emo: "🔦", cat: "decor", w: 0.4, d: 0.4, h: 1.85, build: floorlamp },
  { id: "plant", name: "Potted plant", emo: "🪴", cat: "nature", w: 0.35, d: 0.35, h: 0.75, build: plant },
  { id: "poster", name: "Star poster", emo: "⭐", cat: "decor", w: 0.6, d: 0.05, h: 0.9, wall: true, build: poster },
  { id: "trophies", name: "Trophy shelf", emo: "🏆", cat: "decor", w: 0.9, d: 0.24, h: 0.85, wall: true, build: trophyShelf },
  { id: "toybox", name: "Toy box", emo: "🧸", cat: "play", w: 0.8, d: 0.45, h: 0.55, build: toybox },
  { id: "rocket", name: "Toy rocket", emo: "🚀", cat: "play", w: 0.4, d: 0.4, h: 1.1, build: rocket },
  { id: "telescope", name: "Telescope", emo: "🔭", cat: "play", w: 0.5, d: 0.5, h: 0.95, build: telescope },
  { id: "drum", name: "Drum", emo: "🥁", cat: "play", w: 0.5, d: 0.5, h: 0.6, build: drum },
  { id: "hoop", name: "Mini hoop", emo: "🏀", cat: "play", w: 0.55, d: 0.4, h: 1.3, build: basketball },
  { id: "dollhouse", name: "Dollhouse", emo: "🏠", cat: "play", w: 0.8, d: 0.3, h: 0.95, wall: true, build: dollhouse },
  { id: "train", name: "Train set", emo: "🚂", cat: "play", w: 1.1, d: 1.1, h: 0.2, build: trainset },
];
export const FURN_BY_ID = new Map(FURNITURE.map((f) => [f.id, f]));

/* ---------------- placement rules ---------------- */
export interface Placement { id: string; x: number; z: number; rot: number }  // rot = quarter turns, 0..3
export interface RoomRect { w: number; d: number }                            // room interior in meters

/** does this footprint fit inside the room without overlapping other furniture? */
export function fits(place: Placement, def: FurnDef, room: RoomRect, others: Placement[]): boolean {
  const fp = footprint(place, def);
  if (Math.abs(fp.x) + fp.w / 2 > room.w / 2 - 0.05 || Math.abs(fp.z) + fp.d / 2 > room.d / 2 - 0.05) return false;
  for (const o of others) {
    const od = FURN_BY_ID.get(o.id); if (!od) continue;
    const of = footprint(o, od);
    if (!def.rug && !od.rug && Math.abs(fp.x - of.x) < (fp.w + of.w) / 2 && Math.abs(fp.z - of.z) < (fp.d + of.d) / 2) return false;
  }
  return true;
}
/** footprint after rotation (quarter turns swap width and depth) */
export function footprint(p: Placement, def: FurnDef): { x: number; z: number; w: number; d: number } {
  const swap = p.rot % 2 === 1;
  return { x: p.x, z: p.z, w: swap ? def.d : def.w, d: swap ? def.w : def.d };
}
/** default layout for a brand-new room: bed, desk+chair, rug, bookshelf */
export function starterLayout(room: RoomRect): Placement[] {
  const out: Placement[] = [];
  const tryAdd = (id: string, x: number, z: number, rot = 0) => {
    const def = FURN_BY_ID.get(id)!, p = { id, x, z, rot };
    if (fits(p, def, room, out)) out.push(p);
  };
  tryAdd("bed", -room.w / 2 + 1.15, -room.d / 2 + 0.75, 0);
  tryAdd("rug", 0.2, 0.3, 0);
  tryAdd("desk", room.w / 2 - 0.85, -room.d / 2 + 0.5, 3);
  tryAdd("chair", room.w / 2 - 0.85, -room.d / 2 + 1.1, 0);
  tryAdd("bookshelf", -room.w / 2 + 0.6, room.d / 2 - 0.4, 0);
  return out;
}
