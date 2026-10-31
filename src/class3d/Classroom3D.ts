/** The straight-on 3D classroom: a real room (not isometric) with decor, two boards, a projector screen, 48 unique seated classmates, a teacher who walks anywhere,
 *  and a camera director (wide, follow, board, projector close-up with dimmed lights and a spotlight, your seat, free orbit). */
import * as THREE from "three";
import { Beam } from "../shared/beam";
import { dprCap, shadowSize, vignette, rimLight, aoStrips, smallScreen } from "../shared/polish";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { astar } from "../hall3d/logic";
import { ROSTER, TEACHER_BY_SUBJECT, type NpcDef } from "../hall3d/roster";
import { Social } from "../hall3d/social";
import { toLook } from "../hall3d/avatar";
import * as HT from "../hall3d/textures";
import * as CT from "./tex";
import { Board } from "./board";
import { Projector } from "./projector";
import { drawPicFinal, picsFor, picTitle } from "../game/wallart";
import { makeBillboard, setPose, dirIndex, placeBody, SEAT, SEAT_POSES, TEACH, TEACH_POSES, GESTURE, emoPose, type Billboard } from "./sprites";
import { personaOf, type Persona, type Emotion, type Reaction } from "./persona";
import { voice } from "./voice";
import { drawBoard } from "../game/timesui";
import { FACULTY_BY_ID } from "../hall3d/faculty";
import type { Subject } from "../game/types";
import { Mood, Gfx } from "../hall3d/mood";
import { buildClassExtras } from "./extras";
import { isPixar } from "../shared/look";
import { INTERIOR_SCALE as IS, PROP_H, scaleScene } from "../shared/scale";
import { setupPixarClass, type ClassPx } from "./pixarClass";
import type { Char3DEx } from "../dorm/char3d";
import { ClassPet } from "./pet";

export const X0 = -9, X1 = 9, Z0 = -9.5, Z1 = 9.5, WALL = 5.4, STAGE_H = 0.3, STAGE_Z = -6.3;
export const ROWS = 6, COLS = 8, ROW_DZ = 1.95, ROW_Z0 = -3.6, XS = [-7.6, -5.7, -3.8, -1.9, 1.9, 3.8, 5.7, 7.6];
const rowH = (r: number) => 0.14 * r, rowZ = (r: number) => ROW_Z0 + r * ROW_DZ;
const sstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** floor height at depth z (stage at the front, stepped rows behind) */
export function groundY(z: number) {
  let h = STAGE_H * (1 - sstep(STAGE_Z, STAGE_Z + 0.5, z)); const b0 = ROW_Z0 - ROW_DZ / 2;
  for (let r = 1; r < ROWS; r++) h += 0.14 * sstep(b0 + r * ROW_DZ - 0.25, b0 + r * ROW_DZ + 0.25, z);
  return h;
}
const shade2 = (h: string) => { const n = parseInt(h.slice(1, 7), 16), f = (v: number) => Math.round(v * 0.82); return "#" + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)].map((v) => v.toString(16).padStart(2, "0")).join(""); };
export type CamMode = "wide" | "follow" | "board-left" | "board-right" | "screen" | "seat" | "free" | "demo" | "bulletin";
export const SPOTS: Record<string, { x: number; z: number; face?: [number, number] }> = {
  podium: { x: -2.9, z: -5.5, face: [0, 1] }, center: { x: 0, z: -5.2, face: [0, 1] }, screenL: { x: -4.7, z: -7.6, face: [1, -0.1] }, screenR: { x: 4.1, z: -7.6, face: [-1, -0.1] },
  boardL: { x: -6.2, z: -8.4, face: [0, -1] }, boardR: { x: 6.2, z: -8.4, face: [0, -1] }, demo: { x: 3.6, z: -5.2, face: [0, 1] }, aisleC: { x: 0, z: -2.4, face: [0, 1] }, aisleL: { x: -8.35, z: 0.2 }, aisleR: { x: 8.35, z: 0.2 },
  mid: { x: 0, z: 1.0, face: [0, 1] }, midL: { x: -4.7, z: 1.1 }, midR: { x: 4.7, z: 1.1 }, back: { x: 0, z: 7.8, face: [0, -1] },
};
export interface Seat { c3?: Char3DEx; r: number; c: number; x: number; z: number; y: number; bb: Billboard; def: NpcDef | null; hand: 0 | 1 | 2; handT: number; act: number; actT: number; player: boolean }
interface TeacherState { bb: Billboard; pos: THREE.Vector3; path: { x: number; z: number }[]; face: THREE.Vector3; speed: number; talking: boolean; mode: "idle" | "point" | "write" | "present" | "hold"; res: (() => void) | null; walkPh: number; faceTo: THREE.Vector3 | null; moving: boolean; def: NpcDef; persona: Persona; emo: { e: Emotion; g: string | null; until: number } | null; idle: string; sig: string | null; base: THREE.Vector3; gest: string | null; gestUntil: number; gestT: number; wrongs: number }

