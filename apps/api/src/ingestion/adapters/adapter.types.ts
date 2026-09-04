import type { DataSource, FreebieKind, Platform, ReleaseType, Store } from '@appgamenews/shared';

/** Registro canônico produzido por um adapter, pronto para upsert. */
export interface NormalizedGame {
  source: DataSource;
  sourceId: string;
  title: string;
  coverUrl?: string | null;
  description?: string | null;
  developer?: string | null;
  publisher?: string | null;
  tags?: string[];
  metacritic?: number | null;
}

export interface NormalizedPrice {
  source: DataSource;
  sourceId: string; // id do jogo na fonte, para casar com NormalizedGame
  store: Store;
  currency: string;
  amountCents: number;
  regularCents: number;
  discountPct: number;
  url?: string | null;
}

export interface NormalizedRelease {
  source: DataSource;
  sourceId: string;
  platform: Platform;
  region?: string | null;
  releaseDate?: string | null; // ISO
  type: ReleaseType;
  name?: string | null;
  version?: string | null;
}

export interface NormalizedFreebie {
  source: DataSource;
  title: string;
  store: Store;
  platform: Platform;
  kind: FreebieKind;
  startsAt?: string | null;
  endsAt?: string | null;
  claimUrl: string;
  coverUrl?: string | null;
}

export interface NormalizedNews {
  source: DataSource;
  externalId: string;
  gameSourceId?: string | null;
  title: string;
  url: string;
  publishedAt: string;
  summary?: string | null;
}

export interface AdapterResult {
  games?: NormalizedGame[];
  prices?: NormalizedPrice[];
  releases?: NormalizedRelease[];
  freebies?: NormalizedFreebie[];
  news?: NormalizedNews[];
}

/**
 * Contexto opcional passado a cada execução de adapter. Deve ser um parâmetro
 * (nunca estado mutável guardado no provider, que é singleton) — evita
 * corrida de dados se uma re-sincronização manual sobrepor a agendada.
 */
export interface AdapterRunContext {
  /** appids da Steam sob acompanhamento (na wishlist de alguém), para buscar notícias. */
  steamWishlistedAppIds?: number[];
}

export interface SourceAdapter {
  readonly source: DataSource;
  /** true se o adapter tem tudo o que precisa (chave de API etc.). */
  isEnabled(): boolean;
  run(ctx?: AdapterRunContext): Promise<AdapterResult>;
}
