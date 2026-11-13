// smash — first-run guide: a short 3-card intro (with Skip), then the first 5 swings are coached
// one by one on the lock screen (text + Hebrew voice where the phone has one). Shown once.
import { store } from "./core.js";

export const COACH_SWINGS = 5;
// each step: what to do before the swing, and a short note after it
const STEPS = [
  { t: "מכה 1 מתוך 5", say: "מכה ראשונה. לאט ובשליטה, תנועה רגילה.", p: "לאט ובשליטה. תנועה רגילה, בלי כוח.", after: "יפה! כל מכה נספרת, משמיעה צליל ומקבלת מהירות." },
  { t: "מכה 2 מתוך 5", say: "מכה שנייה. אותה תנועה, קצת יותר מהר.", p: "אותה תנועה, קצת יותר מהר.", after: "המספר הגדול הוא מהירות ראש המחבט בקמ״ש." },
  { t: "מכה 3 מתוך 5", say: "מכה שלישית. תאיץ ממש לפני המגע.", p: "תאיץ ממש לפני המגע. ככה עולה המהירות.", after: "האצה מאוחרת = מהירות גבוהה ברגע המגע." },
  { t: "מכה 4 מתוך 5", say: "מכה רביעית. תמשיך את התנועה עד הכתף השנייה.", p: "תמשיך את התנועה עד הכתף השנייה (גמר תנועה).", after: "גמר תנועה מלא מוסיף נקודות לציון." },
  { t: "מכה 5 מתוך 5", say: "מכה חמישית. עכשיו חזק, אבל בשליטה.", p: "עכשיו חזק, אבל בשליטה.", after: "" },
];
export const DONE_TEXT = "סיימת את ההדרכה! אפשר להמשיך להכות. כדי לסיים ולראות ציון, מחזיקים את הכפתור למטה 2 שניות.";
export const DONE_SAY = "כל הכבוד, סיימת את ההדרכה. אפשר להמשיך להכות. כדי לראות ציון, תחזיק את הכפתור למטה שתי שניות.";
export const MISS_TEXT = "לא זיהינו מכה. תן תנופה מלאה יותר, מהכתף.";

export const coach = {
  // swings already coached (0..5). "done" = finished or skipped.
  n() { return store.get("coachN", 0); },
  active() { return !store.get("coachDone", false) && this.n() < COACH_SWINGS; },
  step() { return STEPS[Math.min(this.n(), COACH_SWINGS - 1)]; },
  hit() { const n = this.n() + 1; store.set("coachN", n); if (n >= COACH_SWINGS) store.set("coachDone", true); return n; },
  skip() { store.set("coachDone", true); },
  tourSeen() { return store.get("tourSeen", false); },
};

/* ---------- voice (best effort: silent if the phone has no Hebrew voice) ---------- */
let voice = null;
function pickVoice() {
  try { voice = speechSynthesis.getVoices().find(v => /^he|^iw/i.test(v.lang)) || null; } catch (e) { voice = null; }
}
if (typeof speechSynthesis !== "undefined") { pickVoice(); try { speechSynthesis.addEventListener("voiceschanged", pickVoice); } catch (e) {} }
// iPhone only lets speech start after a tap: call this inside the tap that starts training
export function primeVoice() { try { if (typeof speechSynthesis === "undefined") return; const u = new SpeechSynthesisUtterance(" "); u.volume = 0; u.lang = "he-IL"; speechSynthesis.speak(u); } catch (e) {} }
// resolves when the sentence ends (or after maxMs, or at once if there is no voice)
export function say(text, maxMs = 4500) {
  return new Promise(res => {
    try {
      if (typeof speechSynthesis === "undefined" || !voice) return res();
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.voice = voice; u.lang = voice.lang; u.rate = 1.05;
      const t = setTimeout(res, maxMs); u.onend = u.onerror = () => { clearTimeout(t); res(); };
      speechSynthesis.speak(u);
    } catch (e) { res(); }
  });
}
export function hush() { try { typeof speechSynthesis !== "undefined" && speechSynthesis.cancel(); } catch (e) {} }

