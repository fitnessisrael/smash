// Copies the website into www/ for the store apps (Capacitor).
// In the app, the first screen is signup or training (not the marketing page).
import { cpSync, rmSync, mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
const out = "www";
rmSync(out, { recursive: true, force: true }); mkdirSync(out);
const skip = new Set(["www", "node_modules", "android", "ios", "scripts", "resources", "store", ".git", ".github", "package.json", "package-lock.json", "capacitor.config.json", "vercel.json", "README.md"]);
for (const f of readdirSync(".")) if (!skip.has(f)) cpSync(f, `${out}/${f}`, { recursive: true });
cpSync("index.html", `${out}/landing.html`);
cpSync("index.html", `${out}/index.html`);
console.log("www ready");

// ---- make the store app work offline: copy libraries and fonts into www/vendor and point the pages at them ----
const V = `${out}/vendor`; mkdirSync(V, { recursive: true });
const cp = (from, to) => { if (!existsSync(from)) throw new Error("missing " + from); mkdirSync(to.replace(/\/[^/]+$/, ""), { recursive: true }); cpSync(from, to); };
cp("node_modules/three/build/three.module.js", `${V}/three/build/three.module.js`);
cp("node_modules/three/examples/jsm/controls/OrbitControls.js", `${V}/three/examples/jsm/controls/OrbitControls.js`);
cp("node_modules/@tensorflow/tfjs/dist/tf.min.js", `${V}/tf.min.js`);
cp("node_modules/peerjs/dist/peerjs.min.js", `${V}/peerjs.min.js`);
cp("node_modules/qrcode-generator/qrcode.js", `${V}/qrcode.js`);
let css = "";
for (const w of [400, 500, 700, 800, 900]) for (const [sub, range] of [["hebrew", "U+0590-05FF,U+200C-2010,U+20AA,U+25CC,U+FB1D-FB4F"], ["latin", "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"]]) {
  const f = `rubik-${sub}-${w}-normal.woff2`; cp(`node_modules/@fontsource/rubik/files/${f}`, `${V}/fonts/${f}`);
  css += `@font-face{font-family:Rubik;font-style:normal;font-weight:${w};font-display:swap;src:url(fonts/${f}) format("woff2");unicode-range:${range}}\n`;
}
writeFileSync(`${V}/fonts.css`, css);
const rewrite = (file) => {
  let t = readFileSync(file, "utf8");
  t = t.replace(/<link rel="preconnect"[^>]*>\s*/g, "");
  t = t.replace(/<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '<link rel="stylesheet" href="/vendor/fonts.css">');
  t = t.replaceAll("https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js", "/vendor/three/build/three.module.js");
  t = t.replaceAll("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/", "/vendor/three/examples/jsm/");
  t = t.replaceAll("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js", "/vendor/tf.min.js");
  t = t.replaceAll("https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js", "/vendor/peerjs.min.js");
  t = t.replaceAll("https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js", "/vendor/qrcode.js");
  writeFileSync(file, t);
};
for (const f of readdirSync(out)) if (f.endsWith(".html")) rewrite(`${out}/${f}`);
console.log("vendor ready");
