import { tx } from './db.js';
import { HOUR, DAY, spMidnight } from './util.js';

/*
 * Conteúdo de EXEMPLO para o app não nascer vazio.
 * Os locais (endereços e sites) são reais; as programações, avaliações e pessoas são fictícias.
 * Tudo isso é marcado com is_demo = 1 e some com `npm run reset-demo`.
 */

const DEMO_USERS = [
  { username: 'bubblegun', name: 'Bubble Gun', bio: 'Conta oficial. Dicas e novidades da cidade 🫧', avatar: '🫧', color: 'pink' },
  { username: 'luna_sp', name: 'Luna', bio: 'Caçadora de exposições e cafés.', avatar: '🌸', color: 'lilac' },
  { username: 'caio.rola', name: 'Caio', bio: 'Centro a pé, sempre.', avatar: '🎧', color: 'blue' },
  { username: 'bia_cultura', name: 'Bia', bio: 'Teatro, jazz e boas companhias.', avatar: '🎭', color: 'peach' },
  { username: 'theo_noturno', name: 'Theo', bio: 'Só saio depois das 19h.', avatar: '🪩', color: 'mint' },
  { username: 'mari_zines', name: 'Mari', bio: 'Faço zines e converso com quem faz também.', avatar: '🎨', color: 'lemon' },
];

export function seedIfNeeded(db) {
  const done = db.prepare("SELECT 1 FROM meta WHERE key = 'seeded'").get();
  if (done) return false;
  seedDemo(db);
  return true;
}

/** Apaga todo o conteúdo de exemplo e recria com datas a partir de hoje. */
export function resetDemo(db) {
  tx(db, () => {
    db.exec('DELETE FROM events WHERE is_demo = 1; DELETE FROM users WHERE is_demo = 1;');
  });
  seedDemo(db);
}