/* ---------- intro cards ---------- */
const CARDS = [
  { icon: '<rect x="14" y="4" width="12" height="26" rx="3"/><path d="M20 30v7"/><circle cx="20" cy="11" r="1.6" fill="currentColor"/>',
    h: "מחזיקים כמו מחבט", p: "אחיזה חזקה בתחתית הטלפון, כמו ידית. <b>החלק העליון = ראש המחבט. המסך = המיתרים.</b> מומלץ כיסוי עם אחיזה או רצועת יד." },
  { icon: '<path d="M8 30c4-12 12-20 24-22"/><path d="M26 6l6 2-2 6"/><circle cx="10" cy="30" r="2" fill="currentColor"/>',
    h: "מניפים אחרי הצלצול", p: "שני טיקים ואז צלצול, ואז מכה אחת באוויר. המסך ננעל, לא צריך להסתכל עליו. ב-5 המכות הראשונות נגיד לך בדיוק מה לעשות." },
  { icon: '<circle cx="20" cy="20" r="15"/><path d="M20 20l7-7"/><path d="M11 26h18" stroke-dasharray="2 3"/>',
    h: "מקבלים מהירות וציון", p: "כל מכה מקבלת מהירות בקמ״ש. בסוף רואים הילוך חוזר בתלת-ממד וציון 0-100 עם טיפ אחד לשיפור." },
];
// shows the 3 cards once. Resolves "go" (finished) or "skip" (skipped the whole guide).
export function tour(onGo) { // onGo runs inside the last tap (iPhone motion/voice permission)
  store.set("tourSeen", true);
  const el = document.createElement("div");
  el.className = "count onb"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-labelledby", "onb-h");
  el.innerHTML = `<div class="card onb-card">
    <div class="onb-top"><span class="label" id="onb-n"></span><button type="button" class="onb-skip" id="onb-skip">דלג</button></div>
    <svg class="onb-ic" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"></svg>
    <h2 id="onb-h"></h2><p id="onb-p"></p>
    <div class="onb-dots" aria-hidden="true">${CARDS.map(() => "<i></i>").join("")}</div>
    <button type="button" class="big" id="onb-next"></button></div>`;
  document.body.appendChild(el);
  let i = 0;
  const paint = () => {
    const c = CARDS[i];
    el.querySelector("#onb-n").textContent = `${i + 1} מתוך ${CARDS.length}`;
    el.querySelector(".onb-ic").innerHTML = c.icon; el.querySelector("#onb-h").textContent = c.h; el.querySelector("#onb-p").innerHTML = c.p;
    el.querySelectorAll(".onb-dots i").forEach((d, k) => d.classList.toggle("on", k === i));
    el.querySelector("#onb-next").textContent = i < CARDS.length - 1 ? "הבא" : "יאללה, 5 מכות מודרכות";
    el.querySelector("#onb-next").focus();
  };
  paint();
  return new Promise(res => {
    el.querySelector("#onb-next").onclick = () => { if (i < CARDS.length - 1) { i++; paint(); } else { onGo && onGo(); el.remove(); res("go"); } };
    el.querySelector("#onb-skip").onclick = () => { coach.skip(); el.remove(); res("skip"); };
  });
}

/* ---------- one-time tooltips ---------- */
// small bubble under an element; disappears on tap or when the element is used
export function tip(target, text, key) {
  if (!target || store.get("tip:" + key, false)) return null;
  const b = document.createElement("div"); b.className = "onb-tip"; b.setAttribute("role", "note");
  b.innerHTML = `<span></span><button type="button" aria-label="סגור">✕</button>`; b.querySelector("span").textContent = text;
  target.insertAdjacentElement("afterend", b);
  const close = () => { store.set("tip:" + key, true); b.remove(); };
  b.querySelector("button").onclick = close; target.addEventListener("click", close, { once: true });
  return b;
}
// one-time explanation card above the score after the first replay
export function scoreTip(container) {
  if (store.get("tip:score", false) || !container) return;
  const c = document.createElement("div"); c.className = "card onb-score";
  c.innerHTML = `<b>איך לקרוא את הציון?</b><p>הציון (0-100) הוא ממוצע של 5 מדדים. המדד הכי חלש מופיע ראשון, עם טיפ אחד לתיקון. תתחיל ממנו במכה הבאה. בתלת-ממד, צהוב = רגע המהירות הכי גבוהה, שם צריך להיות המגע.</p><button type="button" class="pill lime">הבנתי</button>`;
  c.querySelector("button").onclick = () => { store.set("tip:score", true); c.remove(); };
  container.prepend(c);
}
