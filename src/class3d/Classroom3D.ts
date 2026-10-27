import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { Beam } from "../shared/beam";
import { dprCap, shadowSize, vignette, rimLight, smallScreen } from "../shared/polish";
import { SUBJECTS, type Subject } from "../hall3d/campus";
import { bakeSheet, COLS, DIRS, FW, FH, SCALE, FEET, AGE_SCALE, type Look } from "../hall3d/characters";
import { toLook, type AvatarSpec } from "../hall3d/avatar";
import { ROSTER } from "../hall3d/roster";
import { Social } from "../hall3d/social";
import { CURRICULUM, type Lesson, type QuizQ } from "./curriculum";
import { Progress } from "../game/progress";
import { drawBlackboard } from "../game/timesui";
import { buildQuiz } from "./quiz";
import { getStyle } from "../dorm/style";
import { isPixar } from "../shared/look";
import { Pet } from "./pet";
import { SEQ, playSeq, type SeqStep } from "./sequence";
import { INTERIOR_SCALE as IS, CHAR_K, scaleScene } from "../shared/scale";

export interface ClassOpts { subject: Subject; onExit: () => void; onToast: (m: string) => void }
const UNIT = 1.75 / 45;
const ROOM = { w: 15, d: 11, h: 3.6 };

interface Kid { look: Look; sprite: THREE.Sprite; mat: THREE.SpriteMaterial; tex: THREE.Texture; seat: THREE.Vector3; defId: number }

