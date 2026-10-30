import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, relative, isAbsolute } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
  '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.vtt': 'text/vtt',
};

function send(res, status, body = '', type = 'text/plain') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

/**
 * A request gate: requests for a held path stay pending until `release()`.
 * Lets a test observe Voyager in a precise loading state for as long as it needs.
 */
class Gate {
  requests = 0;
  #release;
  #released = new Promise(resolve => { this.#release = resolve; });
  release() { this.#release(); }
  async pass() {
    this.requests++;
    await this.#released;
  }
}

/**
 * Files served to a single test under a unique URL prefix,
 * so nothing (including the browser's HTTP cache) leaks between tests.
 */
export class Site {
  files = new Map();
  gates = new Map();
  #requests = new Map();
  #aborted = new Map();
  #build;
  /** `build(res, path)` serves a file of the Voyager build: the site serves the build under `voyager/`. */
  constructor(base, build) {
    this.base = base;
    this.#build = build;
  }

  /**
   * Voyager's own resources (fonts, images, translations), served from the site
   * so a test can hold or count requests to them. Use it as Explorer's `resourceRoot`.
   */
  get resources() { return `${this.base}voyager/`; }

  /** How many requests reached `path`, held or not, served or not found. */
  requests(path) { return this.#requests.get(path) ?? 0; }

  /** How many requests to `path` the browser gave up on before getting the whole response. */
  aborted(path) { return this.#aborted.get(path) ?? 0; }

  /** Serve `body` at `path`. Objects are served as JSON. */
  set(path, body, type = types[extname(path)] ?? 'application/octet-stream') {
    if (!Buffer.isBuffer(body) && typeof body !== 'string') body = JSON.stringify(body);
    this.files.set(path, { body, type });
    return this;
  }

  /** Hold every request to `path` until the returned gate is released. */
  hold(path) {
    const gate = new Gate();
    this.gates.set(path, gate);
    return gate;
  }

  async serve(path, req, res) {
    this.#requests.set(path, this.requests(path) + 1);
    res.on('close', () => { if (!res.writableFinished) this.#aborted.set(path, this.aborted(path) + 1); });
    await this.gates.get(path)?.pass();
    if (res.destroyed) return;
    const file = this.files.get(path);
    if (!file && path.startsWith('voyager/')) return this.#build(res, path.slice('voyager/'.length));
    if (!file) return send(res, 404, `Not found: ${path}`);
    sendRange(req, res, Buffer.from(file.body), file.type);
  }
}

/**
 * Answers single byte ranges, as browsers request them to stream and seek media.
 * Anything else gets the whole body.
 */
function sendRange(req, res, body, type) {
  const headers = { 'content-type': type, 'cache-control': 'no-store', 'accept-ranges': 'bytes' };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (!range || (!range[1] && !range[2])) {
    res.writeHead(200, { ...headers, 'content-length': body.length });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  // "bytes=-n" is the last n bytes.
  const start = range[1] ? Number(range[1]) : Math.max(0, body.length - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
  if (start > end) {
    res.writeHead(416, { ...headers, 'content-range': `bytes */${body.length}` });
    return res.end();
  }
  res.writeHead(206, { ...headers, 'content-length': end - start + 1, 'content-range': `bytes ${start}-${end}/${body.length}` });
  res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
}

/**
 * Serves a Voyager build (`/voyager/`), an embedding page (`/host.html`) and per-test sites (`/sites/<n>/`).
 * Only GET/HEAD are answered: tests never write anything.
 */
export async function startServer({ dist, bundle }) {
  const sites = new Map();
  let count = 0;

  const host = `<!doctype html>
<html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Voyager e2e host</title>
<link href="/voyager/fonts/fonts.css" rel="stylesheet">
<style>html, body { margin: 0; width: 100%; height: 100%; background: #303030; }
voyager-explorer { display: block; width: 100%; height: 100%; }</style>
<script src="/voyager/${bundle}"></script>
</head><body></body></html>`;

  async function serveFile(res, path) {
    const file = join(dist, path);
    const inside = relative(dist, file);
    if (inside.startsWith('..') || isAbsolute(inside)) return send(res, 403);
    const stats = await stat(file).catch(() => null);
    if (!stats?.isFile()) return send(res, 404, `Not found: ${path}`);
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'content-length': stats.size, 'cache-control': 'no-store' });
    createReadStream(file).pipe(res);
  }

  async function handle(req, res) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405);
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (pathname === '/host.html') return send(res, 200, host, types['.html']);
    if (pathname === '/favicon.ico') return send(res, 204);
    if (pathname.startsWith('/voyager/')) return serveFile(res, pathname.slice('/voyager/'.length));
    const site = /^\/sites\/(\d+)\/(.*)$/.exec(pathname);
    if (site && sites.has(site[1])) return sites.get(site[1]).serve(site[2], req, res);
    send(res, 404, `Not found: ${pathname}`);
  }

  const server = http.createServer((req, res) => handle(req, res).catch(error => {
    if (res.headersSent) res.destroy(error);
    else send(res, 500, error.stack);
  }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  return {
    origin,
    createSite() {
      const id = String(++count);
      const site = new Site(`${origin}/sites/${id}/`, serveFile);
      sites.set(id, site);
      return site;
    },
    removeSite(site) {
      for (const [id, value] of sites) if (value === site) sites.delete(id);
      // Unblock anything still waiting so the connection can close.
      for (const gate of site.gates.values()) gate.release();
    },
    close() {
      server.closeAllConnections();
      return new Promise(resolve => server.close(resolve));
    },
  };
}
