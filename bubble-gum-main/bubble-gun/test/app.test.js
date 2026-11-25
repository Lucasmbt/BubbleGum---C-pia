import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../lib/db.js';
import { seedIfNeeded } from '../lib/seed.js';
import { createServer } from '../server.js';

// ---------- infraestrutura de teste ----------

async function startApp({ strict = false } = {}) {
  const db = openDb(':memory:');
  seedIfNeeded(db);
  const sent = [];
  const mailer = { mode: 'test', send: async (msg) => void sent.push(msg) };
  // Nos testes comuns todo mundo vem do mesmo IP; só o teste de força bruta usa o limitador real.
  const limiter = strict ? undefined : { take: () => 0, clear() {} };
  const server = createServer({ db, mailer, limiter });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { db, sent, base, close: () => new Promise((r) => server.close(r)) };
}

/** Cliente HTTP com "jar" de cookies, como um navegador. */
class Client {
  constructor(base) {
    this.base = base;
    this.cookie = '';
  }

  async req(method, path, body, headers = {}) {
    const res = await fetch(this.base + path, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}), ...headers },
      body: body ? JSON.stringify(body) : undefined,
    });
    for (const c of res.headers.getSetCookie()) {
      const [pair] = c.split(';');
      if (/;\s*Max-Age=0/i.test(c) || pair.endsWith('=')) this.cookie = '';
      else this.cookie = pair;
    }
    let data = null;
    try { data = await res.json(); } catch { /* sem corpo JSON */ }
    return { status: res.status, data, headers: res.headers };
  }

  get = (p) => this.req('GET', p);
  post = (p, b) => this.req('POST', p, b);
}

let app;
let n = 0;
const uniq = () => `u${++n}${Date.now().toString(36).slice(-4)}`;

async function newUser(extra = {}) {
  const c = new Client(app.base);
  const username = extra.username ?? uniq();
  const body = { username, email: `${username}@example.com`, password: 'senha-forte-123', display_name: 'Pessoa Teste', ...extra };
  const r = await c.post('/api/register', body);
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { c, username, email: body.email, password: body.password };
}

before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

// ---------- site e segurança ----------

test('serve o app e manda cabeçalhos de segurança', async () => {
  const res = await fetch(`${app.base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.match(res.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const html = await res.text();
  assert.match(html, /Bubble Gun/);
  for (const f of ['/app.js', '/app.css', '/favicon.svg']) assert.equal((await fetch(app.base + f)).status, 200, f);
});

test('não vaza arquivos fora de public/', async () => {
  for (const p of ['/../package.json', '/%2e%2e/package.json', '/..%2fserver.js', '/.env', '/data/bubblegun.db']) {
    const r = await fetch(app.base + p);
    assert.equal(r.status, 404, p);
  }
});

test('rotas protegidas exigem login', async () => {
  const c = new Client(app.base);
  for (const p of ['/api/me', '/api/events', '/api/posts', '/api/categories', '/api/me/saved']) {
    assert.equal((await c.get(p)).status, 401, p);
  }
});

test('bloqueia POST vindo de outro site (CSRF) e conteúdo que não é JSON', async () => {
  const { c } = await newUser();
  const evil = await c.req('POST', '/api/posts', { body: 'oi' }, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  const opaque = await c.req('POST', '/api/posts', { body: 'oi' }, { origin: 'null' });
  assert.equal(opaque.status, 403);
  const same = await c.req('POST', '/api/posts', { body: 'oi' }, { origin: app.base });
  assert.equal(same.status, 201);
  const res = await fetch(`${app.base}/api/posts`, { method: 'POST', headers: { cookie: c.cookie, 'content-type': 'text/plain' }, body: 'x' });
  assert.equal(res.status, 415);
});

// ---------- cadastro e login ----------

test('cadastro valida os campos', async () => {
  const c = new Client(app.base);
  const ok = { username: uniq(), email: `${uniq()}@example.com`, password: 'senha-forte-123' };
  const cases = [
    [{ ...ok, username: 'ab' }, /Usuário/],
    [{ ...ok, username: 'tem espaço' }, /Usuário/],
    [{ ...ok, username: 'admin' }, /disponível/],
    [{ ...ok, email: 'sem-arroba' }, /e-mail/],
    [{ ...ok, password: 'curta' }, /8 caracteres/],
    [{ ...ok, password: 'x'.repeat(129) }, /128/],
  ];
  for (const [body, re] of cases) {
    const r = await c.post('/api/register', body);
    assert.equal(r.status, 400, JSON.stringify(body));
    assert.match(r.data.error, re);
  }
});

test('cadastro cria a conta, abre sessão e nunca devolve a senha', async () => {
  const { c, username, email, password } = await newUser();
  assert.match(c.cookie, /^bg_session=/);
  const me = await c.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.username, username);
  assert.equal(me.data.user.email, email);
  const dump = JSON.stringify(me.data);
  assert.ok(!dump.includes(password) && !/password|hash/i.test(dump));
  // no banco: só um hash com sal
  const row = app.db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username);
  assert.match(row.password_hash, /^scrypt\$/);
  assert.ok(!row.password_hash.includes(password));
});

test('cookie de sessão é HttpOnly e SameSite', async () => {
  const c = new Client(app.base);
  const u = uniq();
  const res = await fetch(`${app.base}/api/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: u, email: `${u}@example.com`, password: 'senha-forte-123' }),
  });
  const cookie = res.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  void c;
});

