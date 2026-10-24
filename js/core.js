// סמש — shared core: quaternions, phone sensors, swing detection, sound, storage.

/* ---------- quaternion math (w,x,y,z) ---------- */
export const Q = {
  id: () => [1, 0, 0, 0],
  mul(a, b) {
    return [
      a[0]*b[0] - a[1]*b[1] - a[2]*b[2] - a[3]*b[3],
      a[0]*b[1] + a[1]*b[0] + a[2]*b[3] - a[3]*b[2],
      a[0]*b[2] - a[1]*b[3] + a[2]*b[0] + a[3]*b[1],
      a[0]*b[3] + a[1]*b[2] - a[2]*b[1] + a[3]*b[0],
    ];
  },
  norm(q) { const n = Math.hypot(...q) || 1; return q.map(v => v / n); },
  axisAngle(ax, ang) { const s = Math.sin(ang / 2); const n = Math.hypot(...ax) || 1; return [Math.cos(ang / 2), ax[0]/n*s, ax[1]/n*s, ax[2]/n*s]; },
  rot(q, v) { // rotate vector v by q
    const [w, x, y, z] = q, [vx, vy, vz] = v;
    const ix = w*vx + y*vz - z*vy, iy = w*vy + z*vx - x*vz, iz = w*vz + x*vy - y*vx, iw = -x*vx - y*vy - z*vz;
    return [ix*w + iw*-x + iy*-z - iz*-y, iy*w + iw*-y + iz*-x - ix*-z, iz*w + iw*-z + ix*-y - iy*-x];
  },
  fromTo(a, b) { // shortest arc rotating unit a onto unit b
    const d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    if (d < -0.9999) return [0, 1, 0, 0];
    const c = [a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0]];
    return Q.norm([1 + d, c[0], c[1], c[2]]);
  },
  fromBasis(x, y, z) { // columns = device axes in world
    const m00 = x[0], m01 = y[0], m02 = z[0], m10 = x[1], m11 = y[1], m12 = z[1], m20 = x[2], m21 = y[2], m22 = z[2];
    const t = m00 + m11 + m22; let q;
    if (t > 0) { const s = 0.5 / Math.sqrt(t + 1); q = [0.25 / s, (m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s]; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); q = [(m21 - m12) / s, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s]; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); q = [(m02 - m20) / s, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s]; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); q = [(m10 - m01) / s, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s]; }
    return Q.norm(q);
  },
  slerp(a, b, t) {
    let d = a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]; if (d < 0) { b = b.map(v => -v); d = -d; }
    if (d > 0.9995) return Q.norm(a.map((v, i) => v + (b[i] - v) * t));
    const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return a.map((v, i) => v * wa + b[i] * wb);
  },
};
export const V = {
  add: (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]],
  sc: (a, s) => [a[0]*s, a[1]*s, a[2]*s],
  norm(a) { const n = Math.hypot(...a) || 1; return [a[0]/n, a[1]/n, a[2]/n]; },
  cross: (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]],
};

/* ---------- sports ---------- */
// lever: racket length from hand to sweet spot (m); thr: speed (km/h) that counts as a hit
export const SPORTS = {
  tennis: { he: "טניס", lever: 0.55, thr: 30, strokes: [["fh", "פורהנד"], ["bh", "בקהנד"], ["serve", "הגשה"], ["smash", "סמש"], ["volley", "וולה"]] },
  padel: { he: "פאדל", lever: 0.40, thr: 22, strokes: [["fh", "פורהנד"], ["bh", "בקהנד"], ["serve", "הגשה"], ["smash", "סמש"], ["bandeja", "בנדחה"], ["volley", "וולה"]] },
};
export const strokeName = (sport, k) => (SPORTS[sport].strokes.find(s => s[0] === k) || [k, k])[1];

/* ---------- storage ---------- */
export const store = {
  get(k, d) { try { const v = JSON.parse(localStorage.getItem("smash:" + k)); return v ?? d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("smash:" + k, JSON.stringify(v)); } catch (e) {} },
};

