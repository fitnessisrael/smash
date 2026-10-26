// סמש — phone app
import { account, PLAN, NATIVE } from "./account.js";
const TV_HOST = "smash-it.co.il";
import { Q, SPORTS, strokeName, store, Racket, SwingDetector, Sound, PlayLock, armPose, demoSwing, $, pressGroup, kmhOf } from "./core.js";
import { showSummary, fmtTime } from "./summary.js";
// 3D is loaded on demand so the rest of the app works even if it is slow to load
let makeScene, makeRacket, makeBall, poseRacket, COURT, THREE, OrbitControls;
async function load3d() {
  if (THREE) return;
  const m = await import("./court3d.js"); ({ makeScene, makeRacket, makeBall, poseRacket, COURT, THREE } = m);
  ({ OrbitControls } = await import("three/addons/controls/OrbitControls.js"));
}

if (!store.get("v3", false)) { store.set("sport", "padel"); store.set("solo", "drill"); store.set("v3", true); } // new defaults: padel, continuous drill
const S = {
  sport: store.get("sport", "padel"), side: store.get("side", 1), stroke: store.get("stroke", "fh"),
  feed: store.get("feed", "mix"), pmode: store.get("pmode", "easy"), solo: store.get("solo", "drill"),
};
if (!account.require()) throw new Error("signup first");
const me = account.get();
function paintTrial() {
  const el = $("trial");
  if (NATIVE) { el.hidden = true; return; }
  if (account.isPro()) { el.className = "chip-trial pro"; el.textContent = "PRO"; }
  else { el.className = "chip-trial"; el.innerHTML = `<b>${account.left()}</b> מתוך ${PLAN.freeTries} ניתוחים חינם`; }
}
paintTrial();
if (me && me.name) $("hello").textContent = `${me.name.split(" ")[0]}, הטלפון שלך הוא המחבט.`;
// gate: every analysis (one swing, a drill, a screen game) uses one free try
// one-time safety screen before the first swing
function safety() {
  if (store.get("safetyOk", false)) return Promise.resolve(true);
  $("safety").hidden = false; $("sf-ok").focus();
  return new Promise(res => {
    $("sf-ok").onclick = () => { store.set("safetyOk", true); $("safety").hidden = true; ensureSensors(); res(true); };
    $("sf-no").onclick = () => { $("safety").hidden = true; res(false); };
  });
}
function gate() { if (account.canUse()) return true; location.href = "/pro.html?from=limit"; return false; }
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
let replayWait = null; // set while a replay was opened from the drill summary: "back" returns to that summary
document.addEventListener("click", e => { if (e.target.closest("[data-back]")) { leaveRemote(); stopReplay(); show("home"); if (current === "home" && replayWait) { const w = replayWait; replayWait = null; w("back"); } } });

/* ---------------- home ---------------- */
function setPressed(el, v) { for (const b of el.querySelectorAll("button[data-v]")) b.setAttribute("aria-pressed", String(b.dataset.v === String(v))); }
setPressed($("sport"), S.sport); setPressed($("hand"), S.side); setPressed($("solo"), S.solo);
pressGroup($("sport"), v => { S.sport = v; store.set("sport", v); renderStrokes(); });
pressGroup($("hand"), v => { S.side = Number(v); store.set("side", S.side); });
pressGroup($("solo"), v => { S.solo = v; store.set("solo", v); stepText(); });
function stepText() { $("setup-step3").textContent = S.solo === "drill" ? "עשה כמה מכות שתרצה. כל מכה נספרת ומשמיעה צליל. בסוף תראה הילוך חוזר של המכה הכי טובה." : "עשה מכה אחת. ההילוך החוזר נפתח לבד."; }
stepText();
$("go-replay").onclick = () => { renderStrokes(); show("setup"); };
$("go-tv").onclick = () => { $("tv-url").textContent = TV_HOST + "/tv"; renderFeed(); show("tv"); };

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