export class Classroom3D {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(58, 1, 0.1, 80 * IS);
  boardL = new Board("left"); boardR = new Board("right"); projector = new Projector();
  seats: Seat[] = []; teacher!: TeacherState; subject: Subject = "math"; playerSeat!: Seat;
  mode: CamMode = "wide"; auto = true; dim = 0; private dimT = 0; yaw = 0; pitch = 0; free = { yaw: 0.0, pitch: 0.28, dist: 14 }; screenK = 0; screenRate = 0;
  onTapStudent: (d: NpcDef) => void = () => {}; onTapTeacher: () => void = () => {}; onTapDemo: () => void = () => {}; onTapPic: (pid: string) => void = () => {}; onHover: (s: string | null, x: number, y: number) => void = () => {};
  inputLocked = false; keys: Record<string, boolean> = {};
  private blobTex = HT.blobTex(); private nav: string[] = []; private cell = 0.25; private nx = 0; private nz = 0;
  private camPos = new THREE.Vector3(0, 3.5, 8.6); private camLook = new THREE.Vector3(0, 2.5, -9); private camFov = 58;
  private pBeam!: Beam; private lights!: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight; spot: THREE.SpotLight; ceil: THREE.MeshBasicMaterial; beam: THREE.Mesh; glow: THREE.Mesh };
  private decor = new THREE.Group(); private demo = new THREE.Group(); private demoModel: THREE.Object3D | null = null; private demoMatClones: THREE.Material[] = [];
  private boardMats: THREE.MeshBasicMaterial[] = []; private t = 0; private last = performance.now(); private raycaster = new THREE.Raycaster(); private hoverT = 0; private tex = new Map<string, THREE.Texture>();
  private pet!: ClassPet; private fx!: { tick(t: number): void }; private tod = Mood.realTod(); private todT = 0; private todParam = Mood.queryTod();
  private px: ClassPx | null = null; private desks!: THREE.InstancedMesh; private pointer = { x: 0, y: 0, down: false, sx: 0, sy: 0, st: 0 };

  constructor(public host: HTMLElement) {
    const phone = smallScreen();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !phone, alpha: false, powerPreference: phone ? "low-power" : "high-performance" }); r.setPixelRatio(dprCap()); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.outputColorSpace = THREE.SRGBColorSpace;
    scaleScene(this.scene); host.appendChild(r.domElement); this.scene.background = new THREE.Color("#EADFCB");
    this.buildLights(); this.buildShell(); this.buildFront(); this.buildSeats(); this.buildStaticDecor(); this.buildDetails(); this.fx = buildClassExtras(this.scene, { X0, X1, Z0, Z1, WALL, groundY, rowH, rowZ, ROWS, XS, ceilPanels: [0, 1, 2].flatMap((i) => [0, 1, 2, 3].map((j) => [-5.5 + i * 5.5, -6 + j * 4.6] as [number, number])) }); this.scene.add(this.decor, this.demo); this.buildNav(); this.buildTeacher(TEACHER_BY_SUBJECT.math); this.pet = new ClassPet(this.scene, { x: -8.0, z: -8.4, w: 1.5, d: 1.3, y: STAGE_H });
    if (isPixar()) { this.px = setupPixarClass(this, { X0, X1, Z0, Z1, WALL, STAGE_H, groundY, rowH, rowZ }, this.lights as any); this.px.refresh(this.scene); }
    else this.px = setupPixarClass(this, { X0, X1, Z0, Z1, WALL, STAGE_H, groundY, rowH, rowZ }, this.lights as any, true);
    this.px.syncTeacher();
    this.bindInput(r.domElement); addEventListener("resize", () => this.resize()); this.resize(); this.snapCamera(); requestAnimationFrame(this.frame);
  }
  private T<K extends string>(key: K, make: () => THREE.Texture) { let t = this.tex.get(key); if (!t) { t = make(); this.tex.set(key, t); } return t; }
  private rep(key: string, make: () => THREE.Texture, rx: number, ry: number) { const k = `${key}@${rx}x${ry}`; let t = this.tex.get(k); if (!t) { t = this.T(key, make).clone(); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.needsUpdate = true; this.tex.set(k, t); } return t; }
  resize() { const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight; this.renderer.setSize(w, h); this.px?.resize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  /* ------------------------------------------------------------ materials + helpers */
  private std(map: THREE.Texture | null, color = "#ffffff") { return new THREE.MeshStandardMaterial({ map, color, roughness: 0.95, metalness: 0 }); }
  private plain(c: string) { return new THREE.MeshStandardMaterial({ color: c, roughness: 1 }); }
  private box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], x: number, y: number, z: number, o: { outline?: boolean; shadow?: boolean; parent?: THREE.Object3D } = {}) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = o.shadow ?? true; m.receiveShadow = true; (o.parent ?? this.scene).add(m);
    if (o.outline !== false) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0x6d5a5f, transparent: true, opacity: 0.5 }))); return m;
  }
  /** flat paper card on a wall: rotY 0 faces +z (front wall), PI/2 faces +x (left wall), -PI/2 faces -x (right wall), PI faces -z (back wall) */
  private card(tex: THREE.Texture, w: number, h: number, x: number, y: number, z: number, rotY: number, parent: THREE.Object3D = this.decor, basic = false) {
    const g = new THREE.Group(), sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 1.1, h * 1.1), new THREE.MeshBasicMaterial({ map: this.T("cardsh", () => HT.cardShadowTex()), transparent: true, opacity: 0.5, depthWrite: false }));
    sh.position.set(0.03, -0.05, 0); const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), basic ? new THREE.MeshBasicMaterial({ map: tex, transparent: true }) : new THREE.MeshStandardMaterial({ map: tex, roughness: 1, transparent: true })); m.position.z = 0.02; m.receiveShadow = true;
    g.add(sh, m); g.position.set(x, y, z); g.rotation.y = rotY; parent.add(g); return m;
  }

  /* ------------------------------------------------------------ lights */
  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0xe4d3b4, 1.8), sun = new THREE.DirectionalLight(0xfff0d8, 1.45); sun.position.set(-7, 11, 5); sun.target.position.set(0, 0, 0); sun.castShadow = true; sun.shadow.mapSize.set(shadowSize(2048), shadowSize(2048));
    const c = sun.shadow.camera; c.left = -13 * IS; c.right = 13 * IS; c.top = 14 * IS; c.bottom = -14 * IS; c.near = 1; c.far = 40 * IS; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    const spot = new THREE.SpotLight(0xfff3d6, 0, 30 * IS, Math.PI / 5, 0.55, 1.2); spot.position.set(0, 4.9, 3.2); spot.target.position.set(0, 3.0, -9.4); this.scene.add(hemi, sun, sun.target, spot, spot.target); Mood.rig({ hemi, sun, bg: this.scene.background as THREE.Color, manual: true });
    const ceil = new THREE.MeshBasicMaterial({ color: 0xffffff }), beam = new THREE.Mesh(new THREE.ConeGeometry(3.7, 12.8, 28, 1, true), new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    beam.position.set(0, 3.9, -3.2); beam.rotation.x = -Math.PI / 2 + 0.07; beam.scale.set(1, 1, 0.6); this.scene.add(beam);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshBasicMaterial({ color: 0x9fc7ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); glow.position.set(0, 3.05, -9.3); this.scene.add(glow);
    this.lights = { hemi, sun, spot, ceil, beam, glow };
    rimLight(this.scene, 0.4, [6, 7, 12]); vignette(this.host, 0.24); aoStrips(this.scene, [{ x0: X0, z0: Z0, x1: X1, z1: Z1 }], { inward: true, width: 1.3, opacity: 0.38, y: 0.02 });   // cool rim, vignette, wall/floor occlusion
    this.pBeam = new Beam(this.scene, Social.profile.avatar.shirt, { size: 0.9, height: 5.5 });   // light pillar over your seat
  }

  /* ------------------------------------------------------------ room shell */
  private buildShell() {
    const S = this.scene, wid = X1 - X0, dep = Z1 - Z0, cap = this.plain("#F7ECD6"), outer = this.plain("#D8C6A4");
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(wid, dep), Mood.tinted(this.std(this.rep("wood", () => CT.floorWood(), wid / 4, dep / 4)), "floor", 0.7)); floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, (Z0 + Z1) / 2); floor.receiveShadow = true; S.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(wid, dep), new THREE.MeshStandardMaterial({ map: this.rep("ceil", () => CT.ceiling(), wid / 3, dep / 3), roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, WALL, (Z0 + Z1) / 2); S.add(ceil);
    const wall = (len: number, cx: number, cz: number, horiz: boolean, innerIdx: number, key: string) => { const inner = Mood.tinted(this.std(this.rep(key, () => HT.wallTex(), len / 4, 1)), "wash", 1), mats = [outer, outer, cap, outer, outer, outer]; mats[innerIdx] = inner; this.box(horiz ? len : 0.3, WALL, horiz ? 0.3 : len, mats, cx, WALL / 2, cz, { outline: false, shadow: false }); };
    wall(wid + 0.6, 0, Z0 - 0.15, true, 4, "wallF"); wall(wid + 0.6, 0, Z1 + 0.15, true, 5, "wallB"); wall(dep, X0 - 0.15, (Z0 + Z1) / 2, false, 0, "wallL"); wall(dep, X1 + 0.15, (Z0 + Z1) / 2, false, 1, "wallR");
    // stage + stepped rows
    const stageTop = this.std(this.rep("stage", () => CT.rowCarpet(), 6, 1)); this.box(wid, STAGE_H, STAGE_Z - Z0 + 0.0, [this.plain("#B98B5A"), this.plain("#B98B5A"), stageTop, this.plain("#B98B5A"), this.plain("#9A653D"), this.plain("#9A653D")], 0, STAGE_H / 2, (Z0 + STAGE_Z) / 2);
    for (let r = 1; r < ROWS; r++) { const z = rowZ(r) - ROW_DZ / 2, d = Z1 - z; this.box(wid, rowH(r), d, [this.plain("#B8C9D6"), this.plain("#B8C9D6"), this.std(this.rep("rowc", () => CT.rowCarpet(), 6, 1)), this.plain("#8aa1b3"), this.plain("#5E7F9D"), this.plain("#5E7F9D")], 0, rowH(r) / 2, z + d / 2, { shadow: false }); }
    // baseboards
    for (const s of [-1, 1]) this.box(0.1, 0.22, dep, this.plain("#9A653D"), s * (wid / 2 - 0.05), 0.11, (Z0 + Z1) / 2, { outline: false, shadow: false });
    this.box(wid, 0.22, 0.1, this.plain("#9A653D"), 0, 0.11, Z0 + 0.05, { outline: false, shadow: false });
    // ceiling light panels + pendant lamps
    const lm = this.lights.ceil; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { const p = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.1), lm); p.rotation.x = Math.PI / 2; p.position.set(-5.5 + i * 5.5, WALL - 0.02, -6 + j * 4.6); S.add(p); }
  }

  /* ------------------------------------------------------------ front of the room: boards, screen, projector, podium */
  private buildFront() {
    const S = this.scene, zF = Z0 + 0.06;
    const bm = (b: Board) => { const m = new THREE.MeshBasicMaterial({ map: b.tex, toneMapped: false }); this.boardMats.push(m); return m; };
    for (const [b, x] of [[this.boardL, -6.2], [this.boardR, 6.2]] as const) { this.box(4.0, 2.6, 0.12, this.plain("#9DA7AA"), x, 2.9, zF); const m = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.31), bm(b)); m.position.set(x, 2.9, zF + 0.07); S.add(m); this.box(3.9, 0.12, 0.3, this.plain("#C9B28A"), x, 1.56, zF + 0.1, { outline: false }); for (let i = 0; i < 3; i++) this.box(0.28, 0.06, 0.06, this.plain(["#2a5fa8", "#c4463c", "#2f7a52"][i]), x - 1 + i * 0.4, 1.63, zF + 0.16, { outline: false, shadow: false }); }
    // projector screen
    this.box(6.8, 3.95, 0.16, this.plain("#313A3F"), 0, 3.05, zF); const sm = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 3.6), new THREE.MeshBasicMaterial({ map: this.projector.tex, toneMapped: false })); sm.position.set(0, 3.05, zF + 0.09); S.add(sm); (this as any).screenMesh = sm;
    this.box(7.2, 0.18, 0.28, this.plain("#9DA7AA"), 0, 5.1, zF + 0.05); for (const s of [-1, 1]) this.box(0.08, 0.8, 0.08, this.plain("#5b6a70"), s * 3.1, 4.7, zF + 0.1, { outline: false });
    // ceiling projector
    this.box(0.9, 0.34, 0.7, this.plain("#EDE2CF"), 0, WALL - 0.4, 3.2); const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 16), new THREE.MeshBasicMaterial({ color: 0xcfe6ff })); lens.rotation.x = Math.PI / 2; lens.position.set(0, WALL - 0.4, 2.8); S.add(lens);
    this.box(0.06, 0.4, 0.06, this.plain("#9DA7AA"), 0, WALL - 0.2, 3.2, { outline: false });
    // teacher desk (left) and podium, flag
    this.box(1.9, 0.08, 0.85, this.std(CT.deskTop("#C98B4D")), -3.0, STAGE_H + PROP_H.classTeacherDesk - 0.04, -7.9); for (const [dx, dz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) this.box(0.08, 0.76, 0.08, this.plain("#9A653D"), -3.0 + dx, STAGE_H + 0.38, -7.9 + dz, { outline: false });
    this.box(0.5, 0.04, 0.34, this.plain("#9DA7AA"), -3.4, STAGE_H + 0.84, -7.85); this.box(0.5, 0.3, 0.04, this.plain("#313A3F"), -3.4, STAGE_H + 1.02, -8.03); this.box(0.3, 0.34, 0.3, this.plain("#E07A66"), -2.4, STAGE_H + 0.99, -7.9);
    const flag = new THREE.Group(); this.box(0.06, 3.2, 0.06, this.plain("#9DA7AA"), 0, 1.6, 0, { parent: flag, outline: false }); const fm = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.7), new THREE.MeshStandardMaterial({ map: this.T("flag", () => this.flagTex()), side: THREE.DoubleSide })); fm.position.set(0.58, 2.8, 0); flag.add(fm); flag.position.set(8.2, STAGE_H, -8.6); S.add(flag);
    // clock + banner
    this.card(this.T("clock", () => HT.clockTex()), 0.8, 0.8, 0, 5.1, Z0 + 0.2, 0, S as any); this.card(this.T("bnr", () => CT.bannerStrip("LEARN • ASK • DISCOVER", "#E07A66")), 4.6, 0.58, -6.2, 4.52, Z0 + 0.12, 0, S as any);
    // spotlight pools of paper on the stage floor
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 2.8), this.std(this.rep("carpet", () => CT.carpet(), 3, 1))); rug.rotation.x = -Math.PI / 2; rug.position.set(0, STAGE_H + 0.012, -7.0); rug.receiveShadow = true; S.add(rug);
  }
  private flagTex() { const cv = document.createElement("canvas"); cv.width = 256; cv.height = 160; const c = cv.getContext("2d")!; for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? "#fff" : "#D9564A"; c.fillRect(0, i * 23, 256, 23); } c.fillStyle = "#2b3a55"; c.fillRect(0, 0, 110, 92); c.fillStyle = "#fff"; for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(16 + (i % 4) * 26, 18 + Math.floor(i / 4) * 26, 5, 0, 7); c.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

  /* ------------------------------------------------------------ desks, chairs and the seated people */
  private buildSeats() {
    const n = ROWS * COLS, pxl = isPixar(), deskG = pxl ? new RoundedBoxGeometry(1.34, 0.1, 0.7, 4, 0.045) : new RoundedBoxGeometry(1.3, 0.07, 0.66, 2, 0.025), legG = pxl ? new RoundedBoxGeometry(1.2, 0.7, 0.1, 3, 0.04) : new THREE.BoxGeometry(1.2, 0.7, 0.06), chairG = pxl ? new RoundedBoxGeometry(0.66, 0.1, 0.58, 4, 0.05) : new RoundedBoxGeometry(0.62, 0.07, 0.55, 2, 0.028), backG = pxl ? new RoundedBoxGeometry(0.66, 0.52, 0.1, 4, 0.05) : new RoundedBoxGeometry(0.62, 0.5, 0.06, 2, 0.028);
    const desks = this.desks = new THREE.InstancedMesh(deskG, this.std(CT.deskTop("#D9A86B")), n), legs = new THREE.InstancedMesh(legG, this.plain("#9A653D"), n), seatM = new THREE.InstancedMesh(chairG, this.plain("#4F91C7"), n), backM = new THREE.InstancedMesh(backG, this.plain("#4F91C7"), n);
    const m4 = new THREE.Matrix4(), cols = ["#4F91C7", "#E07A66", "#88B89A", "#EAB94E"]; let i = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, i++) {
      const x = XS[c], z = rowZ(r), y = rowH(r), col = new THREE.Color(cols[(r + c) % 4]);
      m4.makeTranslation(x, y + PROP_H.deskTop - (pxl ? 0.05 : 0.035), z - 0.38); desks.setMatrixAt(i, m4); m4.makeTranslation(x, y + 0.35, z - 0.62); legs.setMatrixAt(i, m4);
      m4.makeTranslation(x, y + 0.42, z + 0.3); seatM.setMatrixAt(i, m4); seatM.setColorAt(i, col); m4.makeTranslation(x, y + 0.7, z + 0.58); backM.setMatrixAt(i, m4); backM.setColorAt(i, col);
      const bb = makeBillboard(this.scene, { id: i, skin: "#f0c29b", hair: "#3a2a30", style: "crop", shirt: "#4f91c7" } as any, SEAT_POSES, this.blobTex); bb.sprite.visible = false; bb.blob.visible = false;
      this.seats.push({ r, c, x, z: z + 0.3, y: y + 0.44, bb, def: null, hand: 0, handT: 0, act: 0, actT: Math.random() * 4, player: false });
    }
    for (const m of [desks, legs, seatM, backM]) { m.castShadow = true; m.receiveShadow = true; this.scene.add(m); }
    this.playerSeat = this.seats[3 * COLS + 3]; this.playerSeat.player = true;
  }
  /** seat everyone: the player at a front-ish seat and the class (attendees first, then the rest of the roster) around them */
  assign(attendees: number[] = []) {
    const pool = [...attendees.map((id) => ROSTER[id]).filter(Boolean), ...ROSTER.filter((d) => !attendees.includes(d.id))]; let k = 0;
    for (const s of this.seats) {
      this.disposeBB(s.bb);
      if (s.player) { s.def = null; s.bb = this.mkSeatBB(s, { ...toLook(Social.profile.avatar, 11), tag: false }); }
      else { const d = pool[k++ % pool.length]; s.def = d; s.bb = this.mkSeatBB(s, d.look); }
      s.hand = 0; s.act = 0;
    }
    this.px?.syncSeats();
  }
  private mkSeatBB(s: Seat, look: any) { const bb = makeBillboard(this.scene, look, SEAT_POSES, this.blobTex); bb.sprite.position.set(s.x, s.y, s.z); bb.blob.position.set(s.x, s.y - 0.38, s.z + 0.05); bb.blob.scale.set(0.9, 0.9, 1); return bb; }
  private disposeBB(b: Billboard) { this.scene.remove(b.sprite, b.blob); b.tex.dispose(); b.mat.dispose(); (b.blob.material as THREE.Material).dispose(); }
  rebuildPlayer() { const s = this.playerSeat; this.pBeam.setColor(Social.profile.avatar.shirt); this.disposeBB(s.bb); s.bb = this.mkSeatBB(s, { ...toLook(Social.profile.avatar, 11), tag: false }); this.px?.syncSeats(); }
  setHand(npcId: number, up: boolean) { const s = this.seats.find((x) => x.def?.id === npcId); if (s) { s.hand = up ? 1 : 0; s.handT = 0; } }
  setPlayerHand(up: boolean) { this.playerSeat.hand = up ? 1 : 0; this.playerSeat.handT = 0; }
  seatedDefs(): NpcDef[] { return this.seats.filter((s) => s.def).map((s) => s.def!); }
  seatOf(id: number) { return this.seats.find((s) => s.def?.id === id); }

  /* ------------------------------------------------------------ decor */
  private buildStaticDecor() {
    const S = this.scene, G = this.decor; const winT = this.T("win", () => HT.windowTex());
    // windows (left wall) and posters (right wall), bunting, lanterns
    for (const z of [-6.4, 7.9]) { Mood.window(this.card(winT, 1.9, 2.4, X0 + 0.17, 2.95, z, Math.PI / 2, S as any).material as THREE.MeshStandardMaterial); }
    this.buildBoard();
    [[-1.9, 2.3], [-0.5, 2.0], [1.0, 2.5]].forEach(([z, y], i) => this.card(this.T(`gal${i + 3}`, () => CT.gallery(i + 3)), 1.1, 1.1, X1 - 0.17, y + 0.5, z, -Math.PI / 2, S as any));
    this.card(this.T("rules", () => CT.posterRules()), 1.5, 2.0, X1 - 0.17, 2.4, 2.0, -Math.PI / 2, S as any); this.card(this.T("cal", () => CT.calendar()), 1.1, 1.4, X1 - 0.17, 2.4, 4.0, -Math.PI / 2, S as any);
    this.card(this.T("quote", () => CT.posterQuote("Every question is a good question.")), 3.4, 0.85, 0, 3.0, Z1 - 0.2, Math.PI, S as any);
    // bunting along both side walls and the front
    const bun = (x0: number, z0: number, x1: number, z1: number, y: number) => { const cols = [0xF28F7E, 0xEAB94E, 0x8FC9E8, 0xA9DCC0, 0xB8A8DA, 0xEAA5B2].map((c) => new THREE.Color(c)), pos: number[] = [], col: number[] = []; const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 0.8), tx = (x1 - x0) / len, tz = (z1 - z0) / len; for (let i = 0; i < n; i++) { const d = 0.4 + i * 0.8, cx = x0 + tx * d, cz = z0 + tz * d, c = cols[i % 6]; pos.push(cx - tx * 0.2, y, cz - tz * 0.2, cx + tx * 0.2, y, cz + tz * 0.2, cx, y - 0.44, cz); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b); } const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); S.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }))); };
    bun(X0 + 0.07, Z0, X0 + 0.07, Z1, WALL - 0.12); bun(X1 - 0.07, Z0, X1 - 0.07, Z1, WALL - 0.12); bun(X0, Z1 - 0.07, X1, Z1 - 0.07, WALL - 0.12);
    [[-5, -5.5, "#F8D977"], [5, -5.5, "#F28F7E"], [-5, 0, "#8FC9E8"], [5, 0, "#A9DCC0"], [-5, 5.5, "#B8A8DA"], [5, 5.5, "#EAA5B2"]].forEach(([x, z, col]: any) => { const l = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), new THREE.MeshStandardMaterial({ map: HT.lanternTex(col), emissive: new THREE.Color(col), emissiveIntensity: 0.25, roughness: 1 })); l.scale.y = 1.2; l.position.set(x, WALL - 1.1, z); l.castShadow = true; S.add(l); const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 4), this.plain("#9A653D")); str.position.set(x, WALL - 0.55, z); S.add(str); });
    // bookshelf + globe + pet cage (left wall front), cubbies + door + reading corner (back)
    const shelf = new THREE.Group(); this.box(0.5, 1.6, 3.6, this.plain("#C98B4D"), 0, 0.8, 0, { parent: shelf }); for (let i = 0; i < 4; i++) this.box(0.52, 0.05, 3.6, this.plain("#9A653D"), 0, 0.05 + i * 0.45, 0, { parent: shelf, outline: false }); const bc = ["#4F91C7", "#E07A66", "#88B89A", "#EAB94E", "#B8A8DA", "#F28F7E", "#8173AE"]; for (let r = 0; r < 3; r++) { let z = -1.6; for (let k = 0; k < 14; k++) { const w = 0.16 + (k * 37 % 5) * 0.03; this.box(0.34, 0.34 - (k % 3) * 0.04, w, this.plain(bc[(k + r * 2) % 7]), 0, 0.28 + r * 0.45 + 0.17 - (k % 3) * 0.02, z + w / 2, { parent: shelf, outline: false, shadow: false }); z += w + 0.01; } } shelf.position.set(X0 + 0.4, 0, -6.2); S.add(shelf);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.28, 20, 16), new THREE.MeshStandardMaterial({ map: this.globeTex(), roughness: 0.9 })); globe.position.set(X0 + 0.46, 1.78, -5.4); globe.castShadow = true; S.add(globe); this.box(0.06, 0.12, 0.06, this.plain("#9A653D"), X0 + 0.46, 1.54, -5.4, { outline: false });
    const cage = this.box(0.5, 0.36, 0.4, new THREE.MeshStandardMaterial({ color: "#CFEFFB", transparent: true, opacity: 0.55, roughness: 0.4 }), X0 + 0.46, 1.56 + 0.3, -7.2); const ham = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), this.plain("#E8C39A")); ham.position.set(X0 + 0.46, 1.78, -7.2); S.add(ham); void cage;
    for (let i = 0; i < 6; i++) { const x = X0 + 1 + i * 1.2; this.box(1.0, 1.0, 0.5, this.plain(["#F2A79B", "#9CC3E0", "#F4D488", "#B7D8A4", "#C9B7E8", "#F6B294"][i]), x, 0.5, Z1 - 0.3); this.box(0.8, 0.34, 0.04, this.plain("#fff6ea"), x, 0.78, Z1 - 0.07, { outline: false, shadow: false }); }
    const door = this.card(this.T("door", () => HT.doorTex("#8173AE")), 1.3, PROP_H.classDoor, X1 - 1.6, PROP_H.classDoor / 2, Z1 - 0.12, Math.PI, S as any); void door; this.card(this.T("exit", () => HT.signTex("EXIT", "#E07A66")), 1.0, 0.25, X1 - 1.6, PROP_H.classDoor + 0.25, Z1 - 0.12, Math.PI, S as any);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), this.std(this.rep("rug2", () => CT.carpet(), 2, 2))); rug.rotation.x = -Math.PI / 2; rug.position.set(X0 + 2.0, rowH(5) + 0.012, Z1 - 1.4); S.add(rug); [["#E07A66", -0.5, 0.3], ["#4F91C7", 0.5, -0.3], ["#88B89A", 0.2, 0.8]].forEach(([c, dx, dz]: any) => { const b = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), this.plain(c)); b.scale.set(1, 0.6, 1); b.position.set(X0 + 2.0 + dx, rowH(5) + 0.2, Z1 - 1.4 + dz); b.castShadow = true; S.add(b); });
    for (const [x, z] of [[X0 + 0.8, Z0 + 1.0], [X1 - 0.8, Z1 - 0.8], [X0 + 0.8, Z1 - 0.8]]) this.plant(x, rowH(z > 4 ? 5 : 0) + (z < -7 ? STAGE_H : 0), z);
    void G;
  }

  /* ------------------------------------------------------------ extra fixtures: the small things that make a real classroom read as real */
  private textTex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const c = cv.getContext("2d")!; draw(c, w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
  private cyl(rt: number, rb: number, h: number, col: string, x: number, y: number, z: number, parent: THREE.Object3D = this.scene, seg = 14) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), this.plain(col)); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
  private buildDetails() {
    const S = this.scene, wid = X1 - X0, dep = Z1 - Z0, cream = "#F7ECD6", wood = "#9A653D", ink = "#4A3B3F", B = (w: number, h: number, d: number, col: string, x: number, y: number, z: number, parent: THREE.Object3D = S) => this.box(w, h, d, this.plain(col), x, y, z, { outline: false, shadow: false, parent });
    // crown moulding + back baseboard
    B(wid, 0.14, 0.14, cream, 0, WALL - 0.07, Z0 + 0.07); B(wid, 0.14, 0.14, cream, 0, WALL - 0.07, Z1 - 0.07); for (const s of [-1, 1]) B(0.14, 0.14, dep, cream, s * (wid / 2 - 0.07), WALL - 0.07, (Z0 + Z1) / 2);
    B(wid, 0.22, 0.1, wood, 0, 0.11, Z1 - 0.05);
    // ceiling: light-panel frames, sprinklers, vents, smoke detectors, speakers, conduit
    for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) B(2.7, 0.02, 1.4, "#C9C2B2", -5.5 + i * 5.5, WALL - 0.005, -6 + j * 4.6);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 5; j++) { const x = -7.5 + i * 5, z = -7.5 + j * 3.9; this.cyl(0.03, 0.03, 0.12, "#B8B2A4", x, WALL - 0.06, z, S, 8); this.cyl(0.14, 0.14, 0.02, "#EDE6D4", x, WALL - 0.12, z, S, 12); }
    for (const [x, z] of [[-2.9, -2.1], [2.9, 3.4]]) { B(1.0, 0.05, 0.5, "#D9D2C2", x, WALL - 0.03, z); for (let k = 0; k < 6; k++) B(0.9, 0.012, 0.025, "#8a8478", x, WALL - 0.062, z - 0.2 + k * 0.08); }
    for (const [x, z] of [[-1.3, 8.2], [1.2, -8.8]]) { this.cyl(0.13, 0.13, 0.05, "#F4F1E8", x, WALL - 0.04, z, S, 16); const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 6), new THREE.MeshBasicMaterial({ color: 0x5fae6a })); led.position.set(x + 0.06, WALL - 0.075, z); S.add(led); }
    for (const sx of [-1, 1]) { B(0.38, 0.5, 0.3, "#3b2f33", sx * (wid / 2 - 0.35), WALL - 0.55, Z0 + 0.35); this.cyl(0.13, 0.13, 0.02, "#6b5a5f", sx * (wid / 2 - 0.35), WALL - 0.55, Z0 + 0.51, S, 14).rotation.x = Math.PI / 2; }
    B(0.07, 0.07, dep - 1, "#B8B2A4", X0 + 0.6, WALL - 0.12, (Z0 + Z1) / 2);
    // windows: frames, sills, blinds, curtains, radiators
    [-6.2, -2.6, 1.0, 4.6, 7.8].forEach((z, i) => {
      const x = X0 + 0.2; B(0.1, 2.46, 0.1, "#F7ECD6", x, 2.95, z - 0.98); B(0.1, 2.46, 0.1, "#F7ECD6", x, 2.95, z + 0.98); B(0.1, 0.1, 2.06, "#F7ECD6", x, 4.2, z); B(0.1, 0.1, 2.06, "#F7ECD6", x, 1.72, z); B(0.1, 0.06, 0.05, "#F7ECD6", x, 2.95, z);
      B(0.34, 0.07, 2.2, "#E8D9B8", x + 0.12, 1.66, z); B(0.18, 0.04, 2.1, "#EDE2CF", x + 0.04, 1.61, z);
      const open = [0.3, 0.55, 0.15, 0.7, 0.4][i]; for (let k = 0; k < Math.round(10 * open); k++) B(0.04, 0.035, 1.9, i % 2 ? "#F4E9D2" : "#EAD9B8", x + 0.07, 4.1 - k * 0.075, z);
      B(0.02, 0.06, 1.95, "#9A653D", x + 0.07, 4.17, z);
      if (i % 2 === 0) { B(0.05, 0.05, 2.5, "#6b4a4f", x + 0.14, 4.3, z); for (const s of [-1, 1]) { const cur = B(0.06, 2.4, 0.5, ["#F28F7E", "#8FC9E8", "#EAB94E"][i / 2], x + 0.16, 2.95, z + s * 1.1); cur.scale.z = 1; for (let f = 0; f < 3; f++) B(0.07, 2.4, 0.04, "#a89880", x + 0.17, 2.95, z + s * 1.1 - 0.18 + f * 0.18); } }
      if (i % 2) { B(0.34, 0.6, 1.9, "#E8E2D2", X0 + 0.32, 0.52, z); for (let f = 0; f < 11; f++) B(0.36, 0.5, 0.025, "#B8B2A4", X0 + 0.33, 0.52, z - 0.85 + f * 0.17); B(0.36, 0.05, 1.96, "#D9D2C2", X0 + 0.33, 0.83, z); }
    });
    // right wall: bulletin board, extinguisher, thermostat, intercom, fire alarm, light switch, outlets

    this.cyl(0.11, 0.11, 0.62, "#C4463C", X1 - 0.3, 1.2, 8.7, S, 14); this.cyl(0.06, 0.09, 0.14, "#2b2b33", X1 - 0.3, 1.58, 8.7, S, 10); B(0.05, 0.05, 0.22, "#2b2b33", X1 - 0.3, 1.48, 8.55);
    this.card(this.T("fireS", () => HT.signTex("FIRE", "#C4463C")), 0.55, 0.14, X1 - 0.17, 1.82, 8.7, -Math.PI / 2, S as any);
    B(0.06, 0.22, 0.16, "#F4F1E8", X1 - 0.14, 1.35, 5.4); B(0.02, 0.1, 0.07, "#5fae6a", X1 - 0.18, 1.37, 5.4);
    B(0.06, 0.34, 0.26, "#EDE2CF", X1 - 0.14, 3.7, -1.2); this.cyl(0.07, 0.07, 0.03, "#6b5a5f", X1 - 0.17, 3.7, -1.2, S, 12).rotation.z = Math.PI / 2;
    B(0.06, 0.2, 0.14, "#C4463C", X1 - 0.14, 1.3, 6.6); B(0.02, 0.05, 0.1, "#fff", X1 - 0.18, 1.3, 6.6);
    for (const [x, y, z, rot] of [[X1 - 0.12, 0.45, -5.1, 0], [X1 - 0.12, 0.45, 3.0, 0], [X0 + 0.12, 0.45, -3.8, 0], [X0 + 0.12, 0.45, 5.9, 0]] as const) { void rot; B(0.04, 0.17, 0.12, "#EDE6D4", x, y, z); for (const dz of [-0.025, 0.025]) B(0.045, 0.045, 0.012, "#5b4a4f", x + (x > 0 ? -0.01 : 0.01), y + (dz > 0 ? 0.035 : -0.035), z); }
    // front wall details: hand sanitizer, outlets, tray with eraser
    B(0.2, 0.34, 0.12, "#EDE2CF", -8.3, 1.4, Z0 + 0.1); B(0.08, 0.1, 0.1, "#8FC9E8", -8.3, 1.52, Z0 + 0.18);
    // back wall: sink counter, wall shelf, coat hooks + backpacks, pencil sharpener, door furniture, switches, class charts
    const cx = 3.8, cz = Z1 - 0.34; this.box(2.8, 0.9, 0.6, this.plain("#C98B4D"), cx, 0.45, cz, { outline: true }); B(2.9, 0.07, 0.68, "#EDE2CF", cx, 0.93, cz); B(0.52, 0.04, 0.38, "#9DA7AA", cx - 0.5, 0.97, cz); B(0.4, 0.02, 0.28, "#7a8a92", cx - 0.5, 0.99, cz);
    this.cyl(0.025, 0.025, 0.34, "#9DA7AA", cx - 0.5, 1.12, cz + 0.2, S, 8); B(0.04, 0.04, 0.18, "#9DA7AA", cx - 0.5, 1.28, cz + 0.11); for (const dx of [-0.35, 0.35]) B(0.01, 0.8, 0.02, "#8a7050", cx + dx, 0.45, cz - 0.31); [[-0.9, 0.06], [-0.9, 0.06], [0.5, 0.06], [1.0, 0.06]].forEach(([dx]) => { this.cyl(0.03, 0.03, 0.08, "#5b4a4f", cx + dx, 0.5, cz - 0.32, S, 8).rotation.x = Math.PI / 2; });
    for (const [dx, col, h] of [[0.4, "#E07A66", 0.2], [0.75, "#4F91C7", 0.26], [1.1, "#88B89A", 0.18]] as const) this.cyl(0.07, 0.07, h, col, cx + dx, 0.97 + h / 2, cz, S, 10);
    B(2.6, 0.06, 0.34, wood, cx, 2.1, Z1 - 0.2); for (let k = 0; k < 7; k++) { const col = ["#4F91C7", "#E07A66", "#88B89A", "#EAB94E", "#B8A8DA", "#F28F7E", "#8173AE"][k]; B(0.2, 0.34 + (k % 3) * 0.06, 0.24, col, cx - 1.1 + k * 0.36, 2.28 + (k % 3) * 0.03, Z1 - 0.22); } for (const dx of [-1.1, 1.1]) B(0.05, 0.16, 0.2, wood, cx + dx, 2.02, Z1 - 0.2);
    B(2.4, 0.07, 0.07, wood, 0.4, 1.7, Z1 - 0.08); for (let k = 0; k < 6; k++) { B(0.04, 0.13, 0.1, "#6b4a4f", -0.55 + k * 0.38, 1.66, Z1 - 0.12); } [["#4F91C7", -0.2], ["#E07A66", 0.55], ["#88B89A", 1.3]].forEach(([col, x]: any) => { this.box(0.42, 0.52, 0.18, this.plain(col), x, 1.12, Z1 - 0.18, { outline: false, shadow: false }); B(0.3, 0.2, 0.06, shade2(col), x, 1.0, Z1 - 0.3); B(0.18, 0.03, 0.04, "#fff6ea", x, 1.34, Z1 - 0.18); });
    B(0.22, 0.2, 0.2, "#9DA7AA", 5.6, 1.2, Z1 - 0.12); this.cyl(0.04, 0.04, 0.04, "#3b2f33", 5.6, 1.2, Z1 - 0.23, S, 8).rotation.x = Math.PI / 2; B(0.05, 0.07, 0.2, "#6b5a5f", 5.72, 1.3, Z1 - 0.12);
    const dx0 = X1 - 1.6; B(0.12, 2.7, 0.14, wood, dx0 - 0.82, 1.35, Z1 - 0.1); B(0.12, 2.7, 0.14, wood, dx0 + 0.82, 1.35, Z1 - 0.1); B(1.76, 0.12, 0.14, wood, dx0, 2.7, Z1 - 0.1);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 1.1), new THREE.MeshStandardMaterial({ color: "#CFE6F2", transparent: true, opacity: 0.6, roughness: 0.2 })); glass.position.set(dx0 + 0.25, 1.7, Z1 - 0.2); glass.rotation.y = Math.PI; S.add(glass); B(0.4, 0.04, 0.03, "#6b4a4f", dx0 + 0.25, 2.27, Z1 - 0.2); B(0.4, 0.04, 0.03, "#6b4a4f", dx0 + 0.25, 1.13, Z1 - 0.2);
    B(0.06, 0.06, 0.14, "#C9B28A", dx0 - 0.6, 1.1, Z1 - 0.22); this.cyl(0.035, 0.035, 0.1, "#C9B28A", dx0 - 0.6, 1.1, Z1 - 0.27, S, 8).rotation.x = Math.PI / 2; B(1.4, 0.2, 0.03, "#C9B28A", dx0, 0.12, Z1 - 0.2);
    for (const y of [0.4, 1.2, 2.0]) B(0.05, 0.12, 0.04, "#9DA7AA", dx0 + 0.82, y, Z1 - 0.2);
    B(0.12, 0.2, 0.05, "#F4F1E8", dx0 - 1.15, 1.35, Z1 - 0.09); B(0.03, 0.08, 0.02, "#fff", dx0 - 1.15, 1.37, Z1 - 0.13); B(0.12, 0.2, 0.05, "#F4F1E8", dx0 - 1.15 - 0.16, 1.35, Z1 - 0.09);
    this.card(this.textTex(512, 400, (c, w, h) => { c.fillStyle = "#FFF9F0"; c.fillRect(0, 0, w, h); c.strokeStyle = "#C9B28A"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = "#E07A66"; c.font = "700 44px 'Trebuchet MS',sans-serif"; c.textAlign = "center"; c.fillText("CLASS JOBS", w / 2, 62); c.fillStyle = ink; c.font = "600 30px 'Trebuchet MS',sans-serif"; c.textAlign = "left"; ["Line leader", "Door holder", "Plant helper", "Board eraser", "Pencil sharpener", "Messenger"].forEach((t, i) => { c.fillText(t, 36, 120 + i * 46); c.fillStyle = ["#4F91C7", "#E07A66", "#88B89A", "#EAB94E", "#B8A8DA", "#F28F7E"][i]; c.beginPath(); c.arc(w - 60, 108 + i * 46, 14, 0, 7); c.fill(); c.fillStyle = ink; }); }), 1.3, 1.0, -6.7, 2.7, Z1 - 0.2, Math.PI, S as any);
    this.card(this.textTex(512, 400, (c, w, h) => { c.fillStyle = "#EAF3FA"; c.fillRect(0, 0, w, h); c.strokeStyle = "#8FC9E8"; c.lineWidth = 8; c.strokeRect(4, 4, w - 8, h - 8); c.fillStyle = "#4F91C7"; c.font = "700 44px 'Trebuchet MS',sans-serif"; c.textAlign = "center"; c.fillText("BIRTHDAYS", w / 2, 62); c.font = "600 26px 'Trebuchet MS',sans-serif"; ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"].forEach((m, i) => { const x = 40 + (i % 4) * 118, y = 120 + Math.floor(i / 4) * 90; c.fillStyle = ["#F28F7E", "#EAB94E", "#88B89A", "#B8A8DA"][i % 4]; c.beginPath(); c.arc(x + 30, y, 30, 0, 7); c.fill(); c.fillStyle = "#fff"; c.fillText(m, x + 30, y + 9); }); }), 1.3, 1.0, -5.1, 2.7, Z1 - 0.2, Math.PI, S as any);
    this.card(this.T("nook", () => HT.signTex("READING NOOK", "#8173AE")), 1.9, 0.48, -7.2, 3.9, Z1 - 0.2, Math.PI, S as any);
    // floor: bins, teacher desk accessories and chair, small stool by the shelf
    const bin = (x: number, z: number, col: string, label: string) => { const g = new THREE.Group(); this.cyl(0.26, 0.21, 0.56, col, 0, 0.28, 0, g, 18); this.cyl(0.275, 0.275, 0.05, shade2(col), 0, 0.58, 0, g, 18); const t = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1), new THREE.MeshBasicMaterial({ map: this.T("bin" + label, () => HT.signTex(label, "#4A3B3F")), transparent: true })); t.position.set(0, 0.36, 0.25); g.add(t); g.position.set(x, STAGE_H, z); S.add(g); };
    bin(X1 - 0.55, -7.4, "#4F91C7", "RECYCLE"); bin(X1 - 0.55, -6.7, "#5b6a70", "TRASH");
    const dy = STAGE_H + 0.84, dxT = -3.0, dzT = -7.9;
    for (let k = 0; k < 4; k++) B(0.42 - k * 0.02, 0.06, 0.3, ["#E07A66", "#4F91C7", "#88B89A", "#EAB94E"][k], dxT + 0.45, dy + 0.03 + k * 0.06, dzT + 0.1);
    this.cyl(0.06, 0.05, 0.1, "#fff6ea", dxT + 0.1, dy + 0.05, dzT + 0.15, S, 10); B(0.03, 0.05, 0.03, "#c4463c", dxT + 0.1, dy + 0.12, dzT + 0.15);
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), this.plain("#D9564A")); apple.position.set(dxT - 0.25, dy + 0.07, dzT + 0.2); apple.castShadow = true; S.add(apple); B(0.012, 0.04, 0.012, "#5E9C72", dxT - 0.25, dy + 0.15, dzT + 0.2);
    this.cyl(0.075, 0.065, 0.14, "#EAB94E", dxT - 0.6, dy + 0.07, dzT - 0.05, S, 12); this.cyl(0.07, 0.07, 0.015, "#6b3f28", dxT - 0.6, dy + 0.14, dzT - 0.05, S, 12);
    for (const [dx, dz, col] of [[-0.7, 0.2, "#4F91C7"], [-0.6, 0.25, "#E07A66"]] as const) { const pad = B(0.3, 0.015, 0.4, col, dxT + dx - 0.2, dy + 0.01, dzT + dz - 0.05); pad.rotation.y = dx * 0.4; }
    const ch = new THREE.Group(); this.box(0.7, 0.08, 0.66, this.plain("#2b3a55"), 0, 0.55, 0, { parent: ch, outline: false }); this.box(0.68, 0.7, 0.08, this.plain("#2b3a55"), 0, 0.95, 0.34, { parent: ch, outline: false }); this.cyl(0.04, 0.04, 0.5, "#6b5a5f", 0, 0.28, 0, ch, 8); for (let a = 0; a < 5; a++) { const arm = this.box(0.34, 0.03, 0.05, this.plain("#4a4a52"), Math.cos(a * 1.2566) * 0.17, 0.04, Math.sin(a * 1.2566) * 0.17, { parent: ch, outline: false, shadow: false }); arm.rotation.y = -a * 1.2566; } ch.position.set(dxT + 0.1, STAGE_H, -8.75); ch.rotation.y = 0.15; S.add(ch);
    // per-desk detail (instanced): chair legs, book box, notebook, pencil, water bottle
    const n = ROWS * COLS, nb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.02, 0.38), this.plain("#ffffff"), n), pc = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 0.19, 5), this.plain("#EAB94E"), n), bt = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 8), this.plain("#8FC9E8"), n), bk = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.16, 0.34), this.plain("#C9B28A"), n), lg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.045, 0.4, 0.045), this.plain("#6b5a5f"), n * 4);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), cols = ["#F28F7E", "#8FC9E8", "#EAB94E", "#A9DCC0", "#B8A8DA", "#fff6ea"]; let i = 0, li = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++, i++) {
      const x = XS[c], z = rowZ(r), y = rowH(r), j = (i * 7919) % 13 / 13;
      e.set(0, (j - 0.5) * 0.5, 0); q.setFromEuler(e); m4.compose(p.set(x - 0.25 + j * 0.1, y + 0.825, z - 0.38 + (j - .5) * .1), q, sc); nb.setMatrixAt(i, m4); nb.setColorAt(i, new THREE.Color(cols[i % 6]));
      e.set(0, 0, Math.PI / 2); q.setFromEuler(e); e.set(0, 1.0 + j, Math.PI / 2); q.setFromEuler(e); m4.compose(p.set(x + 0.1, y + 0.83, z - 0.4), q, sc); pc.setMatrixAt(i, m4);
      q.identity(); m4.compose(p.set(x + 0.5, y + 0.9, z - 0.55), q, i % 3 === 0 ? sc : new THREE.Vector3(0.001, 0.001, 0.001)); bt.setMatrixAt(i, m4); bt.setColorAt(i, new THREE.Color(cols[(i + 2) % 6]));
      m4.compose(p.set(x, y + 0.6, z - 0.62), q, sc); bk.setMatrixAt(i, m4);
      for (const [lx, lz] of [[-0.26, 0.05], [0.26, 0.05], [-0.26, 0.5], [0.26, 0.5]]) { m4.compose(p.set(x + lx, y + 0.2, z + lz), q, sc); lg.setMatrixAt(li++, m4); }
    }
    for (const m of [nb, pc, bt, bk, lg]) { m.castShadow = false; m.receiveShadow = true; S.add(m); }
  }
  /** the class-times bulletin board on the right wall: today's picked time, the 5 session times and the lesson number */
  private boardCv!: HTMLCanvasElement; private boardTex!: THREE.CanvasTexture; private boardFocus: Subject | undefined;
  refreshBoard(focus: Subject | undefined = this.boardFocus) { this.boardFocus = focus; if (!this.boardCv) return; drawBoard(this.boardCv.getContext("2d")!, this.boardCv.width, this.boardCv.height, focus); this.boardTex.needsUpdate = true; }
  private buildBoard() {
    const cv = this.boardCv = document.createElement("canvas"); cv.width = 1024; cv.height = 560; this.boardTex = new THREE.CanvasTexture(cv); this.boardTex.colorSpace = THREE.SRGBColorSpace; this.boardTex.anisotropy = 4; this.refreshBoard();
    const mat = new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false }), g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.96, 3.56), this.plain("#9A653D")); frame.position.set(0, 0, 0); g.add(frame);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.86), mat); face.position.set(-0.055, 0, 0); face.rotation.y = -Math.PI / 2; g.add(face);
    g.position.set(X1 - 0.12, 2.75, -4.9); this.scene.add(g); addEventListener("unify:progress", () => this.refreshBoard());
  }
  private plant(x: number, y: number, z: number) { const g = new THREE.Group(), pot = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 0.42, 14), this.plain("#F28F7E")); pot.position.y = 0.21; pot.castShadow = true; g.add(pot); const cols = ["#5E9C72", "#88B89A", "#3F7655", "#A9DCC0"]; for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2, leaf = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9 + (i % 3) * 0.2, 4), this.plain(cols[i % 4])); leaf.position.set(Math.cos(a) * 0.16, 0.85, Math.sin(a) * 0.16); leaf.rotation.set(Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); leaf.castShadow = true; g.add(leaf); } g.position.set(x, y, z); this.scene.add(g); }
  private globeTex() { const cv = document.createElement("canvas"); cv.width = 256; cv.height = 128; const c = cv.getContext("2d")!; c.fillStyle = "#4F91C7"; c.fillRect(0, 0, 256, 128); c.fillStyle = "#88B89A"; for (const [x, y, w, h] of [[30, 30, 60, 40], [100, 24, 70, 36], [130, 70, 36, 40], [190, 36, 50, 34], [60, 80, 30, 30]]) { c.beginPath(); c.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 7); c.fill(); } const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; }

  /** subject-specific decor + the rotating 3D demo on the pedestal */
  wallPics: THREE.Mesh[] = [];
  setSubject(subject: Subject, lessonId: string, lessonPics: string[] = []) {
    this.subject = subject; for (const o of [...this.decor.children]) { this.decor.remove(o); o.traverse((m: any) => { m.geometry?.dispose?.(); }); } const D = this.decor, T = this.T.bind(this);
    this.wallPics.length = 0;
    const ids = picsFor(subject, lessonPics, 4), zs = [-3.9, -1.5, 0.9, 3.3];
    ids.forEach((pid, i) => {                                                // the pictures on the wall are the lesson's own pictures; tap one to enlarge it
      const tex = new THREE.CanvasTexture(drawPicFinal(pid)); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
      const frame = this.box(0.07, 1.3, 2.14, this.plain("#9A653D"), X0 + 0.14, 2.75, zs[i], { parent: D } as any); void frame;
      const m = this.card(tex, 2.0, 1.125, X0 + 0.19, 2.75, zs[i], Math.PI / 2, D, true); m.userData = { pid, title: picTitle(pid) }; this.wallPics.push(m);
      const lab = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.2), new THREE.MeshBasicMaterial({ map: CT.labelTex(picTitle(pid), "#E07A66"), transparent: true })); lab.position.set(X0 + 0.2, 2.0, zs[i]); lab.rotation.y = Math.PI / 2; D.add(lab);
    });
    if (subject === "science") { for (let i = 0; i < 5; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.12 + (i % 3) * 0.06, 14, 10), this.plain(["#F6B294", "#4F91C7", "#E07A66", "#EAB94E", "#B8A8DA"][i])); p.position.set(-6 + i * 3, WALL - 0.7 - (i % 2) * 0.5, -2.4); D.add(p); const st = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.7, 4), this.plain("#9DA7AA")); st.position.set(p.position.x, WALL - 0.3 - (i % 2) * 0.1, -2.4); D.add(st); } }
    this.buildDemo(lessonId); this.px?.refresh(this.scene);
  }
  private buildDemo(lessonId: string) {
    while (this.demo.children.length) { const o = this.demo.children[0]; this.demo.remove(o); }
    const ped = new THREE.Group(); this.box(0.9, 0.9, 0.9, this.plain("#C98B4D"), 0, 0.45, 0, { parent: ped }); this.box(1.0, 0.08, 1.0, this.plain("#EDE2CF"), 0, 0.94, 0, { parent: ped }); const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.2), new THREE.MeshBasicMaterial({ map: CT.labelTex("TRY IT", "#E07A66"), transparent: true })); tag.position.set(0, 0.5, 0.46); ped.add(tag);
    const model = this.makeDemoModel(lessonId); model.position.y = 1.5; ped.add(model); this.demoModel = model; ped.position.set(3.6, STAGE_H, -6.6); this.demo.add(ped); (ped as any).isDemo = true;
  }
  private makeDemoModel(id: string): THREE.Object3D {
    const g = new THREE.Group(), m = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }), add = (geo: THREE.BufferGeometry, c: string, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m(c)); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
    if (id === "parabola") { const pts: THREE.Vector3[] = []; for (let i = -10; i <= 10; i++) pts.push(new THREE.Vector3(i * 0.05, i * i * 0.006, 0)); g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.025, 6), m("#E9515D"))); add(new THREE.SphereGeometry(0.06, 12, 10), "#F8D977", 0, 0, 0); g.position.y = -0.1; }
    else if (id === "fractions") { for (let i = 0; i < 8; i++) add(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 16, 1, false, (i / 8) * Math.PI * 2, (Math.PI * 2) / 8 - 0.04), i < 3 ? "#E9515D" : "#F6C45C"); }
    else if (id === "egypt") { for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.9 - i * 0.18, 0.16, 0.9 - i * 0.18), "#E8C98A", 0, i * 0.16 - 0.3, 0); }
    else if (id === "cell") { add(new THREE.BoxGeometry(0.8, 0.6, 0.8), "#A9DCC0").material = new THREE.MeshStandardMaterial({ color: "#A9DCC0", transparent: true, opacity: 0.45 }); add(new THREE.SphereGeometry(0.2, 12, 10), "#CFE8F8", 0.05, 0, 0); for (const [x, y, z] of [[-0.25, 0.15, 0.2], [0.28, -0.1, -0.2], [0.2, 0.2, 0.25]]) add(new THREE.SphereGeometry(0.08, 10, 8), "#5E9C72", x, y, z); add(new THREE.SphereGeometry(0.07, 10, 8), "#B8A8DA", -0.28, -0.1, -0.1); }
    else if (id === "photosynthesis") { add(new THREE.CylinderGeometry(0.2, 0.15, 0.25, 12), "#E07A66", 0, -0.35, 0); add(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6), "#5E9C72", 0, -0.05, 0); for (let i = 0; i < 4; i++) { const l = add(new THREE.ConeGeometry(0.1, 0.34, 4), "#5E9C72", Math.cos(i * 1.6) * 0.18, 0.1 + i * 0.07, Math.sin(i * 1.6) * 0.18); l.rotation.z = Math.cos(i * 1.6) * 0.9; l.rotation.x = Math.sin(i * 1.6) * 0.9; } add(new THREE.SphereGeometry(0.1, 12, 10), "#F8D977", 0.4, 0.4, 0); }
    else if (id === "watercycle") { add(new THREE.SphereGeometry(0.17, 12, 10), "#fff", -0.12, 0.2, 0); add(new THREE.SphereGeometry(0.22, 12, 10), "#fff", 0.1, 0.24, 0); for (let i = 0; i < 4; i++) add(new THREE.ConeGeometry(0.04, 0.12, 6), "#8FC9E8", -0.2 + i * 0.13, -0.1 - (i % 2) * 0.12, 0).rotation.z = Math.PI; }
    else if (id === "gravity") { add(new THREE.SphereGeometry(0.3, 16, 12), "#4F91C7"); const moon = add(new THREE.SphereGeometry(0.1, 12, 10), "#EDE2CF", 0.6, 0, 0); moon.name = "moon"; }
    else if (id === "printing") { add(new THREE.BoxGeometry(0.7, 0.1, 0.5), "#6b3f28", 0, -0.35, 0); for (const sx of [-0.28, 0.28]) add(new THREE.BoxGeometry(0.07, 0.6, 0.07), "#9A653D", sx, -0.05, 0); add(new THREE.BoxGeometry(0.7, 0.07, 0.1), "#9A653D", 0, 0.27, 0); add(new THREE.BoxGeometry(0.4, 0.08, 0.3), "#9DA7AA", 0, -0.1, 0); }
    else if (id === "bill" || id === "branches" || id === "election") { add(new THREE.BoxGeometry(0.8, 0.3, 0.45), "#FFF9F0", 0, -0.25, 0); for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8), "#EDE2CF", -0.28 + i * 0.14, 0.05, 0.2); add(new THREE.SphereGeometry(0.2, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), "#EDE2CF", 0, 0.25, 0); }
    else if (id === "silkroad") { add(new THREE.SphereGeometry(0.34, 16, 12), "#4F91C7"); add(new THREE.TorusGeometry(0.4, 0.015, 6, 28), "#EAB94E").rotation.x = Math.PI / 2; add(new THREE.BoxGeometry(0.2, 0.12, 0.12), "#E9515D", 0.3, 0.1, 0.1); }
    else if (id === "theme" || id === "figurative") { add(new THREE.BoxGeometry(0.4, 0.05, 0.55), "#E07A66", -0.2, 0, 0).rotation.z = 0.25; add(new THREE.BoxGeometry(0.4, 0.05, 0.55), "#4F91C7", 0.2, 0, 0).rotation.z = -0.25; }
    else if (id === "orchestra" || id === "rhythm") { add(new THREE.CylinderGeometry(0.28, 0.28, 0.28, 18), "#E9515D", 0, -0.2, 0); add(new THREE.CylinderGeometry(0.29, 0.29, 0.03, 18), "#fff6ea", 0, -0.05, 0); for (let i = 0; i < 3; i++) add(new THREE.SphereGeometry(0.06, 10, 8), ["#F8D977", "#4F91C7", "#88B89A"][i], -0.25 + i * 0.25, 0.25 + (i % 2) * 0.1, 0); }
    else if (id === "colormix" || id === "perspective") { add(new THREE.CylinderGeometry(0.4, 0.4, 0.05, 24), "#E8C39A"); for (let i = 0; i < 4; i++) add(new THREE.SphereGeometry(0.08, 10, 8), ["#E9515D", "#F8D977", "#4F91C7", "#5FAE6A"][i], -0.22 + i * 0.15, 0.08, (i % 2) * 0.1); }
    else if (id === "life") { add(new THREE.BoxGeometry(0.5, 0.34, 0.36), "#C98569", 0, -0.3, 0); add(new THREE.BoxGeometry(0.54, 0.06, 0.4), "#9A653D", 0, -0.1, 0); add(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 12), "#EAB94E", -0.15, 0.02, 0.05); add(new THREE.SphereGeometry(0.09, 12, 10), "#D9564A", 0.12, 0.02, 0.0); add(new THREE.BoxGeometry(0.24, 0.02, 0.18), "#5E9C72", 0.1, -0.06, 0.1); }
    else if (id === "careers") { add(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), "#9A653D", 0, -0.1, 0); [["#E07A66", 0.28, 0.1, 0.25], ["#4F91C7", 0.12, -0.05, -0.3], ["#88B89A", 0.38, -0.2, 0.1]].forEach(([c, y, rot, x]: any, i) => { const b = add(new THREE.BoxGeometry(0.42, 0.12, 0.04), c, x * 0.3, y - 0.05 + i * 0.06 - 0.1, 0.03); b.rotation.y = rot; }); add(new THREE.SphereGeometry(0.06, 10, 8), "#EAB94E", 0, 0.38, 0); }
    else add(new THREE.IcosahedronGeometry(0.3, 0), "#B8A8DA");
    return g;
  }

  /* ------------------------------------------------------------ teacher: fluid walking on a nav grid */
  private buildNav() {
    const c = this.cell, nx = this.nx = Math.ceil((X1 - X0) / c), nz = this.nz = Math.ceil((Z1 - Z0) / c), blocked: number[][] = [];
    const pad = 0.12; for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) { const x = XS[k], z = rowZ(r); blocked.push([x - 0.68 - pad, z - 0.76 - pad, x + 0.68 + pad, z + 0.62 + pad]); }
    blocked.push([-4.1, -8.5, -1.9, -7.2], [3.0, -7.3, 4.2, -6.0], [X0, -7.9, X0 + 1.0, -4.4], [7.7, -9.2, 8.7, -8.0], [X0, 8.1, X0 + 3.4, Z1], [X1 - 2.6, 8.4, X1, Z1], [X0, 8.5, X1, Z1 - 0.2]);
    blocked[blocked.length - 1] = [X0, 9.0, X1, Z1];
    this.nav = Array.from({ length: nz }, (_, j) => Array.from({ length: nx }, (_, i) => { const x = X0 + (i + 0.5) * c, z = Z0 + (j + 0.5) * c; if (x < X0 + 0.3 || x > X1 - 0.3 || z < Z0 + 0.4 || z > Z1 - 0.3) return "#"; return blocked.some((b) => x > b[0] && x < b[2] && z > b[1] && z < b[3]) ? "#" : "."; }).join(""));
  }
  private tile(x: number, z: number) { return { i: Math.max(0, Math.min(this.nx - 1, Math.floor((x - X0) / this.cell))), j: Math.max(0, Math.min(this.nz - 1, Math.floor((z - Z0) / this.cell))) }; }
  private clear(a: { x: number; z: number }, b: { x: number; z: number }) { const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15); for (let k = 1; k < n; k++) { const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n, t = this.tile(x, z); if (this.nav[t.j][t.i] === "#") return false; } return true; }
  private buildTeacher(def: NpcDef) {
    if (this.teacher) this.disposeBB(this.teacher.bb);
    const persona = personaOf(def.faculty ?? def.personality), bb = makeBillboard(this.scene, { ...def.look, emote: persona.base }, TEACH_POSES, this.blobTex); const pos = this.teacher?.pos ?? new THREE.Vector3(SPOTS.center.x, STAGE_H, SPOTS.center.z);
    this.teacher = { bb, pos, path: [], face: new THREE.Vector3(0, 0, 1), speed: 0, talking: false, mode: "idle", res: null, walkPh: 0, faceTo: null, moving: false, def, persona, idle: FACULTY_BY_ID[def.faculty ?? ""]?.idle ?? "still", sig: FACULTY_BY_ID[def.faculty ?? ""]?.sig ?? null, base: bb.sprite.scale.clone(), emo: null, gest: null, gestUntil: 0, gestT: 2, wrongs: 0 };
    voice.mood = (d) => (d.id === def.id && this.teacher?.emo && this.t < this.teacher.emo.until ? this.teacher.emo.e : d.id === def.id ? persona.base : "neutral");
  }
  private plate: THREE.Sprite | null = null;
  /** a bold name plate that follows the teacher so you always know who is speaking */
  private makePlate(def: NpcDef) {
    if (this.plate) { this.scene.remove(this.plate); (this.plate.material as THREE.SpriteMaterial).map?.dispose(); }
    const cv = document.createElement("canvas"); cv.width = 512; cv.height = 112; const c = cv.getContext("2d")!; c.fillStyle = "#E8A33D"; c.beginPath(); c.roundRect(4, 6, 504, 100, 30); c.fill(); c.lineWidth = 7; c.strokeStyle = "#8a5f1c"; c.stroke();
    c.fillStyle = "#fff"; c.font = "700 46px 'Trebuchet MS',sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(def.name.length > 18 ? def.first : def.name, 256, 46); c.font = "600 26px 'Trebuchet MS',sans-serif"; c.fillText((def.title ?? "Teacher").slice(0, 30), 256, 84);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false })); sp.scale.set(2.3, 0.5, 1); sp.renderOrder = 20; this.scene.add(sp); this.plate = sp;
  }
  setTeacher(def: NpcDef) { this.buildTeacher(def); this.makePlate(def); this.px?.syncTeacher(); }
  /** walk to a named spot or point; resolves on arrival; the camera can follow */
  walkTo(spot: string | { x: number; z: number }, face?: [number, number]): Promise<void> {
    const t = this.teacher, s = typeof spot === "string" ? SPOTS[spot] : spot, dest = { x: s.x, z: s.z }, f = face ?? (typeof spot === "string" ? SPOTS[spot].face : undefined);
    const a = this.tile(t.pos.x, t.pos.z), b = this.tile(dest.x, dest.z); const tiles = astar(this.nav, a.i, a.j, b.i, b.j); const raw = [{ x: t.pos.x, z: t.pos.z }, ...tiles.map((q) => ({ x: X0 + (q.x + 0.5) * this.cell, z: Z0 + (q.y + 0.5) * this.cell }))];
    if (tiles.length) raw[raw.length - 1] = dest; else if (a.i !== b.i || a.j !== b.j) { /* blocked target: stay */ return Promise.resolve(); }
    const pts: { x: number; z: number }[] = []; for (let i = 0; i < raw.length - 1;) { let j = raw.length - 1; while (j > i + 1 && !this.clear(raw[i], raw[j])) j--; pts.push(raw[j]); i = j; }
    t.path = pts; t.faceTo = f ? new THREE.Vector3(f[0], 0, f[1]).normalize() : null; t.mode = "idle"; return new Promise((r) => { t.res?.(); t.res = r; if (!pts.length) { t.res = null; r(); } });
  }
  setTeacherMode(mode: TeacherState["mode"], face?: [number, number]) { const t = this.teacher; t.mode = mode; if (face) t.faceTo = new THREE.Vector3(face[0], 0, face[1]).normalize(); }
  setTalking(on: boolean) { this.teacher.talking = on; }
  /** show a feeling (and optionally a gesture) for a while */
  emote(e: Emotion, ms = 2600, g: string | null = null) { this.teacher.emo = { e, g, until: this.t + ms / 1000 }; }
  /** the teacher reacts in character; returns a short spoken interjection to put in front of the reply (may be "") */
  react(kind: Reaction): string {
    const T = this.teacher; let k: Reaction = kind;
    if (kind === "wrong") { T.wrongs++; if (T.wrongs >= 2) { k = "wrongAgain"; T.wrongs = 0; } } else if (kind === "correct") T.wrongs = 0;
    const r = T.persona.r[k]; this.emote(r.e, r.ms, r.g ?? null); return r.lines[Math.floor(Math.random() * r.lines.length)] ?? "";
  }
  get teacherMoving() { return this.teacher.path.length > 0; }
  private updateTeacher(dt: number) {
    const t = this.teacher; let moving = false;
    if (t.path.length) {
      const tgt = t.path[0], dx = tgt.x - t.pos.x, dz = tgt.z - t.pos.z, d = Math.hypot(dx, dz), remain = t.path.reduce((n, p, i) => n + (i === 0 ? d : Math.hypot(p.x - t.path[i - 1].x, p.z - t.path[i - 1].z)), 0);
      const want = Math.min(1.55 * t.persona.walk, 0.35 + remain * 0.9) ; t.speed += (want - t.speed) * Math.min(1, dt * 4); const step = Math.min(d, t.speed * dt);
      if (d < 0.04 || step >= d) { t.pos.x = tgt.x; t.pos.z = tgt.z; t.path.shift(); } else { t.pos.x += (dx / d) * step; t.pos.z += (dz / d) * step; const f = new THREE.Vector3(dx / d, 0, dz / d); t.face.lerp(f, Math.min(1, dt * 8)).normalize(); }
      moving = true; t.walkPh += dt * (3 + t.speed * 3.2);
      if (!t.path.length) { t.speed = 0; const r = t.res; t.res = null; r?.(); }
    } else { t.speed = 0; if (t.faceTo) t.face.lerp(t.faceTo, Math.min(1, dt * 6)).normalize(); }
    t.moving = moving; t.pos.y = groundY(t.pos.z); const b = t.bb, cam = new THREE.Vector3(); this.camera.getWorldDirection(cam); cam.y = 0; if (cam.lengthSq() < 1e-4) cam.set(0, 0, -1); cam.normalize();
    const dir = dirIndex(t.face, cam, 0); let pose = TEACH.stand; const now = this.t, emoOn = !!t.emo && now < t.emo.until;
    if (moving) pose = TEACH.walk1 + (Math.floor(t.walkPh) % 4);
    else if (t.mode === "write") pose = TEACH.write; else if (t.mode === "point") pose = Math.abs(t.face.z) > 0.8 ? TEACH.pointUp : TEACH.point; else if (t.mode === "present") pose = TEACH.present; else if (t.mode === "hold") pose = TEACH.hold;
    else if (emoOn) pose = t.emo!.g && GESTURE[t.emo!.g] !== undefined ? GESTURE[t.emo!.g] : emoPose(t.emo!.e, t.talking ? (Math.floor(now * 3.4) % 2 ? 1 : 2) : 0);
    else if (t.talking) {
      if (now > t.gestT) { const g = t.persona.gestures; t.gest = t.sig && Math.random() < 0.45 ? t.sig : g[Math.floor(Math.random() * g.length)]; t.gestUntil = now + 1.0 + Math.random() * 0.8; t.gestT = now + t.persona.fidget[0] + Math.random() * (t.persona.fidget[1] - t.persona.fidget[0]); }
      pose = t.gest && now < t.gestUntil && GESTURE[t.gest] !== undefined ? GESTURE[t.gest] : Math.floor(now * 3.4) % 2 ? TEACH.talkA : TEACH.talkB;
    }
    if (moving && t.talking) pose = TEACH.walk1 + (Math.floor(t.walkPh) % 4);
    setPose(b, pose, dir); b.sprite.position.copy(t.pos); if (this.plate) this.plate.position.set(t.pos.x, t.pos.y + 3.55 * (b.h ?? 1) / 1.4 + 0.5, t.pos.z);
    { const T2 = this.t, k = moving ? 0 : 1; let rot = 0, sy = 1, dy = 0; if (!moving) { if (t.idle === "bounce") dy = Math.abs(Math.sin(T2 * (t.talking ? 5 : 3.2))) * 0.05; else if (t.idle === "sway") rot = Math.sin(T2 * 1.6) * 0.035; else if (t.idle === "nod") sy = 1 + Math.sin(T2 * (t.talking ? 3.4 : 1.8)) * 0.012; else if (t.idle === "tilt") rot = 0.03 + Math.sin(T2 * 0.8) * 0.012; } b.mat.rotation += (rot * k - b.mat.rotation) * 0.15; b.sprite.scale.set(t.base.x, t.base.y * sy, 1); b.sprite.position.y += dy; } b.blob.position.set(t.pos.x, t.pos.y + 0.02, t.pos.z); placeBody(b, moving, this.t, false);
  }

  /* ------------------------------------------------------------ cameras */
  setMode(m: CamMode, manual = false) { if (manual) this.auto = false; if (m === "screen" && this.mode !== "screen") this.screenK = 0; this.mode = m; }
  /** slow dolly toward the screen over `secs` seconds */
  closeUpScreen(secs: number) { this.mode = "screen"; this.screenK = 0; this.screenRate = 1 / Math.max(2, secs); }
  setDim(on: boolean) { this.dimT = on ? 1 : 0; }
  private desired() {
    const T = this.teacher.pos, p = new THREE.Vector3(), l = new THREE.Vector3(); let fov = 56;
    switch (this.mode) {
      case "wide": p.set(0, 3.8, Z1 - 1.0); l.set(0, 1.7, Z0 + 2); fov = 50; break;
      case "follow": { const f = this.teacher.face; const cx = T.x * 0.55; p.set(cx - f.x * 1.0, T.y + 3.0, Math.min(Z1 - 1, T.z + 6.8)); l.set(cx, T.y + 1.9, T.z - 0.3); fov = 56; break; }
      case "board-left": p.set(-6.0, 2.6, -3.8); l.set(-6.2, 2.7, Z0); fov = 44; break;
      case "board-right": p.set(6.0, 2.6, -3.8); l.set(6.2, 2.7, Z0); fov = 44; break;
      case "screen": { const k = sstep(0, 1, this.screenK); p.set(0, 3.1 - k * 0.15, 2.8 - k * 4.8); l.set(0, 3.05, Z0); fov = 50 - k * 10; break; }
      case "bulletin": p.set(X1 - 5.2, 2.75, -4.9); l.set(X1, 2.75, -4.9); fov = 40; break;
      case "demo": p.set(3.6, 2.25, -2.5); l.set(3.6, 1.8, -6.6); fov = 46; break;
      case "seat": { const s = this.playerSeat; p.set(s.x, s.y + 1.12 / IS, s.z + 0.06); l.set(s.x + Math.sin(this.yaw) * 5, 2.45 + Math.tan(this.pitch) * 6, s.z - Math.cos(this.yaw) * 6); fov = 62; break; }
      case "free": { const f = this.free; p.set(Math.sin(f.yaw) * Math.cos(f.pitch) * f.dist, 2 + Math.sin(f.pitch) * f.dist, -1.5 + Math.cos(f.yaw) * Math.cos(f.pitch) * f.dist); p.z = Math.min(p.z, Z1 - 0.5); p.y = Math.min(p.y, WALL - 0.45); l.set(0, 2.1, -1.5); fov = 56; break; }
    }
    // keep the boards / projector fully in frame whatever the window shape: widen the vertical fov when the window is narrow
    const asp = this.camera.aspect || 1.6, need = (halfW: number, dist: number) => (2 * Math.atan(Math.tan(Math.atan(halfW / dist)) / asp) * 180) / Math.PI * 1.12, dist = p.distanceTo(l);
    if (this.mode === "wide") fov = Math.max(fov, need(7.6, dist)); else if (this.mode === "board-left" || this.mode === "board-right") fov = Math.max(fov, need(2.8, dist)); else if (this.mode === "screen") fov = Math.max(fov, need(3.8, dist)); else if (this.mode === "bulletin") fov = Math.max(fov, need(2.0, dist));
    return { p, l, fov: Math.min(fov, 105) };
  }
  private snapCamera() { const d = this.desired(); this.camPos.copy(d.p); this.camLook.copy(d.l); this.camFov = d.fov; this.applyCam(); }
  private applyCam() { this.camera.position.copy(this.camPos).multiplyScalar(IS); this.camera.fov = this.camFov; this.camera.updateProjectionMatrix(); this.camera.lookAt(this.camLook.clone().multiplyScalar(IS)); }

  /* ------------------------------------------------------------ input */
  private bindInput(el: HTMLElement) {
    el.addEventListener("pointerdown", (e) => { const p = this.pointer; p.down = true; p.x = p.sx = e.clientX; p.y = p.sy = e.clientY; p.st = performance.now(); el.setPointerCapture(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      const p = this.pointer; if (p.down) { const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; if (this.mode === "free") { this.free.yaw -= dx * 0.006; this.free.pitch = Math.max(0.05, Math.min(1.1, this.free.pitch + dy * 0.004)); } else if (this.mode === "seat") { this.yaw = Math.max(-0.9, Math.min(0.9, this.yaw - dx * 0.004)); this.pitch = Math.max(-0.3, Math.min(0.35, this.pitch - dy * 0.003)); } }
      else if (performance.now() - this.hoverT > 90) { this.hoverT = performance.now(); const hit = this.pick(e.clientX, e.clientY); this.onHover(hit?.label ?? null, e.clientX, e.clientY); }
    });
    el.addEventListener("pointerup", (e) => { const p = this.pointer, was = p.down; p.down = false; if (was && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) < 7 && performance.now() - p.st < 500) { const hit = this.pick(e.clientX, e.clientY); if (hit?.kind === "student") this.onTapStudent(hit.def!); else if (hit?.kind === "teacher") this.onTapTeacher(); else if (hit?.kind === "demo") this.onTapDemo(); else if (hit?.kind === "pic") this.onTapPic(hit.pid!); } });
    el.addEventListener("pointercancel", () => { this.pointer.down = false; });
    el.addEventListener("wheel", (e) => { if (this.mode === "free") { e.preventDefault(); this.free.dist = Math.max(5, Math.min(18, this.free.dist * Math.exp(e.deltaY * 0.001))); } }, { passive: false });
  }
  private pick(cx: number, cy: number): { kind: "student" | "teacher" | "demo" | "pic"; label: string; def?: NpcDef; pid?: string } | null {
    const r = this.renderer.domElement.getBoundingClientRect(), nd = new THREE.Vector2(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); this.raycaster.setFromCamera(nd, this.camera);
    const sprites: THREE.Object3D[] = [this.teacher.bb.sprite, ...this.seats.filter((s) => !s.player).map((s) => s.bb.sprite)]; const hits = this.raycaster.intersectObjects(sprites, false);
    if (hits.length) { const o = hits[0].object; if (o === this.teacher.bb.sprite) return { kind: "teacher", label: TEACHER_BY_SUBJECT[this.subject].name }; const s = this.seats.find((x) => x.bb.sprite === o); if (s?.def) return { kind: "student", label: `${s.def.name} (grade ${s.def.grade})`, def: s.def }; }
    const dh = this.raycaster.intersectObjects(this.demo.children, true); if (dh.length) return { kind: "demo", label: "Interactive 3D example: click to try" };
    const ph = this.raycaster.intersectObjects(this.wallPics, false); if (ph.length) { const u = ph[0].object.userData; return { kind: "pic", label: `Picture: ${u.title}. Click to enlarge`, pid: u.pid }; }
    return null;
  }

  /* ------------------------------------------------------------ frame */
  private frame = (now: number) => { try {
    const raw = now - this.last, dt = Math.min(0.05, raw / 1000); this.last = now; this.t += dt; Gfx.tick(raw);
    if ((this.todT -= dt) < 0) { this.todT = 5; this.tod = Mood.realTod(); } Mood.update(dt, this.todParam ?? this.tod); this.fx.tick(this.t);
    this.boardL.update(dt); this.boardR.update(dt); this.projector.update(dt); this.pet.tick(dt);
    if (this.mode === "screen") this.screenK = Math.min(1, this.screenK + dt * this.screenRate);
    // lighting: ease toward dim / bright
    this.dim += (this.dimT - this.dim) * Math.min(1, dt * 1.6); const d = this.dim, L = this.lights;
    const kp = this.px?.k ?? { hemi: 1, sun: 1 }; L.hemi.intensity = (1.8 - 1.4 * d) * Mood.hemiK * kp.hemi; L.sun.intensity = (1.45 - 1.25 * d) * Mood.sunK * kp.sun; L.spot.intensity = 70 * d; (L.beam.material as THREE.MeshBasicMaterial).opacity = 0.075 * d; (L.glow.material as THREE.MeshBasicMaterial).opacity = 0.1 * d; L.ceil.color.setRGB(1, 1, 1).lerp(Mood.lamp, Mood.glow * 0.7).multiplyScalar(1 - 0.78 * d);
    (this.scene.background as THREE.Color).copy(Mood.sky).multiplyScalar(1 - 0.7 * d); const tint = 1 - 0.62 * d;
    this.boardMats.forEach((m) => m.color.setScalar(1 - 0.6 * d)); this.updateTeacher(dt);
    const cam = new THREE.Vector3(); this.camera.getWorldDirection(cam); cam.y = 0; if (cam.lengthSq() < 1e-4) cam.set(0, 0, -1); cam.normalize();
    for (const s of this.seats) {
      const b = s.bb; if (!b.sprite) continue; b.sprite.visible = b.blob.visible = !s.c3; b.mat.color.setScalar(tint);
      s.handT += dt; s.actT -= dt; if (s.actT <= 0) { s.actT = 1.5 + Math.random() * 4; s.act = Math.random() < 0.28 ? 1 : 0; }
      let pose = SEAT.sit; if (s.hand === 1) { pose = s.handT < 0.25 ? SEAT.raiseHalf : SEAT.raiseFull; } else if (s.act && !s.player) pose = Math.floor(this.t * 2.2 + s.c) % 2 ? SEAT.writeA : SEAT.writeB; else if (s.player) pose = SEAT.sit;
      setPose(b, pose, dirIndex(b.facing, cam, 1)); placeBody(b, false, this.t, true);
    }
    this.teacher.bb.mat.color.setScalar(1 - 0.35 * d);
    if (this.demoModel) { this.demoModel.rotation.y += dt * 0.7; const moon = this.demoModel.getObjectByName("moon"); if (moon) moon.position.set(Math.cos(this.t * 1.3) * 0.6, 0, Math.sin(this.t * 1.3) * 0.6); }
    // camera
    if (this.mode === "seat" || this.mode === "free") { /* user driven */ }
    const des = this.desired(), k = 1 - Math.exp(-dt * (this.mode === "screen" ? 3.5 : 2.6)); this.camPos.lerp(des.p, k); this.camLook.lerp(des.l, k); this.camFov += (des.fov - this.camFov) * k; this.applyCam();
    { const ps = this.playerSeat; this.pBeam.update(this.t, this.camera, { x: ps.x, y: ps.y - 0.44, z: ps.z }, !!ps.bb.sprite, IS); }
    if (this.px) { this.px.update(dt, this.t, d); this.px.render(dt); } else this.renderer.render(this.scene, this.camera);
  } catch (err) { console.warn("class frame", err); }
    requestAnimationFrame(this.frame);
  };
}