test('usuário e e-mail duplicados são recusados (sem diferenciar maiúsculas)', async () => {
  const { username, email } = await newUser();
  const c = new Client(app.base);
  const a = await c.post('/api/register', { username: username.toUpperCase(), email: `${uniq()}@example.com`, password: 'senha-forte-123' });
  assert.equal(a.status, 409);
  const b = await c.post('/api/register', { username: uniq(), email: email.toUpperCase(), password: 'senha-forte-123' });
  assert.equal(b.status, 409);
});

test('login por usuário e por e-mail; erro genérico quando errado', async () => {
  const { username, email, password } = await newUser();
  const byUser = new Client(app.base);
  assert.equal((await byUser.post('/api/login', { identifier: username.toUpperCase(), password })).status, 200);
  assert.equal((await byUser.get('/api/me')).status, 200);
  const byMail = new Client(app.base);
  assert.equal((await byMail.post('/api/login', { identifier: email, password })).status, 200);

  const c = new Client(app.base);
  const wrongPw = await c.post('/api/login', { identifier: username, password: 'errada-errada' });
  const noUser = await c.post('/api/login', { identifier: 'ninguem_aqui', password: 'errada-errada' });
  assert.equal(wrongPw.status, 401);
  assert.equal(noUser.status, 401);
  assert.equal(wrongPw.data.error, noUser.data.error); // não revela se o usuário existe
});

test('contas de exemplo não aceitam login', async () => {
  const r = await new Client(app.base).post('/api/login', { identifier: 'luna_sp', password: '!' });
  assert.equal(r.status, 401);
});

test('logout encerra a sessão', async () => {
  const { c } = await newUser();
  const old = c.cookie;
  assert.equal((await c.post('/api/logout')).status, 200);
  const again = new Client(app.base);
  again.cookie = old;
  assert.equal((await again.get('/api/me')).status, 401);
});

// ---------- recuperação de senha ----------

