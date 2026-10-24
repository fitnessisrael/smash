// Copies the website into www/ for the store apps (Capacitor).
// In the app, the first screen is signup or training (not the marketing page).
import { cpSync, rmSync, mkdirSync, writeFileSync, readdirSync } from "node:fs";
const out = "www";
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
const skip = new Set(["www", "node_modules", "android", "ios", "scripts", "resources", ".git", ".github", "package.json", "package-lock.json", "capacitor.config.json", "vercel.json", "README.md"]);
for (const f of readdirSync(".")) if (!skip.has(f)) cpSync(f, `${out}/${f}`, { recursive: true });
cpSync("index.html", `${out}/landing.html`);
writeFileSync(`${out}/index.html`, `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>html,body{background:#000;margin:0}</style></head><body><script>
var has=false;try{has=!!localStorage.getItem("smash:account")}catch(e){}
location.replace(has?"/app.html":"/start.html?next=/app.html");
</script></body></html>`);
console.log("www ready");
