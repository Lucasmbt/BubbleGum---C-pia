import net from 'node:net';
import tls from 'node:tls';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

/**
 * Envio de e-mail.
 *  - Com SMTP_HOST configurado: envia de verdade por SMTP (TLS direto, STARTTLS ou texto puro só para testes locais).
 *  - Sem SMTP: grava o e-mail em ./outbox e mostra o link no terminal (modo desenvolvimento).
 */
export function createMailer(cfg = config) {
  return {
    mode: cfg.smtp ? 'smtp' : 'outbox',
    send: (message) => (cfg.smtp ? smtpSend(cfg.smtp, message) : writeOutbox(cfg.outboxDir, message)),
  };
}

// ---------- montagem da mensagem (MIME) ----------

const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = (s) => s.replace(/.{1,76}/g, '$&\r\n').trimEnd();

function addressOnly(from) {
  const m = /<([^>]+)>/.exec(from);
  return (m ? m[1] : from).trim();
}

function assertNoNewlines(value, what) {
  if (/[\r\n]/.test(value)) throw new Error(`${what} inválido`);
}

export function buildMessage({ from, to, subject, text, html }) {
  assertNoNewlines(from, 'remetente');
  assertNoNewlines(to, 'destinatário');
  const boundary = `bg_${crypto.randomBytes(12).toString('hex')}`;
  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: =?UTF-8?B?${b64(subject.replace(/[\r\n]+/g, ' '))}?=`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@bubblegun.local>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');
  const part = (type, body) =>
    `--${boundary}\r\nContent-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(b64(body))}\r\n`;
  return `${headers}\r\n\r\n${part('text/plain', text)}${part('text/html', html)}--${boundary}--\r\n`;
}

// ---------- modo desenvolvimento ----------

async function writeOutbox(dir, message) {
  fs.mkdirSync(dir, { recursive: true });
  const slug = message.to.replace(/[^a-z0-9@.]+/gi, '_').slice(0, 60);
  const file = path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}_${slug}.txt`);
  fs.writeFileSync(file, `Para: ${message.to}\nAssunto: ${message.subject}\n\n${message.text}\n`);
  const link = /https?:\/\/\S+/.exec(message.text)?.[0];
  console.log(`📬 [sem SMTP configurado] e-mail para ${message.to} salvo em ${path.relative(process.cwd(), file)}`);
  if (link) console.log(`   link: ${link}`);
}

// ---------- cliente SMTP mínimo ----------

function openSocket(cfg) {
  return new Promise((resolve, reject) => {
    const opts = { host: cfg.host, port: cfg.port };
    const socket = cfg.secure === 'tls' ? tls.connect({ ...opts, servername: cfg.host }) : net.connect(opts);
    socket.setTimeout(20_000, () => socket.destroy(new Error('Tempo esgotado falando com o servidor SMTP')));
    socket.once('error', reject);
    socket.once(cfg.secure === 'tls' ? 'secureConnect' : 'connect', () => {
      socket.off('error', reject);
      resolve(socket);
    });
  });
}

class Reader {
  constructor(socket) {
    this.socket = socket;
    this.buf = '';
    this.waiting = [];
    this.error = null;
    this.onData = (d) => {
      this.buf += d.toString('utf8');
      this.pump();
    };
    this.onError = (e) => this.fail(e);
    this.onClose = () => this.fail(new Error('Conexão SMTP encerrada'));
    socket.on('data', this.onData);
    socket.on('error', this.onError);
    socket.on('close', this.onClose);
  }

  detach() {
    this.socket.off('data', this.onData);
    this.socket.off('error', this.onError);
    this.socket.off('close', this.onClose);
  }

  fail(err) {
    this.error ??= err;
    while (this.waiting.length) this.waiting.shift().reject(this.error);
  }

  pump() {
    while (this.waiting.length) {
      const lines = this.buf.split('\r\n');
      const last = lines.findIndex((l, i) => i < lines.length - 1 && /^\d{3}( |$)/.test(l));
      if (last < 0) return;
      this.buf = lines.slice(last + 1).join('\r\n');
      const reply = lines.slice(0, last + 1);
      this.waiting.shift().resolve({ code: Number(reply[0].slice(0, 3)), text: reply.join(' | ') });
    }
  }

  read() {
    if (this.error) return Promise.reject(this.error);
    return new Promise((resolve, reject) => {
      this.waiting.push({ resolve, reject });
      this.pump();
    });
  }
}

export async function smtpSend(cfg, { to, subject, text, html }) {
  const raw = buildMessage({ from: cfg.from, to, subject, text, html });
  let socket = await openSocket(cfg);
  let reader = new Reader(socket);
  const hello = `EHLO ${os.hostname().replace(/[^a-z0-9.-]/gi, '') || 'localhost'}`;

  const send = async (line, expected = [250]) => {
    socket.write(`${line}\r\n`);
    const reply = await reader.read();
    if (!expected.includes(reply.code)) {
      const shown = line.startsWith('AUTH') ? 'AUTH' : line.split(' ')[0];
      throw new Error(`SMTP recusou ${shown}: ${reply.text}`);
    }
    return reply;
  };

  try {
    const greeting = await reader.read();
    if (greeting.code !== 220) throw new Error(`SMTP não aceitou a conexão: ${greeting.text}`);
    await send(hello);

    if (cfg.secure === 'starttls') {
      await send('STARTTLS', [220]);
      reader.detach();
      socket = await new Promise((resolve, reject) => {
        const secured = tls.connect({ socket, servername: cfg.host }, () => resolve(secured));
        secured.once('error', reject);
      });
      socket.setTimeout(20_000, () => socket.destroy(new Error('Tempo esgotado falando com o servidor SMTP')));
      reader = new Reader(socket);
      await send(hello);
    }

    if (cfg.user) {
      await send(`AUTH PLAIN ${b64(`\0${cfg.user}\0${cfg.pass}`)}`, [235]);
    }
    await send(`MAIL FROM:<${addressOnly(cfg.from)}>`);
    await send(`RCPT TO:<${to}>`, [250, 251]);
    await send('DATA', [354]);
    socket.write(`${raw.replace(/^\./gm, '..')}\r\n.\r\n`);
    const done = await reader.read();
    if (done.code !== 250) throw new Error(`SMTP não aceitou a mensagem: ${done.text}`);
    await send('QUIT', [221]).catch(() => {});
  } finally {
    socket.destroy();
  }
}
