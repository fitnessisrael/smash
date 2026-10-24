// סמש — phone app
import { account, PLAN } from "./account.js";
import { Q, SPORTS, strokeName, store, Racket, SwingDetector, Sound, PlayLock, armPose, demoSwing, $, pressGroup } from "./core.js";
// 3D is loaded on demand so the rest of the app works even if it is slow to load
let makeScene, makeRacket, makeBall, poseRacket, COURT, THREE, OrbitControls;
async function load3d() {
  if (THREE) return;
  const m = await import("./court3d.js"); ({ makeScene, makeRacket, makeBall, poseRacket, COURT, THREE } = m);
  ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
}

const S = {
  sport: store.get("sport", "tennis"), side: store.get("side", 1), stroke: store.get("stroke", "fh"),
  feed: store.get("feed", "mix"), pmode: store.get("pmode", "easy"), solo: store.get("solo", "one"),
};
if (!account.require()) throw new Error("signup first");
const me = account.get();
function paintTrial() {
  const el = $("trial");
  if (account.isPro()) { el.className = "chip-trial pro"; el.textContent = "PRO"; }
  else { el.className = "chip-trial"; el.innerHTML = `<b>${account.left()}</b> מתוך ${PLAN.freeTries} ניתוחים חינם`; }
}
paintTrial();
if (me && me.name) $("hello").textContent = `${me.name.split(" ")[0]}, הטלפון שלך הוא המחבט.`;
// gate: every analysis (one swing, a drill, a screen game) uses one free try
function gate() { if (account.canUse()) return true; location.href = "/pro?from=limit"; return false; }
const sound = new Sound();
const racket = new Racket();
let sensorsOn = false;

/* ---------------- navigation ---------------- */
const views = ["home", "setup", "replay", "tv", "remote"];
let current = "home";
function show(v) {
  for (const k of views) $("v-" + k).hidden = k !== v;
  current = v; window.scrollTo(0, 0);
  if (v === "home") renderReplays();
}
document.addEventListener("click", e => { if (e.target.closest("[data-back]")) { leaveRemote(); stopReplay(); show("home"); } });

/* ---------------- home ---------------- */
function setPressed(el, v) { for (const b of el.querySelectorAll("button[data-v]")) b.setAttribute("aria-pressed", String(b.dataset.v === String(v))); }
setPressed($("sport"), S.sport); setPressed($("hand"), S.side); setPressed($("solo"), S.solo);
pressGroup($("sport"), v => { S.sport = v; store.set("sport", v); renderStrokes(); });
pressGroup($("hand"), v => { S.side = Number(v); store.set("side", S.side); });
pressGroup($("solo"), v => { S.solo = v; store.set("solo", v); stepText(); });
function stepText() { $("setup-step3").textContent = S.solo === "drill" ? "עשה כמה מכות שתרצה. כל מכה נספרת ומשמיעה צליל. בסוף תראה הילוך חוזר של המכה הכי טובה." : "עשה מכה אחת. ההילוך החוזר נפתח לבד."; }
stepText();
$("go-replay").onclick = () => { renderStrokes(); show("setup"); };
$("go-tv").onclick = () => { $("tv-url").textContent = location.host + "/tv"; renderFeed(); show("tv"); };

