// סמש — big screen: court, ball machine, live racket driven by the phone
import { Q, SPORTS, Sound, armPose, $ } from "./core.js";
import { makeScene, makeRacket, makeBall, poseRacket, COURT, THREE } from "./court3d.js";

const sound = new Sound();
const G = { sport: "tennis", side: 1, feed: "mix", running: false, hits: 0, streak: 0, q: Q.id(), lastQ: 0 };
const sc = makeScene($("c"), G.sport);
let racket = makeRacket(G.sport); sc.scene.add(racket);
const B = makeBall(0.06); sc.scene.add(B.ball, B.shadow); B.ball.visible = B.shadow.visible = false;
const target = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0xd4ff1e, transparent: true, opacity: 0.0, side: THREE.DoubleSide }));
target.rotation.x = -Math.PI / 2; target.position.y = 0.02; sc.scene.add(target);
addEventListener("resize", () => { sc.resize(); placeCamera(); });

function placeCamera() {
  const z = COURT[G.sport].playerZ;
  sc.camera.fov = 52; sc.camera.position.set(0.4 * G.side, 2.5, z + 3.6); sc.camera.lookAt(0, 0.6, -3); sc.camera.updateProjectionMatrix();
}
function setSport(s) {
  G.sport = s; sc.setSport(s); sc.scene.remove(racket); racket = makeRacket(s); sc.scene.add(racket); placeCamera();
}
placeCamera();

/* ---------- pairing ---------- */
let peer = null, conn = null;
function newCode() { return String(Math.floor(1000 + Math.random() * 9000)); }
function openRoom() {
  const code = newCode();
  peer = new window.Peer("smash-tv-" + code, { debug: 0 });
  peer.on("open", () => {
    $("code").textContent = code; $("pair-status").textContent = "ממתין לטלפון…";
    const url = `${location.origin}/?tv=${code}`;
    try { const qr = qrcode(0, "M"); qr.addData(url); qr.make(); $("qr").innerHTML = qr.createSvgTag({ scalable: true, margin: 0 }); } catch (e) {}
  });
  peer.on("error", e => {
    if (e && e.type === "unavailable-id") { peer.destroy(); openRoom(); return; }
    $("pair-status").textContent = "בעיית חיבור לאינטרנט. מנסה שוב…"; setTimeout(() => { try { peer.destroy(); } catch (x) {} openRoom(); }, 3000);
  });
  peer.on("connection", c => {
    if (conn && conn.open) { try { conn.close(); } catch (e) {} }
    conn = c;
    c.on("data", onData);
    c.on("open", () => { $("live").classList.add("on"); $("live-t").textContent = "טלפון מחובר"; $("pair").hidden = true; say("מחובר!", "לחץ התחל בטלפון"); });
    c.on("close", () => { $("live").classList.remove("on"); $("live-t").textContent = "הטלפון התנתק"; G.running = false; $("pair").hidden = false; $("pair-status").textContent = "ממתין לטלפון…"; });
  });
}
if (window.Peer) openRoom(); else $("pair-status").textContent = "לא הצלחנו לטעון את רכיב החיבור. רענן את הדף.";
$("sound").onclick = () => { sound.unlock(); $("sound").textContent = "הצליל פעיל ✓"; };
function send(m) { try { conn && conn.open && conn.send(m); } catch (e) {} }

function onData(m) {
  if (m.type === "hello") { G.side = m.side || 1; G.feed = m.feed || "mix"; if (m.sport !== G.sport) setSport(m.sport); placeCamera(); }
  else if (m.type === "q") { G.q = m.q; G.lastQ = performance.now(); if (m.kmh > 15) $("s-speed").textContent = m.kmh; }
  else if (m.type === "start") { sound.unlock(); G.running = true; G.hits = 0; G.streak = 0; paint(); say("יאללה!", "הכדור בדרך"); setTimeout(feed, 1500); }
  else if (m.type === "hit") onHit(m);
  else if (m.type === "bye") { G.running = false; }
}

/* ---------- ball physics (scripted arcs) ---------- */
// ball = list of segments {a, b, h, t0, dur}; y follows a parabola with extra apex height h
let ball = null;
const lerp = (a, b, s) => a.map((v, i) => v + (b[i] - v) * s);
function arc(seg, s) { const p = lerp(seg.a, seg.b, s); p[1] = seg.a[1] + (seg.b[1] - seg.a[1]) * s + 4 * seg.h * s * (1 - s); return p; }
function ballPos(t) {
  if (!ball) return null;
  for (const seg of ball.segs) if (t <= seg.t0 + seg.dur) return { p: arc(seg, Math.max(0, (t - seg.t0) / seg.dur)), seg };
  const last = ball.segs[ball.segs.length - 1]; return { p: last.b, seg: last, done: true };
}
function contactPoint(kind) {
  const z = COURT[G.sport].playerZ, x = kind === "fh" ? 0.95 * G.side : -0.85 * G.side;
  return [x, 1.0, z - 0.35];
}