const recentReplays = () => store.get("replays", []).filter(x => Date.now() - x.d < 30 * 864e5);
function renderMine() {
  const l = account.sessions(); $("mine-wrap").hidden = !l.length; if (!l.length) return;
  const n = l.reduce((a, x) => a + x.n, 0), ms = l.reduce((a, x) => a + x.ms, 0), best = Math.max(...l.map(x => x.best || 0));
  $("mine-tot").innerHTML = `<div><b>${l.length}</b><span>אימונים</span></div><div><b>${n}</b><span>חבטות</span></div><div><b>${best || "—"}</b><span>שיא קמ״ש</span></div>`;
  $("mine").innerHTML = l.slice(0, 8).map(x => `<button style="pointer-events:none" tabindex="-1"><div>${x.mode} · ${SPORTS[x.sport] ? SPORTS[x.sport].he : ""}<br><span>${new Date(x.d).toLocaleDateString("he-IL")} · ${x.n} חבטות · ${fmtTime(x.ms)}</span></div><b>${x.avg ? x.avg + " ממוצע" : "—"}</b></button>`).join("");
}
function renderReplays() {
  renderMine();
  const r = recentReplays();
  $("replays-wrap").hidden = !r.length;
  $("replays").innerHTML = r.slice(0, 6).map((x, i) => `<button data-i="${i}"><div>${x.marks ? "סשן מלא · " + x.marks.length + " מכות" : strokeName(x.sport, x.stroke)} · ${SPORTS[x.sport].he}<br><span>${new Date(x.d).toLocaleDateString("he-IL")}</span></div><b>${Math.round(x.peak)} קמ״ש</b></button>`).join("");
}
$("replays").addEventListener("click", e => {
  const b = e.target.closest("button[data-i]"); if (!b) return;
  const r = recentReplays()[+b.dataset.i]; if (r) openReplay(r);
});

let sensorsP = null;
function ensureSensors() { // must start inside a tap (iPhone permission); shared by every caller
  sound.unlock();
  if (sensorsOn) return Promise.resolve(true);
  if (!Racket.supported()) return Promise.resolve(false);
  if (!sensorsP) sensorsP = racket.start().then(() => { sensorsOn = true; sound.wake(); return true; }, () => { sensorsP = null; return false; });
  return sensorsP;
}

/* ---------------- play lock ---------------- */
let onLockRelease = null;
const lock = new PlayLock($("lock"), $("lk-hold"), () => onLockRelease && onLockRelease());
function lockScreen({ mode, title, text, stats = false, hold = "סיום · החזק 2 שניות" }) {
  $("lk-mode").textContent = mode || ""; $("lk-t").textContent = title || ""; $("lk-p").textContent = text || "";
  $("lk-speed").hidden = !stats; $("lk-stats").hidden = !stats; $("lk-pulse").hidden = stats; $("lk-hold-t").textContent = hold;
  lock.engage();
}
let clockT = 0, clockT0 = 0;
function startClock() { clockT0 = performance.now(); clearInterval(clockT); const t = () => ($("lk-clock").textContent = fmtTime(performance.now() - clockT0)); $("lk-clock").hidden = false; t(); clockT = setInterval(t, 500); }
function stopClock() { clearInterval(clockT); const ms = performance.now() - clockT0; $("lk-clock").hidden = true; return ms; }
function flash() { $("lock").classList.add("flash"); setTimeout(() => $("lock").classList.remove("flash"), 140); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sound.wake(); });

