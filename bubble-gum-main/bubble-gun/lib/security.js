import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// Parâmetros do scrypt (recomendação OWASP: N=2^14 com r=8, p=1 é o mínimo aceitável).
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

/** Guarda apenas um hash com sal. A senha original nunca é armazenada. */
export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts[0] !== 'scrypt' || parts.length !== 6) return false; // contas de exemplo têm "!" e nunca logam
  const [, n, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, 'base64');
  const key = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(key, expected);
}

let dummyHash;
/** Gasta o mesmo tempo de uma verificação real, para não revelar se o usuário existe. */
export async function dummyVerify(password) {
  dummyHash ??= await hashPassword('bubble-gun-dummy');
  await verifyPassword(password, dummyHash);
}

export const newToken = () => crypto.randomBytes(32).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Limitador de tentativas em memória (suficiente para uma instância só). */
export class RateLimiter {
  constructor() {
    this.hits = new Map();
    setInterval(() => this.sweep(), 60_000).unref();
  }

  /** Retorna 0 se pode seguir, ou quantos segundos faltam para tentar de novo. */
  take(key, limit, windowMs) {
    const now = Date.now();
    let e = this.hits.get(key);
    if (!e || e.reset <= now) {
      e = { count: 0, reset: now + windowMs };
      this.hits.set(key, e);
    }
    e.count += 1;
    return e.count <= limit ? 0 : Math.ceil((e.reset - now) / 1000);
  }

  clear(key) {
    this.hits.delete(key);
  }

  sweep() {
    const now = Date.now();
    for (const [k, e] of this.hits) if (e.reset <= now) this.hits.delete(k);
  }
}
