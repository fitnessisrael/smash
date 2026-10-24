// smash — account, free trials and plan.
// Stage 1: the account lives on this device. When a backend (accounts + payments) is connected,
// only this file changes; the pages call the same functions.

export const PLAN = {
  priceILS: 199,
  freeTries: 5,
  // Payment page link from the payment company (e.g. Grow / Cardcom / PayPlus). Empty = not live yet.
  paymentUrl: "",
};

// running inside the App Store / Google Play app? (store rules: no outside payment links there)
export const NATIVE = !!(typeof window !== "undefined" && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

const KEY = "smash:account";
function read() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
function write(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} return a; }

export const account = {
  get: read,
  create({ name, email, sport, marketing = false, termsAt = Date.now() }) {
    const prev = read();
    return write({ name: name.trim(), email: email.trim().toLowerCase(), sport: sport || "tennis", marketing, termsAt, created: prev ? prev.created : Date.now(), used: prev ? prev.used : 0, proUntil: prev ? prev.proUntil : 0 });
  },
  // Stage 1: called when the payment page sends the buyer back. Stage 2 will confirm the payment on a server first.
  activatePro() { const a = read(); if (!a) return; a.proUntil = Math.max(a.proUntil || 0, Date.now()) + 365 * 864e5; a.paidAt = Date.now(); write(a); },
  signOut() { try { localStorage.removeItem(KEY); } catch (e) {} },
  isPro() { const a = read(); return !!(a && a.proUntil && a.proUntil > Date.now()); },
  left() { const a = read(); if (!a) return 0; return Math.max(0, PLAN.freeTries - (a.used || 0)); },
  // true if the user may start an analysis now
  canUse() { return this.isPro() || this.left() > 0; },
  // count one analysis (no-op for Pro)
  use() { const a = read(); if (!a || this.isPro()) return; a.used = (a.used || 0) + 1; write(a); },
  // send to signup when there is no account
  require(next = location.pathname + location.search) {
    if (!read()) { location.replace("/start.html?next=" + encodeURIComponent(next)); return false; }
    return true;
  },
};
