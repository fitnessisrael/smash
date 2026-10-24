// סמש — 3D court, racket and ball (three.js)
import * as THREE from "three";

export const COURT = {
  tennis: { half: 11.885, width: 10.97, single: 8.23, service: 6.4, netH: 0.914, playerZ: 12.4 },
  padel: { half: 10, width: 10, single: 10, service: 6.95, netH: 0.88, playerZ: 8.6 },
};
const C = { ground: 0x0b0d09, court: 0x123022, padel: 0x14253a, line: 0xeef2e2, lime: 0xd4ff1e, net: 0xdfe5cf, glass: 0x9fd0ff };

export function makeScene(canvas, sport = "tennis") {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setClearColor(0x05060a);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05060a, 28, 60);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x223322, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2); sun.position.set(-6, 14, 8); scene.add(sun);
  const courtGroup = new THREE.Group(); scene.add(courtGroup);
  const api = { renderer, scene, camera, courtGroup, sport };
  api.setSport = s => { api.sport = s; buildCourt(courtGroup, s); };
  api.setSport(sport);
  api.resize = () => {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  api.resize();
  return api;
}

function line(group, x1, z1, x2, z2, w = 0.05) {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(len, w), new THREE.MeshBasicMaterial({ color: C.line }));
  m.rotation.x = -Math.PI / 2; m.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
  m.position.set((x1 + x2) / 2, 0.012, (z1 + z2) / 2); group.add(m);
}

function buildCourt(g, sport) {
  while (g.children.length) { const c = g.children.pop(); c.geometry && c.geometry.dispose(); }
  const k = COURT[sport];
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: C.ground }));
  ground.rotation.x = -Math.PI / 2; g.add(ground);
  const pad = sport === "padel" ? 0 : 3.5;
  const surf = new THREE.Mesh(new THREE.PlaneGeometry(k.width + pad * 1.6, k.half * 2 + pad * 2),
    new THREE.MeshLambertMaterial({ color: sport === "padel" ? C.padel : C.court }));
  surf.rotation.x = -Math.PI / 2; surf.position.y = 0.005; g.add(surf);
  const W = k.width / 2, S = k.single / 2, H = k.half;
  // outer lines
  line(g, -W, -H, W, -H); line(g, -W, H, W, H); line(g, -W, -H, -W, H); line(g, W, -H, W, H);
  if (sport === "tennis") { line(g, -S, -H, -S, H); line(g, S, -H, S, H); }
  line(g, -S, -k.service, S, -k.service); line(g, -S, k.service, S, k.service);
  line(g, 0, -k.service, 0, k.service);
  if (sport === "tennis") { line(g, 0, H, 0, H - 0.2); line(g, 0, -H, 0, -H + 0.2); }
  // net
  const net = new THREE.Mesh(new THREE.PlaneGeometry(k.width + 0.9, k.netH),
    new THREE.MeshBasicMaterial({ color: C.net, transparent: true, opacity: 0.28, side: THREE.DoubleSide }));
  net.position.set(0, k.netH / 2, 0); g.add(net);
  const band = new THREE.Mesh(new THREE.BoxGeometry(k.width + 0.9, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  band.position.set(0, k.netH, 0); g.add(band);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.07), new THREE.MeshLambertMaterial({ color: 0x777777 }));
    post.position.set(sx * (k.width / 2 + 0.45), 0.535, 0); g.add(post);
  }
  if (sport === "padel") {
    const glass = new THREE.MeshBasicMaterial({ color: C.glass, transparent: true, opacity: 0.09, side: THREE.DoubleSide, depthWrite: false });
    const edge = new THREE.LineBasicMaterial({ color: C.glass, transparent: true, opacity: 0.35 });
    const wall = (w, h, x, z, ry) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass); m.position.set(x, h / 2, z); m.rotation.y = ry; g.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(w, h)), edge); e.position.copy(m.position); e.rotation.y = ry; g.add(e);
    };
    wall(10, 3, 0, -10, 0); wall(10, 3, 0, 10, 0);
    for (const sx of [-5, 5]) { wall(2, 3, sx, -9, Math.PI / 2); wall(2, 3, sx, 9, Math.PI / 2); }
  }
}

