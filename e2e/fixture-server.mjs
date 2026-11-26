// Serves the hand-written recipe pages in e2e/fixtures/sites/ for the import flows.
// The dev server may fetch it only because playwright.config.ts sets
// IMPORT_ALLOW_HOSTS=127.0.0.1:4010 (ignored in production, lib/import/url-guard.ts).
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";

const PORT = 4010;
const dir = new URL("./fixtures/sites/", import.meta.url);

createServer(async (req, res) => {
  const name = new URL(req.url ?? "/", "http://x").pathname.replace(/^\/+/, "");
  if (name === "health") return res.end("ok");
  if (name === "blocked") {
    res.writeHead(403, { "content-type": "text/html" });
    return res.end("<h1>Forbidden</h1>");
  }
  if (!/^[a-z0-9-]+$/.test(name)) {
    res.writeHead(404);
    return res.end();
  }
  try {
    const html = await readFile(new URL(`${name}.html`, dir));
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } catch {
    res.writeHead(404);
    res.end();
  }
}).listen(PORT, "127.0.0.1", () => console.log(`fixture sites on http://127.0.0.1:${PORT}`));
