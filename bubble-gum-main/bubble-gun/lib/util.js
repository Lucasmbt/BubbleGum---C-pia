export class HttpError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const bad = (message) => new HttpError(400, message);

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩]/g;

/** Limpa texto vindo do usuário: normaliza, remove caracteres de controle e espaços nas pontas. */
export function clean(value, { multiline = false } = {}) {
  let s = String(value ?? '').normalize('NFC').replace(/\r\n?/g, '\n').replace(CONTROL, '');
  if (multiline) {
    s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  } else {
    s = s.replace(/\s+/g, ' ');
  }
  return s.trim();
}

/** Tamanho em "caracteres visíveis" (code points), para o emoji contar como 1. */
export const len = (s) => Array.from(s).length;

/** Minúsculas e sem acento, para busca. */
export const fold = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase();

export const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{2,19}$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (k && !(k in out)) {
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        /* cookie malformado: ignora */
      }
    }
  }
  return out;
}

// --- Fuso de São Paulo (UTC-3 fixo; o Brasil não usa mais horário de verão) ---
export const HOUR = 3600e3;
export const DAY = 24 * HOUR;
export const SP_OFFSET = -3 * HOUR;

/** Meia-noite (horário de SP) do dia de `ms`, em epoch ms. */
export const spMidnight = (ms) => Math.floor((ms + SP_OFFSET) / DAY) * DAY - SP_OFFSET;
/** Dia da semana em SP (0 = domingo). */
export const spWeekday = (ms) => new Date(ms + SP_OFFSET).getUTCDay();
