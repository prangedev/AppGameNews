import type { Platform } from './platform.js';
import type { Store } from './store.js';

/** Fontes de dados externas (para dedup e `source_health`). */
export const DATA_SOURCES = [
  'cheapshark',
  'itad',
  'rawg',
  'steam',
  'epic',
  'gog',
  'prime',
  'seed',
  'manual',
] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export type ReleaseType = 'base' | 'dlc' | 'update';
export const RELEASE_TYPES: ReleaseType[] = ['base', 'dlc', 'update'];

export type FreebieKind = 'keep' | 'trial' | 'prime';
export const FREEBIE_KINDS: FreebieKind[] = ['keep', 'trial', 'prime'];

/** Gatilhos de notificação por item da wishlist. */
export const WISHLIST_TRIGGERS = [
  'any_drop', // qualquer queda de preço
  'target', // preço <= target_price
  'free', // ficou grátis
  'release', // lançou
  'dlc', // nova DLC
  'update', // novo patch/atualização
] as const;
export type WishlistTrigger = (typeof WISHLIST_TRIGGERS)[number];

export const NOTIFICATION_TYPES = [
  'price_drop',
  'target_hit',
  'free_game',
  'release',
  'dlc',
  'update',
  'digest',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CHANNELS = ['push', 'in_app', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export type AuthProvider = 'local' | 'google' | 'steam' | 'epic';
export const AUTH_PROVIDERS: AuthProvider[] = ['local', 'google', 'steam', 'epic'];

/** Preço normalizado, sempre em centavos inteiros para evitar float. */
export interface Money {
  currency: string; // ISO 4217, ex.: "BRL", "USD"
  amountCents: number;
}

export interface PricePointDTO {
  store: Store;
  price: Money;
  regularPrice: Money;
  discountPct: number;
  url: string | null;
  capturedAt: string; // ISO
}

export interface LowestPriceDTO {
  store: Store;
  price: Money;
  at: string; // ISO
}

export interface GameSummaryDTO {
  id: string;
  slug: string;
  title: string;
  coverUrl: string | null;
  platforms: Platform[];
  bestPrice: PricePointDTO | null;
  isFreeNow: boolean;
}

export interface GameDetailDTO extends GameSummaryDTO {
  description: string | null;
  developer: string | null;
  publisher: string | null;
  tags: string[];
  metacritic: number | null;
  prices: PricePointDTO[];
  lowest: LowestPriceDTO[];
  releases: GameReleaseDTO[];
  freebies: FreebieDTO[];
  news: NewsItemDTO[];
}

export interface GameReleaseDTO {
  platform: Platform;
  region: string | null;
  releaseDate: string | null; // ISO date
  type: ReleaseType;
  name: string | null;
  version: string | null;
}

export interface FreebieDTO {
  gameId: string | null;
  title: string;
  store: Store;
  platform: Platform;
  kind: FreebieKind;
  startsAt: string | null;
  endsAt: string | null;
  claimUrl: string; // já validado contra a allowlist
  coverUrl: string | null;
}

export interface NewsItemDTO {
  id: string;
  source: DataSource;
  title: string;
  url: string;
  publishedAt: string;
  summary: string | null;
}
