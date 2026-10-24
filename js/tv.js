// סמש — big screen: court, ball machine, live racket driven by the phone
import { Q, SPORTS, Sound, armPose, strokeName, $ } from "./core.js";
import { makeScene, makeRacket, makeBall, poseRacket, COURT, THREE } from "./court3d.js";

const sound = new Sound();
const G = { mode: "easy", sport: "tennis", side: 1, feed: "mix", running: false, hits: 0, streak: 0, q: Q.id(), lastQ: 0 };
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
    const url = `${location.origin}/app?tv=${code}`;
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
// any tap or remote-control key on the TV turns sound on
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => sound.unlock(), { once: true });
function send(m) { try { conn && conn.open && conn.send(m); } catch (e) {} }

function onData(m) {
  if (m.type === "hello") { G.mode = m.mode || "easy"; G.side = m.side || 1; G.feed = m.feed || "mix"; if (m.sport !== G.sport) setSport(m.sport); placeCamera(); }
  else if (m.type === "q") { G.q = m.q; G.lastQ = performance.now(); if (m.kmh > 15) $("s-speed").textContent = m.kmh; }
  else if (m.type === "start") { if (G.running) return; sound.unlock(); G.running = true; G.hits = 0; G.streak = 0; paint(); say("יאללה!", "הכדור בדרך"); queueFeed(1500); }
  else if (m.type === "hit") onHit(m);
  else if (m.type === "mode") { G.mode = m.mode; say(m.mode === "real" ? "מצב אמיתי" : "מצב סלחני", m.mode === "real" ? "הכדור טס לפי המכה שלך" : "", 1400); }
  else if (m.type === "feed") { G.feed = m.feed; say(m.feed === "mix" ? "מעורב" : strokeName(G.sport, m.feed), "אימון חדש", 1200); }
  else if (m.type === "stop") { G.running = false; ball = null; B.ball.visible = B.shadow.visible = false; say("הפסקה", "לחץ התחל בטלפון כדי להמשיך"); }
  else if (m.type === "bye") { G.running = false; }
}

/* ---------- ball physics (scripted arcs) ---------- */
// ball = list of segments {a, b, h, t0, dur}; y follows a parabola with extra apex height h
let ball = null;
const lerp = (a, b, s) => a.map((v, i) => v + (b[i] - v) * s);
function arc(seg, s) { const p = lerp(seg.a, seg.b, s); p[1] = seg.a[1] + (seg.b[1] - seg.a[1]) * s + 4 * seg.h * s * (1 - s); return p; }
function segPos(seg, s) {
  if (!seg.pts) return arc(seg, s);
  const f = s * (seg.pts.length - 1), i = Math.min(seg.pts.length - 2, Math.floor(f));
  return lerp(seg.pts[i], seg.pts[i + 1], f - i);
}
function ballPos(t) {
  if (!ball) return null;
  for (const seg of ball.segs) if (t <= seg.t0 + seg.dur) return { p: segPos(seg, Math.max(0, (t - seg.t0) / seg.dur)), seg };
  const last = ball.segs[ball.segs.length - 1]; return { p: last.b, seg: last, done: true };
}
// one ball "recipe" per stroke: where you meet it and how it arrives
function makeFeed(kind, now) {
  const k = COURT[G.sport], z = k.playerZ, sd = G.side, padel = G.sport === "padel";
  const far = [(Math.random() - 0.5) * 3, 1.1, -k.half + 0.6];
  const segs = []; let P, t = now;
  const add = (a, b, h, dur, bounce) => { segs.push({ a, b, h, t0: t, dur, bounceAtEnd: !!bounce }); t += dur; };
  if (kind === "fh" || kind === "bh") {
    P = [kind === "fh" ? 0.95 * sd : -0.85 * sd, 1.0, z - 0.35];
    const Bn = [P[0] * 0.75, 0.03, P[2] - (padel ? 4.2 : 5.6)];
    add(far, Bn, 1.4, padel ? 1.25 : 1.15, true); add(Bn, P, 0.55, 0.5);
  } else if (kind === "volley") {
    P = [(Math.random() < 0.5 ? 0.75 : -0.7) * sd, 1.25, z - 0.6];
    add(far, P, 0.6, 1.35);
  } else if (kind === "smash" || kind === "bandeja") {
    P = [(kind === "smash" ? 0.35 : 0.45) * sd, kind === "smash" ? 2.55 : 2.1, z - 0.4];
    add([far[0], 1.0, far[2]], P, kind === "smash" ? 6 : 4.5, kind === "smash" ? 2.1 : 1.9);
  } else if (kind === "serve" && !padel) { // toss
    const hand = [0.35 * sd, 1.3, z - 0.1]; P = [0.4 * sd, 2.5, z - 0.5];
    add(hand, P, 0.9, 0.95);
  } else { // padel serve: drop, bounce, hit below the waist
    const hand = [0.5 * sd, 1.0, z - 0.3], Bn = [0.6 * sd, 0.03, z - 0.5]; P = [0.65 * sd, 0.7, z - 0.6];
    add(hand, Bn, 0, 0.45, true); add(Bn, P, 0.25, 0.4);
  }
  const tContact = t;
  add(P, [P[0] * 1.2, Math.max(0.3, P[1] - 0.6), P[2] + 3], 0.15, 0.45);
  segs[segs.length - 1].miss = true;
  return { kind, P, tContact, segs };
}

