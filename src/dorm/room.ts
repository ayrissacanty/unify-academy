/** UNIFY Academy: My Dorm room. Builds the campus dorm, hotspots, the furniture editor (snap, collide, stack, undo) and persistence. */
import { hasReward } from "./rewards";
import * as THREE from "three";
import { B, CATALOG, FurnitureDefX, canvasTex, cvs, disposeTree, mk, nightFactor, releaseMaterials, rng, shade } from "./furniture";
import { DORM_KEY } from "./types";
import { aoStrips } from "../shared/polish";
import type { DormApi, DormLayout, DormTheme, FurnitureDef, Hotspot, HotspotId, Mood, Placed, Style } from "./types";

/** extra editor/camera API on top of the shared DormApi contract */
export interface DormApiPlus extends DormApi {
  /** feed the camera position every frame: fades the wall that faces it, opens the wardrobe when you get close */
  setCameraPosition(v: THREE.Vector3): void;
  /** the page tells the room which hotspot the camera is focused on (wardrobe doors open for "wardrobe") */
  setFocus(id: HotspotId | null): void;
  undo(): boolean; redo(): boolean; readonly canUndo: boolean; readonly canRedo: boolean;
  exportLayout(): string; importLayout(json: string): boolean;
  saveLocal(): boolean; loadLocal(): boolean;
  /** wall/floor values accept "#rrggbb|pattern" (walls: plain|stripes|dots|brick, floors: wood|tile|carpet) */
  setTheme(t: Partial<DormTheme>): void;
  readonly selected: Placed | null;
  /** hover highlight (returns what is under the pointer) */
  hover(ndcX: number, ndcY: number, camera: THREE.Camera): { hotspot?: Hotspot; placed?: Placed } | null;
  /** drag the selected piece with the pointer (call endDrag on release) */
  dragSelected(ndcX: number, ndcY: number, camera: THREE.Camera): void; endDrag(): void;
  flash(id: HotspotId): void;
  setLabels(on: boolean): void;
  setNeonText(t: string): void;
  def(id: string): FurnitureDefX | undefined;
  stats(): { items: number };
}

/* ------------------------------------------------------------------ constants */
const X0 = -2.1, X1 = 2.1, Z0 = -2.4, Z1 = 2.4, H = 2.7, MAX_ITEMS = 120, GRID = 0.25;
const DEFS = new Map<string, FurnitureDefX>(CATALOG.map((d) => [d.id, d]));
/** wall order: 0 back (-z), 1 right (+x), 2 front (+z), 3 left (-x); rot makes the item face into the room */
const WALL_ROT = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const WALL_N: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const PATTERNS_W = ["plain", "stripes", "dots", "brick"], PATTERNS_F = ["wood", "tile", "carpet"];
const noop = () => { /* not pickable */ };
const HEX = /^#[0-9a-fA-F]{6}$/;

interface HsDef { id: HotspotId; def: string; label: string; icon: string; t: [number, number, number]; p: [number, number, number]; la: [number, number, number]; col: string }
const HS: HsDef[] = [
  { id: "wardrobe", def: "wardrobe", label: "Wardrobe", icon: "👗", t: [0, 1.0, 0.05], p: [1.0, 1.4, 2.5], la: [0, 2.25, 0.3], col: "#F2B138" },
  { id: "computer", def: "computer", label: "Computer", icon: "💻", t: [0, 0.3, -0.05], p: [0.12, 0.42, 1.0], la: [0, 0.65, 0.1], col: "#4F91C7" },
  { id: "folder", def: "folder", label: "Grades", icon: "📁", t: [0, 0.03, 0], p: [0.05, 0.62, 0.72], la: [0, 0.2, 0.1], col: "#3FB68B" },
  { id: "binder", def: "binder", label: "Homework", icon: "📒", t: [0, 0.03, 0], p: [0.0, 0.62, 0.72], la: [0, 0.2, 0.1], col: "#8D6BD4" },
  { id: "collage", def: "collage", label: "Collage", icon: "🖼️", t: [0, 0.45, 0], p: [0, 0.45, 2.5], la: [0, 1.08, 0.1], col: "#E8567C" },
  { id: "mirror", def: "mirror", label: "Mirror", icon: "🪞", t: [0, 0.85, 0], p: [0, 1.0, 2.7], la: [0, 1.78, 0.1], col: "#2BB5C9" },
  { id: "backpack", def: "backpack", label: "Backpack", icon: "🎒", t: [0, 0.22, 0], p: [0.45, 0.5, 1.0], la: [0, 0.55, 0], col: "#F28C4E" },
  { id: "bed", def: "loft", label: "Loft bed", icon: "🛏️", t: [0, 1.3, 0], p: [1.5, 2.2, 3.6], la: [0.4, 2.12, 0.2], col: "#4F91C7" },
  { id: "window", def: "window", label: "Window", icon: "🪟", t: [0, 0.65, 0], p: [0.3, 0.75, 2.5], la: [0, 1.5, 0.1], col: "#5CC8FF" },
  { id: "desk", def: "desk", label: "Desk", icon: "🖥️", t: [0, 0.8, 0], p: [0.7, 1.35, 3.1], la: [0.5, 0.5, 0.4], col: "#C98F58" },
];