export function seedDemo(db, now = Date.now()) {
  const mid = spMidnight(now);
  const at = (days, h = 0, m = 0) => mid + days * DAY + h * HOUR + m * 60_000;

  const EVENTS = [
    {
      key: 'jazz', title: 'Noite de Jazz no Parque', category: 'Música', emoji: '🎷', color: 'pink', featured: 1,
      venue: 'Parque Ibirapuera', address: 'Av. Pedro Álvares Cabral, s/n', neighborhood: 'Ibirapuera',
      starts: at(4, 19), ends: at(4, 22), price: 0, priceNote: 'Entrada gratuita', age: 'Livre',
      tags: 'jazz, ao ar livre, pôr do sol, gratuito',
      description: 'Trio de jazz ao ar livre com standards brasileiros e improvisos ao entardecer. Leve uma canga, um lanche e boas companhias: o gramado é de todo mundo.',
      links: [['Site do parque', 'https://www.parqueibirapuera.org/']],
    },
    {
      key: 'masp', title: 'Cores da Cidade: Fotografia Urbana', category: 'Exposição', emoji: '📸', color: 'blue', featured: 1,
      venue: 'MASP', address: 'Av. Paulista, 1578', neighborhood: 'Bela Vista',
      starts: at(-7, 10), ends: at(38, 18), price: 7500, priceNote: 'Meia-entrada para estudantes', age: 'Livre',
      tags: 'fotografia, exposição, avenida paulista, urbano',
      description: 'Mostra coletiva que passeia por São Paulo em cores saturadas: fachadas, marquises, feiras e gente. Reserve umas duas horas para ver sem pressa e deixe um tempo para o vão livre lá embaixo.',
      links: [['Site do MASP', 'https://masp.org.br/']],
    },
    {
      key: 'sala', title: 'Tardes Barrocas: Concerto de Câmara', category: 'Música', emoji: '🎻', color: 'lilac', featured: 0,
      venue: 'Sala São Paulo', address: 'Praça Júlio Prestes, 16', neighborhood: 'Campos Elíseos',
      starts: at(-14, 11), ends: at(21, 12, 30), price: 6000, priceNote: 'Sessões aos domingos', age: 'Livre',
      tags: 'música clássica, barroco, orquestra, domingo',
      description: 'Série de concertos de câmara com repertório barroco, aos domingos de manhã. Uma ótima forma de conhecer uma das salas de concerto mais bonitas do país.',
      links: [['Site da Sala São Paulo', 'https://www.salasaopaulo.art.br/']],
    },
    {
      key: 'teatro', title: 'O Último Balão', category: 'Teatro', emoji: '🎈', color: 'lilac', featured: 1,
      venue: 'Theatro Municipal', address: 'Praça Ramos de Azevedo, s/n', neighborhood: 'República',
      starts: at(-10, 20), ends: at(20, 21, 40), price: 4000, priceNote: 'Temporada de quartas a domingos', age: '12 anos',
      tags: 'teatro, drama, família, temporada',
      description: 'Uma comédia dramática sobre uma cidade que decide soltar todos os seus balões de uma vez. Cenário de papel, atuações precisas e um final que pede lenço.',
      links: [['Site do Theatro Municipal', 'https://theatromunicipal.org.br/']],
    },
    {
      key: 'cine', title: 'Cine Rua: Sessão ao Ar Livre', category: 'Cinema', emoji: '🍿', color: 'lemon', featured: 0,
      venue: 'Praça Roosevelt', address: 'Praça Franklin Roosevelt', neighborhood: 'Consolação',
      starts: at(5, 19, 30), ends: at(5, 22), price: 0, priceNote: 'Gratuito, leve almofadas', age: '14 anos',
      tags: 'cinema, ao ar livre, gratuito, praça',
      description: 'Tela montada na praça, clássicos do cinema paulistano e pipoca no capricho. Chegue cedo para pegar um bom lugar no chão.',
      links: [],
    },
    {
      key: 'zines', title: 'Feira de Zines e Arte Impressa', category: 'Feira', emoji: '✂️', color: 'lemon', featured: 0,
      venue: 'Centro Cultural São Paulo', address: 'Rua Vergueiro, 1000', neighborhood: 'Paraíso',
      starts: at(12, 11), ends: at(13, 18), price: 0, priceNote: 'Entrada gratuita', age: 'Livre',
      tags: 'zines, arte impressa, feira, fim de semana, gratuito',
      description: 'Dois dias de feira com dezenas de bancas de zines, gravuras, adesivos e quadrinhos independentes. Dá para trocar ideia direto com quem faz.',
      links: [],
    },
    {
      key: 'sarau', title: 'Sarau da Vila', category: 'Literatura', emoji: '🎤', color: 'mint', featured: 0,
      venue: 'Beco do Batman', address: 'Rua Gonçalo Afonso', neighborhood: 'Vila Madalena',
      starts: at(3, 20), ends: at(3, 22, 30), price: 0, priceNote: 'Microfone aberto', age: 'Livre',
      tags: 'sarau, poesia, microfone aberto, vila madalena, gratuito',
      description: 'Microfone aberto para poesia, prosa e música sem amplificação. Quem quiser ler se inscreve na hora; quem prefere ouvir também é muito bem-vindo.',
      links: [],
    },
    {
      key: 'ceramica', title: 'Oficina de Cerâmica para Iniciantes', category: 'Oficina', emoji: '🏺', color: 'peach', featured: 0,
      venue: 'Sesc Pompeia', address: 'Rua Clélia, 93', neighborhood: 'Pompeia',
      starts: at(-14, 14), ends: at(20, 17), price: 3000, priceNote: 'Turma aberta, material incluso', age: '12 anos',
      tags: 'cerâmica, oficina, artesanal, mãos na massa',
      description: 'Aprenda a modelar, queimar e esmaltar sua primeira peça. Não precisa de experiência nenhuma, só de vontade de sujar as mãos.',
      links: [['Site do Sesc', 'https://www.sescsp.org.br/']],
    },
    {
      key: 'baile', title: 'Baile Pop Chiclete', category: 'Festa', emoji: '🪩', color: 'peach', featured: 1,
      venue: 'Baixo Augusta', address: 'Rua Augusta, trecho do Baixo Augusta', neighborhood: 'Consolação',
      starts: at(5, 22), ends: at(6, 4), price: 5000, priceNote: 'Lista amiga até as 23h', age: '18 anos',
      tags: 'festa, pop, balada, dança, rosa',
      description: 'Pista só de hits pop dos anos 2000 até hoje, cenografia de bolhas e glitter liberado. Dress code: qualquer coisa rosa.',
      links: [],
    },
    {
      key: 'centro', title: 'Caminhada pelo Centro Histórico', category: 'Passeio', emoji: '🚶', color: 'mint', featured: 0,
      venue: 'Pátio do Colégio', address: 'Pátio do Colégio, 2', neighborhood: 'Sé',
      starts: at(11, 9, 30), ends: at(11, 12), price: 0, priceNote: 'Gratuito, vagas limitadas', age: 'Livre',
      tags: 'passeio, centro histórico, caminhada, história, gratuito',
      description: 'Roteiro a pé de duas horas pelo marco zero da cidade, com histórias de ruas, prédios e esquinas. Use calçado confortável e leve água.',
      links: [],
    },
    {
      key: 'samba', title: 'Domingo no Parque: Roda de Samba', category: 'Música', emoji: '🪘', color: 'pink', featured: 0,
      venue: 'Parque da Água Branca', address: 'Av. Francisco Matarazzo, 455', neighborhood: 'Água Branca',
      starts: at(6, 14), ends: at(6, 18), price: 0, priceNote: 'Entrada gratuita', age: 'Livre',
      tags: 'samba, roda de samba, parque, domingo, gratuito',
      description: 'Roda de samba à sombra das árvores, com repertório de pagode e partido alto. Levar cadeira de praia é quase obrigatório.',
      links: [],
    },
    {
      key: 'pina', title: 'Arte Brasileira: Visita Guiada ao Acervo', category: 'Exposição', emoji: '🖼️', color: 'blue', featured: 0,
      venue: 'Pinacoteca de São Paulo', address: 'Praça da Luz, 2', neighborhood: 'Luz',
      starts: at(-30, 10), ends: at(90, 17, 30), price: 3000, priceNote: 'Visitas mediadas aos sábados', age: 'Livre',
      tags: 'arte brasileira, museu, acervo, visita guiada',
      description: 'Percurso pelo acervo com mediação, do século XIX ao contemporâneo. Boa pedida para quem quer entender o que está olhando.',
      links: [['Site da Pinacoteca', 'https://pinacoteca.org.br/']],
    },
    {
      key: 'slam', title: 'Slam de Poesia Aberto', category: 'Literatura', emoji: '🗣️', color: 'mint', featured: 0,
      venue: 'Praça Roosevelt', address: 'Praça Franklin Roosevelt', neighborhood: 'Consolação',
      starts: at(4, 19), ends: at(4, 21), price: 0, priceNote: 'Gratuito', age: 'Livre',
      tags: 'slam, poesia, competição, gratuito, praça',
      description: 'Batalha de poesia falada com três minutos por poeta, júri sorteado na plateia e muita energia. Chegue cedo para se inscrever.',
      links: [],
    },
    {
      key: 'curtas', title: 'Mostra de Curtas Paulistanos', category: 'Cinema', emoji: '🎞️', color: 'lemon', featured: 0,
      venue: 'IMS Paulista', address: 'Av. Paulista, 2424', neighborhood: 'Consolação',
      starts: at(13, 16), ends: at(13, 20), price: 0, priceNote: 'Gratuito, retirar ingresso na hora', age: '12 anos',
      tags: 'curtas, cinema, paulista, gratuito',
      description: 'Seleção de curtas-metragens feitos na cidade, seguida de conversa com quem dirigiu. Dá tempo de emendar com um café ali na Paulista.',
      links: [['Site do IMS', 'https://ims.com.br/']],
    },
  ];

  // [evento, usuário, nota, comentário, dias atrás]
  const REVIEWS = [
    ['masp', 'luna_sp', 5, 'As fotos são incríveis. Vale ir sem pressa e voltar para a sala do fundo.', 5],
    ['masp', 'caio.rola', 4, 'Bem montada. Só estava bem cheio no sábado à tarde, vá no meio da semana.', 3],
    ['masp', 'bia_cultura', 5, 'Saí querendo fotografar a cidade inteira.', 2],
    ['teatro', 'bia_cultura', 5, 'O final me pegou de surpresa. Levem lenço.', 4],
    ['teatro', 'theo_noturno', 4, 'Cenário lindo. A primeira meia hora é um pouco lenta, mas compensa.', 1],
    ['pina', 'caio.rola', 5, 'A mediação fez toda a diferença. Aprendi mais em 1h do que sozinho em um dia.', 6],
    ['pina', 'luna_sp', 4, 'Acervo maravilhoso. Chegue cedo, o sábado lota.', 2],
    ['ceramica', 'mari_zines', 5, 'Saí com uma tigelinha toda torta e muito orgulho dela.', 3],
    ['sala', 'theo_noturno', 5, 'A acústica é de outro mundo. Vá de manhã, o clima é ótimo.', 7],
  ];

  // Posts: [chave, usuário, texto, minutos atrás, chave do post pai (resposta)]
  const POSTS = [
    ['boasvindas', 'bubblegun', 'Bem-vinde ao Bubble Gun! 🫧 Aqui a gente conecta quem ama cultura em SP. Conta pra gente: qual foi o último rolê que valeu a pena?', 60 * 48],
    ['sarau', 'luna_sp', 'Fui num sarau ontem na Vila Madalena e saí com três livros novos na lista. Quem mais curte microfone aberto?', 60 * 20],
    ['centro', 'caio.rola', 'Dica de quem vive no centro: dá pra fazer Pinacoteca → Sala São Paulo a pé e ainda sobra tempo pra um café.', 60 * 9],
    ['jazz', 'bia_cultura', 'Alguém topa a Noite de Jazz na sexta? Tô sem companhia 🎷', 60 * 5],
    ['jazz-r1', 'theo_noturno', 'Eu vou! Marca o ponto de encontro.', 60 * 4, 'jazz'],
    ['jazz-r2', 'luna_sp', 'Também entro. Levo a canga!', 45, 'jazz'],
    ['zine', 'mari_zines', 'Preparando minha banca pra feira de zines. Nervosa e animada ao mesmo tempo ✂️', 60 * 2],
    ['baile', 'theo_noturno', 'O Baile Pop Chiclete promete. Quem vai de rosa?', 25],
  ];

  const LIKES = {
    boasvindas: ['luna_sp', 'caio.rola', 'bia_cultura', 'mari_zines'],
    sarau: ['caio.rola', 'bia_cultura'],
    centro: ['luna_sp', 'theo_noturno', 'mari_zines'],
    jazz: ['theo_noturno'],
    'jazz-r1': ['bia_cultura'],
    zine: ['luna_sp', 'caio.rola', 'bia_cultura', 'theo_noturno'],
    baile: ['bia_cultura', 'mari_zines'],
  };

  tx(db, () => {
    const insUser = db.prepare(
      `INSERT INTO users (username, email, password_hash, display_name, bio, avatar, avatar_color, is_demo, created_at)
       VALUES (?, ?, '!', ?, ?, ?, ?, 1, ?)`,
    );
    const userId = {};
    for (const u of DEMO_USERS) {
      // ".invalid" é um domínio reservado: nenhum e-mail real jamais chega lá.
      const res = insUser.run(u.username, `${u.username}@demo.bubblegun.invalid`, u.name, u.bio, u.avatar, u.color, now - 30 * DAY);
      userId[u.username] = Number(res.lastInsertRowid);
    }

    const insEvent = db.prepare(
      `INSERT INTO events (title, category, description, venue, address, neighborhood, starts_at, ends_at,
                           price_cents, price_note, age_rating, emoji, color, tags, featured, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const insLink = db.prepare('INSERT INTO event_links (event_id, label, url) VALUES (?, ?, ?)');
    const eventId = {};
    for (const e of EVENTS) {
      const res = insEvent.run(
        e.title, e.category, e.description, e.venue, e.address, e.neighborhood, e.starts, e.ends,
        e.price, e.priceNote, e.age, e.emoji, e.color, e.tags, e.featured,
      );
      eventId[e.key] = Number(res.lastInsertRowid);
      for (const [label, url] of e.links) insLink.run(eventId[e.key], label, url);
    }

    const insReview = db.prepare(
      'INSERT INTO reviews (event_id, user_id, rating, comment, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );
    for (const [ev, user, rating, comment, daysAgo] of REVIEWS) {
      const t = now - daysAgo * DAY;
      insReview.run(eventId[ev], userId[user], rating, comment, t, t);
    }

    const insPost = db.prepare('INSERT INTO posts (user_id, parent_id, body, created_at) VALUES (?, ?, ?, ?)');
    const insLike = db.prepare('INSERT INTO post_likes (user_id, post_id, created_at) VALUES (?, ?, ?)');
    const postId = {};
    for (const [key, user, body, minutesAgo, parent] of POSTS) {
      const res = insPost.run(userId[user], parent ? postId[parent] : null, body, now - minutesAgo * 60_000);
      postId[key] = Number(res.lastInsertRowid);
    }
    for (const [key, users] of Object.entries(LIKES)) {
      for (const u of users) insLike.run(userId[u], postId[key], now);
    }

    db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', ?)").run(String(now));
  });
}