test('esqueci a senha: e-mail com link, troca de senha e invalidação do link', async () => {
  const { c, username, email, password } = await newUser();
  const other = new Client(app.base);
  await other.post('/api/login', { identifier: username, password }); // segunda sessão em outro aparelho

  app.sent.length = 0;
  const r = await new Client(app.base).post('/api/forgot', { email: email.toUpperCase() });
  assert.equal(r.status, 200);
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(app.sent.length, 1);
  const mail = app.sent[0];
  assert.equal(mail.to, email);
  assert.match(mail.subject, /senha/i);
  const token = /#\/redefinir\?token=([\w-]+)/.exec(mail.text)?.[1];
  assert.ok(token && token.length >= 40, 'link com token no e-mail');
  assert.match(mail.html, /redefinir\?token=/);

  const anon = new Client(app.base);
  assert.equal((await anon.post('/api/reset', { token: 'token-invalido', password: 'nova-senha-123' })).status, 400);
  assert.equal((await anon.post('/api/reset', { token, password: 'curta' })).status, 400);
  assert.equal((await anon.post('/api/reset', { token, password: 'nova-senha-123' })).status, 200);

  // link só vale uma vez
  assert.equal((await anon.post('/api/reset', { token, password: 'outra-senha-123' })).status, 400);
  // senha antiga morreu, nova funciona
  assert.equal((await anon.post('/api/login', { identifier: username, password })).status, 401);
  assert.equal((await anon.post('/api/login', { identifier: username, password: 'nova-senha-123' })).status, 200);
  // sessões antigas foram derrubadas
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await other.get('/api/me')).status, 401);
});

test('esqueci a senha: resposta é igual para e-mail inexistente e nada é enviado', async () => {
  const { email } = await newUser();
  app.sent.length = 0;
  const real = await new Client(app.base).post('/api/forgot', { email });
  const fake = await new Client(app.base).post('/api/forgot', { email: 'ninguem@example.com' });
  await new Promise((res) => setTimeout(res, 20));
  assert.equal(real.status, 200);
  assert.deepEqual(real.data, fake.data);
  assert.equal(app.sent.length, 1);
  assert.equal((await new Client(app.base).post('/api/forgot', { email: 'invalido' })).status, 400);
});

test('link de senha expirado não funciona; pedir outro cancela o anterior', async () => {
  const { email } = await newUser();
  app.sent.length = 0;
  const grab = () => /token=([\w-]+)/.exec(app.sent.at(-1).text)[1];
  const c = new Client(app.base);

  await c.post('/api/forgot', { email });
  await new Promise((res) => setTimeout(res, 20));
  const first = grab();
  await c.post('/api/forgot', { email });
  await new Promise((res) => setTimeout(res, 20));
  const second = grab();
  assert.notEqual(first, second);
  assert.equal((await c.post('/api/reset', { token: first, password: 'nova-senha-123' })).status, 400);

  app.db.exec('UPDATE password_resets SET expires_at = 1');
  assert.equal((await c.post('/api/reset', { token: second, password: 'nova-senha-123' })).status, 400);
});

// ---------- eventos ----------

test('lista eventos, categorias e só mostra o que ainda não acabou', async () => {
  const { c } = await newUser();
  const { data } = await c.get('/api/events');
  assert.ok(data.events.length >= 10);
  const now = Date.now();
  const detail = await c.get(`/api/events/${data.events[0].id}`);
  assert.ok(detail.data.event.address);
  for (const e of data.events) assert.ok(e.ends_at >= now);
  const cats = (await c.get('/api/categories')).data.categories;
  assert.ok(cats.some((x) => x.name === 'Música'));
  // ordenados pela data de início
  const starts = data.events.map((e) => e.starts_at);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
});

test('filtros: categoria, gratuitos e período', async () => {
  const { c } = await newUser();
  const music = (await c.get(`/api/events?category=${encodeURIComponent('Música')}`)).data.events;
  assert.ok(music.length >= 2 && music.every((e) => e.category === 'Música'));
  const free = (await c.get('/api/events?free=1')).data.events;
  assert.ok(free.length >= 5 && free.every((e) => e.price_cents === 0));
  const month = (await c.get('/api/events?when=mes')).data.events;
  const all = (await c.get('/api/events')).data.events;
  assert.ok(month.length > 0 && month.length <= all.length);
  for (const when of ['hoje', 'semana', 'fds']) assert.equal((await c.get(`/api/events?when=${when}`)).status, 200);
});

