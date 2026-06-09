const fs = require("fs");
const vm = require("vm");

const required = [
  "index.html", "styles.css", "app-config.js", "store.js", "app.js", "sw.js",
  "manifest.webmanifest", "icon-192.png", "icon-512.png", "apple-touch-icon.png"
];
required.forEach(file => {
  if (!fs.existsSync(file)) throw new Error(`缺少应用资源：${file}`);
});

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(match => match[1]));
const refs = [...app.matchAll(/\$\("#([^" ]+)"\)/g)].map(match => match[1]);
const missing = [...new Set(refs.filter(id => !ids.has(id)))];
if (missing.length) throw new Error(`页面缺少元素：${missing.join(", ")}`);

const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
if (manifest.display !== "standalone" || !manifest.icons.some(icon => icon.sizes === "512x512")) {
  throw new Error("PWA Manifest 配置不完整");
}
["app-config.js", "store.js", "app.js", "sw.js"].forEach(file => new vm.Script(fs.readFileSync(file, "utf8"), { filename: file }));
console.log("应用资源、页面引用、Manifest 与脚本检查通过。");
