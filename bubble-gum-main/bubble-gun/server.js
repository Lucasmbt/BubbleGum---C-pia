import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { config, ROOT } from './lib/config.js';
import { openDb } from './lib/db.js';
import { createMailer } from './lib/mailer.js';
import { createApi } from './lib/api.js';
import { seedIfNeeded } from './lib/seed.js';
import { HttpError } from './lib/util.js';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

async function readJson(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new HttpError(413, 'Mensagem grande demais.');
    chunks.push(chunk);
  }
  if (!size) return {};
  if (!(req.headers['content-type'] ?? '').includes('application/json')) throw new HttpError(415, 'Envie os dados como JSON.');
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('forma inesperada');
    return value;
  } catch {
    throw new HttpError(400, 'JSON inválido.');
  }
}

function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

function sendJson(res, status, data, extraHeaders = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...extraHeaders,
  });
  res.end(body);
}

function serveStatic(req, res, pathname, publicDir) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(publicDir, path.normalize(rel));
  const hidden = rel.split('/').some((part) => part.startsWith('.'));
  let stat;
  try {
    stat = file.startsWith(publicDir + path.sep) && !hidden ? fs.statSync(file) : null;
  } catch {
    stat = null;
  }
  if (!stat?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Não encontrado');
    return;
  }
  const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  const headers = {
    'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache',
    ETag: etag,
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers).end();
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': stat.size });
  if (req.method === 'HEAD') res.end();
  else fs.createReadStream(file).pipe(res);
}

export function createServer({ db, mailer, limiter, publicDir = path.join(ROOT, 'public') }) {
  const api = createApi({ db, mailer, limiter });

  async function handleApi(req, res, url) {
    const match = api.match(req.method, url.pathname);
    if (!match) throw new HttpError(404, 'Rota não encontrada.');
    if (match === 'method') throw new HttpError(405, 'Método não permitido.');

    // Proteção extra contra CSRF: pedidos que mudam dados precisam vir do mesmo site.
    if (req.method !== 'GET') {
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        let host = '';
        try {
          host = new URL(origin).host;
        } catch {
          /* origem inválida */
        }
        if (host !== req.headers.host) throw new HttpError(403, 'Origem não permitida.');
      } else if (origin === 'null') {
        throw new HttpError(403, 'Origem não permitida.');
      }
    }

    const ctx = {
      req,
      url,
      params: match.params,
      ip: clientIp(req),
      user: api.authenticate(req),
      body: req.method === 'GET' ? {} : await readJson(req),
      cookies: [],
      status: 200,
    };
    if (match.route.auth && !ctx.user) throw new HttpError(401, 'Entre na sua conta para continuar.');

    const data = await match.route.handler(ctx);
    sendJson(res, ctx.status, data ?? { ok: true }, ctx.cookies.length ? { 'Set-Cookie': ctx.cookies } : {});
  }

  return http.createServer(async (req, res) => {
    const started = Date.now();
    for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
    let pathname = '/';
    try {
      const url = new URL(req.url, 'http://localhost');
      pathname = url.pathname;
      if (pathname.startsWith('/api/')) await handleApi(req, res, url);
      else serveStatic(req, res, pathname, publicDir);
    } catch (err) {
      if (!res.headersSent) {
        if (err instanceof HttpError) {
          const headers = err.extra?.retryAfter ? { 'Retry-After': String(err.extra.retryAfter) } : {};
          sendJson(res, err.status, { error: err.message }, headers);
        } else {
          const id = crypto.randomBytes(4).toString('hex');
          console.error(`[erro ${id}] ${req.method} ${pathname}`, err);
          sendJson(res, 500, { error: `Algo deu errado do nosso lado (código ${id}). Tente de novo em instantes.` });
        }
      } else {
        res.destroy();
      }
    } finally {
      if (pathname.startsWith('/api/') && !pathname.endsWith('/health')) {
        console.log(`${req.method} ${pathname} ${res.statusCode} ${Date.now() - started}ms`);
      }
    }
  });
}

// ---------- execução direta: node server.js ----------

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  if (config.seed && seedIfNeeded(db)) console.log('Conteúdo de exemplo criado (eventos, avaliações e bolhas de demonstração).');

  const mailer = createMailer();
  const server = createServer({ db, mailer });
  server.listen(config.port, config.host, () => {
    console.log(`\n🫧 Bubble Gun no ar: ${config.baseUrl}`);
    console.log(
      mailer.mode === 'smtp'
        ? `   E-mails: SMTP em ${config.smtp.host}:${config.smtp.port}`
        : '   E-mails: modo desenvolvimento (SMTP não configurado). Os e-mails vão para a pasta ./outbox e o link aparece aqui no terminal.',
    );
  });

  const shutdown = () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
