import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
const base = path.resolve("out");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    let file = path.resolve(base, "." + pathname);
    if (file !== base && !file.startsWith(base + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if ((await stat(file)).isDirectory()) file = path.join(file, "index.html");
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type": types[path.extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found. Run npm run build before npm start.");
  }
});
const port = Number(process.env.PORT || 3000);
server.listen(port, "127.0.0.1", () =>
  console.log(`Demand Matching Lab: http://127.0.0.1:${port}`),
);
