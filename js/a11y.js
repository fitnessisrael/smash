// smash — accessibility menu (no third-party script). Settings are remembered on this device.
const KEY = "smash:a11y";
const OPTS = [
  ["big", "הגדלת טקסט"],
  ["contrast", "ניגודיות גבוהה"],
  ["links", "הדגשת קישורים"],
  ["still", "עצירת אנימציות"],
  ["readable", "גופן קריא"],
];
let state = {};
try { state = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
function apply() {
  const r = document.documentElement;
  for (const [k] of OPTS) r.classList.toggle("a11y-" + k, !!state[k]);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}
apply();

const css = document.createElement("style");
css.textContent = `
.a11y-btn{position:fixed;z-index:25;bottom:calc(16px + env(safe-area-inset-bottom,0px));left:calc(16px + env(safe-area-inset-left,0px));width:48px;height:48px;border-radius:50%;border:2px solid #000;background:#dafa54;color:#000;display:grid;place-items:center;cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.5)}
.a11y-btn svg{width:28px;height:28px}
.a11y-panel{position:fixed;z-index:26;bottom:calc(74px + env(safe-area-inset-bottom,0px));left:calc(16px + env(safe-area-inset-left,0px));width:min(290px,calc(100vw - 32px));background:#0f100c;border:1px solid #33372a;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:8px;color:#f1f4e6;font-family:Rubik,system-ui,sans-serif;direction:rtl}
.a11y-panel h2{font-size:17px;margin:0 0 4px;font-weight:800}
.a11y-panel button{display:flex;justify-content:space-between;align-items:center;width:100%;background:#17190f;border:1px solid #2a2d22;color:#f1f4e6;border-radius:12px;padding:11px 12px;font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-align:right}
.a11y-panel button[aria-pressed="true"]{border-color:#dafa54;color:#dafa54}
.a11y-panel a{color:#dafa54;font-size:14px;text-align:center;padding-top:4px}
body.locked .a11y-btn,body.locked .a11y-panel{display:none}
html.a11y-big{font-size:118%}
html.a11y-big body{font-size:19px}
html.a11y-contrast{--bg:#000;--panel:#000;--line:#fff;--chalk:#fff;--muted:#fff;--lime:#f2ff00}
html.a11y-contrast body{filter:contrast(1.15)}
html.a11y-links a{text-decoration:underline!important;text-underline-offset:3px;outline:1px dashed currentColor;outline-offset:2px}
html.a11y-still *,html.a11y-still *::before,html.a11y-still *::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}
html.a11y-readable body,html.a11y-readable button,html.a11y-readable input{font-family:Arial,Helvetica,sans-serif!important;letter-spacing:.02em}
.skip{position:absolute;right:12px;top:-60px;z-index:40;background:#dafa54;color:#000;padding:10px 16px;border-radius:10px;font-weight:800;text-decoration:none}
.skip:focus{top:12px}
`;
document.head.appendChild(css);

function build() {
  const main = document.querySelector("main, .wrap, .formwrap");
  if (main && !main.id) main.id = "content";
  const skip = document.createElement("a"); skip.className = "skip"; skip.href = "#" + (main ? main.id : ""); skip.textContent = "דילוג לתוכן";
  document.body.prepend(skip);
  const btn = document.createElement("button");
  btn.className = "a11y-btn"; btn.type = "button"; btn.setAttribute("aria-label", "תפריט נגישות"); btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="M4 7.5l8 1.5 8-1.5.4 1.9-5.4 1.2v3.4l2.2 6.5-1.9.6L13 15h-2l-2.3 6.1-1.9-.6L9 14v-3.4L3.6 9.4z"/></svg>';
  const panel = document.createElement("div");
  panel.className = "a11y-panel"; panel.hidden = true; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "הגדרות נגישות");
  panel.innerHTML = "<h2>נגישות</h2>" + OPTS.map(([k, he]) => `<button type="button" data-k="${k}" aria-pressed="${!!state[k]}">${he}<span aria-hidden="true">${state[k] ? "✓" : ""}</span></button>`).join("") +
    '<button type="button" data-k="reset">איפוס הגדרות</button><a href="/accessibility">הצהרת נגישות</a>';
  panel.addEventListener("click", e => {
    const b = e.target.closest("button[data-k]"); if (!b) return;
    if (b.dataset.k === "reset") state = {}; else state[b.dataset.k] = !state[b.dataset.k];
    apply();
    for (const x of panel.querySelectorAll("button[data-k]")) if (x.dataset.k !== "reset") { x.setAttribute("aria-pressed", String(!!state[x.dataset.k])); x.querySelector("span").textContent = state[x.dataset.k] ? "✓" : ""; }
  });
  btn.addEventListener("click", () => { panel.hidden = !panel.hidden; btn.setAttribute("aria-expanded", String(!panel.hidden)); if (!panel.hidden) panel.querySelector("button").focus(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape" && !panel.hidden) { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
  document.body.append(btn, panel);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
