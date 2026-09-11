/**
 * The development server.
 *
 * It exists for one reason beyond serving files: it sends `Cache-Control:
 * no-store`. Python's http.server sends no caching header at all, which lets
 * the browser apply its own heuristic freshness to every module. The result is
 * a page built from a mix of old and new files, which shows up as errors like
 * "does not provide an export named X" for an export that is plainly there.
 * Modules are cached hard by browsers, so during development the only safe
 * answer is to never store them.
 *
 *   node tools/serve.mjs [--port 5173] [--root stage0]
 */
import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PORT = Number(arg("--port", 5173));
const ROOT = resolve(arg("--root", "stage0"));

/** Getting these wrong is fatal for modules, so they are explicit. */
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store, must-revalidate",
    ...headers,
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const wanted = decodeURIComponent(url.pathname);

  // Resolve inside the root and refuse anything that climbs out of it.
  const path = normalize(join(ROOT, wanted === "/" ? "/index.html" : wanted));
  if (path !== ROOT && !path.startsWith(ROOT + sep)) {
    send(res, 403, "Forbidden");
    return;
  }

  try {
    const info = await stat(path);
    const file = info.isDirectory() ? join(path, "index.html") : path;
    const size = info.isDirectory() ? (await stat(file)).size : info.size;

    res.writeHead(200, {
      "Content-Type": TYPES[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": size,
      // Belt and braces: no-store alone is enough for well behaved browsers,
      // but a stale entry already in the cache needs to be beaten as well.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    });
    createReadStream(file).pipe(res);
  } catch {
    send(res, 404, `Not found: ${wanted}`, { "Content-Type": "text/plain; charset=utf-8" });
  }
});

server.listen(PORT, () => {
  console.log(`MotionPlay dev server: http://127.0.0.1:${PORT}  (serving ${ROOT}, no caching)`);
});