/* racket mesh: built along +Y (tip) with string face toward +Z, handle at origin */
const GEO = {};
function padelFaceGeo() {
  if (GEO.padel) return GEO.padel;
  // teardrop face (perforated, like a real padel racket), 45.5 cm total with the handle
  const pts = [], cy = 0.325, rx = 0.13, ry = 0.13;
  for (let i = 0; i < 64; i++) {
    const a = i / 64 * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    const pinch = sn < 0 ? Math.pow(-sn, 2.2) : 0;
    pts.push(new THREE.Vector2(rx * c * (1 - 0.72 * pinch), cy + ry * sn - 0.05 * pinch));
  }
  const shape = new THREE.Shape(pts);
  for (let y = cy - 0.07; y <= cy + 0.09; y += 0.026) {
    const half = Math.sqrt(Math.max(0, 1 - Math.pow((y - cy) / 0.1, 2))) * 0.085;
    for (let x = -half; x <= half + 1e-6; x += 0.026) {
      const h = new THREE.Path(); h.absarc(x, y, 0.0065, 0, Math.PI * 2, false); shape.holes.push(h);
    }
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.032, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 2, curveSegments: 10 });
  g.translate(0, 0, -0.016);
  return (GEO.padel = g);
}
export function makeRacket(sport = "tennis") {
  const g = new THREE.Group();
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a1d16 });
  if (sport === "padel") {
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.15, 10), dark); handle.position.y = 0.075; g.add(handle);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.005, 6, 16), dark); strap.position.y = -0.03; strap.rotation.y = Math.PI / 2; g.add(strap);
    const face = new THREE.Mesh(padelFaceGeo(), new THREE.MeshLambertMaterial({ color: 0xd4ff1e, side: THREE.DoubleSide }));
    g.add(face);
    const frame = new THREE.Mesh(padelFaceGeo(), new THREE.MeshBasicMaterial({ color: 0x0a0b08, wireframe: false }));
    frame.scale.set(1.035, 1.0, 0.7); frame.position.y = -0.01; g.add(frame);
    g.userData.len = 0.455;
    return g;
  }
  const L = 0.68, handleL = 0.2, headLen = L - handleL - 0.05;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, handleL, 10), dark); handle.position.y = handleL / 2; g.add(handle);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.011, 8, 36), new THREE.MeshLambertMaterial({ color: 0xd4ff1e }));
  rim.scale.set(1, 1.3, 1); rim.position.y = handleL + 0.05 + headLen / 2; g.add(rim);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.125, 28), new THREE.MeshBasicMaterial({ color: 0xeef2e2, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
  strings.scale.set(1, 1.3, 1); strings.position.copy(rim.position); g.add(strings);
  for (const sx of [-1, 1]) { // open throat, typical of a tennis racket
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.12, 6), dark);
    t.position.set(sx * 0.035, handleL + 0.04, 0); t.rotation.z = sx * 0.45; g.add(t);
  }
  g.userData.len = L;
  return g;
}

export function makeBall(r = 0.04) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), new THREE.MeshBasicMaterial({ color: C.lime }));
  const sh = new THREE.Mesh(new THREE.CircleGeometry(r * 1.3, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
  sh.rotation.x = -Math.PI / 2;
  return { ball: m, shadow: sh, set(p) { m.position.set(p[0], p[1], p[2]); sh.position.set(p[0], 0.015, p[2]); } };
}

/* apply phone quaternion [w,x,y,z] + hand position to a racket group */
export function poseRacket(racket, q, hand) {
  racket.quaternion.set(q[1], q[2], q[3], q[0]);
  racket.position.set(hand[0], hand[1], hand[2]);
}

export { THREE };
