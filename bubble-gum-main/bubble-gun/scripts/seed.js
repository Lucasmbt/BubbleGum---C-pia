// Uso:
//   npm run seed          -> cria o conteúdo de exemplo se o banco ainda não tiver sido populado
//   npm run reset-demo    -> apaga o conteúdo de exemplo e recria com datas a partir de hoje
//                            (avaliações/respostas de pessoas reais nesses eventos e posts também somem)
import { openDb } from '../lib/db.js';
import { seedIfNeeded, resetDemo } from '../lib/seed.js';

const db = openDb();
if (process.argv.includes('--reset-demo')) {
  resetDemo(db);
  console.log('Conteúdo de exemplo recriado com datas a partir de hoje.');
} else {
  console.log(seedIfNeeded(db) ? 'Conteúdo de exemplo criado.' : 'O banco já foi populado antes. Use --reset-demo para recriar.');
}
db.close();