function renderStrokes() {
  const list = SPORTS[S.sport].strokes;
  if (!list.some(s => s[0] === S.stroke)) S.stroke = "fh";
  $("strokes").innerHTML = list.map(([k, he]) => `<button class="choice" data-v="${k}" aria-pressed="${k === S.stroke}">${he}</button>`).join("");
}
pressGroup($("strokes"), v => { S.stroke = v; store.set("stroke", v); });
// stroke picker for screen mode (adds "mixed")
function renderFeed() {
  const list = [["mix", "מעורב"], ...SPORTS[S.sport].strokes];
  if (!list.some(s => s[0] === S.feed)) S.feed = "mix";
  const html = list.map(([k, he]) => `<button class="choice" data-v="${k}" aria-pressed="${k === S.feed}">${he}</button>`).join("");
  $("feed").innerHTML = html; $("rm-feed").innerHTML = html;
}
const pickFeed = v => { S.feed = v; store.set("feed", v); renderFeed(); send({ type: "feed", feed: v }); };
pressGroup($("feed"), pickFeed); pressGroup($("rm-feed"), pickFeed);
// forgiving vs real ball physics on the big screen
function paintMode() {
  for (const id of ["pm1", "pm2"]) setPressed($(id), S.pmode);
  for (const p of document.querySelectorAll("[data-modehint]")) p.textContent = S.pmode === "real"
    ? "אמיתי: הכדור טס לפי זווית פני המחבט, מהירות התנופה, התזמון ומקום הפגיעה. מכה לא מדויקת תלך לרשת או החוצה."
    : "סלחני: מכה בזמן סביר תעבור את הרשת ותיכנס למגרש. טוב להתחלה.";
}
const pickMode = v => { S.pmode = v; store.set("pmode", v); paintMode(); send({ type: "mode", mode: v }); };
pressGroup($("pm1"), pickMode); pressGroup($("pm2"), pickMode); paintMode();

function renderReplays() {
  const r = store.get("replays", []);
  $("replays-wrap").hidden = !r.length;
  $("replays").innerHTML = r.slice(0, 6).map((x, i) => `<button data-i="${i}"><div>${strokeName(x.sport, x.stroke)} · ${SPORTS[x.sport].he}<br><span>${new Date(x.d).toLocaleDateString("he-IL")}</span></div><b>${Math.round(x.peak)} קמ״ש</b></button>`).join("");
}
$("replays").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const r = store.get("replays", [])[+b.dataset.i]; if (r) openReplay(r);
});

async function ensureSensors() {
  sound.unlock();
  if (sensorsOn) return true;
  if (!Racket.supported()) return false;
  try { await racket.start(); sensorsOn = true; return true; } catch (e) { return false; }
}

/* ---------------- play lock ---------------- */
let onLockRelease = null;
const lock = new PlayLock($("lock"), $("lk-hold"), () => onLockRelease && onLockRelease());
function lockScreen({ mode, title, text, stats = false, hold = "החזק 2 שניות כדי לעצור" }) {
  $("lk-mode").textContent = mode || ""; $("lk-t").textContent = title || ""; $("lk-p").textContent = text || "";
  $("lk-speed").hidden = !stats; $("lk-stats").hidden = !stats; $("lk-pulse").hidden = stats; $("lk-hold-t").textContent = hold;
  lock.engage();
}
function flash() { $("lock").classList.add("flash"); setTimeout(() => $("lock").classList.remove("flash"), 140); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sound.wake(); });

