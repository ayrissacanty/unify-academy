/** The 3D club room: one friendly table per club in a half circle, a weekly schedule board on the back wall, a glowing ring on the clubs that meet today,
 *  and a green badge on the clubs you have joined. Click (or tap) a table to read about the club. Drag to look around a little, wheel or pinch to zoom.
 *  Pure scene: the popup and the join / meeting screens live in demo/clubs3d.ts and the existing community UI. */
import * as THREE from "three";
import { CLUBS, Clubs, type Club } from "../game/community";

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
/** which clubs meet on a weekday (0 = Sunday ... 6 = Saturday) */
export const clubsOn = (day: number, list: Club[] = CLUBS): Club[] => list.filter((c) => c.day === day);
/** the half-circle table positions for n clubs (front stays open for the camera) */
export function seats(n: number, radius = 7.6): { x: number; z: number; ry: number }[] {
  return Array.from({ length: n }, (_, i) => { const a = n === 1 ? 0 : -Math.PI * 0.42 + (i / (n - 1)) * Math.PI * 0.84; return { x: Math.sin(a) * radius, z: -Math.cos(a) * radius * 0.62 - 0.4, ry: -a * 0.6 }; });
}
const ACC: Record<string, string> = { garden: "#5FB37A", puzzle: "#6A7FDB", art: "#E8604C", drama: "#B06AD4", code: "#2BB5C9", kindness: "#F2A03D" };
const accOf = (c: Club, i: number) => ACC[c.id] ?? ["#E8604C", "#4F91C7", "#5FB37A", "#EAB94E", "#8E7CC3", "#2BB5C9", "#F28C4E"][i % 7];