/* ---------------- phone only: one swing or a drill ---------------- */
$("start-replay").onclick = async () => {
  $("setup-msg").hidden = true;
  if (!gate()) return;
  if (store.get("safetyOk", false)) ensureSensors(); // start the permission inside this tap
  if (!(await safety())) return;
  const ok = await ensureSensors();
  if (!ok) { // computer / no sensors: show a demo replay
    openReplay({ d: Date.now(), sport: S.sport, stroke: S.stroke, side: S.side, frames: demoSwing(S.stroke), demo: true });
    return;
  }
  S.solo === "drill" ? drill() : record();
};
const wait = ms => new Promise(r => setTimeout(r, ms));
async function countIn(isCancelled, lead = 1300) {
  await wait(lead); if (isCancelled()) return false; sound.tick(); flash(); sound.buzz();
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
    frames.push({ t: s.t - t0, q: s.q.slice(), kmh: kmhOf(s, SPORTS[S.sport].lever) });
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
function saveAndOpen(frames, tp, open = true) { // keep ~1.2 s before the peak and 0.7 s after
  const cut = frames.filter(f => f.t > tp - 1200 && f.t < tp + 700);
  const rep = { d: Date.now(), sport: S.sport, stroke: S.stroke, side: S.side, frames: thin(cut) };
  rep.peak = Math.max(...rep.frames.map(f => f.kmh));
  const list = store.get("replays", []); list.unshift(rep); store.set("replays", list.slice(0, 12));
  if (open) openReplay(JSON.parse(JSON.stringify(rep)));
}
// drill: every swing gets its own count-in (tick, tick, ding), then ~2.5 s to get ready again.
// The whole session is recorded (up to one minute of swing clips) and the best swing is kept on the card.
async function drill() {
  let stopped = false; onLockRelease = () => { stopped = true; };
  const modeT = "אימון רצוף · " + strokeName(S.sport, S.stroke);
  const lever = SPORTS[S.sport].lever;
  lockScreen({ mode: modeT, title: "היכנס לעמדת מוכנות", text: "שני טיקים, ואז צלצול. אחרי כל מכה יש הפסקה קצרה." });
  let listening = false, det = null, pending = null;
  const buf = [], speeds = [], clips = []; let n = 0, sum = 0, bestKmh = 0, clipMs = 0;
  const off = racket.on(s => {
    buf.push({ t: s.t, q: s.q.slice(), kmh: kmhOf(s, lever) });
    while (buf.length && s.t - buf[0].t > 2400) buf.shift();
    if (pending && s.t - pending.t >= 700) { // swing finished: cut the clip around it
      const fr = buf.filter(f => f.t > pending.t - 1200 && f.t < pending.t + 700);
      if (fr.length > 8 && clipMs + 1900 <= 60000) { clipMs += fr[fr.length - 1].t - fr[0].t; clips.push({ frames: fr.map(f => ({ ...f })), tp: pending.t, kmh: pending.kmh }); }
      pending = null;
    }
    if (!listening) return;
    const h = det.push(s);
    if (h) {
      listening = false; n++; sum += h.kmh; speeds.push(h.kmh); bestKmh = Math.max(bestKmh, h.kmh); pending = { t: h.t, kmh: h.kmh };
      sound.hit(S.sport, h.kmh / 80); sound.buzz(); flash();
      $("lk-speed").innerHTML = `${Math.round(h.kmh)}<small> קמ״ש</small>`;
      $("lk-a").textContent = n; $("lk-b").textContent = Math.round(sum / n); $("lk-c").textContent = Math.round(bestKmh);
    }
  });
  let first = true;
  while (!stopped) {
    if (!(await countIn(() => stopped, first ? 1300 : 500))) break;
    if (first) { account.use(); paintTrial(); lockScreen({ mode: modeT, stats: true }); startClock(); $("lk-a-l").textContent = "חבטות"; $("lk-b-l").textContent = "ממוצע קמ״ש"; first = false; }
    $("lk-t").textContent = "";
    det = new SwingDetector(S.sport); listening = true;
    const t0 = performance.now(), n0 = n;
    while (!stopped && n === n0 && performance.now() - t0 < 9000) await wait(40); // wait for the swing (or repeat the count-in)
    listening = false;
    if (!stopped && n > n0) await wait(700); // let the swing clip finish recording
  }
  off(); onLockRelease = null; const ms = first ? 0 : stopClock();
  if (first) { show("home"); return; }
  // build the session video: the swing clips one after another
  let best = null; for (const c of clips) if (!best || c.kmh > best.kmh) best = c;
  let hasBest = false, hasVideo = false;
  const cut = c => { const t0 = c.frames[0].t; return { frames: c.frames.map(f => ({ ...f, t: f.t - t0 })), tp: c.tp - t0 }; };
  if (best) { const c = cut(best); saveAndOpen(c.frames, c.tp, false); hasBest = true; }
  if (clips.length) {
    const frames = [], marks = []; let off0 = 0, focus = [0, 0];
    for (const c of clips) {
      const k = cut(c), i0 = frames.length;
      for (const f of k.frames) frames.push({ t: off0 + f.t, q: f.q, kmh: f.kmh });
      marks.push({ t0: off0, t: off0 + k.tp, kmh: c.kmh, i0, i1: frames.length - 1 });
      if (c === best) focus = [i0, frames.length - 1];
      off0 += k.frames[k.frames.length - 1].t + 150;
    }
    saveSession(frames, marks, focus); hasVideo = true;
  }
  for (let again = false; ; again = true) { // after a replay, "back" returns here, not to the main screen
    const acts = [];
    if (hasVideo) acts.push({ id: "video", label: `כל המכות שעשיתי (${clips.length})`, primary: true });
    if (hasBest) acts.push({ id: "best", label: "המכה הטובה ביותר שלי" });
    acts.push({ id: "done", label: "סיום", primary: !acts.length });
    const act = await showSummary({ mode: modeT, sport: S.sport, ms, speeds, actions: acts, save: !again });
    if (act === "done") { show("home"); return; }
    const list = store.get("replays", []);
    const rp = act === "video" ? (list.find(r => r.marks) || list[0]) : (list.find(r => !r.marks) || list[0]);
    openReplay(rp);
    await new Promise(res => { replayWait = res; });
  }
}
function saveSession(frames, marks, focus) {
  const th = []; let last = -99; for (const f of frames) if (f.t - last >= 33) { th.push({ t: Math.round(f.t), q: f.q.map(v => +v.toFixed(3)), kmh: +f.kmh.toFixed(0) }); last = f.t; }
  // marks / focus must point into the thinned list
  const idx = t => { let i = 0; while (i < th.length - 1 && th[i].t < t) i++; return i; };
  const m2 = marks.map(m => ({ t0: m.t0, t: m.t, kmh: m.kmh }));
  const f0 = idx(frames[focus[0]].t), f1 = idx(frames[focus[1]].t);
  const rep = { d: Date.now(), sport: S.sport, stroke: S.stroke, side: S.side, frames: th, marks: m2, focus: [f0, f1], peak: Math.max(...marks.map(m => m.kmh)) };
  let list = store.get("replays", []); list.unshift(rep);
  let nv = 0; list = list.filter(r => !r.marks || ++nv <= 3); // keep the last 3 full sessions (storage size)
  store.set("replays", list.slice(0, 14));
}
function thin(fr) { // keep ~120 fps max, round numbers to save space
  const out = []; let last = -99;
  for (const f of fr) if (f.t - last >= 8) { out.push({ t: Math.round(f.t), q: f.q.map(v => +v.toFixed(4)), kmh: +f.kmh.toFixed(1) }); last = f.t; }
  return out;
}
function setupMsg(text) { show("setup"); $("setup-msg").textContent = text; $("setup-msg").hidden = false; }

/* ---------------- replay viewer ---------------- */
const blobB64 = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(b); });
async function shareVideo(blob) { // native: system share sheet (save to Photos, WhatsApp…); web: share sheet or download
  const name = `smash-${Date.now()}.${blob.type.includes("mp4") ? "mp4" : "webm"}`;
  const P = window.Capacitor && window.Capacitor.Plugins;
  if (NATIVE && P && P.Filesystem && P.Share) {
    try {
      const f = await P.Filesystem.writeFile({ path: name, data: await blobB64(blob), directory: "CACHE" });
      await P.Share.share({ title: "smash", text: "smash-it.co.il", url: f.uri, dialogTitle: "שתף את החבטה" });
      return;
    } catch (e) { if (/cancel/i.test(String((e && e.message) || e))) return; }
  }
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "smash", text: "smash-it.co.il" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}

