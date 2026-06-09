const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dist = path.join(root, "dist");
const assets = [
  "index.html", "styles.css", "app-config.js", "store.js", "app.js", "sw.js",
  "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png", "apple-touch-icon.png"
];

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
assets.forEach(file => fs.copyFileSync(path.join(root, file), path.join(dist, file)));
fs.writeFileSync(path.join(dist, ".nojekyll"), "");
console.log(`构建完成：${assets.length} 个应用资源已写入 dist。`);