/* ---------- phone motion sensors ---------- */
// Device frame: x = right of screen, y = top of phone (racket tip), z = out of the screen (string face).
// World frame: y up, -z toward the net, x to the player's right.
export class Racket {
  constructor() {
    this.q = Q.id(); this.g = [0, 1, 0]; this.last = 0; this.w = 0; this.ok = false; this.listeners = [];
    this.onMotion = this.onMotion.bind(this);
  }
  static supported() { return typeof window !== "undefined" && "DeviceMotionEvent" in window; }
  async start() {
    // iOS needs an explicit permission tap (must be called from a click handler)
    try {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        const r = await DeviceMotionEvent.requestPermission(); if (r !== "granted") throw new Error("denied");
      }
    } catch (e) { throw new Error("denied"); }
    window.addEventListener("devicemotion", this.onMotion);
    // wait for first real sample
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("nosensor")), 2500); this._first = () => { clearTimeout(t); res(); }; });
  }
  stop() { window.removeEventListener("devicemotion", this.onMotion); }
  on(fn) { this.listeners.push(fn); return () => (this.listeners = this.listeners.filter(f => f !== fn)); }
  // Align the racket to the world: tip up from gravity, string face toward the net.
  zero() {
    const up = V.norm(this.g);
    let q = Q.fromTo(up, [0, 1, 0]);
    const face = Q.rot(q, [0, 0, 1]);
    if (Math.hypot(face[0], face[2]) > 0.2) {
      const yaw = Math.atan2(face[0], face[2]); // want heading = atan2(0,-1) = PI
      q = Q.mul(Q.axisAngle([0, 1, 0], Math.PI - yaw), q);
    }
    this.q = q;
  }
  onMotion(e) {
    const now = performance.now();
    const ag = e.accelerationIncludingGravity, rr = e.rotationRate;
    if (!rr || rr.alpha == null) return;
    if (this._first) { this._first(); this._first = null; }
    if (ag && ag.x != null) { // low-pass gravity estimate (only trusted when the phone is calm)
      const a = [ag.x, ag.y, ag.z];
      const k = this.w < 1 ? 0.2 : 0.02;
      this.g = this.g.map((v, i) => v + (a[i] - v) * k);
    }
    const dt = this.last ? Math.min(0.05, Math.max(0.004, (now - this.last) / 1000)) : 0.016;
    this.last = now;
    // rotationRate: alpha around z, beta around x, gamma around y (deg/s)
    const wx = (rr.beta || 0) * Math.PI / 180, wy = (rr.gamma || 0) * Math.PI / 180, wz = (rr.alpha || 0) * Math.PI / 180;
    const w = Math.hypot(wx, wy, wz); this.w = w;
    if (w > 1e-6) this.q = Q.norm(Q.mul(this.q, Q.axisAngle([wx, wy, wz], w * dt)));
    const sample = { t: now, q: this.q, w, dt, wv: [wx, wy, wz] };
    for (const f of this.listeners) f(sample);
  }
}

/* ---------- swing detector: fires once per swing at peak racket-head speed ---------- */
export class SwingDetector {
  constructor(sport, sens = 1) { this.set(sport, sens); this.prev = 0; this.armed = true; this.calm = 0; this.peak = null; }
  set(sport, sens = 1) { this.lever = SPORTS[sport].lever; this.thr = SPORTS[sport].thr * sens; }
  // returns hit info or null
  push(s) {
    const kmh = s.w * this.lever * 3.6; // racket-head speed from angular velocity
    let hit = null;
    if (this.armed) {
      if (kmh > this.thr && (!this.peak || kmh >= this.peak.kmh)) this.peak = { kmh, q: s.q, t: s.t, wv: s.wv };
      if (this.peak && kmh < this.peak.kmh * 0.8) { hit = this.peak; this.peak = null; this.armed = false; this.calm = 0; }
    } else {
      this.calm = kmh < this.thr * 0.45 ? this.calm + s.dt : 0;
      if (this.calm > 0.15) this.armed = true;
    }
    this.prev = kmh;
    return hit ? { ...hit, hand: hit.kmh * 0.38 } : null;
  }
}