export function defaultDormLayout(): DormLayout {
  const P = (uid: string, def: string, x: number, z: number, rot: number, color: string, y?: number, variant?: number): Placed => {
    const p: Placed = { uid, def, x, z, rot, color }; if (y !== undefined) p.y = y; if (variant !== undefined) p.variant = variant; return p;
  };
  return {
    v: 1,
    theme: { wall: "#4FB6B2|stripes", floor: "#C98F58|wood", trim: "#FFFFFF", rug: "#E8567C", window: "auto", ceiling: "#FFF6E5", lights: "#FFC857" },
    items: [
      P("d_loft", "loft", -1.1, -1.9, 0, "#2F6FB5"),
      P("d_desk", "desk", -1.15, -2.1, 0, "#E8C99A"),
      P("d_chair", "chair", -1.15, -1.35, Math.PI, "#E8567C"),
      P("d_comp", "computer", -1.3, -2.08, 0, "#EDEFF5", 0.75),
      P("d_lamp", "desklamp", -1.85, -2.15, 0.4, "#F2B138", 0.75),
      P("d_folder", "folder", -0.8, -2.0, 0, "#F2C879", 0.75),
      P("d_binder", "binder", -0.5, -2.02, 0, "#3B7DD8", 0.75),
      P("d_pack", "backpack", -1.15, -1.07, 0, "#F28C4E", 0.5),
      P("d_ward", "wardrobe", 1.8, -1.5, -Math.PI / 2, "#F2B138"),
      P("d_mirror", "mirror", 2.07, -0.35, -Math.PI / 2, "#C98F58", 0.15),
      P("d_door", "door", 2.04, 1.55, -Math.PI / 2, "#B5733C", 0),
      P("d_window", "window", -2.03, -0.1, Math.PI / 2, "#FFB3C7", 0.95),
      P("d_collage", "collage", 0.85, -2.37, 0, "#C98F58", 1.1),
      P("d_lights", "stringlights", 0.8, -2.38, 0, "#FFC857", 2.2),
      P("d_poster", "poster", -2.085, 1.85, Math.PI / 2, "#8D6BD4", 1.2, 2),
      P("d_shelf", "bookshelf", -1.94, 0.95, Math.PI / 2, "#C98F58"),
      P("d_bean", "beanbag", -1.2, 1.75, 0, "#8D6BD4"),
      P("d_rug", "ruground", 0.1, 0.4, 0, "#E8567C"),
      P("d_cush", "cushion", 0.7, 1.35, 0.4, "#F2B138"),
      P("d_plant1", "monstera", 1.45, 1.95, 0, "#F4EBDD"),
      P("d_plant2", "snakeplant", -1.85, -0.95, 0, "#F2B138"),
      P("d_flamp", "floorlamp", 1.85, 0.7, 0, "#FFC857"),
    ],
  };
}

/* ------------------------------------------------------------------ validation */
const num = (v: unknown, d: number) => (typeof v === "number" && isFinite(v) ? v : d);
const clampN = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
function themeVal(v: unknown, d: string, pats: string[]) {
  if (typeof v !== "string") return d; const [c, p] = v.split("|"); if (!HEX.test(c)) return d; return p && pats.includes(p) ? c + "|" + p : p ? c + "|" + pats[0] : c;
}
export function sanitizeLayout(raw: unknown): DormLayout {
  const base = defaultDormLayout(), r = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>, th = (r.theme && typeof r.theme === "object" ? r.theme : {}) as Record<string, any>;
  const hex = (v: unknown, d: string) => (typeof v === "string" && HEX.test(v) ? v : d);
  const theme: DormTheme = {
    wall: themeVal(th.wall, base.theme.wall, PATTERNS_W), floor: themeVal(th.floor, base.theme.floor, PATTERNS_F), trim: hex(th.trim, base.theme.trim), rug: hex(th.rug, base.theme.rug),
    window: th.window === "day" || th.window === "night" || th.window === "auto" ? th.window : "auto", ceiling: hex(th.ceiling, base.theme.ceiling!), lights: hex(th.lights, base.theme.lights!),
  };
  const items: Placed[] = [], uids = new Set<string>(), core = new Set<string>();
  const src = Array.isArray(r.items) ? r.items : [];
  for (const it of src.slice(0, 400)) {
    if (items.length >= MAX_ITEMS) break;
    if (!it || typeof it !== "object") continue;
    const def = DEFS.get(String((it as any).def)); if (!def) continue;
    if (def.core) { if (core.has(def.id)) continue; core.add(def.id); }
    let uid = typeof (it as any).uid === "string" && (it as any).uid ? String((it as any).uid).slice(0, 40) : ""; if (!uid || uids.has(uid)) { if (uid) continue; uid = "u" + Math.random().toString(36).slice(2, 8); }
    uids.add(uid);
    const p: Placed = { uid, def: def.id, x: clampN(num((it as any).x, 0), X0, X1), z: clampN(num((it as any).z, 0), Z0, Z1), rot: num((it as any).rot, 0), color: hex((it as any).color, def.colors[0]) };
    if (typeof (it as any).y === "number" && isFinite((it as any).y)) p.y = clampN((it as any).y, 0, H);
    if (def.variants) p.variant = clampN(Math.floor(num((it as any).variant, 0)), 0, def.variants - 1);
    items.push(p);
  }
  for (const b of base.items) { const def = DEFS.get(b.def)!; if (def.core && !core.has(def.id)) { let uid = b.uid; while (uids.has(uid)) uid += "x"; uids.add(uid); items.push({ ...b, uid }); } }
  const out: DormLayout = { v: 1, theme, items };
  if (Array.isArray(r.photos)) out.photos = r.photos.filter((x: unknown) => typeof x === "string").slice(0, 12);
  if (typeof r.note === "string") out.note = r.note.slice(0, 200);
  return out;
}