function feed() {
  if (!G.running) return;
  const kind = G.feed === "mix" ? (Math.random() < 0.55 ? "fh" : "bh") : G.feed;
  const k = COURT[G.sport], P = contactPoint(kind), now = performance.now() / 1000;
  const A = [(Math.random() - 0.5) * 3, 1.1, -k.half + 0.6];
  const Bn = [P[0] * 0.75, 0.03, P[2] - (G.sport === "padel" ? 4.2 : 5.6)];
  const after = [P[0] * 1.2, 0.5, P[2] + 3.2];
  const t1 = G.sport === "padel" ? 1.25 : 1.15, t2 = 0.5;
  ball = { kind, P, tContact: now + t1 + t2, state: "in", segs: [
    { a: A, b: Bn, h: 1.4, t0: now, dur: t1, bounceAtEnd: true },
    { a: Bn, b: P, h: 0.55, t0: now + t1, dur: t2 },
    { a: P, b: after, h: 0.15, t0: now + t1 + t2, dur: 0.45, miss: true },
  ]};
  B.ball.visible = B.shadow.visible = true; target.material.opacity = 0;
  say(kind === "fh" ? "פורהנד" : "בקהנד", "", 600);
}

function onHit(m) {
  $("s-speed").textContent = Math.round(m.kmh);
  if (!ball || ball.state !== "in") return;
  const now = performance.now() / 1000 - 0.04; // network/sensor latency allowance
  const err = now - ball.tContact;
  if (err < -0.28) { ball.missWhy = "הנפת מוקדם מדי"; return; } // ball keeps coming
  if (err > 0.3) { ball.missWhy = "הנפת מאוחר מדי"; return; }
  ball.state = "hit"; sound.hit(G.sport, m.kmh / 80);
  // where does it go? string face direction + timing
  const face = m.face || [0, 0, -1];
  let ang = Math.atan2(face[0], -face[2] || -0.001);
  if (!isFinite(ang) || Math.abs(ang) > 1.2) ang = 0;
  ang = ang * 0.6 + err * 1.8 * (ball.kind === "fh" ? G.side : -G.side);
  const tilt = Math.asin(Math.max(-1, Math.min(1, face[1] || 0)));
  const thr = SPORTS[G.sport].thr, k = COURT[G.sport];
  const power = Math.max(0, Math.min(1, (m.kmh - thr) / 70));
  const P = ballPos(now + 0.04).p, depth = 4 + power * 6 - tilt * 6;
  const tz = -depth, tx = P[0] + Math.tan(ang) * (P[2] - tz);
  const inNet = m.kmh < thr * 1.05 || tilt < -0.45;
  const end = inNet ? [P[0] + (tx - P[0]) * 0.4, 0.4, 0.05] : [tx, 0.03, tz];
  const out = !inNet && (Math.abs(tx) > (G.sport === "tennis" ? k.single / 2 : k.width / 2) || depth > k.half || depth < 0.5);
  const dur = inNet ? 0.45 : 1.25 - power * 0.45;
  const t = now + 0.04;
  ball.segs = [{ a: P, b: end, h: inNet ? 0.15 : 1.0 + tilt * 2 + (1 - power) * 0.8, t0: t, dur, bounceAtEnd: !inNet }];
  const quality = Math.abs(err) < 0.09 ? "מושלם" : err < 0 ? "קצת מוקדם" : "קצת מאוחר";
  ball.result = inNet ? ["ברשת", quality] : out ? ["אאוט", quality] : ["נכנס!", quality];
  ball.good = !inNet && !out;
  if (!inNet) { target.position.set(end[0], 0.02, end[2]); }
}

function finishBall() {
  const r = ball.result || ["פספוס", ball.missWhy || "לא זוהתה מכה"];
  if (ball.good) { G.hits++; G.streak++; } else G.streak = 0;
  say(r[0], r[1]); paint();
  send({ type: "score", hits: G.hits, streak: G.streak, text: r[0] });
  ball = null; setTimeout(() => { B.ball.visible = B.shadow.visible = false; }, 400);
  setTimeout(feed, 1500);
}

function paint() { $("s-hits").textContent = G.hits; $("s-streak").textContent = G.streak; }
let sayT = 0;
function say(big, small = "", ms = 1300) {
  $("say").innerHTML = `${big}${small ? `<small>${small}</small>` : ""}`; $("say").classList.add("on");
  clearTimeout(sayT); sayT = setTimeout(() => $("say").classList.remove("on"), ms);
}

/* ---------- loop ---------- */
let lastSeg = null;
function loop() {
  requestAnimationFrame(loop);
  // live racket
  const origin = [0, 0, COURT[G.sport].playerZ];
  const a = armPose(G.q, G.side, origin);
  poseRacket(racket, G.q, a.hand);
  racket.visible = performance.now() - G.lastQ < 1500;
  // ball
  if (ball) {
    const now = performance.now() / 1000, r = ballPos(now);
    if (r) {
      B.set(r.p);
      if (lastSeg && lastSeg !== r.seg && lastSeg.bounceAtEnd) sound.bounce();
      lastSeg = r.seg;
      if (ball.good && r.seg.bounceAtEnd) target.material.opacity = 0.9;
      if (r.done) { if (ball.segs[ball.segs.length - 1].bounceAtEnd) sound.bounce(); lastSeg = null; finishBall(); }
    }
  }
  sc.renderer.render(sc.scene, sc.camera);
}
sc.resize(); placeCamera(); requestAnimationFrame(loop);