let feedTimer = 0;
function queueFeed(ms) { clearTimeout(feedTimer); feedTimer = setTimeout(feed, ms); }
function feed() {
  if (!G.running || ball) return;
  const kind = G.feed === "mix" ? (Math.random() < 0.55 ? "fh" : "bh") : G.feed;
  ball = Object.assign(makeFeed(kind, performance.now() / 1000), { state: "in" });
  B.ball.visible = B.shadow.visible = true; target.material.opacity = 0;
  say(strokeName(G.sport, kind), "", 700);
}

function onHit(m) { if (G.mode === "real") onHitReal(m); else onHitEasy(m); }

/* ---------- real mode: ball flight from racket face, swing speed, timing and contact point ---------- */
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vlen = a => Math.hypot(a[0], a[1], a[2]);
const vnorm = a => vmul(a, 1 / (vlen(a) || 1));
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// simple ballistic flight with air drag, net, first bounce (and padel glass)
function simulate(p0, v0) {
  const k = COURT[G.sport], drag = 0.018, dt = 1 / 120, r = 0.035, pts = [p0.slice()], bounces = [];
  let p = p0.slice(), v = v0.slice(), t = 0, land = null, net = false;
  while (t < 3.5) {
    const sp = vlen(v);
    v = vadd(v, vmul([-drag * sp * v[0], -9.81 - drag * sp * v[1], -drag * sp * v[2]], dt));
    const np = vadd(p, vmul(v, dt)); t += dt;
    if (p[2] > 0 && np[2] <= 0 && !land) { // crossing the net plane
      const f = p[2] / (p[2] - np[2]), y = p[1] + (np[1] - p[1]) * f;
      if (y < k.netH + r && Math.abs(p[0]) < k.width / 2 + 0.45) { net = true; pts.push([p[0], y, 0.05]); pts.push([p[0], 0.05, 0.3]); break; }
    }
    if (G.sport === "padel" && land && np[2] < -k.half + 0.05) { np[2] = -k.half + 0.05; v[2] *= -0.6; bounces.push(t); } // back glass after the bounce
    if (np[1] <= r && v[1] < 0) {
      np[1] = r; bounces.push(t);
      if (!land) { land = [np[0], np[2]]; v = [v[0] * 0.78, -v[1] * 0.72, v[2] * 0.78]; }
      else { pts.push(np); break; }
    }
    p = np; pts.push(p.slice());
    if (land && t - bounces[0] > 0.9) break;
    if (p[2] > k.half + 4 || p[2] < -k.half - 6) break;
  }
  return { pts, dur: t, land, net, bounces };
}