function tex(w: number, h: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; draw(cv.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const rr = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => { c.beginPath(); c.roundRect(x, y, w, h, r); };

export class ClubRoom3D {
  scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(52, 1, 0.1, 80); renderer: THREE.WebGLRenderer;
  onPick: (c: Club | null) => void = () => {}; private ray = new THREE.Raycaster(); private stations: { club: Club; g: THREE.Group; ring: THREE.Mesh; badge: THREE.Sprite; hit: THREE.Mesh; today: boolean }[] = [];
  private yaw = 0; private dist = 11.4; private tY = 0; private tD = 11.4; private t = 0; private down: { x: number; y: number; yaw: number; moved: boolean } | null = null; private hover: Club | null = null; private pinch = 0; private last = performance.now(); private alive = true;
  constructor(public host: HTMLElement, private now = new Date()) {
    const r = (this.renderer = new THREE.WebGLRenderer({ antialias: true })); r.setPixelRatio(Math.min(devicePixelRatio || 1, 2)); r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap; r.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(r.domElement);
    this.scene.background = new THREE.Color("#F6E6CF"); this.scene.fog = new THREE.Fog("#F6E6CF", 18, 40);
    this.buildLights(); this.buildRoom(); this.buildBoard(); this.buildStations(); this.bind(r.domElement); addEventListener("resize", () => this.resize()); this.resize(); this.place(); requestAnimationFrame(this.frame);
  }
  private buildLights() {
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0xb59870, 1.7), sun = new THREE.DirectionalLight(0xfff0d0, 1.5); sun.position.set(-5, 9, 6); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 30 }); this.scene.add(hemi, sun);
  }
  private mat(c: string, rough = 0.85) { return new THREE.MeshStandardMaterial({ color: c, roughness: rough }); }
  private buildRoom() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 18), new THREE.MeshStandardMaterial({ map: tex(512, 512, (c, w, h) => { c.fillStyle = "#C99A62"; c.fillRect(0, 0, w, h); for (let i = 0; i < 12; i++) { c.fillStyle = i % 2 ? "#BF8F58" : "#D2A56E"; c.fillRect(0, (i * h) / 12, w, h / 12 - 3); } }), roughness: 0.9 })); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; this.scene.add(floor);
    (floor.material as THREE.MeshStandardMaterial).map!.wrapS = (floor.material as THREE.MeshStandardMaterial).map!.wrapT = THREE.RepeatWrapping; (floor.material as THREE.MeshStandardMaterial).map!.repeat.set(3, 2);
    const wall = (w: number, h: number, x: number, y: number, z: number, ry: number, col = "#F3D9B0") => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.mat(col)); m.position.set(x, y, z); m.rotation.y = ry; m.receiveShadow = true; this.scene.add(m); return m; };
    wall(26, 8, 0, 4, -9, 0); wall(18, 8, -13, 4, 0, Math.PI / 2, "#EFD0A3"); wall(18, 8, 13, 4, 0, -Math.PI / 2, "#EFD0A3");
    const trim = new THREE.Mesh(new THREE.BoxGeometry(26, 0.35, 0.12), this.mat("#8A5A3A")); trim.position.set(0, 0.18, -8.94); this.scene.add(trim);
    // rugs, windows, plants
    const rug = new THREE.Mesh(new THREE.CircleGeometry(6.4, 48), new THREE.MeshStandardMaterial({ map: tex(512, 512, (c, w, h) => { const g = c.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w / 2); g.addColorStop(0, "#9FD3C7"); g.addColorStop(0.7, "#7FB7A8"); g.addColorStop(0.72, "#F2B138"); g.addColorStop(1, "#E8604C"); c.fillStyle = g; c.fillRect(0, 0, w, h); }), roughness: 1 })); rug.rotation.x = -Math.PI / 2; rug.position.set(0, 0.01, -2.6); rug.scale.set(1.25, 0.75, 1); rug.receiveShadow = true; this.scene.add(rug);
    for (const x of [-10.5, 10.5]) { const win = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), new THREE.MeshBasicMaterial({ map: tex(256, 256, (c, w, h) => { const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, "#9ED2F2"); g.addColorStop(1, "#E6F4FB"); c.fillStyle = g; c.fillRect(0, 0, w, h); c.fillStyle = "#6BAA75"; c.beginPath(); c.arc(60, h, 80, Math.PI, 0); c.fill(); c.beginPath(); c.arc(190, h, 60, Math.PI, 0); c.fill(); c.strokeStyle = "#8A5A3A"; c.lineWidth = 10; c.strokeRect(5, 5, w - 10, h - 10); c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.moveTo(0, h / 2); c.lineTo(w, h / 2); c.stroke(); }) })); win.position.set(x, 4.2, -8.9); this.scene.add(win); }
    for (const x of [-12, 12]) { const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.35, 0.7, 16), this.mat("#E07A66")); pot.position.set(x * 0.96, 0.35, -8); pot.castShadow = true; this.scene.add(pot); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.14, 1.5 + (i % 3) * 0.3, 5), this.mat(["#5E9C72", "#3F7655", "#88B89A"][i % 3])); const a = (i / 7) * Math.PI * 2; l.position.set(x * 0.96 + Math.cos(a) * 0.25, 1.35, -8 + Math.sin(a) * 0.25); l.rotation.set(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45); l.castShadow = true; this.scene.add(l); } }
  }
  /** the weekly schedule board: Monday to Friday, with today highlighted */
  private buildBoard() {
    const today = this.now.getDay(), W = 1024, H = 640;
    const t = tex(W, H, (c) => {
      c.fillStyle = "#355C4B"; rr(c, 0, 0, W, H, 28); c.fill(); c.strokeStyle = "#B98A55"; c.lineWidth = 14; rr(c, 7, 7, W - 14, H - 14, 24); c.stroke();
      c.fillStyle = "#FFF6E0"; c.font = "700 46px 'Trebuchet MS',sans-serif"; c.textAlign = "center"; c.fillText("🎒 Club Corner: this week", W / 2, 70);
      for (let d = 1; d <= 5; d++) {
        const y = 110 + (d - 1) * 100, on = d === today, list = clubsOn(d);
        c.fillStyle = on ? "#F2B138" : "rgba(255,255,255,.14)"; rr(c, 34, y, W - 68, 86, 18); c.fill();
        c.fillStyle = on ? "#3b3552" : "#FFF6E0"; c.textAlign = "left"; c.font = "700 36px 'Trebuchet MS',sans-serif"; c.fillText(DAY_NAMES[d] + (on ? "  (today)" : ""), 56, y + 54);
        c.font = "600 34px 'Trebuchet MS',sans-serif"; c.textAlign = "right"; c.fillText(list.length ? list.map((x) => `${x.icon} ${x.name.replace(/ Club$| Crew$/, "")}`).join("   ") : "No clubs today, free play!", W - 56, y + 54);
      }
    });
    const b = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 4.75), new THREE.MeshBasicMaterial({ map: t })); b.position.set(0, 5.45, -8.9); this.scene.add(b);
  }
  private buildStations() {
    const pts = seats(CLUBS.length), today = this.now.getDay();
    CLUBS.forEach((club, i) => {
      const p = pts[i], col = accOf(club, i), g = new THREE.Group(); g.position.set(p.x, 0, p.z); g.rotation.y = p.ry;
      const top = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.14, 32), this.mat(col, 0.6)); top.position.y = 1.0; top.castShadow = top.receiveShadow = true; g.add(top);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 1.0, 14), this.mat("#8A5A3A")); leg.position.y = 0.5; leg.castShadow = true; g.add(leg);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.1, 24), this.mat("#8A5A3A")); foot.position.y = 0.05; g.add(foot);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2 + 0.6, st = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.28, 0.55, 16), this.mat("#F4EBDD")); st.position.set(Math.sin(a) * 1.75, 0.28, Math.cos(a) * 1.75); st.castShadow = true; g.add(st); }
      // table-top props from simple shapes
      const prop = (m: THREE.Mesh, x: number, y: number, z: number) => { m.position.set(x, 1.07 + y, z); m.castShadow = true; g.add(m); };
      prop(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.5), this.mat("#FFF6E0")), -0.4, 0.04, 0.2); prop(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.13, 0.22, 14), this.mat("#F4EBDD")), 0.5, 0.11, -0.2); prop(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), this.mat(col, 0.5)), 0.5, 0.33, -0.2);
      // sign on a post with the club icon and name
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), this.mat("#8A5A3A")); post.position.set(0, 1.8, -1.04); g.add(post);
      const card = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.15), new THREE.MeshBasicMaterial({ map: tex(512, 256, (c, w, h) => { c.fillStyle = "#FFF9F0"; rr(c, 6, 6, w - 12, h - 12, 30); c.fill(); c.fillStyle = col; rr(c, 6, 6, w - 12, 56, 28); c.fill(); c.fillStyle = "#fff"; c.font = "700 34px 'Trebuchet MS',sans-serif"; c.textAlign = "center"; c.fillText(DAY_NAMES[club.day] + "s", w / 2, 46); c.fillStyle = "#3b3552"; c.font = "86px 'Trebuchet MS',sans-serif"; c.fillText(club.icon, w / 2, 160); c.font = "700 30px 'Trebuchet MS',sans-serif"; c.fillText(club.name, w / 2, 220); }), transparent: true })); card.position.set(0, 2.55, -0.9); g.add(card);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 10, 48), new THREE.MeshBasicMaterial({ color: "#FFE27A", transparent: true, opacity: club.day === today ? 0.95 : 0 })); ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; g.add(ring);
      const badge = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(128, 128, (c) => { c.fillStyle = "#3FB68B"; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.fill(); c.fillStyle = "#fff"; c.font = "700 70px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText("✓", 64, 68); }), transparent: true, depthTest: false })); badge.scale.set(0.6, 0.6, 1); badge.position.set(1.05, 2.95, -0.9); badge.renderOrder = 10; g.add(badge);
      const hit = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 2.0, 4.2, 12), new THREE.MeshBasicMaterial({ visible: false })); hit.position.y = 2.1; hit.userData.club = club; g.add(hit);
      this.scene.add(g); this.stations.push({ club, g, ring, badge, hit, today: club.day === today });
    });
    this.refresh();
  }
  /** re-read which clubs the student has joined (shows a green check) */
  refresh() { const mine = new Set(Clubs.mine().map((c) => c.id)); for (const s of this.stations) s.badge.visible = mine.has(s.club.id); }
  private place() { const y = this.yaw; this.camera.position.set(Math.sin(y) * this.dist, 3.5 + (this.dist - 11.4) * 0.15, Math.cos(y) * this.dist - 0.5); this.camera.lookAt(0, 2.5, -4); }
  resize() { const w = this.host.clientWidth || innerWidth, h = this.host.clientHeight || innerHeight; this.renderer.setSize(w, h); this.camera.aspect = w / h; this.camera.fov = w / h < 0.9 ? 70 : 52; this.camera.updateProjectionMatrix(); }
  private pick(e: PointerEvent): Club | null {
    const r = this.renderer.domElement.getBoundingClientRect(); this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
    const h = this.ray.intersectObjects(this.stations.map((s) => s.hit), false)[0]; return h ? (h.object.userData.club as Club) : null;
  }
  private bind(el: HTMLElement) {
    el.style.touchAction = "none"; const pts = new Map<number, { x: number; y: number }>();
    el.addEventListener("pointerdown", (e) => { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); this.down = { x: e.clientX, y: e.clientY, yaw: this.tY, moved: false }; el.setPointerCapture?.(e.pointerId); });
    el.addEventListener("pointermove", (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y); if (this.pinch) this.tD = Math.max(8, Math.min(14.5, this.tD - (d - this.pinch) * 0.02)); this.pinch = d; if (this.down) this.down.moved = true; return; }
      if (this.down && pts.has(e.pointerId)) { const dx = e.clientX - this.down.x; if (Math.abs(dx) > 6 || Math.abs(e.clientY - this.down.y) > 6) this.down.moved = true; if (this.down.moved) this.tY = Math.max(-0.7, Math.min(0.7, this.down.yaw - dx * 0.004)); }
      else { const c = this.pick(e); this.hover = c; el.style.cursor = c ? "pointer" : "grab"; }
    });
    const up = (e: PointerEvent) => { pts.delete(e.pointerId); this.pinch = 0; const d = this.down; if (d && !d.moved && pts.size === 0) this.onPick(this.pick(e)); if (!pts.size) this.down = null; };
    el.addEventListener("pointerup", up); el.addEventListener("pointercancel", (e) => { pts.delete(e.pointerId); this.pinch = 0; this.down = null; });
    el.addEventListener("wheel", (e) => { e.preventDefault(); this.tD = Math.max(8, Math.min(14.5, this.tD * Math.exp(e.deltaY * 0.001))); }, { passive: false });
  }
  /** the club under a screen point (used by tests and keyboard users) */
  clubAt(i: number): Club { return CLUBS[i]; }
  /** screen position of a club's table, for tests and for the keyboard focus ring */
  screenOf(clubId: string): { x: number; y: number } | null { const s = this.stations.find((x) => x.club.id === clubId); if (!s) return null; const v = s.g.position.clone().setY(1.6).project(this.camera), r = this.renderer.domElement.getBoundingClientRect(); return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height }; }
  private frame = (now: number) => {
    if (!this.alive) return; const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.t += dt;
    this.yaw += (this.tY - this.yaw) * Math.min(1, dt * 6); this.dist += (this.tD - this.dist) * Math.min(1, dt * 6); this.place();
    for (const s of this.stations) { const hov = this.hover?.id === s.club.id; (s.ring.material as THREE.MeshBasicMaterial).opacity = s.today ? 0.65 + Math.sin(this.t * 3) * 0.3 : hov ? 0.6 : 0; (s.ring.material as THREE.MeshBasicMaterial).color.set(hov && !s.today ? "#ffffff" : "#FFE27A"); s.g.scale.setScalar(hov ? 1.03 : 1); }
    this.renderer.render(this.scene, this.camera); requestAnimationFrame(this.frame);
  };
  dispose() { this.alive = false; this.renderer.dispose(); this.renderer.domElement.remove(); }
}
