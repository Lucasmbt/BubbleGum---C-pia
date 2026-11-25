import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { smtpSend, buildMessage, createMailer } from '../lib/mailer.js';
import { resetPasswordEmail } from '../lib/emails.js';

/** Servidor SMTP de mentira: guarda o que recebe e exige AUTH PLAIN. */
function fakeSmtp({ user = 'robo', pass = 'segredo' } = {}) {
  const received = { commands: [], data: '' };
  const server = net.createServer((sock) => {
    let inData = false;
    let buf = '';
    sock.write('220 fake.smtp ESMTP\r\n');
    sock.on('data', (chunk) => {
      buf += chunk.toString('utf8');
      for (;;) {
        if (inData) {
          const end = buf.indexOf('\r\n.\r\n');
          if (end < 0) return;
          received.data = buf.slice(0, end);
          buf = buf.slice(end + 5);
          inData = false;
          sock.write('250 OK queued\r\n');
          continue;
        }
        const nl = buf.indexOf('\r\n');
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        received.commands.push(line.startsWith('AUTH') ? 'AUTH ***' : line);
        if (line.startsWith('EHLO')) sock.write('250-fake.smtp\r\n250-AUTH PLAIN\r\n250 8BITMIME\r\n');
        else if (line.startsWith('AUTH PLAIN')) {
          const [, u, p] = Buffer.from(line.slice(11), 'base64').toString().split('\0');
          sock.write(u === user && p === pass ? '235 2.7.0 Authenticated\r\n' : '535 5.7.8 Bad credentials\r\n');
        } else if (line.startsWith('MAIL FROM') || line.startsWith('RCPT TO')) sock.write('250 OK\r\n');
        else if (line === 'DATA') { inData = true; sock.write('354 go ahead\r\n'); }
        else if (line === 'QUIT') { sock.write('221 bye\r\n'); sock.end(); }
        else sock.write('502 nope\r\n');
      }
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, received, port: server.address().port })));
}

const decodeParts = (raw) =>
  [...raw.matchAll(/Content-Type: (text\/\w+); charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/g)].map(
    ([, type, body]) => [type, Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8')],
  );

test('SMTP: autentica, envia a mensagem e o conteúdo chega intacto (acentos, emoji, link)', async () => {
  const { server, received, port } = await fakeSmtp();
  try {
    const link = 'http://localhost:3000/#/redefinir?token=abc_DEF-123';
    const mail = resetPasswordEmail({ name: 'João <b>', link, minutes: 60 });
    await smtpSend({ host: '127.0.0.1', port, secure: 'none', user: 'robo', pass: 'segredo', from: 'Bubble Gun <no-reply@bubblegun.test>' }, { to: 'maria@example.com', ...mail });

    assert.deepEqual(
      received.commands.map((c) => c.split(' ')[0]),
      ['EHLO', 'AUTH', 'MAIL', 'RCPT', 'DATA', 'QUIT'],
    );
    assert.ok(received.commands.includes('MAIL FROM:<no-reply@bubblegun.test>'));
    assert.ok(received.commands.includes('RCPT TO:<maria@example.com>'));
    assert.match(received.data, /^From: Bubble Gun <no-reply@bubblegun\.test>/m);
    assert.match(received.data, /^To: maria@example\.com/m);
    const subject = /^Subject: =\?UTF-8\?B\?(.+)\?=/m.exec(received.data)[1];
    assert.equal(Buffer.from(subject, 'base64').toString('utf8'), 'Troque sua senha do Bubble Gun 🫧');

    const parts = Object.fromEntries(decodeParts(received.data + '\r\n--'));
    assert.match(parts['text/plain'], /Oi, João <b>!/);
    assert.ok(parts['text/plain'].includes(link));
    assert.ok(parts['text/html'].includes('João &lt;b&gt;')); // nome escapado no HTML
    assert.ok(!parts['text/html'].includes('João <b>'));
  } finally {
    server.close();
  }
});

test('SMTP: credenciais erradas viram erro claro, sem vazar a senha', async () => {
  const { server, port } = await fakeSmtp();
  try {
    await assert.rejects(
      smtpSend({ host: '127.0.0.1', port, secure: 'none', user: 'robo', pass: 'ERRADA-123', from: 'a@b.co' }, { to: 'x@example.com', subject: 's', text: 't', html: 'h' }),
      (err) => /recusou AUTH/.test(err.message) && !err.message.includes('ERRADA-123'),
    );
  } finally {
    server.close();
  }
});

test('SMTP: servidor fora do ar dá erro, não trava', async () => {
  const dead = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => dead.once('listening', r));
  const { port } = dead.address();
  dead.close();
  await assert.rejects(smtpSend({ host: '127.0.0.1', port, secure: 'none', user: '', pass: '', from: 'a@b.co' }, { to: 'x@example.com', subject: 's', text: 't', html: 'h' }));
});

test('mensagem recusa quebras de linha em destinatário (injeção de cabeçalho)', () => {
  assert.throws(() => buildMessage({ from: 'a@b.co', to: 'x@example.com\r\nBcc: spam@example.com', subject: 's', text: 't', html: 'h' }));
});

test('linhas que começam com ponto são protegidas no DATA (dot-stuffing)', async () => {
  const { server, received, port } = await fakeSmtp();
  try {
    await smtpSend({ host: '127.0.0.1', port, secure: 'none', user: 'robo', pass: 'segredo', from: 'a@b.co' }, { to: 'x@example.com', subject: 's', text: 'linha 1\n.linha com ponto\nfim', html: '<p>h</p>' });
    const text = decodeParts(received.data + '\r\n--').find(([t]) => t === 'text/plain')[1];
    assert.match(text, /\n\.linha com ponto\n/);
  } finally {
    server.close();
  }
});

test('sem SMTP configurado, grava o e-mail em ./outbox', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bg-outbox-'));
  const mailer = createMailer({ smtp: null, outboxDir: dir });
  assert.equal(mailer.mode, 'outbox');
  const log = console.log;
  console.log = () => {};
  try {
    await mailer.send({ to: 'maria@example.com', subject: 'Oi', text: 'abra http://localhost:3000/#/redefinir?token=zzz' });
  } finally {
    console.log = log;
  }
  const [file] = fs.readdirSync(dir);
  assert.match(file, /maria@example\.com/);
  assert.match(fs.readFileSync(path.join(dir, file), 'utf8'), /redefinir\?token=zzz/);
  fs.rmSync(dir, { recursive: true });
});
