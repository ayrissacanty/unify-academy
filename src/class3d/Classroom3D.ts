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