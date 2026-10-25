// smash — end-of-session summary (swings, speed, time). Saves the session to the account (last 30 days).
import { account } from "./account.js";

export const fmtTime = ms => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); };

export function showSummary({ title = "סיכום האימון", mode = "", sport = "padel", ms = 0, speeds = [], n = speeds.length, rows = [], actions = [{ id: "done", label: "סיום", primary: true }], save = true }) {
  const avg = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0, best = speeds.length ? Math.max(...speeds) : 0;
  if (save && n > 0) account.addSession({ d: Date.now(), mode, sport, ms, n, avg: Math.round(avg), best: Math.round(best) });
  const el = document.createElement("div");
  el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.style.cssText = "position:fixed;inset:0;z-index:70;background:rgba(0,0,0,.95);display:flex;align-items:center;justify-content:center;padding:20px;overflow:auto;direction:rtl;font-family:Rubik,system-ui,sans-serif;color:#eef2e2";
  const tile = (v, l, big) => `<div style="flex:1;background:#13150f;border:1px solid #262a1d;border-radius:16px;padding:14px 6px;text-align:center"><b style="display:block;font-size:${big ? 38 : 30}px;color:#dafa54;font-weight:800;font-variant-numeric:tabular-nums">${v}</b><span style="font-size:13px;color:#9aa18a">${l}</span></div>`;
  el.innerHTML = `<div style="width:100%;max-width:440px;display:flex;flex-direction:column;gap:14px">
    <div style="text-align:center"><div style="font-size:14px;color:#9aa18a">${mode}</div><h2 style="font-size:34px;margin:4px 0;font-weight:800">${title}</h2></div>
    <div style="display:flex;gap:8px">${tile(n, "חבטות", 1)}${tile(best ? Math.round(avg) : "—", "מהירות ממוצעת (קמ״ש)")}${tile(fmtTime(ms), "זמן", 1)}</div>
    <div style="display:flex;gap:8px">${tile(best ? Math.round(best) : "—", "מהירות שיא (קמ״ש)")}</div>
    ${rows.length ? `<div style="background:#13150f;border:1px solid #262a1d;border-radius:16px;padding:6px 14px">${rows.map(([a, b]) => `<div style="display:flex;justify-content:space-between;padding:9px 0;border-bottom:1px solid #1d2016"><span style="color:#9aa18a">${a}</span><b>${b}</b></div>`).join("")}</div>` : ""}
    <p style="margin:0;text-align:center;font-size:12px;color:#9aa18a">${n ? "האימון נשמר ב״האימונים שלי״. המהירות היא הערכה." : "לא נספרו חבטות."}</p>
    <div id="sm-acts" style="display:flex;flex-direction:column;gap:10px"></div></div>`;
  document.body.appendChild(el);
  return new Promise(res => {
    const box = el.querySelector("#sm-acts");
    for (const a of actions) {
      const b = document.createElement("button"); b.type = "button"; b.textContent = a.label;
      b.style.cssText = `border:${a.primary ? 0 : "1px solid #262a1d"};border-radius:999px;padding:16px;font:800 20px Rubik,system-ui,sans-serif;cursor:pointer;background:${a.primary ? "#dafa54" : "transparent"};color:${a.primary ? "#141a00" : "#eef2e2"}`;
      b.onclick = () => { el.remove(); res(a.id); };
      box.appendChild(b);
    }
    box.firstChild && box.firstChild.focus();
  });
}