/* ---------------- phone only: one swing or a drill ---------------- */
$("start-replay").onclick = async () => {
  $("setup-msg").hidden = true;
  if (!gate()) return;
  const ok = await ensureSensors();
  if (!ok) { // computer / no sensors: show a demo replay
    openReplay({ d: Date.now(), sport: S.sport, stroke: S.stroke, side: S.side, frames: demoSwing(S.stroke), demo: true });
    return;
  }
  S.solo === "drill" ? drill() : record();
};
const wait = ms => new Promise(r => setTimeout(r, ms));
async function countIn(isCancelled) {
  await wait(1300); if (isCancelled()) return false; sound.tick(); flash(); sound.buzz();
  await wait(700); if (isCancelled()) return false; sound.tick(); flash(); sound.buzz();
  await wait(700); if (isCancelled()) return false;
  racket.zero(); sound.tick(true); flash(); sound.buzz();
  return true;
}
async function record() {
  let cancelled = false; onLockRelease = () => { cancelled = true; };
  lockScreen({ mode: strokeName(S.sport, S.stroke), title: "היכנס לעמדת מוכנות", text: "שני טיקים, ואז צלצול. לא צריך להסתכל על המסך." });
  if (!(await countIn(() => cancelled))) return;
  $("lk-t").textContent = "מכה!"; $("lk-p").textContent = "עשה מכה אחת עכשיו.";
  const det = new SwingDetector(S.sport), frames = [], t0 = performance.now();
  let hitAt = 0, peak = null;
  const off = racket.on(s => {
    frames.push({ t: s.t - t0, q: s.q.slice(), kmh: s.w * SPORTS[S.sport].lever * 3.6 });
    const h = det.push(s);
    if (h && !hitAt) { hitAt = s.t; peak = h; sound.hit(S.sport, h.kmh / 80); sound.buzz(); flash(); }
  });
  while (!cancelled) {
    await wait(50);
    const now = performance.now();
    if (hitAt && now - hitAt > 700) break;
    if (now - t0 > 8000) break;
  }
  off(); onLockRelease = null; lock.release();
  if (cancelled) return;
  if (!peak) { setupMsg("לא זיהינו מכה. נסה שוב, ותן לראש המחבט להשתחרר מהר יותר."); return; }
  account.use(); paintTrial();
  saveAndOpen(frames, peak.t - t0);
}
function saveAndOpen(frames, tp) { // keep ~1.2 s before the peak and 0.7 s after
  const cut = frames.filter(f => f.t > tp - 1200 && f.t < tp + 700);
  const rep = { d: Date.now(), sport: S.sport, stroke: S.stroke, side: S.side, frames: thin(cut) };
  rep.peak = Math.max(...rep.frames.map(f => f.kmh));
  const list = store.get("replays", []); list.unshift(rep); store.set("replays", list.slice(0, 12));
  openReplay(JSON.parse(JSON.stringify(rep)));
}
// drill: endless swings, each one counted with sound; keeps the best one for the replay
async function drill() {
  let stopped = false; onLockRelease = () => { stopped = true; };
  lockScreen({ mode: "אימון רצוף · " + strokeName(S.sport, S.stroke), title: "היכנס לעמדת מוכנות", text: "שני טיקים, ואז צלצול." });
  if (!(await countIn(() => stopped))) return;
  account.use(); paintTrial();
  lockScreen({ mode: "אימון רצוף · " + strokeName(S.sport, S.stroke), stats: true });
  $("lk-a-l").textContent = "מכות"; $("lk-b-l").textContent = "ממוצע";
  const det = new SwingDetector(S.sport), buf = []; let n = 0, sum = 0, bestKmh = 0, best = null, pendingBest = null;
  const off = racket.on(s => {
    buf.push({ t: s.t, q: s.q.slice(), kmh: s.w * SPORTS[S.sport].lever * 3.6 });
    while (buf.length && s.t - buf[0].t > 2200) buf.shift();
    if (pendingBest && s.t - pendingBest.t > 700) { best = { frames: buf.map(f => ({ ...f })), tp: pendingBest.t }; pendingBest = null; }
    const h = det.push(s);
    if (h) {
      n++; sum += h.kmh; sound.hit(S.sport, h.kmh / 80); sound.buzz(); flash();
      if (h.kmh > bestKmh) { bestKmh = h.kmh; pendingBest = { t: h.t }; }
      $("lk-speed").innerHTML = `${Math.round(h.kmh)}<small> קמ״ש</small>`;
      $("lk-a").textContent = n; $("lk-b").textContent = Math.round(sum / n); $("lk-c").textContent = Math.round(bestKmh);
    }
  });
  while (!stopped) await wait(100);
  off(); onLockRelease = null;
  if (pendingBest) best = { frames: buf.map(f => ({ ...f })), tp: pendingBest.t };
  if (best && best.frames) { const t0 = best.frames[0].t; best.frames.forEach(f => (f.t -= t0)); saveAndOpen(best.frames, best.tp - t0); }
  else setupMsg(n ? "האימון נשמר." : "לא זיהינו מכות. תן לראש המחבט להשתחרר מהר יותר.");
}
function thin(fr) { // keep ~120 fps max, round numbers to save space
  const out = []; let last = -99;
  for (const f of fr) if (f.t - last >= 8) { out.push({ t: Math.round(f.t), q: f.q.map(v => +v.toFixed(4)), kmh: +f.kmh.toFixed(1) }); last = f.t; }
  return out;
}
function setupMsg(text) { show("setup"); $("setup-msg").textContent = text; $("setup-msg").hidden = false; }

