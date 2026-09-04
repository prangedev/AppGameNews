/** Lojas digitais rastreadas. */
export const STORES = [
  'steam',
  'epic',
  'gog',
  'ea',
  'ubisoft',
  'amazon_prime',
  'google_play',
  'microsoft',
  'xbox',
  'psn',
  'nintendo',
  'humble',
  'fanatical',
  'greenmangaming',
  'other',
] as const;

export type Store = (typeof STORES)[number];

export const STORE_LABELS: Record<Store, string> = {
  steam: 'Steam',
  epic: 'Epic Games Store',
  gog: 'GOG',
  ea: 'EA App',
  ubisoft: 'Ubisoft Store',
  amazon_prime: 'Prime Gaming',
  google_play: 'Google Play',
  microsoft: 'Microsoft Store',
  xbox: 'Xbox Store',
  psn: 'PlayStation Store',
  nintendo: 'Nintendo eShop',
  humble: 'Humble Store',
  fanatical: 'Fanatical',
  greenmangaming: 'Green Man Gaming',
  other: 'Outra',
};

/**
 * Allowlist de domínios por loja. Usada para validar `claim_url` de freebies e
 * links de compra antes de exibi-los ao usuário (anti open-redirect / phishing).
 */
export const STORE_DOMAIN_ALLOWLIST: Record<Store, string[]> = {
  steam: ['store.steampowered.com', 'steampowered.com', 'steamcommunity.com'],
  epic: ['store.epicgames.com', 'epicgames.com', 'www.epicgames.com'],
  gog: ['gog.com', 'www.gog.com'],
  ea: ['ea.com', 'www.ea.com', 'origin.com'],
  ubisoft: ['store.ubisoft.com', 'ubisoft.com'],
  amazon_prime: ['gaming.amazon.com', 'amazon.com'],
  google_play: ['play.google.com'],
  microsoft: ['microsoft.com', 'apps.microsoft.com'],
  xbox: ['xbox.com', 'www.xbox.com'],
  psn: ['store.playstation.com', 'playstation.com'],
  nintendo: ['nintendo.com', 'www.nintendo.com', 'ec.nintendo.com'],
  humble: ['humblebundle.com', 'www.humblebundle.com'],
  fanatical: ['fanatical.com', 'www.fanatical.com'],
  greenmangaming: ['greenmangaming.com', 'www.greenmangaming.com'],
  other: [],
};

export function isStore(value: unknown): value is Store {
  return typeof value === 'string' && (STORES as readonly string[]).includes(value);
}

/**
 * Retorna a Store cujo allowlist contém o host da URL, ou null.
 * Aceita subdomínios (ex.: `checkout.store.steampowered.com`).
 */
export function matchStoreByUrl(rawUrl: string): Store | null {
  let host: string;
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const store of STORES) {
    for (const domain of STORE_DOMAIN_ALLOWLIST[store]) {
      if (host === domain || host.endsWith(`.${domain}`)) return store;
    }
  }
  return null;
}

/** true se a URL aponta para um domínio de loja conhecido e usa https. */
export function isAllowedStoreUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
  } catch {
    return false;
  }
  return matchStoreByUrl(rawUrl) !== null;
}