/* ------------------------------------------------------------------ procedural wall / floor textures */
function parseTv(v: string, dp: string): [string, string] { const [c, p] = v.split("|"); return [c, p || dp]; }
function wallTexture(c: string, pat: string): { tex: THREE.CanvasTexture; tw: number; th: number } {
  const S = 256, [cv, g] = cvs(S, S); g.fillStyle = c; g.fillRect(0, 0, S, S); const r = rng(5); let tw = 0.5, th = 0.5;
  if (pat === "stripes") { g.fillStyle = shade(c, 0.12, -0.05); for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 32, 0, 32, S); g.fillStyle = "rgba(255,255,255,.35)"; for (let i = 0; i < 4; i++) g.fillRect(i * 64 + 30, 0, 2, S); tw = 0.5; th = 1.35; }
  else if (pat === "dots") { g.fillStyle = shade(c, 0.2, -0.1); for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.beginPath(); g.arc(64 + x * 128 + (y % 2) * 64 - 32 + 32, 64 + y * 128, 20, 0, 7); g.fill(); } tw = 0.4; th = 0.4; }
  else if (pat === "brick") { g.fillStyle = shade(c, 0.28, -0.15); g.fillRect(0, 0, S, S); const bh = 64, bw = 128; for (let y = 0; y < 4; y++) for (let x = -1; x < 3; x++) { g.fillStyle = shade(c, (r() - 0.5) * 0.1); g.fillRect(x * bw + (y % 2) * 64 + 3, y * bh + 3, bw - 6, bh - 6); } tw = 0.6; th = 0.3; }
  else { g.fillStyle = "rgba(255,255,255,.05)"; for (let i = 0; i < 300; i++) g.fillRect(r() * S, r() * S, 2, 2); tw = 1; th = 1; }
  const tex = canvasTex(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return { tex, tw, th: pat === "stripes" ? 1.35 : pat === "brick" ? 0.3 * 4 : th * (pat === "dots" ? 2 : 1) };
}
function floorTexture(c: string, pat: string): { tex: THREE.CanvasTexture; size: number } {
  const S = 512, [cv, g] = cvs(S, S), r = rng(8); g.fillStyle = c; g.fillRect(0, 0, S, S);
  if (pat === "wood") { const ph = S / 8; for (let y = 0; y < 8; y++) { let x = -((y * 137) % 300); while (x < S) { const w = 220 + r() * 160; g.fillStyle = shade(c, (r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.015); g.fillRect(x + 1.5, y * ph + 1.5, w - 3, ph - 3); g.strokeStyle = "rgba(60,30,10,.12)"; g.lineWidth = 1; for (let k = 0; k < 5; k++) { g.beginPath(); const yy = y * ph + 6 + r() * (ph - 12); g.moveTo(x + 4, yy); g.bezierCurveTo(x + w * 0.3, yy + 3, x + w * 0.6, yy - 3, x + w - 4, yy); g.stroke(); } x += w; } } }
  else if (pat === "tile") { const t = S / 4; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = (x + y) % 2 ? shade(c, 0.1) : shade(c, -0.1); g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4); } }
  else { for (let i = 0; i < 4000; i++) { g.fillStyle = shade(c, (r() - 0.5) * 0.14); g.fillRect(r() * S, r() * S, 3, 3); } }
  const tex = canvasTex(cv); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; return { tex, size: pat === "tile" ? 1.0 : 1.0 };
}

/* ------------------------------------------------------------------ geometry helpers */
interface Entry { p: Placed; def: FurnitureDefX; obj: THREE.Group; inner: THREE.Object3D; wall: number }
const MAT_UP = new THREE.Vector3(0, 1, 0);