/* ---------------- replay viewer ---------------- */
let R = null; // replay state
async function openReplay(rep) {
  show("replay");
  try { await load3d(); } catch (e) { $("rp-info").textContent = "התצוגה התלת־ממדית לא נטענה. בדוק חיבור לאינטרנט."; }
  const fr = rep.frames; if (!fr.length) return;
  const t0 = fr[0].t; fr.forEach(f => (f.t -= t0));
  let pi = 0; fr.forEach((f, i) => { if (f.kmh > fr[pi].kmh) pi = i; });
  rep.peak = fr[pi].kmh;
  if (THREE) { if (!R) R = initViewer(); R.load(rep, pi); }
  renderMetrics(rep, pi);
}
function stopReplay() { if (R) R.playing = false; }

function initViewer() {
  const canvas = $("c3d"), sc = makeScene(canvas, S.sport);
  const controls = new OrbitControls(sc.camera, canvas); controls.enableDamping = true; controls.enablePan = false;
  const st = { playing: true, speed: 0.25, t: 0, rep: null, pi: 0, racket: null, trail: null, ghosts: new THREE.Group(), ball: makeBall(0.05), pos: [] };
  sc.scene.add(st.ghosts, st.ball.ball, st.ball.shadow);
  setPressed($("rp-speed"), 0.25);
  pressGroup($("rp-speed"), v => (st.speed = +v));
  $("rp-play").onclick = () => { st.playing = !st.playing; $("rp-play").textContent = st.playing ? "⏸" : "▶"; };
  $("rp-peak").onclick = () => { st.playing = false; $("rp-play").textContent = "▶"; st.t = st.rep.frames[st.pi].t; };
  $("rp-scrub").oninput = e => { st.playing = false; $("rp-play").textContent = "▶"; st.t = e.target.value / 1000 * st.dur; };
  $("again").onclick = () => show("setup");
  window.addEventListener("resize", () => sc.resize());

  st.load = (rep, pi) => {
    st.rep = rep; st.pi = pi; st.t = 0; st.dur = rep.frames[rep.frames.length - 1].t; st.playing = true; $("rp-play").textContent = "⏸";
    sc.setSport(rep.sport);
    if (st.racket) sc.scene.remove(st.racket);
    st.racket = makeRacket(rep.sport); sc.scene.add(st.racket);
    const z = COURT[rep.sport].playerZ, origin = [0, 0, z], L = st.racket.userData.len * 0.78;
    st.pos = rep.frames.map(f => { const a = armPose(f.q, rep.side, origin); return { hand: a.hand, tip: a.hand.map((v, i) => v + a.tip[i] * L) }; });
    // speed-coloured trail of the sweet spot
    if (st.trail) sc.scene.remove(st.trail);
    const pts = [], cols = [], max = rep.peak || 1;
    st.pos.forEach((p, i) => { pts.push(...p.tip); const k = Math.min(1, rep.frames[i].kmh / max); cols.push(0.25 + 0.58 * k, 0.3 + 0.7 * k, 0.12 * (1 - k)); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    st.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    sc.scene.add(st.trail);
    // faint ghost rackets along the swing
    while (st.ghosts.children.length) st.ghosts.remove(st.ghosts.children[0]);
    const n = rep.frames.length;
    for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 14))) {
      const gr = makeRacket(rep.sport); gr.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.12; o.material.depthWrite = false; } });
      poseRacket(gr, rep.frames[i].q, st.pos[i].hand); st.ghosts.add(gr);
    }
    st.ball.set(st.pos[pi].tip);
    // camera: behind and to the hitting side, looking at the player
    const side = rep.side;
    sc.camera.position.set(2.6 * side, 2.1, z + 3.2); controls.target.set(0.3 * side, 1.2, z - 0.2); controls.update();
    $("rp-info").textContent = `${strokeName(rep.sport, rep.stroke)} · שיא ${Math.round(rep.peak)} קמ״ש${rep.demo ? " · דוגמה (פתח בטלפון כדי למדוד אותך)" : ""}`;
  };

  let last = 0;
  const loop = ts => {
    requestAnimationFrame(loop);
    if (current !== "replay" || !st.rep) { last = ts; return; }
    const dt = Math.min(0.05, (ts - last) / 1000 || 0); last = ts;
    if (st.playing) { st.t += dt * 1000 * st.speed; if (st.t > st.dur + 400) st.t = 0; }
    const fr = st.rep.frames; let i = 0; while (i < fr.length - 2 && fr[i + 1].t < st.t) i++;
    const a = fr[i], b = fr[Math.min(fr.length - 1, i + 1)], f = b.t > a.t ? Math.max(0, Math.min(1, (st.t - a.t) / (b.t - a.t))) : 0;
    const q = Q.slerp(a.q, b.q, f), hand = st.pos[i].hand.map((v, k) => v + (st.pos[Math.min(fr.length - 1, i + 1)].hand[k] - v) * f);
    poseRacket(st.racket, q, hand);
    $("rp-scrub").value = String(Math.round(Math.min(1, st.t / st.dur) * 1000));
    const dtp = (st.t - fr[st.pi].t) / 1000;
    $("rp-info").dataset.t = dtp.toFixed(2);
    controls.update(); sc.renderer.render(sc.scene, sc.camera);
  };
  requestAnimationFrame(loop);
  setTimeout(() => sc.resize(), 50);
  return st;
}