test('busca ignora acentos e maiúsculas e combina vários termos', async () => {
  const { c } = await newUser();
  const titles = async (q) => (await c.get(`/api/events?q=${encodeURIComponent(q)}`)).data.events.map((e) => e.title);
  assert.ok((await titles('musica')).includes('Noite de Jazz no Parque'));
  assert.ok((await titles('MÚSICA')).includes('Noite de Jazz no Parque'));
  assert.ok((await titles('vila madalena')).includes('Sarau da Vila'));
  assert.ok((await titles('ceramica sesc')).includes('Oficina de Cerâmica para Iniciantes'));
  assert.deepEqual(await titles('xyzinexistente'), []);
  assert.deepEqual(await titles('jazz sarau'), []); // todos os termos precisam bater
  // caracteres especiais do LIKE não quebram nada
  assert.equal((await c.get(`/api/events?q=${encodeURIComponent("100%_'\";--")}`)).status, 200);
});

test('detalhe do evento traz sites, endereço e avaliações', async () => {
  const { c } = await newUser();
  const list = (await c.get('/api/events')).data.events;
  const masp = list.find((e) => e.title.startsWith('Cores da Cidade'));
  const { data } = await c.get(`/api/events/${masp.id}`);
  assert.equal(data.event.address, 'Av. Paulista, 1578');
  assert.equal(data.event.links[0].url, 'https://masp.org.br/');
  assert.equal(data.event.review_count, 3);
  assert.equal(data.event.reviews.length, 3);
  assert.equal(data.event.breakdown[5] + data.event.breakdown[4], 3);
  assert.equal((await c.get('/api/events/999999')).status, 404);
  assert.equal((await c.get('/api/events/abc')).status, 404);
});

test('avaliar: valida nota, atualiza a média, sobrescreve e apaga', async () => {
  const { c } = await newUser();
  const list = (await c.get('/api/events')).data.events;
  const ev = list.find((e) => e.review_count === 0);
  const url = `/api/events/${ev.id}/reviews`;

  for (const rating of [0, 6, 2.5, 'x', null]) assert.equal((await c.post(url, { rating })).status, 400, String(rating));
  assert.equal((await c.post(url, { rating: 5, comment: 'x'.repeat(501) })).status, 400);

  const first = await c.post(url, { rating: 5, comment: '  Muito bom!  ' });
  assert.equal(first.status, 200);
  assert.equal(first.data.event.avg_rating, 5);
  assert.equal(first.data.event.reviews[0].comment, 'Muito bom!');
  assert.equal(first.data.event.reviews[0].mine, true);

  const { c: c2 } = await newUser();
  const second = await c2.post(url, { rating: 2 });
  assert.equal(second.data.event.review_count, 2);
  assert.equal(second.data.event.avg_rating, 3.5);

  const edited = await c.post(url, { rating: 1, comment: 'Mudei de ideia' }); // mesma pessoa: atualiza, não duplica
  assert.equal(edited.data.event.review_count, 2);
  assert.equal(edited.data.event.avg_rating, 1.5);

  const removed = await c.req('DELETE', `${url}/mine`);
  assert.equal(removed.data.event.review_count, 1);
  assert.equal(removed.data.event.avg_rating, 2);
});

test('avaliação com HTML é guardada como texto (o front escapa)', async () => {
  const { c } = await newUser();
  const ev = (await c.get('/api/events')).data.events[0];
  const r = await c.post(`/api/events/${ev.id}/reviews`, { rating: 4, comment: '<img src=x onerror=alert(1)>' });
  assert.equal(r.data.event.reviews.find((x) => x.mine).comment, '<img src=x onerror=alert(1)>');
});

test('salvar evento (quero ir) alterna e aparece no perfil', async () => {
  const { c } = await newUser();
  const ev = (await c.get('/api/events')).data.events[3];
  assert.deepEqual((await c.post(`/api/events/${ev.id}/save`)).data, { saved: true });
  assert.equal((await c.get('/api/me/saved')).data.events.length, 1);
  assert.equal((await c.get('/api/events')).data.events.find((e) => e.id === ev.id).saved, true);
  assert.equal((await c.get('/api/me')).data.user.stats.saved, 1);
  assert.deepEqual((await c.post(`/api/events/${ev.id}/save`)).data, { saved: false });
  assert.equal((await c.get('/api/me/saved')).data.events.length, 0);
  assert.equal((await c.post('/api/events/999999/save')).status, 404);
});