/* ---------- sound (synthesised, no files) ---------- */
export class Sound {
  constructor() { this.ctx = null; }
  // iPhone silent switch mutes Web Audio unless a media element is playing.
  // So we keep a silent looping <audio> running and ask for the "playback" audio session.
  unlock() {
    try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch (e) {}
    if (!this.media) {
      const a = document.createElement("audio");
      a.src = silentWavUrl(); a.loop = true; a.setAttribute("playsinline", ""); a.preload = "auto";
      a.setAttribute("x-webkit-airplay", "deny"); document.body.appendChild(a); a.hidden = true;
      this.media = a;
    }
    this.media.play().catch(() => {});
    if (!this.ctx) { const C = window.AudioContext || window.webkitAudioContext; if (C) this.ctx = new C(); }
    if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {});
    if (this.ctx) { const o = this.ctx.createOscillator(), g = this.ctx.createGain(); g.gain.value = 0; o.connect(g).connect(this.ctx.destination); o.start(); o.stop(this.ctx.currentTime + 0.01); }
  }
  // call when coming back to the page (e.g. after the screen turned off)
  wake() { if (this.media && this.media.paused) this.media.play().catch(() => {}); if (this.ctx && this.ctx.state !== "running") this.ctx.resume().catch(() => {}); }
  hit(sport = "tennis", power = 1) {
    const c = this.ctx; if (!c) return; const t = c.currentTime;
    const p = Math.max(0.35, Math.min(1, power));
    // string "pock": filtered noise burst + short body tone
    const len = 0.09, buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 6);
    const n = c.createBufferSource(); n.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = sport === "padel" ? 1500 : 2300; bp.Q.value = 1.2;
    const ng = c.createGain(); ng.gain.setValueAtTime(1.6 * p, t);
    n.connect(bp).connect(ng).connect(c.destination); n.start(t);
    const o = c.createOscillator(), og = c.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(sport === "padel" ? 380 : 520, t); o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    og.gain.setValueAtTime(0.9 * p, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og).connect(c.destination); o.start(t); o.stop(t + 0.12);
  }
  bounce() {
    const c = this.ctx; if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.06);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + 0.1);
  }
  tick(high = false) {
    const c = this.ctx; if (!c) return; const t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = high ? "sine" : "square"; o.frequency.value = high ? 1320 : 900;
    g.gain.setValueAtTime(high ? 0.5 : 0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + (high ? 0.5 : 0.05));
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + (high ? 0.55 : 0.06));
  }
  buzz() { if (navigator.vibrate) try { navigator.vibrate(25); } catch (e) {} }
}

