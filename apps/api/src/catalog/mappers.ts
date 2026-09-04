import type {
  FreebieDTO,
  GameDetailDTO,
  GameReleaseDTO,
  GameSummaryDTO,
  NewsItemDTO,
  PricePointDTO,
  LowestPriceDTO,
  Platform,
  Store,
  DataSource,
  FreebieKind,
  ReleaseType,
} from '@appgamenews/shared';
import { isAllowedStoreUrl } from '@appgamenews/shared';
import type {
  Freebie,
  Game,
  GameRelease,
  NewsItem,
  PriceLowest,
  PricePoint,
} from '@prisma/client';

export function toPricePoint(p: PricePoint): PricePointDTO {
  return {
    store: p.store as Store,
    price: { currency: p.currency, amountCents: p.amountCents },
    regularPrice: { currency: p.currency, amountCents: p.regularCents },
    discountPct: p.discountPct,
    url: p.url && isAllowedStoreUrl(p.url) ? p.url : null,
    capturedAt: p.capturedAt.toISOString(),
  };
}

export function toLowest(l: PriceLowest): LowestPriceDTO {
  return {
    store: l.store as Store,
    price: { currency: l.currency, amountCents: l.amountCents },
    at: l.at.toISOString(),
  };
}

export function toRelease(r: GameRelease): GameReleaseDTO {
  return {
    platform: r.platform as Platform,
    region: r.region,
    releaseDate: r.releaseDate ? r.releaseDate.toISOString() : null,
    type: r.type as ReleaseType,
    name: r.name,
    version: r.version,
  };
}

export function toFreebie(f: Freebie): FreebieDTO | null {
  // descarta freebies cujo link não passa na allowlist de lojas
  if (!isAllowedStoreUrl(f.claimUrl)) return null;
  return {
    gameId: f.gameId,
    title: f.title,
    store: f.store as Store,
    platform: f.platform as Platform,
    kind: f.kind as FreebieKind,
    startsAt: f.startsAt ? f.startsAt.toISOString() : null,
    endsAt: f.endsAt ? f.endsAt.toISOString() : null,
    claimUrl: f.claimUrl,
    coverUrl: f.coverUrl,
  };
}

export function toNews(n: NewsItem): NewsItemDTO {
  return {
    id: n.id,
    source: n.source as DataSource,
    title: n.title,
    url: n.url,
    publishedAt: n.publishedAt.toISOString(),
    summary: n.summary,
  };
}

type GameWithRels = Game & {
  releases?: GameRelease[];
  pricePoints?: PricePoint[];
  lowestPrices?: PriceLowest[];
  freebies?: Freebie[];
  news?: NewsItem[];
};

/** Melhor preço atual = menor amountCents entre os price points mais recentes por loja. */
export function bestPrice(points: PricePoint[]): PricePointDTO | null {
  if (points.length === 0) return null;
  const latestByStore = new Map<string, PricePoint>();
  for (const p of points) {
    const cur = latestByStore.get(p.store);
    if (!cur || p.capturedAt > cur.capturedAt) latestByStore.set(p.store, p);
  }
  const sorted = [...latestByStore.values()].sort((a, b) => a.amountCents - b.amountCents);
  return sorted[0] ? toPricePoint(sorted[0]) : null;
}

export function toSummary(g: GameWithRels): GameSummaryDTO {
  const platforms = uniquePlatforms(g.releases ?? []);
  const isFreeNow = (g.freebies ?? []).some(
    (f) => (!f.endsAt || f.endsAt.getTime() > Date.now()) && f.kind !== 'trial',
  );
  return {
    id: g.id,
    slug: g.slug,
    title: g.title,
    coverUrl: g.coverUrl,
    platforms,
    bestPrice: bestPrice(g.pricePoints ?? []),
    isFreeNow,
  };
}

export function toDetail(g: GameWithRels): GameDetailDTO {
  return {
    ...toSummary(g),
    description: g.description,
    developer: g.developer,
    publisher: g.publisher,
    tags: g.tags,
    metacritic: g.metacritic,
    prices: dedupeLatestByStore(g.pricePoints ?? []).map(toPricePoint),
    lowest: (g.lowestPrices ?? []).map(toLowest),
    releases: (g.releases ?? []).map(toRelease),
    freebies: (g.freebies ?? [])
      .map(toFreebie)
      .filter((f): f is FreebieDTO => f !== null),
    news: (g.news ?? []).map(toNews),
  };
}

function dedupeLatestByStore(points: PricePoint[]): PricePoint[] {
  const map = new Map<string, PricePoint>();
  for (const p of points) {
    const cur = map.get(p.store);
    if (!cur || p.capturedAt > cur.capturedAt) map.set(p.store, p);
  }
  return [...map.values()].sort((a, b) => a.amountCents - b.amountCents);
}

function uniquePlatforms(releases: GameRelease[]): Platform[] {
  return [...new Set(releases.map((r) => r.platform))] as Platform[];
}