let R = null; // replay state
let SESS = null; // the full session being browsed (its swings are listed one under another)
const bestMark = M => M.reduce((b, m, i) => (m.kmh > M[b].kmh ? i : b), 0);
function swingRep(sess, k) { // one swing of a session as its own clip
  const M = sess.marks, a = M[k].t0, b = k + 1 < M.length ? M[k + 1].t0 : Infinity;
  const frames = sess.frames.filter(f => f.t >= a && f.t < b).map(f => ({ t: f.t, q: f.q.slice(), kmh: f.kmh }));
  return { d: sess.d, sport: sess.sport, stroke: sess.stroke, side: sess.side, frames, peak: M[k].kmh, fromSession: true };
}
function renderSwingList(k) {
  $("rp-list-wrap").hidden = !SESS; if (!SESS) return;
  const M = SESS.marks, bi = bestMark(M);
  $("rp-list").innerHTML = M.map((m, i) => `<button data-k="${i}" aria-current="${i === k}"><div>מכה ${i + 1}${i === bi ? " · הכי טובה" : ""}<br><span>לחץ לצפייה</span></div><b>${Math.round(m.kmh)} קמ״ש</b></button>`).join("");
}
$("rp-list").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b && SESS) { openReplay(SESS, +b.dataset.k); window.scrollTo({ top: 0, behavior: "smooth" }); } });
async function openReplay(rep, k) {
  show("replay");
  SESS = null;
  if (rep.marks && rep.frames.length) { SESS = rep; if (k == null) k = bestMark(rep.marks); rep = swingRep(SESS, k); }
  renderSwingList(k);
  try { await load3d(); } catch (e) { $("rp-info").textContent = "התצוגה התלת־ממדית לא נטענה. בדוק חיבור לאינטרנט."; }
  const fr = rep.frames; if (!fr.length) return;
  const t0 = fr[0].t; fr.forEach(f => (f.t -= t0));
  let pi = 0; fr.forEach((f, i) => { if (f.kmh > fr[pi].kmh) pi = i; });
  rep.peak = fr[pi].kmh;
  if (THREE) { if (!R) R = initViewer(); R.load(rep, pi); }
  if (SESS) $("rp-info").textContent = `מכה ${k + 1} מתוך ${SESS.marks.length} · ${Math.round(rep.peak)} קמ״ש`;
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
  $("again").onclick = () => { replayWait = null; show("setup"); };
  /* share: record one loop of the replay to a video with a smash-it.co.il stamp, then share / save it */
  function drawMark(c, w) { // lime pill, top right
    const fs = Math.round(w * 0.05), pad = fs * 0.55, t = "smash-it.co.il";
    c.save(); c.font = `800 ${fs}px Rubik, system-ui, sans-serif`; c.textBaseline = "middle"; c.direction = "ltr";
    const tw = c.measureText(t).width, bw = tw + pad * 2, bh = fs + pad, x = w - bw - fs * 0.6, y = fs * 0.6, r = bh / 2;
    c.fillStyle = "rgba(218,250,84,.96)"; c.beginPath();
    c.moveTo(x + r, y); c.arcTo(x + bw, y, x + bw, y + bh, r); c.arcTo(x + bw, y + bh, x, y + bh, r); c.arcTo(x, y + bh, x, y, r); c.arcTo(x, y, x + bw, y, r); c.closePath(); c.fill();
    c.fillStyle = "#141a00"; c.fillText(t, x + pad, y + bh / 2 + 1); c.restore();
  }
  function shareBtn(text, busy) { const b = $("rp-share"); b.textContent = text; b.disabled = !!busy; }
  function startRec() {
    if (st.rec || !st.rep) return;
    if (typeof MediaRecorder === "undefined") { shareBtn("הדפדפן לא תומך בוידאו"); setTimeout(() => shareBtn("📤 שתף וידאו"), 2500); return; }
    try {
      const src = sc.renderer.domElement, k = Math.min(1, 720 / Math.max(src.width, src.height, 1));
      const cv = document.createElement("canvas"); cv.width = Math.max(2, Math.round(src.width * k / 2) * 2); cv.height = Math.max(2, Math.round(src.height * k / 2) * 2);
      const type = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find(t => MediaRecorder.isTypeSupported(t)) || "";
      const mr = new MediaRecorder(cv.captureStream(30), type ? { mimeType: type, videoBitsPerSecond: 3e6 } : {});
      const chunks = []; mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      st.rec = { mr, cv, ctx: cv.getContext("2d"), chunks, type: mr.mimeType || type || "video/webm" };
      shareBtn("מקליט…", true); st.t = 0; st.playing = true; $("rp-play").textContent = "⏸";
      mr.start(250); st.rec.guard = setTimeout(() => st.rec && finishRec(), 40000);
    } catch (e) { st.rec = null; shareBtn("לא הצלחנו להקליט"); setTimeout(() => shareBtn("📤 שתף וידאו"), 2500); }
  }
  function finishRec() {
    const r = st.rec; if (!r) return; st.rec = null; clearTimeout(r.guard);
    r.mr.onstop = async () => { shareBtn("📤 שתף וידאו"); if (r.chunks.length) await shareVideo(new Blob(r.chunks, { type: r.type.split(";")[0] })); };
    try { r.mr.stop(); } catch (e) { shareBtn("📤 שתף וידאו"); }
  }
  $("rp-share").onclick = startRec;

  window.addEventListener("resize", () => sc.resize());

  st.load = (rep, pi) => {
    st.rep = rep; st.pi = pi; st.t = 0; st.speed = rep.fromSession ? 0.5 : 0.25; setPressed($("rp-speed"), st.speed); st.mi = -1; st.dur = rep.frames[rep.frames.length - 1].t; st.playing = true; $("rp-play").textContent = "⏸";
    sc.setSport(rep.sport);
    if (st.racket) sc.scene.remove(st.racket);
    st.racket = makeRacket(rep.sport); sc.scene.add(st.racket);
    const z = COURT[rep.sport].playerZ, origin = [0, 0, z], L = st.racket.userData.len * 0.78;
    st.pos = rep.frames.map(f => { const a = armPose(f.q, rep.side, origin); return { hand: a.hand, tip: a.hand.map((v, i) => v + a.tip[i] * L) }; });
    // speed-coloured trail of the sweet spot
    if (st.trail) sc.scene.remove(st.trail);
    const pts = [], cols = [], max = rep.peak || 1;
    const [fa, fb] = rep.focus || [0, rep.frames.length - 1];
    st.pos.forEach((p, i) => { if (i < fa || i > fb) return; pts.push(...p.tip); const k = Math.min(1, rep.frames[i].kmh / max); cols.push(0.25 + 0.58 * k, 0.3 + 0.7 * k, 0.12 * (1 - k)); });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(cols, 3));
    st.trail = new THREE.Line(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }));
    sc.scene.add(st.trail);
    // faint ghost rackets along the swing
    while (st.ghosts.children.length) st.ghosts.remove(st.ghosts.children[0]);
    const n = rep.frames.length;
    for (let i = fa; i <= fb; i += Math.max(1, Math.floor((fb - fa + 1) / 14))) {
      const gr = makeRacket(rep.sport); gr.traverse(o => { if (o.material) { o.material = o.material.clone(); o.material.transparent = true; o.material.opacity = 0.12; o.material.depthWrite = false; } });
      poseRacket(gr, rep.frames[i].q, st.pos[i].hand); st.ghosts.add(gr);
    }
    st.ball.set(st.pos[pi].tip);
    const mk = $("rp-marks"); mk.hidden = !rep.marks;
    if (rep.marks) { const bi = rep.marks.reduce((b, m, i) => (m.kmh > rep.marks[b].kmh ? i : b), 0); mk.innerHTML = rep.marks.map((m, i) => `<button class="pill${i === bi ? " lime" : ""}" data-t="${m.t0}">${i + 1} · ${Math.round(m.kmh)}</button>`).join(""); mk.onclick = e => { const b = e.target.closest("button[data-t]"); if (b) { st.t = +b.dataset.t; st.playing = true; $("rp-play").textContent = "⏸"; } }; }
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
    if (st.playing || st.rec) { st.t += dt * 1000 * st.speed; if (st.t > st.dur + 400) { st.t = 0; if (st.rec) finishRec(); } }
    const fr = st.rep.frames; let i = 0; while (i < fr.length - 2 && fr[i + 1].t < st.t) i++;
    const a = fr[i], b = fr[Math.min(fr.length - 1, i + 1)], f = b.t > a.t ? Math.max(0, Math.min(1, (st.t - a.t) / (b.t - a.t))) : 0;
    const q = Q.slerp(a.q, b.q, f), hand = st.pos[i].hand.map((v, k) => v + (st.pos[Math.min(fr.length - 1, i + 1)].hand[k] - v) * f);
    poseRacket(st.racket, q, hand);
    $("rp-scrub").value = String(Math.round(Math.min(1, st.t / st.dur) * 1000));
    const dtp = (st.t - fr[st.pi].t) / 1000;
    $("rp-info").dataset.t = dtp.toFixed(2);
    if (st.rep.marks) { const M = st.rep.marks; let mi = 0; for (let k = 0; k < M.length; k++) if (st.t >= M[k].t0) mi = k; if (mi !== st.mi) { st.mi = mi; $("rp-info").textContent = `מכה ${mi + 1} מתוך ${M.length} · ${Math.round(M[mi].kmh)} קמ״ש`; } }
    controls.update(); sc.renderer.render(sc.scene, sc.camera);
    if (st.rec) { const c = st.rec.ctx, w = st.rec.cv.width, h = st.rec.cv.height; c.drawImage(sc.renderer.domElement, 0, 0, w, h); drawMark(c, w); }
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
if (urlCode) { $("tv-code").value = urlCode; $("tv-url").textContent = TV_HOST + "/tv"; renderFeed(); show("tv"); }