function silentWavUrl() {
  const sr = 8000, n = sr, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
  w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

/* ---------- play lock: while the phone is the racket, stray touches and the back gesture do nothing ---------- */
export class PlayLock {
  constructor(el, holdBtn, onUnlock) {
    this.el = el; this.btn = holdBtn; this.onUnlock = onUnlock; this.on = false; this.wl = null;
    const stop = e => { if (this.on && !e.target.closest("#" + holdBtn.id)) { e.preventDefault(); e.stopPropagation(); } };
    for (const t of ["touchstart", "touchmove", "touchend", "click", "dblclick", "contextmenu", "gesturestart"]) el.addEventListener(t, stop, { passive: false });
    document.addEventListener("touchmove", e => { if (this.on) e.preventDefault(); }, { passive: false });
    // hold to unlock
    let timer = null, t0 = 0, raf = 0;
    const fill = holdBtn.querySelector("i");
    const begin = e => { e.preventDefault(); t0 = performance.now(); const step = () => { const p = Math.min(1, (performance.now() - t0) / 1500); fill.style.width = p * 100 + "%"; if (p >= 1) { end(); this.release(true); } else raf = requestAnimationFrame(step); }; raf = requestAnimationFrame(step); };
    const end = () => { cancelAnimationFrame(raf); fill.style.width = "0"; };
    holdBtn.addEventListener("touchstart", begin, { passive: false }); holdBtn.addEventListener("mousedown", begin);
    for (const t of ["touchend", "touchcancel", "mouseup", "mouseleave"]) holdBtn.addEventListener(t, end);
    holdBtn.addEventListener("contextmenu", e => e.preventDefault());
    // back gesture / back button: stay on the page
    addEventListener("popstate", () => { if (this.on) history.pushState({ lock: 1 }, ""); });
    addEventListener("beforeunload", e => { if (this.on) { e.preventDefault(); e.returnValue = ""; } });
    document.addEventListener("visibilitychange", () => { if (this.on && document.visibilityState === "visible") this.keepAwake(); });
  }
  async keepAwake() { try { if ("wakeLock" in navigator) this.wl = await navigator.wakeLock.request("screen"); } catch (e) {} }
  engage() {
    if (this.on) return; this.on = true; this.el.hidden = false; document.body.classList.add("locked");
    history.pushState({ lock: 1 }, ""); this.keepAwake();
    const d = document.documentElement;
    try { if (d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen({ navigationUI: "hide" }).catch(() => {}); } catch (e) {}
  }
  release(byUser = false) {
    if (!this.on) return; this.on = false; this.el.hidden = true; document.body.classList.remove("locked");
    try { this.wl && this.wl.release(); } catch (e) {} this.wl = null;
    try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
    if (byUser && this.onUnlock) this.onUnlock();
  }
}

/* ---------- racket pose → hand + tip positions (simple arm model) ---------- */
export function armPose(q, side = 1, origin = [0, 0, 0]) {
  const tip = Q.rot(q, [0, 1, 0]);
  const shoulder = V.add(origin, [0.2 * side, 1.45, 0]);
  const hand = V.add(shoulder, V.sc(V.norm(V.add(V.sc(tip, 0.8), [0.12 * side, -0.5, -0.15])), 0.6));
  return { hand, tip, face: Q.rot(q, [0, 0, 1]) };
}

/* ---------- demo swing (used when there are no sensors, e.g. on a computer) ---------- */
export function demoSwing(kind = "fh") {
  const frames = [], fps = 60, dur = 1.6;
  for (let i = 0; i <= dur * fps; i++) {
    const t = i / fps;
    // swing angle: slow takeback, fast whip through contact at t≈1.0, follow-through
    const u = t < 0.8 ? 0.25 * Math.sin(t / 0.8 * Math.PI / 2) : t < 1.0 ? 0.25 + 0.5 * Math.pow((t - 0.8) / 0.2, 2) : 0.75 + 0.25 * (1 - Math.pow(1 - Math.min(1, (t - 1.0) / 0.6), 2));
    let tip, face;
    if (kind === "smash" || kind === "serve") {
      const a = -0.6 * Math.PI + u * 1.9 * Math.PI; // tip goes behind back, up, down across
      tip = V.norm([0.15, Math.cos(a), Math.sin(a) * 0.9]);
      face = V.norm(V.cross([1, 0, 0], tip)); if (face[2] > 0) face = V.sc(face, -1);
    } else {
      const th = (-0.3 + u * 1.5) * Math.PI;
      tip = V.norm([Math.sin(th), 0.25 + 0.6 * Math.max(0, u - 0.7), Math.cos(th)]);
      face = V.norm(V.cross([0, 1, 0], tip));
    }
    const x = V.norm(V.cross(tip, face));
    const q = Q.fromBasis(x, tip, face);
    frames.push({ t: t * 1000, q, kmh: 0 });
  }
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1].q, b = frames[i].q;
    const d = Math.min(1, Math.abs(a[0]*b[0] + a[1]*b[1] + a[2]*b[2] + a[3]*b[3]));
    frames[i].kmh = 2 * Math.acos(d) * fps * 0.55 * 3.6;
  }
  frames[0].kmh = frames[1].kmh;
  return frames;
}

export const $ = id => document.getElementById(id);
export function pressGroup(el, onPick) {
  el.addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    for (const x of el.querySelectorAll("button[data-v]")) x.setAttribute("aria-pressed", String(x === b));
    onPick(b.dataset.v);
  });
}