// ---------- comunidade ----------

test('comunidade: postar, validar, responder, curtir e apagar', async () => {
  const { c: ana } = await newUser({ display_name: 'Ana' });
  const { c: leo } = await newUser({ display_name: 'Leo' });

  assert.equal((await ana.post('/api/posts', { body: '   ' })).status, 400);
  assert.equal((await ana.post('/api/posts', { body: 'a'.repeat(281) })).status, 400);
  assert.equal((await ana.post('/api/posts', { body: 'a'.repeat(280) })).status, 201);
  assert.equal((await ana.post('/api/posts', { body: '🫧'.repeat(280) })).status, 201); // emoji conta como 1 caractere

  const created = await ana.post('/api/posts', { body: 'Alguém vai no sarau?' });
  assert.equal(created.status, 201);
  const post = created.data.post;
  assert.equal(post.mine, true);
  assert.equal(post.author.display_name, 'Ana');

  // aparece no feed de outra pessoa, no topo
  const feed = (await leo.get('/api/posts')).data;
  assert.equal(feed.posts[0].id, post.id);
  assert.equal(feed.posts[0].mine, false);
  assert.ok(feed.posts.every((p) => p.parent_id === null)); // respostas não entram no feed

  // curtir alterna
  assert.deepEqual((await leo.post(`/api/posts/${post.id}/like`)).data, { liked: true, likes: 1 });
  assert.deepEqual((await leo.post(`/api/posts/${post.id}/like`)).data, { liked: false, likes: 0 });
  await leo.post(`/api/posts/${post.id}/like`);

  // responder (e responder a uma resposta cai na mesma conversa)
  const reply = await leo.post('/api/posts', { body: 'Eu vou!', parent_id: post.id });
  assert.equal(reply.status, 201);
  const nested = await ana.post('/api/posts', { body: 'Boa!', parent_id: reply.data.post.id });
  assert.equal(nested.data.post.parent_id, post.id);
  assert.equal((await leo.post('/api/posts', { body: 'x', parent_id: 999999 })).status, 404);

  const thread = (await leo.get(`/api/posts/${post.id}`)).data;
  assert.equal(thread.post.replies, 2);
  assert.equal(thread.post.likes, 1);
  assert.equal(thread.post.liked, true);
  assert.deepEqual(thread.replies.map((r) => r.body), ['Eu vou!', 'Boa!']);
  // abrir uma resposta mostra a conversa inteira
  assert.equal((await leo.get(`/api/posts/${reply.data.post.id}`)).data.post.id, post.id);

  // só o autor apaga
  assert.equal((await leo.req('DELETE', `/api/posts/${post.id}`)).status, 403);
  assert.equal((await ana.req('DELETE', `/api/posts/${post.id}`)).status, 200);
  assert.equal((await leo.get(`/api/posts/${post.id}`)).status, 404);
  assert.equal((await leo.get(`/api/posts/${reply.data.post.id}`)).status, 404); // respostas saem junto
});

test('feed pagina com next_before', async () => {
  const { c } = await newUser();
  for (let i = 0; i < 22; i++) await c.post('/api/posts', { body: `bolha ${i}` });
  const page1 = (await c.get('/api/posts')).data;
  assert.equal(page1.posts.length, 20);
  assert.ok(page1.next_before);
  const page2 = (await c.get(`/api/posts?before=${page1.next_before}`)).data;
  assert.ok(page2.posts.length > 0);
  assert.ok(page2.posts[0].id < page1.posts.at(-1).id);
  const seen = new Set([...page1.posts, ...page2.posts].map((p) => p.id));
  assert.equal(seen.size, page1.posts.length + page2.posts.length); // sem repetidas
});

// ---------- perfil ----------

