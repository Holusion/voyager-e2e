import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, join, relative, isAbsolute } from 'node:path';

const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.map': 'application/json', '.wasm': 'application/wasm', '.txt': 'text/plain',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.hdr': 'application/octet-stream',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.glb': 'model/gltf-binary',
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
  constructor(base) { this.base = base; }

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

  async serve(path, res) {
    await this.gates.get(path)?.pass();
    if (res.destroyed) return;
    const file = this.files.get(path);
    if (!file) return send(res, 404, `Not found: ${path}`);
    send(res, 200, file.body, file.type);
  }
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
    if (site && sites.has(site[1])) return sites.get(site[1]).serve(site[2], res);
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
      const site = new Site(`${origin}/sites/${id}/`);
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