/* ---------------- replay metrics ---------------- */
const RANGES = {
  speed: { tennis: { fh: [50, 120], bh: [45, 110], serve: [60, 140], smash: [60, 140], volley: [20, 60] }, padel: { fh: [35, 90], bh: [32, 85], serve: [20, 55], smash: [45, 110], bandeja: [30, 75], volley: [18, 50] } },
};
function grade(v, lo, hi, tol) { if (v >= lo && v <= hi) return 100; const d = v < lo ? lo - v : v - hi; return Math.max(0, Math.round(100 * (1 - d / tol))); }
function renderMetrics(rep, pi) {
  const fr = rep.frames, pk = fr[pi], over = rep.stroke === "smash" || rep.stroke === "serve" && rep.sport === "tennis" || rep.stroke === "bandeja";
  const rng = (RANGES.speed[rep.sport][rep.stroke]) || [40, 100];
  // swing time: from 25% of peak speed to the peak
  let s0 = pi; while (s0 > 0 && fr[s0].kmh > pk.kmh * 0.25) s0--;
  const swingT = (pk.t - fr[s0].t) / 1000;
  // acceleration into contact: speed at peak vs 100 ms earlier
  let b = pi; while (b > 0 && pk.t - fr[b].t < 100) b--;
  const accel = pk.kmh / Math.max(1, fr[b].kmh);
  // follow-through: degrees the racket keeps turning after the peak
  let ft = 0; for (let i = pi + 1; i < fr.length; i++) { const d = Math.min(1, Math.abs(fr[i - 1].q.reduce((a, v, k) => a + v * fr[i].q[k], 0))); ft += 2 * Math.acos(d) * 180 / Math.PI; if (fr[i].kmh < pk.kmh * 0.15) break; }
  // racket face at contact: up/down tilt of the string face
  const face = Q.rot(pk.q, [0, 0, 1]), tilt = Math.asin(Math.max(-1, Math.min(1, face[1]))) * 180 / Math.PI;
  const faceRange = over ? [-35, 15] : rep.stroke === "volley" ? [-5, 35] : [-15, 20];
  const M = [
    { name: "מהירות ראש המחבט", v: Math.round(pk.kmh) + " קמ״ש", s: grade(pk.kmh, rng[0], rng[1], 40),
      tip: pk.kmh < rng[0] ? "האט מדי. שחרר את פרק כף היד ותן לראש המחבט 'להצליף' דרך הכדור." : "מהירות טובה. עכשיו תשמור עליה גם בחבטות הבאות." },
    { name: "האצה לנקודת המגע", v: "×" + accel.toFixed(1), s: grade(accel, 1.6, 9, 1),
      tip: accel < 1.6 ? "המחבט מגיע למגע כבר במהירות קבועה. התחל רך והאץ בסוף, ממש לפני המגע." : "יפה! המחבט מאיץ ממש ברגע הנכון." },
    { name: "זמן התנופה", v: swingT.toFixed(2) + " שנ׳", s: grade(swingT, 0.12, 0.45, 0.3),
      tip: swingT > 0.45 ? "התנופה איטית וארוכה. תכין מוקדם, ואז תנועה אחת מהירה קדימה." : swingT < 0.12 ? "תנופה קצרה מאוד. תן לתנועה להתפתח מהכתף." : "תזמון תנופה טוב." },
    { name: "זווית המיתרים במגע", v: (tilt > 0 ? "פתוח " : "סגור ") + Math.abs(Math.round(tilt)) + "°", s: grade(tilt, faceRange[0], faceRange[1], 25),
      tip: tilt > faceRange[1] ? "המיתרים פונים למעלה. הכדור יעוף גבוה וארוך. סגור קצת את פני המחבט." : tilt < faceRange[0] ? "המיתרים פונים לרצפה. הכדור ייכנס לרשת. פתח קצת את פני המחבט." : "פני המחבט ישרים במגע. מצוין." },
    { name: "גמר תנועה", v: Math.round(ft) + "°", s: grade(ft, rep.stroke === "volley" ? 20 : 70, 400, 60),
      tip: ft < 70 && rep.stroke !== "volley" ? "התנועה נעצרת אחרי המגע. המשך עד הכתף השנייה." : "גמר תנועה מלא." },
  ];
  const total = Math.round(M.reduce((a, m) => a + m.s, 0) / M.length);
  $("rp-metrics").innerHTML =
    `<div class="card" style="display:flex;justify-content:space-between;align-items:center"><div><span class="label">ציון המכה</span><h2 style="font-size:26px">${total >= 85 ? "מצוין" : total >= 70 ? "טוב מאוד" : total >= 50 ? "בכיוון" : "יש מה לשפר"}</h2></div><div class="huge" style="font-size:64px">${total}</div></div>` +
    M.sort((a, b) => a.s - b.s).map(m => `<div class="metric"><div class="row"><h3>${m.name}</h3><span class="chip ${m.s >= 80 ? "g" : m.s >= 50 ? "w" : "b"}">${m.s}</span></div><div class="row"><span class="v">${m.v}</span></div><p>${m.tip}</p></div>`).join("");
}