function onHitReal(m) {
  $("s-speed").textContent = Math.round(m.kmh);
  if (!ball || ball.state !== "in") return;
  const now = performance.now() / 1000 - 0.06;
  const err = now - ball.tContact;
  if (err < -0.25) { ball.missWhy = "הנפת מוקדם מדי"; return; }
  if (err > 0.25) { ball.missWhy = "הנפת מאוחר מדי"; return; }
  const k = COURT[G.sport], len = G.sport === "padel" ? 0.455 : 0.68;
  const bNow = ballPos(now).p, bIn = vmul(vsub(ballPos(now + 0.01).p, ballPos(now - 0.01).p), 50);
  // racket at contact: rotate the peak pose back/forward along the swing by the timing error
  const ww = m.ww || [0, 0, 0], wl = vlen(ww);
  const turn = Math.max(-0.7, Math.min(0.7, -err * wl * 0.5));
  const qc = wl > 0.1 ? Q.mul(Q.axisAngle(vnorm(ww), turn), m.q) : m.q;
  const arm = armPose(qc, G.side, [0, 0, k.playerZ]);
  const sweet = vadd(arm.hand, vmul(arm.tip, len * 0.75));
  // where on the strings did it hit? distance from the sweet spot, across the ball's path
  const dirIn = vnorm(bIn), off = vsub(bNow, sweet), offPerp = vsub(off, vmul(dirIn, vdot(off, dirIn)));
  const miss = vlen(offPerp);
  if (miss > 0.75) { ball.missWhy = "המחבט לא פגש את הכדור"; return; }
  ball.state = "hit";
  const quality = Math.max(0, 1 - miss / 0.75);            // 1 = sweet spot
  // racket-head velocity at the sweet spot (from the phone's spin)
  const vRacket = vcross(ww, vmul(arm.tip, len * 0.75));
  let n = Q.rot(qc, [0, 0, 1]); if (n[2] > 0) n = vmul(n, -1);  // string face pointing toward the net
  const dir = vnorm(vadd(vmul(n, 0.7), vmul(vnorm(vRacket), vRacket[2] < 0 ? 0.3 : 0)));
  const speed = Math.max(4, (1.25 * vlen(vRacket) + 0.25 * vlen(bIn)) * (0.45 + 0.55 * quality));
  // off-centre hits wobble
  const wob = (1 - quality) * 0.35, j = (Math.random() - 0.5) * wob, jv = (Math.random() - 0.5) * wob;
  const v0 = [dir[0] * speed + j * speed, dir[1] * speed + jv * speed, dir[2] * speed];
  if (v0[2] > -1) { ball.state = "in"; ball.missWhy = "פני המחבט פנו הצידה"; return; }
  sound.hit(G.sport, Math.min(1, speed / 25));
  const sim = simulate(bNow, v0);
  ball.segs = [{ pts: sim.pts, t0: now + 0.06, dur: sim.dur, bounceTimes: sim.bounces.map(b => now + 0.06 + b) }];
  const halfW = (G.sport === "tennis" ? k.single : k.width) / 2, maxDepth = ball.kind === "serve" ? k.service : k.half;
  const kmhOut = Math.round(speed * 3.6);
  const tiltDeg = Math.round(Math.asin(Math.max(-1, Math.min(1, n[1]))) * 180 / Math.PI);
  const where = quality > 0.7 ? "במרכז המחבט" : quality > 0.35 ? "קצת מחוץ למרכז" : "בקצה המחבט";
  if (sim.net) ball.result = ["ברשת", tiltDeg < -5 ? "פני המחבט סגורים מדי" : "נמוך מדי: הנף מלמטה למעלה"];
  else if (!sim.land) ball.result = ["אאוט", "ארוך מדי"];
  else {
    const [lx, lz] = sim.land, depth = -lz;
    if (depth < 0) ball.result = ["ברשת", "נמוך מדי: פתח קצת את פני המחבט והנף מלמטה למעלה"];
    else if (depth > maxDepth) ball.result = ["אאוט", ball.kind === "serve" ? "מחוץ לריבוע ההגשה" : (tiltDeg > 15 ? "ארוך: פני המחבט פתוחים מדי" : "ארוך מדי")];
    else if (Math.abs(lx) > halfW) ball.result = ["אאוט", "רחב: " + (err < -0.06 ? "פגעת מוקדם" : err > 0.06 ? "פגעת מאוחר" : "כיוון פני המחבט")];
    else ball.result = [kmhOut > 90 ? "ווינר!" : "נכנס!", `${kmhOut} קמ״ש · ${where}`];
    target.position.set(lx, 0.02, lz);
  }
  ball.good = ball.result[0] === "נכנס!" || ball.result[0] === "ווינר!";
  if (!ball.good && ball.result[0] !== "ברשת" && ball.result[1] && !ball.result[1].includes(where)) ball.result[1] += " · " + where;
}

