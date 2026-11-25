/* Bubble Gun · front-end (JavaScript puro, sem build) */

// ───────────────────────── utilidades ─────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const view = $('#view');
const tabbar = $('#tabbar');

// Templates com escape automático: todo valor interpolado é escapado, a não ser que venha de raw().
const raw = (s) => ({ __raw: String(s) });
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const fmt = (v) =>
  v == null || v === false ? '' : Array.isArray(v) ? v.map(fmt).join('') : typeof v === 'object' && '__raw' in v ? v.__raw : esc(v);
const html = (strings, ...vals) => raw(strings.reduce((out, s, i) => out + s + (i < vals.length ? fmt(vals[i]) : ''), ''));
const paint = (el, tpl) => { el.innerHTML = fmt(tpl); };
const bool = (v) => (v ? 'true' : 'false');
const safeUrl = (u) => (/^https?:\/\//i.test(u) ? u : '#');
const len = (s) => Array.from(s).length;

const SVG = (inner, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${inner}</svg>`;
const ICON = {
  heart: SVG('<path d="M12 20.5s-7.5-4.6-9.2-9.6C1.7 7.7 3.7 4.5 7 4.5c2 0 3.4 1.1 5 3 1.6-1.9 3-3 5-3 3.3 0 5.3 3.2 4.2 6.4C19.5 15.9 12 20.5 12 20.5Z"/>'),
  chat: SVG('<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"/>'),
  trash: SVG('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>'),
  back: SVG('<path d="m15 5-7 7 7 7"/>'),
  eye: SVG('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: SVG('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/>'),
  search: SVG('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.9-4.9"/>'),
  external: SVG('<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>', 'width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'),
};
const icon = (name) => raw(ICON[name]);

const LOGO = raw(`<img src="/imagens/logo.png" alt="Bubble Gum" class="logo-img">`);

// ───────────────────────── datas e textos (sempre no horário de São Paulo) ─────────────────────────

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
const MO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const sp = (ms) => new Date(ms - 3 * 3600e3);
const dayLabel = (ms) => { const d = sp(ms); return `${WD[d.getUTCDay()]}, ${d.getUTCDate()} ${MO[d.getUTCMonth()]}`; };
const dayShort = (ms) => { const d = sp(ms); return `${d.getUTCDate()} ${MO[d.getUTCMonth()]}`; };
const timeLabel = (ms) => { const d = sp(ms); const m = d.getUTCMinutes(); return m ? `${d.getUTCHours()}h${String(m).padStart(2, '0')}` : `${d.getUTCHours()}h`; };
const dayKey = (ms) => Math.floor((ms - 3 * 3600e3) / 864e5);
const isRun = (ev) => ev.ends_at - ev.starts_at > 36 * 3600e3; // exposição/temporada

function whenShort(ev) {
  if (isRun(ev)) return ev.starts_at > Date.now() ? `A partir de ${dayShort(ev.starts_at)}` : `Em cartaz até ${dayShort(ev.ends_at)}`;
  return `${dayLabel(ev.starts_at)} · ${timeLabel(ev.starts_at)}`;
}
function whenLong(ev) {
  if (isRun(ev)) return `Em cartaz de ${dayShort(ev.starts_at)} até ${dayShort(ev.ends_at)}`;
  if (dayKey(ev.starts_at) === dayKey(ev.ends_at)) return `${dayLabel(ev.starts_at)} · ${timeLabel(ev.starts_at)} às ${timeLabel(ev.ends_at)}`;
  return `${dayLabel(ev.starts_at)}, ${timeLabel(ev.starts_at)} até ${dayLabel(ev.ends_at)}, ${timeLabel(ev.ends_at)}`;
}
function priceLabel(ev) {
  if (ev.price_cents === 0) return 'Grátis';
  const r = ev.price_cents / 100;
  return `R$ ${Number.isInteger(r) ? r : r.toFixed(2).replace('.', ',')}`;
}
function timeAgo(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 45) return 'agora';
  if (s < 3600) return `há ${Math.max(1, Math.round(s / 60))} min`;
  if (s < 86400) return `há ${Math.round(s / 3600)} h`;
  if (s < 7 * 86400) return `há ${Math.round(s / 86400)} d`;
  return dayShort(ms);
}
const num = (n) => String(n).replace('.', ',');

// ───────────────────────── blocos reutilizáveis ─────────────────────────

const avatar = (u, size = 44) =>
  html`<span class="avatar av-${u.avatar_color}" style="--s:${size}px" aria-hidden="true">${u.avatar}</span>`;

function stars(value) {
  const full = Math.round(value);
  return html`<span class="stars" role="img" aria-label="Nota ${num(value)} de 5">${'★'.repeat(full)}<span class="off">${'★'.repeat(5 - full)}</span></span>`;
}

const loading = (text = 'Soprando bolhas…') =>
  html`<div class="loading" role="status"><div class="pop-dots"><i></i><i></i><i></i></div><p>${text}</p></div>`;

const emptyState = (emoji, title, text = '') =>
  html`<div class="empty"><div class="big" aria-hidden="true">${emoji}</div><h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}</div>`;

const chip = (action, value, label, pressed) =>
  html`<button type="button" class="chip" data-action="${action}" data-v="${value}" aria-pressed="${bool(pressed)}">${label}</button>`;

function toast(message, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind === 'error' ? 'error' : ''}`;
  el.textContent = message;
  $('#toasts').append(el);
  setTimeout(() => el.remove(), 3400);
}

// ───────────────────────── estado e API ─────────────────────────