/* ---------------- TV mode: phone is the racket ---------------- */
let peer = null, conn = null, streamOff = null, hitOff = null, stats = { hits: 0, streak: 0, best: 0 };
const urlCode = new URLSearchParams(location.search).get("tv");
if (urlCode) { $("tv-code").value = urlCode; $("tv-url").textContent = location.host + "/tv"; renderFeed(); show("tv"); }

$("tv-connect").onclick = async () => {
  const code = $("tv-code").value.replace(/\D/g, "");
  if (code.length !== 4) return tvErr("הקוד צריך להיות 4 ספרות, כמו שמופיע על המסך.");
  tvErr(""); sound.unlock();
  $("tv-connect").textContent = "מתחבר…";
  try {
    if (!window.Peer) throw new Error("lib");
    peer = new window.Peer(undefined, { debug: 0 });
    await new Promise((res, rej) => { peer.on("open", res); peer.on("error", rej); setTimeout(() => rej(new Error("timeout")), 9000); });
    conn = peer.connect("smash-tv-" + code, { reliable: false, serialization: "json" });
    await new Promise((res, rej) => { conn.on("open", res); conn.on("error", rej); peer.on("error", rej); setTimeout(() => rej(new Error("timeout")), 9000); });
    conn.on("data", onTvData);
    conn.on("close", () => { if (current === "remote") { $("rm-title").textContent = "החיבור למסך נותק"; if (lock.on) $("lk-t").textContent = "החיבור למסך נותק"; } });
    send({ type: "hello", sport: S.sport, side: S.side, feed: S.feed, mode: S.pmode }); renderFeed();
    stats = { hits: 0, streak: 0, best: 0 }; paintStats(); sessionCounted = false;
    show("remote");
  } catch (e) {
    tvErr("לא הצלחנו להתחבר. בדוק שהקוד נכון ושהטלפון והמסך מחוברים לאינטרנט.");
    try { peer && peer.destroy(); } catch (x) {} peer = null;
  }
  $("tv-connect").textContent = "התחבר למסך";
};
function tvErr(t) { $("tv-err").textContent = t; $("tv-err").hidden = !t; }
function send(m) { try { conn && conn.open && conn.send(m); } catch (e) {} }