test('perfil: editar dados, validar avatar, trocar senha e derrubar outros aparelhos', async () => {
  const { c, username, password } = await newUser();
  const phone = new Client(app.base);
  await phone.post('/api/login', { identifier: username, password });

  const edit = await c.req('PATCH', '/api/me', { display_name: '  Nova   Pessoa ', bio: 'Amo teatro', avatar: '🦄', avatar_color: 'mint' });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.user.display_name, 'Nova Pessoa');
  assert.equal(edit.data.user.avatar, '🦄');
  assert.equal((await c.req('PATCH', '/api/me', { avatar: '💣' })).status, 400);
  assert.equal((await c.req('PATCH', '/api/me', { avatar_color: 'preto' })).status, 400);
  assert.equal((await c.req('PATCH', '/api/me', { display_name: '' })).status, 400);
  assert.equal((await c.req('PATCH', '/api/me', { bio: 'x'.repeat(161) })).status, 400);

  assert.equal((await c.post('/api/me/password', { current: 'errada-errada', next: 'nova-senha-123' })).status, 401);
  assert.equal((await c.post('/api/me/password', { current: password, next: 'curta' })).status, 400);
  assert.equal((await c.post('/api/me/password', { current: password, next: 'nova-senha-123' })).status, 200);
  assert.equal((await c.get('/api/me')).status, 200); // este aparelho continua logado
  assert.equal((await phone.get('/api/me')).status, 401); // o outro caiu
  assert.equal((await new Client(app.base).post('/api/login', { identifier: username, password: 'nova-senha-123' })).status, 200);
});

test('excluir conta exige senha e apaga os dados da pessoa', async () => {
  const { c, username, password } = await newUser();
  const ev = (await c.get('/api/events')).data.events[0];
  await c.post(`/api/events/${ev.id}/reviews`, { rating: 3, comment: 'ok' });
  const post = (await c.post('/api/posts', { body: 'tchau' })).data.post;

  assert.equal((await c.post('/api/me/delete', { password: 'errada-errada' })).status, 401);
  assert.equal((await c.post('/api/me/delete', { password })).status, 200);
  assert.equal((await c.get('/api/me')).status, 401);
  assert.equal((await new Client(app.base).post('/api/login', { identifier: username, password })).status, 401);

  const { c: other } = await newUser();
  assert.equal((await other.get(`/api/posts/${post.id}`)).status, 404);
  assert.ok(!(await other.get(`/api/events/${ev.id}`)).data.event.reviews.some((r) => r.author.username === username));
});

test('link do e-mail usa o endereço do túnel Cloudflare, mas ignora Host forjado', async () => {
  const { email } = await newUser();
  const { request } = await import('node:http');
  const forgot = (host) => new Promise((resolve, reject) => {
    const body = JSON.stringify({ email });
    const url = new URL(app.base);
    const r = request({ host: url.hostname, port: url.port, path: '/api/forgot', method: 'POST',
      headers: { host, 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) } }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
    r.on('error', reject); r.end(body);
  });
  const lastLink = async () => { await new Promise((r) => setTimeout(r, 50)); return /https?:\/\/\S+/.exec(app.sent.at(-1).text)[0]; };

  assert.equal(await forgot('abc-def-123.trycloudflare.com'), 200);
  assert.match(await lastLink(), /^https:\/\/abc-def-123\.trycloudflare\.com\/#\/redefinir\?token=/);

  assert.equal(await forgot('evil.example.com'), 200);
  assert.match(await lastLink(), /^http:\/\/localhost:3000\/#\/redefinir/);
});

// ---------- limite de tentativas (por último: usa um servidor só dele) ----------

test('limita tentativas de login (força bruta)', async () => {
  const solo = await startApp({ strict: true });
  try {
    const c = new Client(solo.base);
    const statuses = [];
    for (let i = 0; i < 10; i++) statuses.push((await c.post('/api/login', { identifier: 'alguem', password: 'errada-errada' })).status);
    assert.deepEqual(statuses.slice(0, 8), Array(8).fill(401));
    assert.deepEqual(statuses.slice(8), [429, 429]);
    const blocked = await c.post('/api/login', { identifier: 'alguem', password: 'errada-errada' });
    assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  } finally {
    await solo.close();
  }
});