// Forgiving: a reasonable swing in time goes over the net and lands in.
// Only clearly early/late swings go wide, and only very weak or very closed swings hit the net.
function onHitEasy(m) {
  $("s-speed").textContent = Math.round(m.kmh);
  if (!ball || ball.state !== "in") return;
  const now = performance.now() / 1000 - 0.07; // network/sensor latency allowance
  const err = now - ball.tContact;
  if (err < -0.4) { ball.missWhy = "הנפת מוקדם מדי"; return; } // ball keeps coming
  if (err > 0.45) { ball.missWhy = "הנפת מאוחר מדי"; return; }
  ball.state = "hit"; sound.hit(G.sport, m.kmh / 80);
  const k = COURT[G.sport], thr = SPORTS[G.sport].thr;
  const timing = Math.max(0, 1 - Math.abs(err) / 0.45);          // 1 = perfect
  const power = Math.max(0, Math.min(1, (m.kmh - thr) / 60));
  const face = m.face || [0, 0, -1];
  const overhead = ["smash", "bandeja"].includes(ball.kind) || (ball.kind === "serve" && G.sport === "tennis");
  const tilt = Math.asin(Math.max(-1, Math.min(1, face[1] || 0))) + (overhead ? 0.35 : 0);
  // aim: a little from the racket face, mostly from timing (early = pulled, late = pushed)
  let faceAng = Math.atan2(face[0], -face[2] || -0.001); if (!isFinite(faceAng) || Math.abs(faceAng) > 1.2) faceAng = 0;
  const pullSign = ball.kind === "bh" ? -G.side : G.side;
  const ang = faceAng * 0.25 + err * 1.1 * pullSign + (Math.random() - 0.5) * 0.12;
  const P = ballPos(now + 0.07).p;
  const halfW = (G.sport === "tennis" ? k.single : k.width) / 2;
  const maxDepth = ball.kind === "serve" ? k.service : k.half;
  let depth = ball.kind === "serve" ? 2.5 + power * 3 : 5 + power * 4.5 - tilt * 2.5;
  let tx = P[0] + Math.tan(ang) * (P[2] + depth);
  const inNet = (m.kmh < thr * 0.9 && timing < 0.5) || tilt < -0.9;
  const goodSwing = timing > 0.35 && !inNet;
  if (goodSwing) { // keep it in the court with a safety margin
    depth = Math.min(maxDepth - 0.6, Math.max(2, depth));
    tx = Math.max(-halfW + 0.4, Math.min(halfW - 0.4, tx));
  }
  const out = !inNet && !goodSwing && (Math.abs(tx) > halfW || depth > maxDepth || depth < 0.5);
  const end = inNet ? [P[0] + (tx - P[0]) * 0.4, 0.4, 0.05] : [tx, 0.03, -depth];
  const dur = inNet ? 0.45 : 1.25 - power * 0.45;
  ball.segs = [{ a: P, b: end, h: inNet ? 0.15 : Math.max(0.9, 1.2 + tilt * 1.5 + (1 - power) * 0.8), t0: now + 0.07, dur, bounceAtEnd: !inNet }];
  const quality = Math.abs(err) < 0.12 ? "תזמון מושלם" : err < 0 ? "קצת מוקדם" : "קצת מאוחר";
  ball.result = inNet ? ["ברשת", quality] : out ? ["אאוט", quality] : [power > 0.6 ? "ווינר!" : "נכנס!", quality];
  ball.good = !inNet && !out;
  if (!inNet) target.position.set(end[0], 0.02, end[2]);
}

function finishBall() {
  const r = ball.result || ["פספוס", ball.missWhy || "לא זוהתה מכה"];
  if (ball.good) { G.hits++; G.streak++; } else G.streak = 0;
  say(r[0], r[1]); paint();
  send({ type: "score", hits: G.hits, streak: G.streak, text: r[0] });
  ball = null; setTimeout(() => { B.ball.visible = B.shadow.visible = false; }, 400);
  queueFeed(1500);
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
      if (r.seg.bounceTimes) { while (r.seg.bounceTimes.length && now >= r.seg.bounceTimes[0]) { r.seg.bounceTimes.shift(); sound.bounce(); if (ball.good) target.material.opacity = 0.9; } }
      lastSeg = r.seg;
      if (ball.good && r.seg.bounceAtEnd) target.material.opacity = 0.9;
      if (r.done) { if (ball.segs[ball.segs.length - 1].bounceAtEnd) sound.bounce(); lastSeg = null; finishBall(); }
    }
  }
  sc.renderer.render(sc.scene, sc.camera);
}
sc.resize(); placeCamera(); requestAnimationFrame(loop);
