import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Carrega o arquivo .env (se existir) sem precisar de nenhuma biblioteca.
try {
  process.loadEnvFile(path.join(ROOT, '.env'));
} catch {
  /* sem .env: tudo bem, usamos os padrões */
}

const env = process.env;
const port = Number(env.PORT ?? 3000);

function smtpFromEnv() {
  if (!env.SMTP_HOST) return null;
  const smtpPort = Number(env.SMTP_PORT ?? 587);
  const secure = (env.SMTP_SECURE ?? (smtpPort === 465 ? 'tls' : 'starttls')).toLowerCase();
  if (!['tls', 'starttls', 'none'].includes(secure)) {
    throw new Error('SMTP_SECURE deve ser "tls", "starttls" ou "none"');
  }
  const user = env.SMTP_USER ?? '';
  return {
    host: env.SMTP_HOST,
    port: smtpPort,
    secure,
    user,
    pass: env.SMTP_PASS ?? '',
    from: (env.SMTP_FROM ?? `Bubble Gun <${user.includes('@') ? user : 'no-reply@' + env.SMTP_HOST}>`).replace(/[\r\n]/g, ''),
  };
}

export const config = {
  port,
  host: env.HOST ?? '0.0.0.0',
  baseUrlFixed: Boolean(env.BASE_URL),
  baseUrl: (env.BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),
  dbPath: env.DB_PATH ?? path.join(ROOT, 'data', 'bubblegun.db'),
  outboxDir: env.OUTBOX_DIR ?? path.join(ROOT, 'outbox'),
  trustProxy: env.TRUST_PROXY === '1',
  seed: env.BG_SEED !== '0',
  sessionDays: 30,
  resetMinutes: 60,
  smtp: smtpFromEnv(),
};
