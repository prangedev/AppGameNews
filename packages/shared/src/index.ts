export * from './platform.js';
export * from './store.js';
export * from './domain.js';
export * from './dto.js';

/** Utilitário compartilhado: normaliza título para dedup entre fontes. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // diacríticos combinantes
    .replace(/\b(the|a|an|of|edition|deluxe|goty|game of the year)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function slugify(title: string): string {
  return normalizeTitle(title).replace(/\s+/g, '-').slice(0, 80);
}
