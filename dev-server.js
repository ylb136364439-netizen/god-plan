const http = require("http");
const fs = require("fs");
const path = require("path");

const root = __dirname;
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";
const types = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

http.createServer((request, response) => {
  const relative = decodeURIComponent(request.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(request.url.split("?")[0]).slice(1);
  const file = path.resolve(root, relative);
  const resolvedRelative = path.relative(root, file);
  if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  response.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
  fs.createReadStream(file).pipe(response);
}).listen(port, host, () => {
  const interfaces = require("os").networkInterfaces();
  const addresses = Object.values(interfaces).flat().filter(item => item?.family === "IPv4" && !item.internal);
  console.log(`造神计划已启动：`);
  console.log(`电脑访问：http://127.0.0.1:${port}`);
  addresses.forEach(item => console.log(`手机访问：http://${item.address}:${port}`));
});