const state = {
  me: null,
  cats: [],
  events: null,
  cat: '',
  search: { q: '', cat: '', free: false, when: '' },
  feed: { posts: [], next: null },
  profile: null,
  mode: null, // 'edit' | 'password' | 'delete' (perfil)
  draft: null,
  rating: 0,
  event: null,
};

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* resposta sem corpo */ }
  if (!res.ok) {
    const err = new Error(data?.error || 'Algo deu errado. Tente de novo.');
    err.status = res.status;
    throw err;
  }
  return data;
}

function handleError(err) {
  if (err.status === 401 && state.me) {
    state.me = null;
    toast('Sua sessão expirou. Entre de novo.', 'error');
    redirect('#/login');
  } else {
    toast(err.message, 'error');
  }
}

async function ensureCats() {
  if (!state.cats.length) state.cats = (await api('/categories')).categories;
}

// ───────────────────────── roteador ─────────────────────────

const PUBLIC = new Set(['login', 'cadastro', 'esqueci', 'redefinir']);
const TAB_OF = { eventos: 'eventos', procurar: 'procurar', comunidade: 'comunidade', post: 'comunidade', perfil: 'perfil' };
let navId = 0;

const redirect = (hash) => location.replace(hash);
const go = (hash) => (location.hash === hash ? route() : (location.hash = hash));

