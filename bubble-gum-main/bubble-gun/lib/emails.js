const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function resetPasswordEmail({ name, link, minutes }) {
  const subject = 'Troque sua senha do Bubble Gun 🫧';

  const text = [
    `Oi, ${name}!`,
    '',
    'Recebemos um pedido para trocar a senha da sua conta no Bubble Gun.',
    'Para escolher uma nova senha, abra o link abaixo:',
    '',
    link,
    '',
    `O link vale por ${minutes} minutos e só pode ser usado uma vez.`,
    'Se não foi você, é só ignorar este e-mail: sua senha continua a mesma.',
    '',
    '— Equipe Bubble Gun',
  ].join('\n');

  const html = `<!doctype html>
<html lang="pt-BR"><body style="margin:0;padding:24px;background:#ffe3f0;font-family:Arial,Helvetica,sans-serif;color:#2b1238">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:3px solid #2b1238;border-radius:24px;padding:28px;box-shadow:6px 6px 0 #2b1238">
    <div style="font-size:40px;line-height:1">🫧</div>
    <h1 style="margin:12px 0 8px;font-size:24px">Oi, ${esc(name)}!</h1>
    <p style="font-size:16px;line-height:1.5;margin:0 0 20px">Recebemos um pedido para trocar a senha da sua conta no <strong>Bubble Gun</strong>. Clique no botão para escolher uma nova senha.</p>
    <p style="margin:0 0 24px"><a href="${esc(link)}" style="display:inline-block;background:#ff7eb6;color:#2b1238;font-weight:bold;font-size:16px;text-decoration:none;padding:14px 26px;border:3px solid #2b1238;border-radius:999px">Criar nova senha</a></p>
    <p style="font-size:14px;line-height:1.5;margin:0 0 8px;color:#6b4a7a">Se o botão não funcionar, copie e cole este endereço no navegador:<br><span style="word-break:break-all">${esc(link)}</span></p>
    <p style="font-size:14px;line-height:1.5;margin:0;color:#6b4a7a">O link vale por ${minutes} minutos e só pode ser usado uma vez. Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>
  </div>
</body></html>`;

  return { subject, text, html };
}
