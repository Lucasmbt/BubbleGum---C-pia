import { config } from './config.js';
import { tx } from './db.js';
import { AVATARS, AVATAR_COLORS, CATEGORIES, RESERVED_USERNAMES } from './catalog.js';
import { resetPasswordEmail } from './emails.js';
import { dummyVerify, hashPassword, newToken, RateLimiter, sha256, verifyPassword } from './security.js';
import {
  DAY, EMAIL_RE, HttpError, USERNAME_RE, bad, clean, fold, len, parseCookies, spMidnight, spWeekday,
} from './util.js';

export const COOKIE = 'bg_session';
const MIN = 60_000;
const HOUR = 60 * MIN;

export function createApi({ db, mailer, limiter = new RateLimiter() }) {
  const stmts = new Map();
  const sql = (text) => {
    let s = stmts.get(text);
    if (!s) stmts.set(text, (s = db.prepare(text)));
    return s;
  };
  const now = () => Date.now();

  const limit = (key, max, windowMs) => {
    const wait = limiter.take(key, max, windowMs);
    if (wait) throw new HttpError(429, 'Muitas tentativas. Espere um pouco e tente de novo.', { retryAfter: wait });
  };

  /**
   * Endereço público usado nos links dos e-mails.
   * Se BASE_URL foi definido, ele manda. Senão, em túneis do Cloudflare (endereço que muda a cada uso)
   * usamos o próprio endereço de acesso. Só aceitamos *.trycloudflare.com para ninguém conseguir
   * forjar o link do e-mail mandando um cabeçalho Host falso.
   */
  const TUNNEL_HOST = /^[a-z0-9-]+\.trycloudflare\.com$/i;
  const publicBase = (req) => {
    if (config.baseUrlFixed) return config.baseUrl;
    const host = String(req.headers.host ?? '').toLowerCase();
    return TUNNEL_HOST.test(host) ? `https://${host}` : config.baseUrl;
  };

  // ---------- helpers de sessão ----------

  const secureCookie = config.baseUrl.startsWith('https://');
  const cookie = (value, maxAgeSeconds) =>
    `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secureCookie ? '; Secure' : ''}`;

  function startSession(ctx, userId) {
    const token = newToken();
    const t = now();
    sql('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
      sha256(token), userId, t, t + config.sessionDays * DAY,
    );
    ctx.cookies.push(cookie(token, config.sessionDays * 24 * 3600));
  }

  function authenticate(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token || token.length > 100) return null;
    const row = sql(
      `SELECT u.*, s.token_hash AS session_hash
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`,
    ).get(sha256(token), now());
    return row ? { ...row } : null;
  }

  // Limpeza de sessões e links de senha vencidos.
  const sweep = () => {
    const t = now();
    sql('DELETE FROM sessions WHERE expires_at <= ?').run(t);
    sql('DELETE FROM password_resets WHERE expires_at <= ? OR used_at IS NOT NULL').run(t - DAY);
  };
  sweep();
  setInterval(sweep, HOUR).unref();

  // ---------- validações ----------

  const checkPassword = (pw) => {
    if (typeof pw !== 'string' || pw.length < 8) throw bad('A senha precisa ter pelo menos 8 caracteres.');
    if (pw.length > 128) throw bad('A senha pode ter no máximo 128 caracteres.');
  };
  const checkEmail = (email) => {
    if (!EMAIL_RE.test(email) || email.length > 254) throw bad('Digite um e-mail válido.');
  };

  const selfUser = (u) => ({
    id: u.id,
    username: u.username,
    email: u.email,
    display_name: u.display_name,
    bio: u.bio,
    avatar: u.avatar,
    avatar_color: u.avatar_color,
    created_at: u.created_at,
    stats: {
      reviews: sql('SELECT COUNT(*) AS n FROM reviews WHERE user_id = ?').get(u.id).n,
      posts: sql('SELECT COUNT(*) AS n FROM posts WHERE user_id = ?').get(u.id).n,
      saved: sql('SELECT COUNT(*) AS n FROM event_saves WHERE user_id = ?').get(u.id).n,
    },
  });

  const author = (row) => ({
    id: row.uid,
    username: row.username,
    display_name: row.display_name,
    avatar: row.avatar,
    avatar_color: row.avatar_color,
  });

  const intParam = (ctx, name = 'id') => {
    const n = Number(ctx.params[name]);
    if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Não encontrado.');
    return n;
  };

  // ---------- eventos ----------

  const EVENT_SELECT = `
    SELECT e.*,
           (SELECT ROUND(AVG(rating), 1) FROM reviews r WHERE r.event_id = e.id) AS avg_rating,
           (SELECT COUNT(*) FROM reviews r WHERE r.event_id = e.id) AS review_count,
           EXISTS (SELECT 1 FROM event_saves s WHERE s.event_id = e.id AND s.user_id = ?) AS saved
      FROM events e`;

  const eventCard = (e) => ({
    id: e.id,
    title: e.title,
    category: e.category,
    emoji: e.emoji,
    color: e.color,
    venue: e.venue,
    neighborhood: e.neighborhood,
    starts_at: e.starts_at,
    ends_at: e.ends_at,
    price_cents: e.price_cents,
    price_note: e.price_note,
    age_rating: e.age_rating,
    featured: !!e.featured,
    avg_rating: e.avg_rating ?? null,
    review_count: e.review_count,
    saved: !!e.saved,
    is_demo: !!e.is_demo,
  });

  /** Intervalo [de, até) para o filtro "quando". */
  function whenRange(when, t) {
    const today = spMidnight(t);
    switch (when) {
      case 'hoje':
        return [today, today + DAY];
      case 'semana':
        return [t, today + 7 * DAY];
      case 'fds': {
        const dow = spWeekday(t);
        if (dow === 0) return [today, today + DAY];
        if (dow === 6) return [today, today + 2 * DAY];
        const sat = today + (6 - dow) * DAY;
        return [sat, sat + 2 * DAY];
      }
      case 'mes':
        return [t, t + 30 * DAY];
      default:
        return null;
    }
  }

  function listEvents(ctx) {
    const t = now();
    const category = clean(ctx.url.searchParams.get('category') ?? '');
    const free = ctx.url.searchParams.get('free') === '1';
    const when = ctx.url.searchParams.get('when') ?? '';
    const terms = fold(clean(ctx.url.searchParams.get('q') ?? '')).split(' ').filter(Boolean).slice(0, 6);
    const range = whenRange(when, t);

    // Só eventos que ainda não acabaram.
    let rows = sql(`${EVENT_SELECT} WHERE e.ends_at >= ? ORDER BY e.starts_at ASC, e.id ASC`).all(ctx.user.id, t);

    if (category) rows = rows.filter((e) => e.category === category);
    if (free) rows = rows.filter((e) => e.price_cents === 0);
    if (range) rows = rows.filter((e) => e.starts_at < range[1] && e.ends_at >= range[0]);
    if (terms.length) {
      rows = rows.filter((e) => {
        const hay = fold(`${e.title} ${e.category} ${e.venue} ${e.neighborhood} ${e.address} ${e.tags} ${e.description}`);
        return terms.every((term) => hay.includes(term));
      });
    }
    return { events: rows.map(eventCard) };
  }

  function eventDetail(id, user) {
    const e = sql(`${EVENT_SELECT} WHERE e.id = ?`).get(user.id, id);
    if (!e) throw new HttpError(404, 'Evento não encontrado.');

    const reviews = sql(
      `SELECT r.id, r.rating, r.comment, r.updated_at, u.id AS uid, u.username, u.display_name, u.avatar, u.avatar_color
         FROM reviews r JOIN users u ON u.id = r.user_id
        WHERE r.event_id = ? ORDER BY r.updated_at DESC LIMIT 50`,
    ).all(id);

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const row of sql('SELECT rating, COUNT(*) AS n FROM reviews WHERE event_id = ? GROUP BY rating').all(id)) {
      breakdown[row.rating] = row.n;
    }

    return {
      event: {
        ...eventCard(e),
        description: e.description,
        address: e.address,
        tags: e.tags.split(',').map((s) => s.trim()).filter(Boolean),
        links: sql('SELECT label, url FROM event_links WHERE event_id = ? ORDER BY id').all(id).map((l) => ({ ...l })),
        breakdown,
        reviews: reviews.map((r) => ({
          id: r.id,
          rating: r.rating,
          comment: r.comment,
          created_at: r.updated_at,
          mine: r.uid === user.id,
          author: author(r),
        })),
      },
    };
  }

  // ---------- comunidade ----------

  const POST_SELECT = `
    SELECT p.id, p.body, p.created_at, p.parent_id,
           u.id AS uid, u.username, u.display_name, u.avatar, u.avatar_color,
           (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.id) AS likes,
           (SELECT COUNT(*) FROM posts c WHERE c.parent_id = p.id) AS replies,
           EXISTS (SELECT 1 FROM post_likes l WHERE l.post_id = p.id AND l.user_id = ?) AS liked
      FROM posts p JOIN users u ON u.id = p.user_id`;

  const postShape = (p, userId) => ({
    id: p.id,
    body: p.body,
    created_at: p.created_at,
    parent_id: p.parent_id,
    likes: p.likes,
    replies: p.replies,
    liked: !!p.liked,
    mine: p.uid === userId,
    author: author(p),
  });

  // ---------- rotas ----------

  const routes = [];
  const add = (method, pattern, opts, handler) => {
    const keys = [];
    const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)'))}$`);
    routes.push({ method, re, keys, handler, auth: opts.auth !== false });
  };
  const PUBLIC = { auth: false };

  add('GET', '/api/health', PUBLIC, () => ({ ok: true }));

  // --- conta: cadastro, login, senha ---

  add('POST', '/api/register', PUBLIC, async (ctx) => {
    limit(`register:${ctx.ip}`, 10, HOUR);
    const username = clean(ctx.body.username).toLowerCase();
    const email = clean(ctx.body.email).toLowerCase();
    const password = ctx.body.password;
    const displayName = clean(ctx.body.display_name) || username;

    if (!USERNAME_RE.test(username)) throw bad('Usuário: de 3 a 20 caracteres, só letras, números, _ ou ponto.');
    if (RESERVED_USERNAMES.includes(username)) throw bad('Esse nome de usuário não está disponível.');
    checkEmail(email);
    checkPassword(password);
    if (len(displayName) > 40) throw bad('O nome pode ter no máximo 40 caracteres.');

    if (sql('SELECT 1 FROM users WHERE username = ?').get(username)) throw new HttpError(409, 'Esse nome de usuário já está em uso.');
    if (sql('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Já existe uma conta com esse e-mail.');

    const hash = await hashPassword(password);
    const avatar = AVATARS[Math.floor(Math.random() * AVATARS.length)];
    const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    let id;
    try {
      id = Number(
        sql(
          `INSERT INTO users (username, email, password_hash, display_name, avatar, avatar_color, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(username, email, hash, displayName, avatar, color, now()).lastInsertRowid,
      );
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Esse usuário ou e-mail já está em uso.');
      throw err;
    }
    startSession(ctx, id);
    ctx.status = 201;
    return { user: selfUser(sql('SELECT * FROM users WHERE id = ?').get(id)) };
  });

  add('POST', '/api/login', PUBLIC, async (ctx) => {
    const identifier = clean(ctx.body.identifier ?? ctx.body.email ?? ctx.body.username).toLowerCase();
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!identifier || !password || password.length > 128 || identifier.length > 254) {
      throw bad('Digite seu usuário (ou e-mail) e a senha.');
    }
    limit(`login-ip:${ctx.ip}`, 40, 15 * MIN);
    const key = `login:${ctx.ip}:${identifier}`;
    limit(key, 8, 15 * MIN);

    const user = identifier.includes('@')
      ? sql('SELECT * FROM users WHERE email = ?').get(identifier)
      : sql('SELECT * FROM users WHERE username = ?').get(identifier);
    let ok = false;
    if (user) ok = await verifyPassword(password, user.password_hash);
    else await dummyVerify(password);
    if (!ok) throw new HttpError(401, 'Usuário ou senha incorretos.');

    limiter.clear(key);
    startSession(ctx, user.id);
    return { user: selfUser(user) };
  });

  add('POST', '/api/logout', PUBLIC, (ctx) => {
    const token = parseCookies(ctx.req.headers.cookie)[COOKIE];
    if (token) sql('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    ctx.cookies.push(cookie('', 0));
    return { ok: true };
  });

  add('POST', '/api/forgot', PUBLIC, async (ctx) => {
    limit(`forgot-ip:${ctx.ip}`, 5, HOUR);
    const email = clean(ctx.body.email).toLowerCase();
    checkEmail(email);
    const reply = { ok: true, message: 'Se esse e-mail estiver cadastrado, enviamos um link para criar uma nova senha.' };

    // Mesma resposta exista a conta ou não, para não revelar quem tem cadastro.
    if (limiter.take(`forgot-email:${email}`, 3, HOUR)) return reply;
    const user = sql('SELECT * FROM users WHERE email = ? AND is_demo = 0').get(email);
    if (!user) return reply;

    const token = newToken();
    const t = now();
    tx(db, () => {
      sql('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(user.id);
      sql('INSERT INTO password_resets (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
        sha256(token), user.id, t, t + config.resetMinutes * MIN,
      );
    });

    // O link usa "#" para o token nunca ir para logs de servidor nem para o cabeçalho Referer.
    const link = `${publicBase(ctx.req)}/#/redefinir?token=${token}`;
    const mail = resetPasswordEmail({ name: user.display_name, link, minutes: config.resetMinutes });
    // Sem `await`: o tempo de resposta não deve denunciar se o e-mail existe.
    mailer.send({ to: user.email, ...mail }).catch((err) => console.error('Falha ao enviar e-mail de senha:', err.message));
    return reply;
  });

  add('POST', '/api/reset', PUBLIC, async (ctx) => {
    limit(`reset-ip:${ctx.ip}`, 10, HOUR);
    const token = typeof ctx.body.token === 'string' ? ctx.body.token : '';
    checkPassword(ctx.body.password);
    const invalid = new HttpError(400, 'Esse link é inválido ou expirou. Peça um novo.');
    if (!token || token.length > 100) throw invalid;

    const tokenHash = sha256(token);
    const row = sql('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash);
    if (!row || row.used_at || row.expires_at <= now()) throw invalid;

    const hash = await hashPassword(ctx.body.password);
    tx(db, () => {
      // "Reivindica" o token de forma atômica: só uma requisição consegue usá-lo.
      const claimed = sql('UPDATE password_resets SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').run(
        now(), tokenHash, now(),
      );
      if (claimed.changes !== 1) throw invalid;
      sql('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, row.user_id);
      sql('DELETE FROM sessions WHERE user_id = ?').run(row.user_id); // desloga todos os aparelhos
      sql('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(row.user_id);
    });
    return { ok: true };
  });

  // --- perfil ---

  add('GET', '/api/me', {}, (ctx) => ({ user: selfUser(ctx.user) }));

  add('PATCH', '/api/me', {}, (ctx) => {
    const sets = [];
    const values = [];
    const b = ctx.body;
    if ('display_name' in b) {
      const v = clean(b.display_name);
      if (!v || len(v) > 40) throw bad('O nome deve ter de 1 a 40 caracteres.');
      sets.push('display_name = ?'), values.push(v);
    }
    if ('bio' in b) {
      const v = clean(b.bio);
      if (len(v) > 160) throw bad('A bio pode ter no máximo 160 caracteres.');
      sets.push('bio = ?'), values.push(v);
    }
    if ('avatar' in b) {
      if (!AVATARS.includes(b.avatar)) throw bad('Escolha um avatar da lista.');
      sets.push('avatar = ?'), values.push(b.avatar);
    }
    if ('avatar_color' in b) {
      if (!AVATAR_COLORS.includes(b.avatar_color)) throw bad('Escolha uma cor da lista.');
      sets.push('avatar_color = ?'), values.push(b.avatar_color);
    }
    if (sets.length) db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values, ctx.user.id);
    return { user: selfUser(sql('SELECT * FROM users WHERE id = ?').get(ctx.user.id)) };
  });

  add('POST', '/api/me/password', {}, async (ctx) => {
    limit(`pw-change:${ctx.user.id}`, 8, 15 * MIN);
    const current = typeof ctx.body.current === 'string' ? ctx.body.current : '';
    checkPassword(ctx.body.next);
    if (!(await verifyPassword(current, ctx.user.password_hash))) throw new HttpError(401, 'A senha atual está incorreta.');
    const hash = await hashPassword(ctx.body.next);
    tx(db, () => {
      sql('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, ctx.user.id);
      // Sai de todos os outros aparelhos; este continua logado.
      sql('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(ctx.user.id, ctx.user.session_hash);
    });
    return { ok: true };
  });

  add('POST', '/api/me/delete', {}, async (ctx) => {
    limit(`delete-account:${ctx.user.id}`, 5, 15 * MIN);
    const password = typeof ctx.body.password === 'string' ? ctx.body.password : '';
    if (!(await verifyPassword(password, ctx.user.password_hash))) throw new HttpError(401, 'Senha incorreta.');
    sql('DELETE FROM users WHERE id = ?').run(ctx.user.id); // apaga em cascata sessões, avaliações, posts...
    ctx.cookies.push(cookie('', 0));
    return { ok: true };
  });

  add('GET', '/api/me/saved', {}, (ctx) => {
    const rows = sql(
      `${EVENT_SELECT} WHERE e.id IN (SELECT event_id FROM event_saves WHERE user_id = ?) ORDER BY e.starts_at ASC`,
    ).all(ctx.user.id, ctx.user.id);
    return { events: rows.map(eventCard) };
  });

  // --- eventos ---

  add('GET', '/api/categories', {}, () => ({ categories: CATEGORIES }));
  add('GET', '/api/events', {}, listEvents);
  add('GET', '/api/events/:id', {}, (ctx) => eventDetail(intParam(ctx), ctx.user));

  add('POST', '/api/events/:id/save', {}, (ctx) => {
    const id = intParam(ctx);
    if (!sql('SELECT 1 FROM events WHERE id = ?').get(id)) throw new HttpError(404, 'Evento não encontrado.');
    const removed = sql('DELETE FROM event_saves WHERE user_id = ? AND event_id = ?').run(ctx.user.id, id);
    if (removed.changes) return { saved: false };
    sql('INSERT INTO event_saves (user_id, event_id, created_at) VALUES (?, ?, ?)').run(ctx.user.id, id, now());
    return { saved: true };
  });

  add('POST', '/api/events/:id/reviews', {}, (ctx) => {
    const id = intParam(ctx);
    if (!sql('SELECT 1 FROM events WHERE id = ?').get(id)) throw new HttpError(404, 'Evento não encontrado.');
    limit(`review:${ctx.user.id}`, 30, HOUR);
    const rating = Number(ctx.body.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw bad('Escolha uma nota de 1 a 5.');
    const comment = clean(ctx.body.comment, { multiline: true });
    if (len(comment) > 500) throw bad('O comentário pode ter no máximo 500 caracteres.');
    const t = now();
    sql(
      `INSERT INTO reviews (event_id, user_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (event_id, user_id) DO UPDATE SET rating = excluded.rating, comment = excluded.comment, updated_at = excluded.updated_at`,
    ).run(id, ctx.user.id, rating, comment, t, t);
    return eventDetail(id, ctx.user);
  });

  add('DELETE', '/api/events/:id/reviews/mine', {}, (ctx) => {
    const id = intParam(ctx);
    sql('DELETE FROM reviews WHERE event_id = ? AND user_id = ?').run(id, ctx.user.id);
    return eventDetail(id, ctx.user);
  });

  // --- comunidade ---

  add('GET', '/api/posts', {}, (ctx) => {
    const before = Number(ctx.url.searchParams.get('before')) || null;
    const pageSize = 20;
    const rows = sql(
      `${POST_SELECT} WHERE p.parent_id IS NULL AND (? IS NULL OR p.id < ?) ORDER BY p.id DESC LIMIT ?`,
    ).all(ctx.user.id, before, before, pageSize + 1);
    const page = rows.slice(0, pageSize);
    return {
      posts: page.map((p) => postShape(p, ctx.user.id)),
      next_before: rows.length > pageSize ? page.at(-1).id : null,
    };
  });

  add('GET', '/api/posts/:id', {}, (ctx) => {
    let post = sql(`${POST_SELECT} WHERE p.id = ?`).get(ctx.user.id, intParam(ctx));
    if (!post) throw new HttpError(404, 'Essa bolha não existe mais.');
    if (post.parent_id) post = sql(`${POST_SELECT} WHERE p.id = ?`).get(ctx.user.id, post.parent_id); // respostas abrem a conversa inteira
    const replies = sql(`${POST_SELECT} WHERE p.parent_id = ? ORDER BY p.id ASC LIMIT 200`).all(ctx.user.id, post.id);
    return { post: postShape(post, ctx.user.id), replies: replies.map((r) => postShape(r, ctx.user.id)) };
  });

  add('POST', '/api/posts', {}, (ctx) => {
    limit(`post:${ctx.user.id}`, 20, 10 * MIN);
    const body = clean(ctx.body.body, { multiline: true });
    if (!body) throw bad('Escreva alguma coisa antes de soprar a bolha.');
    if (len(body) > 280) throw bad('Cada bolha pode ter no máximo 280 caracteres.');

    let parentId = null;
    if (ctx.body.parent_id != null) {
      const parent = sql('SELECT id, parent_id FROM posts WHERE id = ?').get(Number(ctx.body.parent_id));
      if (!parent) throw new HttpError(404, 'Essa bolha não existe mais.');
      parentId = parent.parent_id ?? parent.id; // uma resposta a uma resposta fica na mesma conversa
    }
    const id = Number(
      sql('INSERT INTO posts (user_id, parent_id, body, created_at) VALUES (?, ?, ?, ?)').run(ctx.user.id, parentId, body, now())
        .lastInsertRowid,
    );
    ctx.status = 201;
    return { post: postShape(sql(`${POST_SELECT} WHERE p.id = ?`).get(ctx.user.id, id), ctx.user.id) };
  });

  add('POST', '/api/posts/:id/like', {}, (ctx) => {
    const id = intParam(ctx);
    if (!sql('SELECT 1 FROM posts WHERE id = ?').get(id)) throw new HttpError(404, 'Essa bolha não existe mais.');
    const removed = sql('DELETE FROM post_likes WHERE user_id = ? AND post_id = ?').run(ctx.user.id, id);
    if (!removed.changes) sql('INSERT INTO post_likes (user_id, post_id, created_at) VALUES (?, ?, ?)').run(ctx.user.id, id, now());
    return { liked: !removed.changes, likes: sql('SELECT COUNT(*) AS n FROM post_likes WHERE post_id = ?').get(id).n };
  });

  add('DELETE', '/api/posts/:id', {}, (ctx) => {
    const id = intParam(ctx);
    const post = sql('SELECT user_id FROM posts WHERE id = ?').get(id);
    if (!post) throw new HttpError(404, 'Essa bolha não existe mais.');
    if (post.user_id !== ctx.user.id) throw new HttpError(403, 'Você só pode apagar as suas próprias bolhas.');
    sql('DELETE FROM posts WHERE id = ?').run(id); // respostas e curtidas saem em cascata
    return { ok: true };
  });

  return {
    authenticate,
    /** Retorna { route, params }, 'method' (caminho existe, método não) ou null. */
    match(method, pathname) {
      let pathMatched = false;
      for (const route of routes) {
        const m = route.re.exec(pathname);
        if (!m) continue;
        pathMatched = true;
        if (route.method !== method) continue;
        const params = {};
        route.keys.forEach((k, i) => {
          try {
            params[k] = decodeURIComponent(m[i + 1]);
          } catch {
            params[k] = '';
          }
        });
        return { route, params };
      }
      return pathMatched ? 'method' : null;
    },
  };
}