function parseRoute() {
  const [path, query = ''] = (location.hash.replace(/^#/, '') || '/').split('?');
  const [name = '', id] = path.split('/').filter(Boolean);
  return { name, id, query: new URLSearchParams(query) };
}

const VIEWS = {
  login: viewLogin, cadastro: viewRegister, esqueci: viewForgot, redefinir: viewReset,
  eventos: viewEvents, evento: viewEvent, procurar: viewSearch,
  comunidade: viewCommunity, post: viewPost, perfil: viewProfile,
};

async function route() {
  const nav = ++navId;
  const r = parseRoute();

  if (!VIEWS[r.name]) return redirect(state.me ? '#/eventos' : '#/login');
  if (!state.me && !PUBLIC.has(r.name)) return redirect('#/login');
  if (state.me && PUBLIC.has(r.name) && r.name !== 'redefinir') return redirect('#/eventos');

  const tab = state.me ? TAB_OF[r.name] : null;
  tabbar.hidden = !tab;
  for (const a of tabbar.querySelectorAll('a')) {
    if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }

  window.scrollTo(0, 0);
  try {
    await VIEWS[r.name](r, nav);
  } catch (err) {
    if (nav !== navId) return;
    if (err.status === 401) {
      const hadSession = !!state.me;
      state.me = null;
      if (hadSession) toast('Sua sessão expirou. Entre de novo.', 'error');
      return redirect('#/login');
    }
    paint(view, html`<div class="card stack center"><div class="big" style="font-size:3rem" aria-hidden="true">🫠</div><h2>Ops, a bolha estourou</h2><p class="muted">${err.message}</p><button class="btn" data-action="retry">Tentar de novo</button></div>`);
  }
  if (nav === navId) view.focus({ preventScroll: true });
}

// ───────────────────────── telas: entrada ─────────────────────────

const authShell = (title, body) => html`
  <section class="auth">
    <div class="auth-head">
      <div class="logo">${LOGO}<div class="wordmark">BubbleGum</div></div>
      <p>${title}</p>
    </div>
    ${body}
  </section>`;

const pwField = (name, label, autocomplete, hint = '') => html`
  <div class="field">
    <label for="f-${name}"><span>${label}</span></label>
    <div class="pw">
      <input id="f-${name}" name="${name}" type="password" autocomplete="${autocomplete}" required ${raw(hint ? 'minlength="8"' : '')} maxlength="128">
      <button type="button" class="pw-toggle" data-action="toggle-pw" aria-label="Mostrar senha" aria-pressed="false">${icon('eye')}</button>
    </div>
    ${hint ? html`<small>${hint}</small>` : ''}
  </div>`;

const textField = (name, label, attrs = {}) => html`
  <div class="field">
    <label for="f-${name}"><span>${label}</span></label>
    <input id="f-${name}" name="${name}" required ${raw(Object.entries(attrs).map(([k, v]) => `${k}="${esc(v)}"`).join(' '))}>
  </div>`;

function viewLogin() {
  document.title = 'Entrar · Bubble Gun';
  paint(view, authShell('Descubra o rolê cultural de São Paulo', html`
    <form class="card auth-card" data-form="login" novalidate>
      <h1>Entrar</h1>
      ${textField('identifier', 'Usuário ou e-mail', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '254' })}
      ${pwField('password', 'Senha', 'current-password')}
      <p class="form-error" role="alert"></p>
      <button class="btn btn-block" type="submit">Entrar</button>
      <p class="center" style="margin-top:14px"><a href="#/esqueci"><b>Esqueci minha senha</b></a></p>
    </form>
    <p class="auth-switch">Novo por aqui? <a href="#/cadastro">Criar conta</a></p>`));
}

function viewRegister() {
  document.title = 'Criar conta · Bubble Gun';
  paint(view, authShell('Crie sua conta e comece a explorar', html`
    <form class="card auth-card" data-form="register" novalidate>
      <h1>Criar conta</h1>
      ${textField('display_name', 'Como quer ser chamado(a)?', { autocomplete: 'nickname', maxlength: '40' })}
      ${textField('username', 'Nome de usuário', { autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', placeholder: 'ex.: luna_sp' })}
      ${textField('email', 'E-mail', { type: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', maxlength: '254' })}
      ${pwField('password', 'Senha', 'new-password', 'Pelo menos 8 caracteres.')}
      <p class="form-error" role="alert"></p>
      <button class="btn btn-block" type="submit">Criar minha conta</button>
    </form>
    <p class="auth-switch">Já tem conta? <a href="#/login">Entrar</a></p>`));
}

function viewForgot() {
  document.title = 'Esqueci a senha · Bubble Gun';
  paint(view, authShell('Vamos te ajudar a voltar', html`
    <form class="card auth-card" data-form="forgot" novalidate>
      <h1>Esqueci minha senha</h1>
      <p class="muted" style="margin-bottom:14px">Digite o e-mail da sua conta e enviaremos um link para criar uma nova senha.</p>
      ${textField('email', 'E-mail cadastrado', { type: 'email', autocomplete: 'email', autocapitalize: 'none', spellcheck: 'false', maxlength: '254' })}
      <p class="form-error" role="alert"></p>
      <button class="btn btn-block" type="submit">Enviar link</button>
    </form>
    <p class="auth-switch"><a href="#/login">← Voltar para o login</a></p>`));
}

function viewReset(r) {
  document.title = 'Nova senha · Bubble Gun';
  const token = r.query.get('token') || '';
  if (!token) {
    paint(view, authShell('Link incompleto', html`
      <div class="card stack center"><p>Esse link não está completo. Peça um novo para trocar sua senha.</p><a class="btn" href="#/esqueci">Pedir novo link</a></div>`));
    return;
  }
  paint(view, authShell('Escolha uma senha nova', html`
    <form class="card auth-card" data-form="reset" novalidate>
      <h1>Nova senha</h1>
      <input type="hidden" name="token" value="${token}">
      ${pwField('password', 'Nova senha', 'new-password', 'Pelo menos 8 caracteres.')}
      <p class="form-error" role="alert"></p>
      <button class="btn btn-block" type="submit">Salvar nova senha</button>
    </form>
    <p class="auth-switch"><a href="#/login">← Voltar para o login</a></p>`));
}

// ───────────────────────── telas: eventos ─────────────────────────

function evCard(ev) {
  return html`
  <article class="card ev-card">
    <div class="cover c-${ev.color}">
      <span class="tag cat">${ev.category}</span>
      <button type="button" class="icon-btn save save-btn" data-action="toggle-save" data-id="${ev.id}" aria-pressed="${bool(ev.saved)}" aria-label="Quero ir: ${ev.title}">${icon('heart')}</button>
      <span class="emoji" aria-hidden="true">${ev.emoji}</span>
    </div>
    <div class="ev-body">
      <h3><a class="stretch" href="#/evento/${ev.id}">${ev.title}</a></h3>
      <div class="ev-meta">
        ${ev.review_count ? html`<span>${stars(ev.avg_rating)} <b>${num(ev.avg_rating)}</b> (${ev.review_count})</span>` : html`<span>Novo por aqui</span>`}
        <span class="${ev.price_cents === 0 ? 'tag tag-free' : ''}"><b>${priceLabel(ev)}</b></span>
      </div>
      <div class="ev-meta"><span>📍 ${ev.venue} · ${ev.neighborhood}</span></div>
      <div class="ev-meta"><span>🗓️ ${whenShort(ev)}</span></div>
    </div>
  </article>`;
}

function resultCard(ev) {
  return html`
  <article class="card result">
    <div class="thumb c-${ev.color}" aria-hidden="true">${ev.emoji}</div>
    <div>
      <h3><a class="stretch" href="#/evento/${ev.id}">${ev.title}</a></h3>
      <div class="ev-meta"><span>${whenShort(ev)}</span></div>
      <div class="ev-meta">
        <span>${ev.neighborhood}</span>
        ${ev.review_count ? html`<span>★ <b>${num(ev.avg_rating)}</b></span>` : ''}
        <span><b>${priceLabel(ev)}</b></span>
      </div>
    </div>
  </article>`;
}

async function viewEvents(r, nav) {
  document.title = 'Eventos · Bubble Gun';
  paint(view, loading());
  const [data] = await Promise.all([api('/events'), ensureCats()]);
  if (nav !== navId) return;
  state.events = data.events;
  renderEvents();
}

function renderEvents() {
  const all = state.events;
  const cat = state.cat;
  const meta = state.cats.find((c) => c.name === cat);
  const list = cat ? all.filter((e) => e.category === cat) : all;
  const featured = all.filter((e) => e.featured);
  const free = all.filter((e) => e.price_cents === 0);
  const first = state.me.display_name.split(' ')[0];

  paint(view, html`
    <header class="top">
      <div><p class="kicker">São Paulo · SP</p><h1>Oi, ${first}! 🫧</h1></div>
      <a href="#/perfil" aria-label="Meu perfil">${avatar(state.me, 48)}</a>
    </header>

    <div class="chips" role="group" aria-label="Categorias">
      ${chip('filter-cat', '', '✨ Todos', cat === '')}
      ${state.cats.map((c) => chip('filter-cat', c.name, `${c.emoji} ${c.name}`, cat === c.name))}
    </div>

    ${cat
      ? html`<div class="section-title"><h2>${meta?.emoji} ${cat}</h2><span class="muted small">${list.length} ${list.length === 1 ? 'evento' : 'eventos'}</span></div>`
      : html`
        ${featured.length ? html`
          <div class="section-title"><h2>Em destaque ✨</h2></div>
          <div class="rail">${featured.map(evCard)}</div>` : ''}
        ${free.length ? html`
          <div class="section-title"><h2>De graça pra curtir 🎉</h2></div>
          <div class="rail">${free.map(evCard)}</div>` : ''}
        <div class="section-title"><h2>Todos os eventos</h2><span class="muted small">${list.length}</span></div>`}

    <div class="stack-lg">
      ${list.length ? list.map(evCard) : emptyState('🫧', `Nada de ${cat || 'evento'} por enquanto`, 'Volte em breve ou explore outra categoria.')}
    </div>
    ${all.some((e) => e.is_demo) ? html`<p class="demo-note">Os eventos, avaliações e conversas desta versão são exemplos de demonstração.</p>` : ''}`);
}

async function viewEvent(r, nav) {
  paint(view, loading());
  tabbar.hidden = true;
  const { event } = await api(`/events/${Number(r.id)}`);
  if (nav !== navId) return;
  state.event = event;
  state.rating = event.reviews.find((x) => x.mine)?.rating ?? 0;
  document.title = `${event.title} · Bubble Gun`;
  renderEvent();
}

function renderEvent() {
  const ev = state.event;
  const mine = ev.reviews.find((x) => x.mine);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${ev.venue}, ${ev.address}, São Paulo`)}`;
  const total = ev.review_count;
  const maxBar = Math.max(1, ...Object.values(ev.breakdown));

  paint(view, html`
    <div class="cover detail-cover c-${ev.color}">
      <button type="button" class="icon-btn back-float" data-action="back" data-fallback="#/eventos" aria-label="Voltar">${icon('back')}</button>
      <span class="emoji" aria-hidden="true">${ev.emoji}</span>
    </div>

    <div class="detail-head">
      <div class="row" style="flex-wrap:wrap;gap:6px">
        <span class="tag">${ev.category}</span>
        <span class="tag ${ev.price_cents === 0 ? 'tag-free' : ''}">${priceLabel(ev)}</span>
        <span class="tag">${ev.age_rating}</span>
        ${ev.is_demo ? html`<span class="tag tag-demo">exemplo</span>` : ''}
      </div>
      <h1>${ev.title}</h1>
      <div class="row" style="flex-wrap:wrap;gap:4px 8px">
        ${total ? html`${stars(ev.avg_rating)} <b>${num(ev.avg_rating)}</b> <span class="muted">(${total} ${total === 1 ? 'avaliação' : 'avaliações'})</span>` : html`<span class="muted">Ainda sem avaliações</span>`}
      </div>
    </div>

    <div class="stack-lg" style="margin-top:12px">
      <div class="actions">
        <button type="button" class="btn" data-action="toggle-save" data-id="${ev.id}" data-on="Salvo ✓" data-off="Quero ir 🎈" aria-pressed="${bool(ev.saved)}"><span class="lbl">${ev.saved ? 'Salvo ✓' : 'Quero ir 🎈'}</span></button>
        <a class="btn btn-blue" href="${maps}" target="_blank" rel="noopener noreferrer">Como chegar ${icon('external')}</a>
      </div>

      <section class="card facts">
        <div class="fact"><span class="ico" aria-hidden="true">🗓️</span><div><b>Quando</b>${whenLong(ev)}</div></div>
        <div class="fact"><span class="ico" aria-hidden="true">📍</span><div><b>Onde</b>${ev.venue}<br><span class="muted">${ev.address} · ${ev.neighborhood}, São Paulo</span></div></div>
        <div class="fact"><span class="ico" aria-hidden="true">🎟️</span><div><b>Quanto</b>${priceLabel(ev)}${ev.price_note ? html`<br><span class="muted">${ev.price_note}</span>` : ''}</div></div>
      </section>

      <section class="card stack">
        <h2>Sobre</h2>
        <p>${ev.description}</p>
        ${ev.tags.length ? html`<div class="row" style="flex-wrap:wrap;gap:6px">${ev.tags.map((t) => html`<span class="tag">#${t}</span>`)}</div>` : ''}
      </section>

      ${ev.links.length ? html`
        <section class="stack">
          <h2>Sites relacionados</h2>
          <div class="links">${ev.links.map((l) => html`<a href="${safeUrl(l.url)}" target="_blank" rel="noopener noreferrer"><span>${l.label}</span>${icon('external')}</a>`)}</div>
        </section>` : ''}

      <section class="card stack" aria-labelledby="rev-h">
        <h2 id="rev-h">Avaliações</h2>
        ${total ? html`
          <div class="rating-sum">
            <div class="center"><div class="rating-big">${num(ev.avg_rating)}</div>${stars(ev.avg_rating)}</div>
            <div class="bars" aria-hidden="true">
              ${[5, 4, 3, 2, 1].map((n) => html`<div class="bar"><span>${n}</span><i style="--w:${Math.round((ev.breakdown[n] / maxBar) * 100)}%"></i><span>${ev.breakdown[n]}</span></div>`)}
            </div>
          </div>` : ''}

        <form class="stack" data-form="review" style="gap:10px">
          <div>
            <p class="filter-label" id="rate-l">${mine ? 'Sua avaliação' : 'Deixe sua avaliação'}</p>
            <div class="star-input" role="group" aria-labelledby="rate-l">
              ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" data-action="set-rating" data-v="${n}" class="${n <= state.rating ? 'on' : ''}" aria-pressed="${bool(n <= state.rating)}" aria-label="${n} ${n === 1 ? 'estrela' : 'estrelas'}">★</button>`)}
            </div>
          </div>
          <label class="sr-only" for="rev-comment">Comentário</label>
          <textarea id="rev-comment" name="comment" maxlength="600" placeholder="Conte como foi (opcional)">${mine?.comment ?? ''}</textarea>
          <p class="form-error" role="alert"></p>
          <div class="row">
            <button class="btn btn-sm" type="submit">${mine ? 'Atualizar avaliação' : 'Publicar avaliação'}</button>
            ${mine ? html`<button class="btn btn-sm btn-ghost" type="button" data-action="delete-review">Apagar</button>` : ''}
          </div>
        </form>

        <div>
          ${ev.reviews.length ? ev.reviews.map((rv) => html`
            <div class="review">
              ${avatar(rv.author, 40)}
              <div>
                <div class="who"><b>${rv.author.display_name}${rv.mine ? ' (você)' : ''}</b><span class="muted small">@${rv.author.username} · ${timeAgo(rv.created_at)}</span></div>
                ${stars(rv.rating)}
              </div>
              ${rv.comment ? html`<p>${rv.comment}</p>` : ''}
            </div>`) : html`<p class="muted center">Seja a primeira pessoa a avaliar. 🫧</p>`}
        </div>
      </section>
    </div>`);
}

// ───────────────────────── telas: procurar ─────────────────────────

const WHEN = [['', 'Qualquer dia'], ['hoje', 'Hoje'], ['semana', 'Próximos 7 dias'], ['fds', 'Fim de semana'], ['mes', 'Este mês']];
const SUGGESTIONS = ['jazz', 'gratuito', 'Vila Madalena', 'teatro', 'ao ar livre', 'samba', 'exposição', 'poesia'];

async function viewSearch() {
  document.title = 'Procurar · Bubble Gun';
  await ensureCats();
  const s = state.search;
  paint(view, html`
    <header class="top"><div><p class="kicker">Achar o rolê certo</p><h1>Procurar</h1></div></header>
    <form class="searchbar" role="search" data-form="search">
      ${icon('search')}
      <label class="sr-only" for="q">Buscar eventos</label>
      <input id="q" type="search" name="q" value="${s.q}" placeholder="Jazz, Vila Madalena, teatro…" autocomplete="off" enterkeyhint="search" maxlength="80">
    </form>

    <p class="filter-label">Categoria</p>
    <div class="chips" role="group" aria-label="Categoria" data-group="s-cat">
      ${chip('s-cat', '', 'Todas', s.cat === '')}
      ${state.cats.map((c) => chip('s-cat', c.name, `${c.emoji} ${c.name}`, s.cat === c.name))}
    </div>
    <p class="filter-label">Quando</p>
    <div class="chips" role="group" aria-label="Quando" data-group="s-when">
      ${WHEN.map(([v, label]) => chip('s-when', v, label, s.when === v))}
    </div>
    <div class="chips" role="group" aria-label="Preço">${chip('s-free', 'free', '🎉 Só gratuitos', s.free)}</div>

    <div id="results" class="stack" style="margin-top:6px" aria-live="polite"></div>`);
  runSearch();
}

let searchSeq = 0;
let searchTimer;
const debouncedSearch = () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 250); };

async function runSearch() {
  const seq = ++searchSeq;
  const box = $('#results');
  if (!box) return;
  const s = state.search;
  const params = new URLSearchParams();
  if (s.q.trim()) params.set('q', s.q.trim());
  if (s.cat) params.set('category', s.cat);
  if (s.free) params.set('free', '1');
  if (s.when) params.set('when', s.when);

  if (![...params.keys()].length) {
    paint(box, html`
      <p class="filter-label">Que tal buscar por…</p>
      <div class="row" style="flex-wrap:wrap;gap:8px">${SUGGESTIONS.map((t) => html`<button type="button" class="chip" data-action="suggest" data-v="${t}">${t}</button>`)}</div>`);
    return;
  }
  try {
    const { events } = await api(`/events?${params}`);
    if (seq !== searchSeq || !$('#results')) return;
    paint($('#results'), events.length
      ? html`<p class="muted small">${events.length} ${events.length === 1 ? 'resultado' : 'resultados'}</p>${events.map(resultCard)}`
      : emptyState('🫧', 'Nenhuma bolha encontrada', 'Tente outro termo ou tire algum filtro.'));
  } catch (err) {
    if (seq === searchSeq) handleError(err);
  }
}

// ───────────────────────── telas: comunidade ─────────────────────────

function postCard(p, { open = true } = {}) {
  return html`
  <article class="card post" data-post="${p.id}" style="position:relative">
    ${avatar(p.author)}
    <div class="head">
      <b>${p.author.display_name}</b>
      <span class="muted small">@${p.author.username} · ${open ? html`<a class="stretch" href="#/post/${p.id}">${timeAgo(p.created_at)}</a>` : timeAgo(p.created_at)}</span>
    </div>
    <p class="body">${p.body}</p>
    <div class="acts">
      <button type="button" class="act" data-action="like-post" data-id="${p.id}" aria-pressed="${bool(p.liked)}" aria-label="Curtir">${icon('heart')}<span class="n">${p.likes}</span></button>
      ${open
        ? html`<a class="act" href="#/post/${p.id}" aria-label="Ver respostas" style="text-decoration:none;position:relative;z-index:2">${icon('chat')}<span>${p.replies}</span></a>`
        : ''}
      ${p.mine ? html`<button type="button" class="act danger" data-action="delete-post" data-id="${p.id}" aria-label="Apagar">${icon('trash')}</button>` : ''}
    </div>
  </article>`;
}

const composer = (formName, placeholder, buttonLabel, extra = '') => html`
  <form class="card composer" data-form="${formName}" ${raw(extra)}>
    ${avatar(state.me)}
    <div class="stack" style="gap:8px">
      <label class="sr-only" for="c-${formName}">${placeholder}</label>
      <textarea id="c-${formName}" name="body" maxlength="600" placeholder="${placeholder}" data-counter="count-${formName}"></textarea>
      <p class="form-error" role="alert"></p>
      <div class="row between"><span class="counter" id="count-${formName}">0/280</span><button class="btn btn-sm" type="submit">${buttonLabel}</button></div>
    </div>
  </form>`;

async function viewCommunity(r, nav) {
  document.title = 'Comunidade · Bubble Gun';
  paint(view, loading());
  const data = await api('/posts');
  if (nav !== navId) return;
  state.feed = { posts: data.posts, next: data.next_before };
  paint(view, html`
    <header class="top"><div><p class="kicker">Papo da cidade</p><h1>Comunidade</h1></div></header>
    ${composer('post', 'O que está rolando por aí?', 'Soprar bolha 🫧')}
    <div class="stack" id="feed" style="margin-top:16px">
      ${state.feed.posts.length ? state.feed.posts.map((p) => postCard(p)) : emptyState('💬', 'Ninguém soprou uma bolha ainda', 'Seja a primeira pessoa!')}
    </div>
    <div class="center" id="more" style="margin-top:16px" ${raw(state.feed.next ? '' : 'hidden')}><button class="btn btn-ghost" data-action="load-more">Ver mais bolhas</button></div>`);
}

async function viewPost(r, nav) {
  paint(view, loading());
  const { post, replies } = await api(`/posts/${Number(r.id)}`);
  if (nav !== navId) return;
  document.title = `Conversa · Bubble Gun`;
  paint(view, html`
    <button type="button" class="icon-btn back" data-action="back" data-fallback="#/comunidade" aria-label="Voltar">${icon('back')}</button>
    <h1 class="sr-only">Conversa</h1>
    <div class="stack">
      ${postCard(post, { open: false })}
      ${composer('reply', `Responder a @${post.author.username}`, 'Responder', `data-parent="${post.id}"`)}
      ${replies.length
        ? html`<div class="replies" id="replies">${replies.map((p) => postCard(p, { open: false }))}</div>`
        : html`<p class="muted center">Ainda sem respostas. Puxe a conversa! 🫧</p>`}
    </div>`);
}

// ───────────────────────── telas: perfil ─────────────────────────

async function viewProfile(r, nav) {
  document.title = 'Perfil · Bubble Gun';
  paint(view, loading());
  const [{ user }, { events }] = await Promise.all([api('/me'), api('/me/saved')]);
  if (nav !== navId) return;
  state.me = user;
  state.profile = { saved: events };
  state.mode = null;
  renderProfile();
}

function renderProfile() {
  const u = state.me;
  const saved = state.profile.saved;
  const mode = state.mode;

  paint(view, html`
    <header class="top"><h1>Perfil</h1><button class="btn btn-sm btn-ghost" data-action="logout">Sair</button></header>
    <div class="stack-lg">
      ${mode === 'edit' ? profileEditForm(u) : html`
        <section class="card profile-head">
          ${avatar(u, 96)}
          <h2>${u.display_name}</h2>
          <p class="muted">@${u.username}</p>
          <p>${u.bio || html`<span class="muted">Adicione uma bio para a galera te conhecer.</span>`}</p>
          <button class="btn btn-sm btn-ghost" data-action="edit-profile">Editar perfil</button>
        </section>`}

      <div class="stats" aria-label="Seus números">
        <div class="stat"><b>${u.stats.reviews}</b><span>avaliações</span></div>
        <div class="stat"><b>${u.stats.posts}</b><span>bolhas</span></div>
        <div class="stat"><b>${u.stats.saved}</b><span>rolês salvos</span></div>
      </div>

      <section class="card">
        <h2 style="margin-bottom:6px">Minha conta</h2>
        <div class="info-row"><div><div class="lbl">Nome de usuário</div><div class="val">@${u.username}</div></div></div>
        <div class="info-row"><div><div class="lbl">E-mail · só você vê</div><div class="val">${u.email}</div></div></div>
        <div class="info-row">
          <div><div class="lbl">Senha · só você vê</div><div class="val dots" aria-label="Senha oculta">••••••••••</div></div>
          <button class="btn btn-sm btn-ghost" data-action="open-password">Alterar</button>
        </div>
        ${mode === 'password' ? passwordForm() : html`<p class="muted small" style="margin-top:8px">🔒 Sua senha fica guardada criptografada: nem o Bubble Gun consegue lê-la. Se esquecer, é só trocar por aqui ou pelo e-mail.</p>`}
      </section>

      <section class="stack">
        <h2>Meus rolês</h2>
        ${saved.length ? saved.map(resultCard) : emptyState('🎈', 'Nada salvo ainda', 'Toque no coração de um evento para guardá-lo aqui.')}
      </section>

      <section class="card danger-zone">
        <h2 style="margin-bottom:6px">Excluir conta</h2>
        ${mode === 'delete' ? html`
          <form class="stack" data-form="delete" style="gap:10px">
            <p class="muted small">Isso apaga seu perfil, avaliações e bolhas. Não dá para desfazer. Digite sua senha para confirmar.</p>
            ${pwField('password', 'Senha', 'current-password')}
            <p class="form-error" role="alert"></p>
            <div class="row"><button class="btn btn-sm btn-danger" type="submit">Excluir para sempre</button><button type="button" class="btn btn-sm btn-ghost" data-action="cancel-mode">Cancelar</button></div>
          </form>` : html`
          <p class="muted small" style="margin-bottom:10px">Quer ir embora? Você pode apagar todos os seus dados.</p>
          <button class="btn btn-sm btn-ghost" data-action="open-delete">Excluir minha conta</button>`}
      </section>
    </div>`);
}

function profileEditForm(u) {
  const d = state.draft ?? (state.draft = { avatar: u.avatar, avatar_color: u.avatar_color });
  return html`
    <form class="card stack" data-form="profile" novalidate>
      <h2>Editar perfil</h2>
      <div class="center"><span id="draft-avatar">${avatar({ avatar: d.avatar, avatar_color: d.avatar_color }, 84)}</span></div>
      <div>
        <p class="filter-label">Avatar</p>
        <div class="picker" role="group" aria-label="Avatar">${AVATARS.map((a) => html`<button type="button" data-action="pick-avatar" data-v="${a}" aria-pressed="${bool(a === d.avatar)}" aria-label="Avatar ${a}">${a}</button>`)}</div>
      </div>
      <div>
        <p class="filter-label">Cor</p>
        <div class="picker colors" role="group" aria-label="Cor do avatar">${COLORS.map((c) => html`<button type="button" class="av-${c}" data-action="pick-color" data-v="${c}" aria-pressed="${bool(c === d.avatar_color)}" aria-label="Cor ${c}"></button>`)}</div>
      </div>
      <div class="field" style="margin:0"><label for="f-display_name"><span>Nome</span></label><input id="f-display_name" name="display_name" value="${u.display_name}" maxlength="40" required></div>
      <div class="field" style="margin:0"><label for="f-bio"><span>Bio</span></label><textarea id="f-bio" name="bio" maxlength="200" style="min-height:70px" placeholder="Fale um pouco sobre você">${u.bio}</textarea></div>
      <p class="form-error" role="alert"></p>
      <div class="row"><button class="btn btn-sm" type="submit">Salvar</button><button type="button" class="btn btn-sm btn-ghost" data-action="cancel-mode">Cancelar</button></div>
    </form>`;
}

const AVATARS = ['🫧', '🎈', '🍬', '🍭', '🧁', '🦄', '🌸', '🎧', '🎨', '📚', '🎭', '🪩', '🍓', '🐙', '🌈', '⭐'];
const COLORS = ['pink', 'blue', 'mint', 'lemon', 'lilac', 'peach'];

const passwordForm = () => html`
  <form class="stack" data-form="password" style="gap:10px;margin-top:12px">
    ${pwField('current', 'Senha atual', 'current-password')}
    ${pwField('next', 'Nova senha', 'new-password', 'Pelo menos 8 caracteres.')}
    <p class="form-error" role="alert"></p>
    <div class="row"><button class="btn btn-sm" type="submit">Trocar senha</button><button type="button" class="btn btn-sm btn-ghost" data-action="cancel-mode">Cancelar</button></div>
  </form>`;

// ───────────────────────── formulários ─────────────────────────

const forms = {
  async login(form, fd) {
    const { user } = await api('/login', { method: 'POST', body: { identifier: fd.get('identifier'), password: fd.get('password') } });
    state.me = user;
    toast(`Oi, ${user.display_name}! 🫧`);
    go('#/eventos');
  },

  async register(form, fd) {
    const { user } = await api('/register', {
      method: 'POST',
      body: { display_name: fd.get('display_name'), username: fd.get('username'), email: fd.get('email'), password: fd.get('password') },
    });
    state.me = user;
    toast('Conta criada! Bem-vindo(a) ao Bubble Gun 🎉');
    go('#/eventos');
  },

  async forgot(form, fd) {
    const res = await api('/forgot', { method: 'POST', body: { email: fd.get('email') } });
    paint(form, html`
      <div class="stack center"><div style="font-size:3rem" aria-hidden="true">💌</div><h1>Confira seu e-mail</h1>
      <p>${res.message}</p><p class="muted small">O link vale por 1 hora. Se não chegar, olhe também o spam.</p>
      <a class="btn" href="#/login">Voltar para o login</a></div>`);
  },

  async reset(form, fd) {
    await api('/reset', { method: 'POST', body: { token: fd.get('token'), password: fd.get('password') } });
    toast('Senha trocada! Entre com a nova senha.');
    redirect('#/login');
  },

  async review(form, fd) {
    if (!state.rating) throw new Error('Escolha de 1 a 5 estrelas.');
    const { event } = await api(`/events/${state.event.id}/reviews`, { method: 'POST', body: { rating: state.rating, comment: fd.get('comment') } });
    state.event = event;
    keepScroll(renderEvent);
    toast('Avaliação publicada! ⭐');
  },

  search() { clearTimeout(searchTimer); runSearch(); },

  async post(form, fd) {
    const { post } = await api('/posts', { method: 'POST', body: { body: fd.get('body') } });
    form.reset();
    updateCounter($('textarea', form));
    $('#feed .empty')?.remove();
    $('#feed').insertAdjacentHTML('afterbegin', fmt(postCard(post)));
    toast('Bolha no ar! 🫧');
  },

  async reply(form, fd) {
    await api('/posts', { method: 'POST', body: { body: fd.get('body'), parent_id: Number(form.dataset.parent) } });
    toast('Resposta enviada!');
    await route();
  },

  async profile(form, fd) {
    const { user } = await api('/me', {
      method: 'PATCH',
      body: { display_name: fd.get('display_name'), bio: fd.get('bio'), avatar: state.draft.avatar, avatar_color: state.draft.avatar_color },
    });
    state.me = user;
    state.mode = null;
    state.draft = null;
    renderProfile();
    toast('Perfil atualizado!');
  },

  async password(form, fd) {
    await api('/me/password', { method: 'POST', body: { current: fd.get('current'), next: fd.get('next') } });
    state.mode = null;
    renderProfile();
    toast('Senha alterada! 🔒');
  },

  async delete(form, fd) {
    await api('/me/delete', { method: 'POST', body: { password: fd.get('password') } });
    resetSession();
    toast('Conta excluída. Sentiremos sua falta!');
    go('#/login');
  },
};

function resetSession() {
  Object.assign(state, { me: null, events: null, cat: '', profile: null, mode: null, draft: null, search: { q: '', cat: '', free: false, when: '' } });
}

function keepScroll(fn) {
  const y = window.scrollY;
  fn();
  window.scrollTo(0, y);
}

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const handler = forms[form.dataset.form];
  if (!handler) return;
  const submit = form.querySelector('[type="submit"]');
  const errorBox = form.querySelector('.form-error');
  if (errorBox) errorBox.textContent = '';
  if (submit) submit.disabled = true;
  try {
    await handler(form, new FormData(form));
  } catch (err) {
    if (err.status === 401 && state.me && form.dataset.form !== 'password' && form.dataset.form !== 'delete') handleError(err);
    else if (errorBox && form.isConnected) errorBox.textContent = err.message;
    else toast(err.message, 'error');
  } finally {
    if (submit?.isConnected) submit.disabled = false;
  }
});

// ───────────────────────── ações (cliques) ─────────────────────────

const actions = {
  retry: () => route(),

  back(el, e) {
    e.preventDefault();
    if (history.length > 1) history.back();
    else go(el.dataset.fallback || '#/eventos');
  },

  'toggle-pw'(el) {
    const input = el.parentElement.querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    el.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
    el.setAttribute('aria-pressed', bool(show));
    el.innerHTML = fmt(icon(show ? 'eyeOff' : 'eye'));
  },

  // eventos
  'filter-cat'(el) {
    state.cat = el.dataset.v;
    keepScroll(renderEvents);
  },

  async 'toggle-save'(el) {
    const id = Number(el.dataset.id);
    const { saved } = await api(`/events/${id}/save`, { method: 'POST' });
    for (const btn of document.querySelectorAll(`[data-action="toggle-save"][data-id="${id}"]`)) {
      btn.setAttribute('aria-pressed', bool(saved));
      const lbl = btn.querySelector('.lbl');
      if (lbl) lbl.textContent = saved ? btn.dataset.on : btn.dataset.off;
    }
    for (const list of [state.events, state.event ? [state.event] : null]) list?.forEach((ev) => { if (ev.id === id) ev.saved = saved; });
    if (state.me) state.me.stats.saved += saved ? 1 : -1;
    toast(saved ? 'Salvo nos seus rolês 🎈' : 'Removido dos seus rolês');
  },

  'set-rating'(el) {
    state.rating = Number(el.dataset.v);
    for (const b of el.parentElement.children) {
      const on = Number(b.dataset.v) <= state.rating;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', bool(on));
    }
  },

  async 'delete-review'() {
    if (!confirm('Apagar sua avaliação?')) return;
    const { event } = await api(`/events/${state.event.id}/reviews/mine`, { method: 'DELETE' });
    state.event = event;
    state.rating = 0;
    keepScroll(renderEvent);
    toast('Avaliação apagada');
  },

  // procurar
  's-cat'(el) { setSearch(el, 'cat', el.dataset.v); },
  's-when'(el) { setSearch(el, 'when', el.dataset.v); },
  's-free'(el) {
    state.search.free = !state.search.free;
    el.setAttribute('aria-pressed', bool(state.search.free));
    runSearch();
  },
  suggest(el) {
    state.search.q = el.dataset.v;
    $('#q').value = el.dataset.v;
    runSearch();
  },

  // comunidade
  async 'like-post'(el) {
    const id = Number(el.dataset.id);
    const { liked, likes } = await api(`/posts/${id}/like`, { method: 'POST' });
    for (const btn of document.querySelectorAll(`[data-action="like-post"][data-id="${id}"]`)) {
      btn.setAttribute('aria-pressed', bool(liked));
      btn.querySelector('.n').textContent = likes;
    }
  },

  async 'delete-post'(el) {
    if (!confirm('Apagar esta bolha? As respostas dela também somem.')) return;
    const id = Number(el.dataset.id);
    await api(`/posts/${id}`, { method: 'DELETE' });
    if (parseRoute().name === 'post' && Number(parseRoute().id) === id) go('#/comunidade');
    else if (parseRoute().name === 'post') await route();
    else el.closest('.post')?.remove();
    toast('Bolha apagada');
  },

  async 'load-more'(el) {
    if (!state.feed.next) return;
    el.disabled = true;
    try {
      const data = await api(`/posts?before=${state.feed.next}`);
      state.feed.next = data.next_before;
      $('#feed').insertAdjacentHTML('beforeend', fmt(data.posts.map((p) => postCard(p))));
      $('#more').hidden = !state.feed.next;
    } finally {
      el.disabled = false;
    }
  },

  // perfil
  async logout() {
    try { await api('/logout', { method: 'POST' }); } catch { /* sai mesmo assim */ }
    resetSession();
    go('#/login');
  },
  'edit-profile'() { state.mode = 'edit'; state.draft = null; renderProfile(); },
  'open-password'() { state.mode = 'password'; renderProfile(); $('#f-current')?.focus(); },
  'open-delete'() { state.mode = 'delete'; renderProfile(); $('#f-password')?.focus(); },
  'cancel-mode'() { state.mode = null; state.draft = null; renderProfile(); },
  'pick-avatar'(el) { pick(el, 'avatar'); },
  'pick-color'(el) { pick(el, 'avatar_color'); },
};

function setSearch(el, key, value) {
  state.search[key] = value;
  for (const b of el.parentElement.children) b.setAttribute('aria-pressed', bool(b === el));
  runSearch();
}

function pick(el, key) {
  state.draft[key] = el.dataset.v;
  for (const b of el.parentElement.children) b.setAttribute('aria-pressed', bool(b === el));
  paint($('#draft-avatar'), avatar({ avatar: state.draft.avatar, avatar_color: state.draft.avatar_color }, 84));
}

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  const fn = el && actions[el.dataset.action];
  if (!fn) return;
  try {
    await fn(el, e);
  } catch (err) {
    handleError(err);
  }
});

// contador de caracteres e busca ao digitar
function updateCounter(textarea) {
  const counter = textarea && $(`#${textarea.dataset.counter}`);
  if (!counter) return;
  const n = len(textarea.value);
  counter.textContent = `${n}/280`;
  counter.classList.toggle('over', n > 280);
}
document.addEventListener('input', (e) => {
  if (e.target.matches('textarea[data-counter]')) updateCounter(e.target);
  if (e.target.id === 'q') {
    state.search.q = e.target.value;
    debouncedSearch();
  }
});

// ───────────────────────── início ─────────────────────────

(async function boot() {
  try {
    state.me = (await api('/me')).user;
  } catch {
    state.me = null;
  }
  window.addEventListener('hashchange', route);
  route();
})();