export class Classroom3D {
  renderer: THREE.WebGLRenderer; scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(46, 1, 0.1, 120 * IS);
  subject: Subject; lesson: Lesson; kids: Kid[] = []; player!: Kid; teacher!: Kid;
  board!: THREE.Mesh; boardCv = document.createElement("canvas"); boardTex!: THREE.CanvasTexture;
  clock = 0; private last = performance.now(); private t = 0;
  private quiz: ReturnType<typeof buildQuiz> | null = null; private pet: Pet | null = null;
  onQuiz: (q: QuizQ[]) => void = () => {}; onDone: (ok: boolean) => void = () => {}; onPet: () => void = () => {};
  private beam!: Beam;
  constructor(public host: HTMLElement, public opts: ClassOpts) {
    const phone = smallScreen();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: !phone, powerPreference: phone ? "low-power" : "high-performance" });
    r.setPixelRatio(dprCap()); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap; r.outputColorSpace = THREE.SRGBColorSpace;
    scaleScene(this.scene); host.appendChild(r.domElement); this.scene.background = new THREE.Color("#F3E7CF");
    this.subject = opts.subject;
    const lessons = CURRICULUM[this.subject] ?? [];
    this.lesson = lessons[Progress.index(this.subject, lessons.length)] ?? lessons[0];
    this.buildLights(); this.buildRoom(); this.buildPeople(); this.buildBoard(); this.buildDecor();
    this.pet = new Pet(this.scene, this.subject, this.player.sprite.position.clone());
    this.beam = new Beam(this.scene, Social.profile.avatar.shirt);
    addEventListener("resize", () => this.resize()); this.resize();
    requestAnimationFrame(this.frame);
  }
  dispose() { this.renderer.dispose(); this.host.innerHTML = ""; }
  resize() { const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }

  private std(map: THREE.Texture | null, color = "#ffffff") { return new THREE.MeshStandardMaterial({ map, color, roughness: 0.92 }); }
  private plain(color: string) { return new THREE.MeshStandardMaterial({ color, roughness: isPixar() ? 0.75 : 1 }); }
  private clay(w: number, h: number, d: number, rad = 0.06) {
    const min = Math.min(w, h, d), r = Math.min(rad, min / 2 - 0.005);
    return r > 0.01 ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d);
  }

  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff6e8, 0xe8d8bc, 1.7); this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.35); sun.position.set(4, 6, 5); sun.castShadow = true;
    const phone = smallScreen(); sun.shadow.mapSize.set(shadowSize(phone ? 512 : 1024), shadowSize(phone ? 512 : 1024));
    sun.shadow.camera.left = -10 * IS; sun.shadow.camera.right = 10 * IS; sun.shadow.camera.top = 10 * IS; sun.shadow.camera.bottom = -10 * IS;
    this.scene.add(sun, sun.target);
    rimLight(this.scene, 0.35); vignette(this.host, 0.2);
  }

  private buildRoom() {
    const { w, d, h } = ROOM;
    const style = getStyle(isPixar() ? "pixar" : "storybook");
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), this.std(null, style.floor)); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    const wallM = this.plain(style.wall), trimM = this.plain(style.trim);
    const mkWall = (ww: number, x: number, z: number, rotY: number) => { const m = new THREE.Mesh(this.clay(ww, h, 0.24), wallM); m.position.set(x, h / 2, z); m.rotation.y = rotY; m.castShadow = m.receiveShadow = true; this.scene.add(m); };
    mkWall(w, 0, -d / 2, 0); mkWall(w, 0, d / 2, 0); mkWall(d, -w / 2, 0, Math.PI / 2); mkWall(d, w / 2, 0, Math.PI / 2);
    for (const z of [-d / 2 + 0.14, d / 2 - 0.14]) { const b = new THREE.Mesh(this.clay(w, 0.16, 0.06), trimM); b.position.set(0, 0.1, z); this.scene.add(b); }
    for (const x of [-w / 2 + 0.14, w / 2 - 0.14]) { const b = new THREE.Mesh(this.clay(d, 0.16, 0.06), trimM); b.position.set(x, 0.1, 0); b.rotation.y = Math.PI / 2; this.scene.add(b); }
    const rug = new THREE.Mesh(new THREE.CircleGeometry(2.6, 26), this.plain("#E07A66")); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.02, 0.6); rug.receiveShadow = true; this.scene.add(rug);
  }

  private buildPeople() {
    const mk = (look: Look, x: number, z: number, defId: number): Kid => {
      const tex = new THREE.CanvasTexture(bakeSheet(look)); tex.colorSpace = THREE.SRGBColorSpace; tex.repeat.set(1 / COLS, 1 / DIRS.length); tex.anisotropy = 4;
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
      const sprite = new THREE.Sprite(mat); const hgt = AGE_SCALE[look.age ?? "hs"] * CHAR_K;
      sprite.center.set(0.5, FEET / FH); sprite.scale.set(((FW / SCALE) * UNIT) * hgt, ((FH / SCALE) * UNIT) * hgt, 1);
      sprite.position.set(x, 0, z); this.scene.add(sprite);
      return { look, sprite, mat, tex, seat: new THREE.Vector3(x, 0, z), defId };
    };
    this.player = mk({ ...toLook(Social.profile.avatar, 11), tag: true } as Look, 0, 1.2, 11);
    const roster = ROSTER.filter((r) => r.age !== "adult").slice(0, 6);
    roster.forEach((r, i) => { const a = (i + 1) / (roster.length + 1), x = -4.5 + a * 9; this.kids.push(mk(r.look, x, 0.4 + (i % 2) * 0.9, r.id)); });
    this.teacher = mk(ROSTER.find((r) => r.age === "adult")?.look ?? roster[0].look, 0, -2.6, -1);
    // little desks under each kid
    for (const k of [...this.kids, this.player]) {
      const desk = new THREE.Mesh(this.clay(0.9, 0.07, 0.6), this.plain("#C4894A")); desk.position.set(k.seat.x, 0.62, k.seat.z - 0.42); desk.castShadow = true; this.scene.add(desk);
      const leg = new THREE.Mesh(this.clay(0.08, 0.6, 0.08), this.plain("#9A653D")); leg.position.set(k.seat.x, 0.31, k.seat.z - 0.42); this.scene.add(leg);
    }
  }

  private buildBoard() {
    this.boardCv.width = 1024; this.boardCv.height = 512; this.boardTex = new THREE.CanvasTexture(this.boardCv); this.boardTex.colorSpace = THREE.SRGBColorSpace; this.boardTex.anisotropy = 4;
    const frame = new THREE.Mesh(this.clay(5.2, 2.7, 0.1), this.plain("#9A653D")); frame.position.set(0, 2.1, -ROOM.d / 2 + 0.2); this.scene.add(frame);
    this.board = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.5), new THREE.MeshBasicMaterial({ map: this.boardTex, toneMapped: false })); this.board.position.set(0, 2.1, -ROOM.d / 2 + 0.27); this.scene.add(this.board);
    this.drawBoard();
  }
  private drawBoard() {
    const c = this.boardCv.getContext("2d")!;
    drawBlackboard(c, this.boardCv.width, this.boardCv.height, this.subject, this.lesson);
    this.boardTex.needsUpdate = true;
  }

  private buildDecor() {
    const s = this.subject;
    const col = { math: "#4F91C7", ela: "#88B89A", science: "#8FC9E8", history: "#C98569", careers: "#E8A33D", life: "#7CB6A0" }[s];
    const shelf = new THREE.Mesh(this.clay(2.4, 1.4, 0.4), this.plain("#C4894A")); shelf.position.set(-ROOM.w / 2 + 1.4, 0.7, -ROOM.d / 2 + 0.4); shelf.castShadow = true; this.scene.add(shelf);
    const cols = ["#E23B4A", "#2E86C1", "#1F9A78", "#F0B429", "#8E7CC3"];
    for (let i = 0; i < 9; i++) { const b = new THREE.Mesh(this.clay(0.1, 0.4, 0.3), this.plain(cols[i % 5])); b.position.set(-ROOM.w / 2 + 0.55 + i * 0.22, 1.65, -ROOM.d / 2 + 0.4); this.scene.add(b); }
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.05, 20), this.plain("#FFFCF4")); clock.rotation.x = Math.PI / 2; clock.position.set(ROOM.w / 2 - 0.3, 2.7, 0); clock.rotation.z = Math.PI / 2; this.scene.add(clock);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.5), new THREE.MeshBasicMaterial({ color: col })); banner.position.set(0, 3.2, -ROOM.d / 2 + 0.14); this.scene.add(banner);
    const plant = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), this.plain("#2F9A56")); plant.position.set(ROOM.w / 2 - 1, 0.55, -ROOM.d / 2 + 0.8); this.scene.add(plant);
  }

  /** run the little teaching sequence, then offer the quiz */
  teach() {
    const steps: SeqStep[] = SEQ[this.subject] ?? [];
    playSeq(steps, {
      teacher: this.teacher.sprite, board: () => this.drawBoard(), toast: this.opts.onToast,
      done: () => { this.quiz = buildQuiz(this.lesson); this.onQuiz(this.quiz?.questions ?? []); },
    });
  }
  answer(i: number) { const ok = this.quiz?.answer(i) ?? false; if (this.quiz?.done) this.finish(); return ok; }
  private finish() {
    const ok = (this.quiz?.score ?? 0) >= (this.quiz?.pass ?? 1);
    if (ok) { Progress.complete(this.subject); this.pet?.celebrate(); }
    this.onDone(ok);
  }
  petFeed() { this.pet?.feed(); }
  petPat() { this.pet?.pat(); }

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    this.pet?.tick(this.t, dt);
    for (const [i, k] of [...this.kids, this.player, this.teacher].entries()) {
      const bob = k === this.teacher ? Math.sin(this.t * 1.4) * 0.03 : Math.sin(this.t * 2 + i) * 0.015;
      k.sprite.position.y = bob; k.tex.offset.set(0, 0);
    }
    this.beam.update(this.t, this.camera, this.player.sprite.position, true, IS);
    this.camera.position.set(0, 4.6 * IS, 7.8 * IS); this.camera.lookAt(0, 1.1 * IS, -1.5 * IS);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame(this.frame);
  };
}
void SUBJECTS;