$("tv-connect").onclick = async () => {
  const code = $("tv-code").value.replace(/\D/g, "");
  if (code.length !== 4) return tvErr("הקוד צריך להיות 4 ספרות, כמו שמופיע על המסך.");
  tvErr(""); sound.unlock();
  $("tv-connect").textContent = "מתחבר…";
  try {
    if (!window.Peer) throw new Error("lib");
    peer = new window.Peer(undefined, { debug: 0 });
    await new Promise((res, rej) => { peer.on("open", res); peer.on("error", rej); setTimeout(() => rej(new Error("timeout")), 9000); });
    conn = peer.connect("smash-tv-" + code, { reliable: true, serialization: "json" });
    await new Promise((res, rej) => { conn.on("open", res); conn.on("error", rej); peer.on("error", rej); setTimeout(() => rej(new Error("timeout")), 9000); });
    conn.on("data", onTvData);
    conn.on("close", () => { if (current === "remote") { $("rm-title").textContent = "החיבור למסך נותק"; if (lock.on) $("lk-t").textContent = "החיבור למסך נותק"; } });
    send({ type: "hello", sport: S.sport, side: S.side, feed: S.feed, mode: S.pmode }); renderFeed();
    stats = { hits: 0, streak: 0, best: 0 }; rm.speeds = []; rm.ms = 0; rm.maxStreak = 0; paintStats(); sessionCounted = false;
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
const rm = { speeds: [], ms: 0, t0: 0, maxStreak: 0 };
$("rm-start").onclick = async () => {
  if (!sessionCounted && !gate()) return;
  if (store.get("safetyOk", false)) ensureSensors();
  if (!(await safety())) return;
  const ok = await ensureSensors();
  if (!ok) { $("rm-hint").textContent = "לא קיבלנו גישה לחיישני התנועה. פתח את האתר בטלפון (ספארי או כרום) ואשר גישה לתנועה."; return; }
  let stopped = false;
  onLockRelease = () => {
    stopped = true; streamOff && streamOff(); streamOff = null; send({ type: "stop" }); $("rm-start").textContent = "המשך"; $("rm-hint").textContent = "עצרת. אפשר להחליף חבטה ולהמשיך.";
    const ms = stopClock(); const sp = rm.speeds.slice(); rm.speeds = [];
    showSummary({ mode: "מול מסך · " + (S.feed === "mix" ? "מעורב" : strokeName(S.sport, S.feed)), sport: S.sport, ms, speeds: sp, rows: [["נכנסו למגרש", stats.hits], ["רצף שיא", rm.maxStreak]] });
  };
  const mode = "מול מסך · " + (S.feed === "mix" ? "מעורב" : strokeName(S.sport, S.feed));
  lockScreen({ mode, title: "היכנס לעמדת מוכנות", text: "הטלפון זקוף, המסך פונה לטלוויזיה." });
  if (!(await countIn(() => stopped))) return;
  lockScreen({ mode, stats: true }); startClock();
  $("lk-a-l").textContent = "נכנסו"; $("lk-b-l").textContent = "רצף";
  if (!sessionCounted) { account.use(); sessionCounted = true; paintTrial(); }
  send({ type: "feed", feed: S.feed }); send({ type: "start" });
  startStreaming();
};

function startStreaming() {
  streamOff && streamOff(); hitOff && hitOff();
  const det = new SwingDetector(S.sport); let lastSend = 0;
  streamOff = racket.on(s => {
    if (s.t - lastSend > 33) { lastSend = s.t; send({ type: "q", q: s.q.map(v => +v.toFixed(4)), kmh: Math.round(kmhOf(s, SPORTS[S.sport].lever)) }); }
    const h = det.push(s);
    if (h) {
      rm.speeds.push(h.kmh); sound.hit(S.sport, h.kmh / 80); sound.buzz();
      const face = Q.rot(h.q, [0, 0, 1]);
      send({ type: "hit", kmh: h.kmh, face, q: h.q, ww: Q.rot(h.q, h.wv || [0, 0, 0]), at: Date.now() });
      flash();
      stats.best = Math.max(stats.best, Math.round(h.kmh));
      $("rm-speed").innerHTML = $("lk-speed").innerHTML = `${Math.round(h.kmh)}<small> קמ״ש</small>`; paintStats();
    }
  });
}
function onTvData(m) {
  if (m.type === "score") { stats.hits = m.hits; stats.streak = m.streak; rm.maxStreak = Math.max(rm.maxStreak, m.streak); paintStats(); if (m.text) { $("rm-title").textContent = m.text; if (lock.on) $("lk-t").textContent = m.text; } }
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

$("del-acc")?.addEventListener("click", e => { e.preventDefault(); if (confirm("למחוק את החשבון וכל הנתונים מהמכשיר?")) { account.deleteAll(); location.replace("/start.html"); } });
