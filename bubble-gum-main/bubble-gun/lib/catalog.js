// Listas fixas usadas pelo servidor, pela seed e (via API) pelo app.

export const CATEGORIES = [
  { name: 'Música', emoji: '🎷', color: 'pink' },
  { name: 'Teatro', emoji: '🎭', color: 'lilac' },
  { name: 'Exposição', emoji: '🖼️', color: 'blue' },
  { name: 'Cinema', emoji: '🍿', color: 'lemon' },
  { name: 'Festa', emoji: '🪩', color: 'peach' },
  { name: 'Literatura', emoji: '📚', color: 'mint' },
  { name: 'Oficina', emoji: '🏺', color: 'peach' },
  { name: 'Passeio', emoji: '🚶', color: 'mint' },
  { name: 'Feira', emoji: '🛍️', color: 'lemon' },
];

export const AVATARS = ['🫧', '🎈', '🍬', '🍭', '🧁', '🦄', '🌸', '🎧', '🎨', '📚', '🎭', '🪩', '🍓', '🐙', '🌈', '⭐'];

export const AVATAR_COLORS = ['pink', 'blue', 'mint', 'lemon', 'lilac', 'peach'];

// Nomes que ninguém pode registrar.
export const RESERVED_USERNAMES = ['admin', 'administrador', 'bubblegun', 'bubble_gun', 'suporte', 'support', 'root', 'moderacao'];