let sessionCounted = false;
$("rm-start").onclick = async () => {
  if (!sessionCounted && !gate()) return;
  const ok = await ensureSensors();
  if (!ok) { $("rm-hint").textContent = "לא קיבלנו גישה לחיישני התנועה. פתח את האתר בטלפון (ספארי או כרום) ואשר גישה לתנועה."; return; }
  let stopped = false;
  onLockRelease = () => { stopped = true; streamOff && streamOff(); streamOff = null; send({ type: "stop" }); $("rm-start").textContent = "המשך"; $("rm-hint").textContent = "עצרת. אפשר להחליף חבטה ולהמשיך."; };
  const mode = "מול מסך · " + (S.feed === "mix" ? "מעורב" : strokeName(S.sport, S.feed));
  lockScreen({ mode, title: "היכנס לעמדת מוכנות", text: "הטלפון זקוף, המסך פונה לטלוויזיה." });
  if (!(await countIn(() => stopped))) return;
  lockScreen({ mode, stats: true });
  $("lk-a-l").textContent = "נכנסו"; $("lk-b-l").textContent = "רצף";
  if (!sessionCounted) { account.use(); sessionCounted = true; paintTrial(); }
  send({ type: "feed", feed: S.feed }); send({ type: "start" });
  startStreaming();
};

function startStreaming() {
  streamOff && streamOff(); hitOff && hitOff();
  const det = new SwingDetector(S.sport); let lastSend = 0;
  streamOff = racket.on(s => {
    if (s.t - lastSend > 33) { lastSend = s.t; send({ type: "q", q: s.q.map(v => +v.toFixed(4)), kmh: Math.round(s.w * SPORTS[S.sport].lever * 3.6) }); }
    const h = det.push(s);
    if (h) {
      sound.hit(S.sport, h.kmh / 80); sound.buzz();
      const face = Q.rot(h.q, [0, 0, 1]);
      send({ type: "hit", kmh: h.kmh, face, q: h.q, ww: Q.rot(h.q, h.wv || [0, 0, 0]), at: Date.now() });
      flash();
      stats.best = Math.max(stats.best, Math.round(h.kmh));
      $("rm-speed").innerHTML = $("lk-speed").innerHTML = `${Math.round(h.kmh)}<small> קמ״ש</small>`; paintStats();
    }
  });
}
function onTvData(m) {
  if (m.type === "score") { stats.hits = m.hits; stats.streak = m.streak; paintStats(); if (m.text) { $("rm-title").textContent = m.text; if (lock.on) $("lk-t").textContent = m.text; } }
}
function paintStats() {
  $("rm-hits").textContent = stats.hits; $("rm-streak").textContent = stats.streak; $("rm-best").textContent = stats.best;
  if (lock.on && current === "remote") { $("lk-a").textContent = stats.hits; $("lk-b").textContent = stats.streak; $("lk-c").textContent = stats.best; }
}
function leaveRemote() {
  streamOff && streamOff(); streamOff = null;
  if (conn) { try { send({ type: "bye" }); conn.close(); } catch (e) {} conn = null; }
  if (peer) { try { peer.destroy(); } catch (e) {} peer = null; }
  $("rm-start").textContent = "התחל";
}

renderStrokes(); renderReplays();
