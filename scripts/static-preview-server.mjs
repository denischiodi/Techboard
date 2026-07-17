import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../dist/public");
const port = Number(process.env.PORT || 3030);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

function safePath(urlPath) {
  const clean = decodeURIComponent(urlPath.split("?")[0]).replace(/^\/+/, "");
  const file = path.resolve(root, clean || "index.html");
  return file.startsWith(root) ? file : path.join(root, "index.html");
}

createServer(async (req, res) => {
  try {
    let file = safePath(req.url || "/");
    if (!existsSync(file) || file.endsWith(path.sep)) {
      file = path.join(root, "index.html");
    }

    const ext = path.extname(file);
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": types[ext] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    res.end(`Erro ao abrir preview: ${error.message}`);
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`TechBoard+ preview aberto em http://localhost:${port}`);
});