export function createDorm(style: Style, layoutIn?: DormLayout): DormApiPlus {
  const group = new THREE.Group(); group.name = "dorm";
  const itemsG = new THREE.Group(), shellG = new THREE.Group(), labelsG = new THREE.Group(), overlayG = new THREE.Group();
  group.add(shellG, itemsG, labelsG, overlayG);

  let layout = sanitizeLayout(layoutIn ?? defaultDormLayout());
  let editing = false, labelsOn = true, selUid: string | null = null, hoverUid: string | null = null, focusId: HotspotId | null = null;
  let time = 0, uidN = 0, flashT = 0, flashId: HotspotId | null = null, hourNow = 13, moodHour = 13, disposed = false;
  const entries = new Map<string, Entry>(), tickers: Entry[] = [];
  const hotspots: Hotspot[] = [], hsById = new Map<HotspotId, Hotspot>(), hsDef = new Map<HotspotId, HsDef>(), hsByUid = new Map<string, Hotspot>();
  const cam = new THREE.Vector3(0, 3, 6); let camSet = false, camDist = 6;
  const changeCbs: ((l: DormLayout) => void)[] = [], selectCbs: ((p: Placed | null, d: FurnitureDef | null) => void)[] = [];
  let changeTimer: ReturnType<typeof setTimeout> | null = null, dragTimer: ReturnType<typeof setTimeout> | null = null;
  let photoUrls: string[] = [];
  const hist: string[] = []; let hi = -1;

  const spots = {
    owner: new THREE.Vector3(0.95, 0, -0.5), ownerRot: 0.5, guest: new THREE.Vector3(-0.85, 0, 1.0), guestRot: 2.25,
    desk: new THREE.Vector3(-1.15, 0, -1.35), deskRot: Math.PI,
  };

  /* ---------------------------------------------------------------- shell */
  interface Wall { g: THREE.Group; mat: THREE.Material; op: number; tex: THREE.Texture }
  const walls: Wall[] = []; let floorMesh: THREE.Mesh | null = null, ceil: THREE.Mesh | null = null; let floorTex: THREE.Texture | null = null, shellMats: THREE.Material[] = [];
  function disposeShell() {
    for (const o of [...shellG.children]) { shellG.remove(o); disposeTree(o); }
    for (const m of shellMats) { (m as THREE.MeshStandardMaterial).map?.dispose(); m.dispose(); } shellMats = []; walls.length = 0; floorMesh = null; ceil = null;
  }
  function buildShell() {
    disposeShell();
    const th = layout.theme, [wc, wp] = parseTv(th.wall, "plain"), [fc, fp] = parseTv(th.floor, "wood");
    const wt = wallTexture(wc, wp), ft = floorTexture(fc, fp);
    const mkMat = (kind: "wall" | "floor", tex: THREE.Texture) => { const m = style.mat(kind, "#ffffff", { map: tex, rough: 1 }); shellMats.push(m); return m; };
    const spans = [4.2, 4.8, 4.2, 4.8];
    const defs: { pos: [number, number, number]; size: [number, number, number] }[] = [
      { pos: [0, H / 2, Z0 - 0.06], size: [4.2, H, 0.12] }, { pos: [X1 + 0.06, H / 2, 0], size: [0.12, H, 5.04] },
      { pos: [0, H / 2, Z1 + 0.06], size: [4.2, H, 0.12] }, { pos: [X0 - 0.06, H / 2, 0], size: [0.12, H, 5.04] },
    ];
    const trimMat = mk("wood", th.trim, { rough: 0.5 });
    defs.forEach((d, i) => {
      const t = wt.tex.clone(); t.repeat.set(spans[i] / wt.tw, H / wt.th); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.needsUpdate = true;
      const m = mkMat("wall", t); const mesh = new THREE.Mesh(new THREE.BoxGeometry(...d.size), m); mesh.position.set(...d.pos); mesh.receiveShadow = true;
      const g = new THREE.Group(); g.add(mesh);
      const tb = new B(style), n = WALL_N[i], along = i % 2 ? 4.8 : 4.2;
      const bx = n[0] ? 0.025 : along, bz = n[0] ? along : 0.025, cx = n[0] ? n[0] * (2.1 - 0.0125) : 0, cz = n[1] ? n[1] * (2.4 - 0.0125) : 0;
      tb.box(bx, 0.11, bz, cx, 0, cz, trimMat, 0.008); tb.box(n[0] ? 0.04 : along, 0.07, n[0] ? along : 0.04, n[0] ? n[0] * 2.08 : 0, H - 0.07, n[1] ? n[1] * 2.38 : 0, trimMat, 0.01);
      g.add(tb.done(false)); shellG.add(g); walls.push({ g, mat: m, op: 1, tex: t });
    });
    const fm = mkMat("floor", ft.tex); ft.tex.repeat.set(4.4 / ft.size, 5 / ft.size); floorTex = ft.tex;
    floorMesh = new THREE.Mesh(new THREE.BoxGeometry(4.44, 0.2, 5.04), fm); floorMesh.position.y = -0.1; floorMesh.receiveShadow = true; shellG.add(floorMesh);
    ceil = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 4.8), style.mat("wall", th.ceiling || "#FFF6E5", {})); shellMats.push(ceil.material as THREE.Material);
    ceil.rotation.x = Math.PI / 2; ceil.position.y = H; shellG.add(ceil);
    aoStrips(shellG, [{ x0: X0, z0: Z0, x1: X1, z1: Z1 }], { inward: true, width: 0.5, opacity: style.id === "pixar" ? 0.3 : 0.24, y: 0.004 });   // soft wall/floor occlusion
    wt.tex.dispose(); void floorTex;
  }

  /* ---------------------------------------------------------------- highlight + selection boxes + labels */
  const boxGeo = new THREE.BoxGeometry(1, 1, 1), edgeGeo = new THREE.EdgesGeometry(boxGeo);
  function mkOutline(col: string, fill: number) {
    const g = new THREE.Group(), fm = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: fill, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    const lm = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.95, toneMapped: false, depthTest: false });
    const f = new THREE.Mesh(boxGeo, fm), l = new THREE.LineSegments(edgeGeo, lm); f.raycast = noop; l.raycast = noop; l.renderOrder = 15; g.add(f, l); g.visible = false; g.raycast = noop;
    return { g, fm, lm };
  }
  const hl = mkOutline("#FFE27A", 0.18), sel = mkOutline("#4DD0B1", 0.12);
  const place = (o: { g: THREE.Group }, e: Entry | undefined, pad: number) => {
    if (!e) { o.g.visible = false; return; } const [w, d, h] = e.def.size; e.obj.add(o.g); o.g.position.set(0, h / 2, 0); o.g.scale.set(w + pad, h + pad, d + pad); o.g.visible = true;
  };
  const labels = new Map<HotspotId, THREE.Sprite>();
  function mkLabel(h: HsDef) {
    const [cv, g] = cvs(320, 88); g.font = `800 34px system-ui, 'Segoe UI', Roboto, Arial, sans-serif`; const w = Math.min(300, g.measureText(h.label).width + 74);
    g.fillStyle = "rgba(255,255,255,.97)"; g.beginPath(); g.roundRect(160 - w / 2, 12, w, 56, 28); g.fill(); g.strokeStyle = "rgba(60,50,70,.35)"; g.lineWidth = 3; g.stroke();   // no blurred drop shadow: its semi-transparent dark pixels read as a box behind the tag in post-processed looks
    g.fillStyle = h.col; g.beginPath(); g.arc(160 - w / 2 + 30, 40, 13, 0, 7); g.fill(); g.fillStyle = "#2b2f3a"; g.textBaseline = "middle"; g.textAlign = "left"; g.fillText(h.label, 160 - w / 2 + 52, 42);
    const tx = canvasTex(cv); tx.premultiplyAlpha = true; tx.needsUpdate = true;   // premultiplied: transparent texels carry no black fringe
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
    sp.renderOrder = 30; sp.scale.set(0.5, 0.5 * 88 / 320, 1); sp.userData.base = sp.scale.clone(); labelsG.add(sp); labels.set(h.id, sp); return sp;
  }
  overlayG.add(hl.g, sel.g);

  /* ---------------------------------------------------------------- items */
  const isHex = (c: unknown): c is string => typeof c === "string" && HEX.test(c);
  function hFor(def: FurnitureDefX) { return def.size[2]; }
  function wallOf(p: Placed): number {
    const dist = [Math.abs(p.z - Z0), Math.abs(p.x - X1), Math.abs(p.z - Z1), Math.abs(p.x - X0)]; let b = 0; for (let i = 1; i < 4; i++) if (dist[i] < dist[b]) b = i; return b;
  }
  function build(p: Placed, def: FurnitureDefX): Entry {
    const inner = def.build(style, p.color, p.variant ?? 0); inner.traverse((o) => { if ((o as THREE.Points).isPoints) o.raycast = noop; });
    const obj = new THREE.Group(); obj.add(inner); obj.userData.uid = p.uid; obj.name = def.id;
    const e: Entry = { p, def, obj, inner, wall: def.wall ? wallOf(p) : -1 }; applyTransform(e);
    const u = inner.userData; if (u.setHour) u.setHour(hourNow); if (u.setNight) u.setNight(nightFactor(moodHour));
    itemsG.add(obj); entries.set(p.uid, e); if (u.tick) tickers.push(e); return e;
  }
  function applyTransform(e: Entry) { e.obj.position.set(e.p.x, e.p.y ?? 0, e.p.z); e.obj.rotation.y = e.p.rot; }
  function remove(e: Entry) {
    if (hl.g.parent === e.obj) { overlayG.add(hl.g); hl.g.visible = false; } if (sel.g.parent === e.obj) { overlayG.add(sel.g); sel.g.visible = false; }
    itemsG.remove(e.obj); disposeTree(e.obj); entries.delete(e.p.uid); const i = tickers.indexOf(e); if (i >= 0) tickers.splice(i, 1);
  }
  function applyLayout(l: DormLayout, rebuildShell = true) {
    layout = l; for (const e of [...entries.values()]) { const q = l.items.find((x) => x.uid === e.p.uid); if (!q || q.def !== e.p.def || q.color !== e.p.color || (q.variant ?? 0) !== (e.p.variant ?? 0)) remove(e); }
    for (const p of l.items) { const old = entries.get(p.uid); if (old) { old.p = p; old.wall = old.def.wall ? wallOf(p) : -1; applyTransform(old); } else build(p, DEFS.get(p.def)!); }
    if (rebuildShell) buildShell(); refreshHotspots(); applyPhotos(); if (selUid && !entries.has(selUid)) selUid = null; showSel();
  }

  /* ---------------------------------------------------------------- hotspots */
  const tv = new THREE.Vector3();
  function refreshHotspots() {
    hotspots.length = 0; hsById.clear(); hsByUid.clear();
    for (const d of HS) {
      const e = [...entries.values()].find((x) => x.def.id === d.def); if (!e) continue;
      let h = hsDef.get(d.id) && prevHs.get(d.id);
      if (!h) { h = { id: d.id, label: d.label, icon: d.icon, focus: { pos: new THREE.Vector3(), target: new THREE.Vector3() }, object: e.obj }; prevHs.set(d.id, h); }
      h.object = e.obj; hsDef.set(d.id, d);
      const toW = (a: [number, number, number], out: THREE.Vector3) => out.set(a[0], a[1], a[2]).applyAxisAngle(MAT_UP, e.p.rot).add(e.obj.position);
      toW(d.t, h.focus.target); toW(d.p, h.focus.pos); h.focus.pos.y = Math.max(0.3, Math.min(H + 2, h.focus.pos.y));
      hotspots.push(h); hsById.set(d.id, h); hsByUid.set(e.p.uid, h);
      const sp = labels.get(d.id) ?? mkLabel(d); toW(d.la, sp.position); sp.position.y += 0;
    }
  }
  const prevHs = new Map<HotspotId, Hotspot>();

  /* ---------------------------------------------------------------- placement */
  interface Cand { x: number; z: number; y?: number; rot: number }
  const rectOf = (c: Cand, def: FurnitureDefX) => {
    const co = Math.abs(Math.cos(c.rot)), si = Math.abs(Math.sin(c.rot)), hw = (co * def.size[0] + si * def.size[1]) / 2, hd = (si * def.size[0] + co * def.size[1]) / 2; return { hw, hd };
  };
  const snap = (v: number, g: number) => Math.round(v / g) * g;
  /** snap + stack + wall-snap + clamp. Mutates c; returns false when it would collide */
  function fit(c: Cand, def: FurnitureDefX, ignore: string | null, keepY = false): boolean {
    let hostTop = 0, stacked = false;
    if (def.wall) {
      const probe: Placed = { uid: "", def: def.id, x: c.x, z: c.z, rot: 0, color: "" }; const w = wallOf(probe); c.rot = WALL_ROT[w];
      const half = def.size[0] / 2, dep = def.size[1] / 2, n = WALL_N[w];
      if (n[0]) { c.x = n[0] > 0 ? X1 - dep : X0 + dep; c.z = clampN(snap(c.z, 0.05), Z0 + half, Z1 - half); } else { c.z = n[1] > 0 ? Z1 - dep : Z0 + dep; c.x = clampN(snap(c.x, 0.05), X0 + half, X1 - half); }
      c.y = clampN(keepY && c.y !== undefined ? snap(c.y, 0.05) : def.y0 ?? 1.2, 0, H - def.size[2]);
    } else {
      let host: Entry | null = null;
      if (!def.flat && !def.soft && def.size[2] <= 0.7 && !def.surface) for (const e of entries.values()) {
        if (e.p.uid === ignore || e.def.surface === undefined || e.def.wall || e.def.id === def.id) continue;
        const r = rectOf(e.p, e.def); if (Math.abs(c.x - e.p.x) < r.hw && Math.abs(c.z - e.p.z) < r.hd && def.size[0] * def.size[1] < e.def.size[0] * e.def.size[1] * 0.7) { const top = (e.p.y ?? 0) + e.def.surface; if (top >= hostTop) { hostTop = top; host = e; } }
      }
      const r = rectOf(c, def);
      if (host) {
        stacked = true; const hr = rectOf(host.p, host.def); c.x = clampN(snap(c.x, 0.05), host.p.x - hr.hw + r.hw, host.p.x + hr.hw - r.hw); c.z = clampN(snap(c.z, 0.05), host.p.z - hr.hd + r.hd, host.p.z + hr.hd - r.hd); c.y = hostTop;
      } else if (def.soft) { c.x = clampN(snap(c.x, 0.05), X0 + r.hw, X1 - r.hw); c.z = clampN(snap(c.z, 0.05), Z0 + r.hd, Z1 - r.hd); c.y = c.y ?? 0.5; }
      else {
        c.x = clampN(snap(c.x, GRID), X0 + r.hw, X1 - r.hw); c.z = clampN(snap(c.z, GRID), Z0 + r.hd, Z1 - r.hd);
        if (c.x - r.hw < X0 + 0.13) c.x = X0 + r.hw; if (c.x + r.hw > X1 - 0.13) c.x = X1 - r.hw; if (c.z - r.hd < Z0 + 0.13) c.z = Z0 + r.hd; if (c.z + r.hd > Z1 - 0.13) c.z = Z1 - r.hd; c.y = undefined;
      }
    }
    if (def.flat || def.soft) return true;
    const r = rectOf(c, def), y0 = (c.y ?? 0) + (def.under ?? 0), y1 = (c.y ?? 0) + def.size[2], e0 = 0.02;
    for (const e of entries.values()) {
      if (e.p.uid === ignore || e.def.flat || e.def.soft) continue;
      const q = rectOf(e.p, e.def), qy0 = (e.p.y ?? 0) + (e.def.under ?? 0), qy1 = (e.p.y ?? 0) + e.def.size[2];
      if (y1 - 0.003 <= qy0 || qy1 - 0.003 <= y0) continue;
      if (Math.abs(c.x - e.p.x) < r.hw + q.hw - e0 && Math.abs(c.z - e.p.z) < r.hd + q.hd - e0) return false;
    }
    void stacked; return true;
  }
  function tryMove(e: Entry, nx: number, nz: number, nrot = e.p.rot): boolean {
    const c: Cand = { x: nx, z: nz, y: e.p.y, rot: nrot }; if (!fit(c, e.def, e.p.uid, true)) return false;
    e.p.x = c.x; e.p.z = c.z; e.p.rot = c.rot; if (c.y === undefined) delete e.p.y; else e.p.y = c.y; e.wall = e.def.wall ? wallOf(e.p) : -1; applyTransform(e); return true;
  }

  /* ---------------------------------------------------------------- history + change events */
  const snapshot = () => JSON.stringify(layout);
  function emit() { if (changeTimer) clearTimeout(changeTimer); changeTimer = setTimeout(() => { changeTimer = null; if (!disposed) for (const cb of changeCbs) cb(layout); }, 200); }
  function commit() { const s = snapshot(); if (hist[hi] === s) return; hist.length = hi + 1; hist.push(s); if (hist.length > 21) hist.shift(); hi = hist.length - 1; refreshHotspots(); emit(); }
  function restore() { applyLayout(sanitizeLayout(JSON.parse(hist[hi]))); emit(); }
  const selEntry = () => (selUid ? entries.get(selUid) : undefined);
  function showSel() { const e = selEntry(); place(sel, editing ? e : undefined, 0.04); if (!e || !editing) sel.g.visible = false; }

  /* ---------------------------------------------------------------- picking */
  const invW = new THREE.Matrix4(), ray = new THREE.Raycaster(), v2 = new THREE.Vector2(), plane = new THREE.Plane(), hit = new THREE.Vector3();
  const visEntries: THREE.Object3D[] = [], visLabels: THREE.Object3D[] = [];
  function entryOf(o: THREE.Object3D | null): Entry | undefined { while (o) { const u = o.userData.uid; if (u) return entries.get(u); o = o.parent; } return undefined; }
  function pickRaw(nx: number, ny: number, camera: THREE.Camera): { hotspot?: Hotspot; placed?: Placed } | null {
    v2.set(nx, ny); ray.setFromCamera(v2, camera);
    if (labelsOn && !editing) { visLabels.length = 0; for (const [, s] of labels) if (s.visible) visLabels.push(s); const lh = ray.intersectObjects(visLabels, false)[0]; if (lh) { for (const [id, s] of labels) if (s === lh.object) { const h = hsById.get(id); return h ? { hotspot: h, placed: entryOf(h.object)?.p } : null; } } }
    visEntries.length = 0; for (const e of entries.values()) if (e.obj.visible) visEntries.push(e.obj);
    const hits = ray.intersectObjects(visEntries, true);
    for (const h of hits) { const e = entryOf(h.object); if (!e) continue; return { placed: e.p, hotspot: hsByUid.get(e.p.uid) }; }
    return null;
  }

  function select(uid: string | null) {
    if (uid && !entries.has(uid)) uid = null; selUid = uid; showSel();
    const e = selEntry(); for (const cb of selectCbs) cb(e ? e.p : null, e ? e.def : null);
  }
  function newUid() { let u: string; do u = "u" + (++uidN).toString(36) + Math.random().toString(36).slice(2, 5); while (entries.has(u)); return u; }
  function spawn(defId: string, color?: string): Placed | null {
    const def = DEFS.get(defId); if (!def || layout.items.length >= MAX_ITEMS) return null;
    if (def.core && layout.items.some((p) => p.def === defId)) return null;
    const p: Placed = { uid: newUid(), def: defId, x: 0, z: 0, rot: 0, color: isHex(color) ? color : def.colors[0] };
    if (def.variants) p.variant = 0; if (defId.startsWith("rug")) p.color = isHex(color) ? color : p.color;
    const dir = camSet ? Math.atan2(cam.x, cam.z) : 0, px = Math.sin(dir) * 0.9, pz = Math.cos(dir) * 0.9;
    const tryAt = (x: number, z: number, y?: number) => {
      const c: Cand = { x, z, y, rot: def.wall ? 0 : p.rot }; if (!fit(c, def, null)) return false;
      p.x = c.x; p.z = c.z; p.rot = c.rot; if (c.y !== undefined) p.y = c.y; else delete p.y; return true;
    };
    let ok = false;
    if (def.wall) { for (const w of [0, 3, 1, 2]) { for (let k = 0; k < 40 && !ok; k++) { const t = ((k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 0.25; const n = WALL_N[w]; ok = tryAt(n[0] ? n[0] * 5 : t + (w === 0 ? 0.5 : 0), n[0] ? t : n[1] * 5); } if (ok) break; } }
    else for (let ring = 0; ring <= 10 && !ok; ring++) for (let a = -ring; a <= ring && !ok; a++) for (let b2 = -ring; b2 <= ring && !ok; b2++) { if (Math.max(Math.abs(a), Math.abs(b2)) !== ring) continue; ok = tryAt(px + a * GRID, pz + b2 * GRID); }
    if (!ok) return null;
    layout.items.push(p); build(p, def); refreshHotspots(); applyPhotos(); commit(); select(p.uid); return p;
  }
  function applyPhotos() {
    const n = photoUrls.length; let k = 0;
    for (const e of entries.values()) {
      const u = e.inner.userData;
      if (u.setPhotos) u.setPhotos(photoUrls.slice(0, 12)); else if (u.setPhoto && k < 3) { u.setPhoto(n ? photoUrls[k % n] : null, k + 3); k++; }
    }
  }

  /* ---------------------------------------------------------------- editor operations */
  const grabOff = { x: 0, z: 0, set: false };
  function recolorEntry(e: Entry, color: string) { e.p.color = color; const o = e.obj.position.clone(), r = e.obj.rotation.y; remove(e); const ne = build(e.p, e.def); ne.obj.position.copy(o); ne.obj.rotation.y = r; refreshHotspots(); applyPhotos(); if (selUid === e.p.uid) showSel(); }
  const api: DormApiPlus = {
    group, get layout() { return layout; }, set layout(l: DormLayout) { api.setLayout(l); }, hotspots, spots,
    setLayout(l) { applyLayout(sanitizeLayout(l)); hist.length = 0; hi = -1; commit(); },
    setMood(m: Mood) {
      moodHour = m.hour; hourNow = layout.theme.window === "day" ? 13 : layout.theme.window === "night" ? 22 : m.hour;
      for (const e of entries.values()) { const u = e.inner.userData; if (u.setHour) u.setHour(hourNow); if (u.setNight) u.setNight(nightFactor(moodHour)); }
    },
    setEditing(on) { editing = on; if (!on) select(null); showSel(); hl.g.visible = false; hoverUid = null; },
    get editing() { return editing; },
    select, onChange(cb) { changeCbs.push(cb); }, onSelect(cb) { selectCbs.push(cb); },
    catalog: () => CATALOG.filter((d) => !d.reward || hasReward(d.id)),
    add: (id, color) => spawn(id, color),
    moveSelected(dx, dz) { const e = selEntry(); if (!e) return; const x = e.p.x + dx, z = e.p.z + dz; if (tryMove(e, x, z) || tryMove(e, x, e.p.z) || tryMove(e, e.p.x, z)) { refreshHotspots(); commit(); } },
    rotateSelected(q) { const e = selEntry(); if (!e || e.def.wall) return; const r = e.p.rot + q * Math.PI / 2; const nr = Math.atan2(Math.sin(r), Math.cos(r)); if (tryMove(e, e.p.x, e.p.z, nr)) { refreshHotspots(); commit(); } },
    recolorSelected(color) { const e = selEntry(); if (!e || !isHex(color)) return; recolorEntry(e, color); commit(); },
    deleteSelected() { const e = selEntry(); if (!e || e.def.core) return; layout.items.splice(layout.items.indexOf(e.p), 1); remove(e); select(null); refreshHotspots(); commit(); },
    setPhotos(urls) { photoUrls = urls.slice(); applyPhotos(); },
    pick(nx, ny, camera) { const r = pickRaw(nx, ny, camera); if (r?.hotspot) flash(r.hotspot.id); return r; },
    update(dt) {
      time += dt; const k = Math.min(1, dt * 6);
      // wall fade: the wall between a camera outside the room and the room becomes see-through
      if (camSet) for (let i = 0; i < walls.length; i++) {
        const w = walls[i], n = WALL_N[i], plane0 = n[0] ? (n[0] > 0 ? X1 : -X1) * 1 : (n[1] > 0 ? Z1 : Z0);
        const out = n[0] ? (cam.x - plane0) * n[0] : (cam.z - plane0) * n[1], tgt = out > 0.05 ? Math.max(0, 1 - (out - 0.05) / 0.2) : 1;
        w.op += (tgt - w.op) * k; if (Math.abs(w.op - tgt) < 0.01) w.op = tgt;
        const m = w.mat as THREE.MeshStandardMaterial; m.transparent = w.op < 0.995; m.opacity = w.op; w.g.visible = w.op > 0.03; w.g.children[1].visible = w.op > 0.9;
      }
      if (ceil) ceil.visible = camSet && cam.y < H - 0.25 && cam.x > X0 && cam.x < X1 && cam.z > Z0 && cam.z < Z1;
      // wall items follow their wall; wardrobe opens when focused/selected/close
      for (const e of entries.values()) if (e.wall >= 0) e.obj.visible = walls[e.wall] ? walls[e.wall].op > 0.5 : true;
      for (const e of tickers) {
        const u = e.inner.userData;
        if (e.def.id === "wardrobe") {
          const near = camSet && Math.hypot(cam.x - e.p.x, cam.z - e.p.z) < 1.3 && cam.y < 2.4;
          const tgt = focusId === "wardrobe" || selUid === e.p.uid || near ? 1 : 0; u.openAmount += (tgt - u.openAmount) * Math.min(1, dt * 4); if (Math.abs(u.openAmount - tgt) < 0.002) u.openAmount = tgt;
        }
        u.tick(dt, time);
      }
      // highlights and labels
      const pulse = 0.5 + 0.5 * Math.sin(time * 6);
      hl.fm.opacity = 0.12 + 0.14 * pulse; sel.fm.opacity = 0.08 + 0.1 * pulse;
      if (flashT > 0) { flashT -= dt; const h = flashId ? hsById.get(flashId) : null; if (h && flashT > 0) { const e = entryOf(h.object); if (e && !editing) { place(hl, e, 0.05); hl.fm.opacity = 0.35 * Math.min(1, flashT * 2); } } else if (!hoverUid) hl.g.visible = false; }
      const show = labelsOn && !editing && !focusId;
      for (const [id, s] of labels) { s.visible = show && (hsById.get(id)?.object.visible ?? false); if (s.visible) { const f = Math.min(1.5, Math.max(0.55, camDist * 0.2)); s.scale.set(s.userData.base.x * f, s.userData.base.y * f, 1); } }
    },
    dispose() {
      disposed = true; if (changeTimer) clearTimeout(changeTimer); if (dragTimer) clearTimeout(dragTimer);
      for (const e of [...entries.values()]) remove(e); disposeShell(); labels.forEach((s) => { (s.material.map as THREE.Texture | null)?.dispose(); s.material.dispose(); }); labels.clear();
      boxGeo.dispose(); edgeGeo.dispose(); for (const o of [hl, sel]) { o.fm.dispose(); o.lm.dispose(); } group.removeFromParent(); releaseMaterials(style);
    },
    /* ---- extras */
    setCameraPosition(v) { cam.copy(v); camSet = true; camDist = Math.hypot(v.x, v.y - 1, v.z); },
    setFocus(id) { focusId = id; },
    undo() { if (hi <= 0) return false; hi--; restore(); return true; }, redo() { if (hi >= hist.length - 1) return false; hi++; restore(); return true; },
    get canUndo() { return hi > 0; }, get canRedo() { return hi < hist.length - 1; },
    exportLayout: () => JSON.stringify(layout),
    importLayout(json) { try { const l = sanitizeLayout(JSON.parse(json)); applyLayout(l); commit(); return true; } catch { return false; } },
    saveLocal() { try { localStorage.setItem(DORM_KEY, JSON.stringify(layout)); return true; } catch { return false; } },
    loadLocal() { try { const s = localStorage.getItem(DORM_KEY); if (!s) return false; applyLayout(sanitizeLayout(JSON.parse(s))); commit(); return true; } catch { return false; } },
    setTheme(t) {
      const th = layout.theme, old = { ...th };
      if (t.wall) th.wall = themeVal(t.wall, th.wall, PATTERNS_W); if (t.floor) th.floor = themeVal(t.floor, th.floor, PATTERNS_F);
      for (const k of ["trim", "rug", "ceiling", "lights"] as const) if (isHex(t[k])) th[k] = t[k]!;
      if (t.window) th.window = t.window;
      if (th.rug !== old.rug) for (const e of [...entries.values()]) if (e.def.id.startsWith("rug") && e.p.color === old.rug) recolorEntry(e, th.rug);
      if (th.lights !== old.lights) for (const e of [...entries.values()]) if (e.def.id === "stringlights") recolorEntry(e, th.lights!);
      buildShell(); api.setMood({ hour: moodHour }); commit();
    },
    get selected() { return selEntry()?.p ?? null; },
    hover(nx, ny, camera) {
      const r = pickRaw(nx, ny, camera); const e = r?.placed ? entries.get(r.placed.uid) : undefined;
      const want = e && (editing || r?.hotspot) ? e : undefined;
      if ((want?.p.uid ?? null) !== hoverUid) { hoverUid = want?.p.uid ?? null; place(hl, want, 0.05); }
      return r;
    },
    dragSelected(nx, ny, camera) {
      const e = selEntry(); if (!e || !editing) return; v2.set(nx, ny); ray.setFromCamera(v2, camera); ray.ray.applyMatrix4(invW.copy(group.matrixWorld).invert());
      plane.set(MAT_UP, -((e.p.y ?? 0) + (e.def.wall ? e.def.size[2] / 2 : 0.01))); if (!ray.ray.intersectPlane(plane, hit)) return;
      if (!grabOff.set) { grabOff.x = e.p.x - hit.x; grabOff.z = e.p.z - hit.z; grabOff.set = true; }
      const x = hit.x + grabOff.x, z = hit.z + grabOff.z;
      if (tryMove(e, x, z) || tryMove(e, x, e.p.z) || tryMove(e, e.p.x, z)) { refreshHotspots(); if (dragTimer) clearTimeout(dragTimer); dragTimer = setTimeout(api.endDrag, 600); emit(); }
    },
    endDrag() { if (dragTimer) { clearTimeout(dragTimer); dragTimer = null; } grabOff.set = false; commit(); },
    flash,
    setLabels(on) { labelsOn = on; },
    setNeonText(t) { for (const e of entries.values()) e.inner.userData.setText?.(t); },
    def: (id) => DEFS.get(id),
    stats: () => ({ items: layout.items.length }),
  };
  function flash(id: HotspotId) { flashT = 0.9; flashId = id; }

  /* ---------------------------------------------------------------- init */
  applyLayout(layout, false); buildShell(); refreshHotspots(); commit(); api.setMood({ hour: 13 });
  void hFor; void rng;
  return api;
}
