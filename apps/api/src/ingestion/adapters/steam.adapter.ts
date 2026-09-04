import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { HttpClient } from '../http-client.js';
import type {
  AdapterResult,
  AdapterRunContext,
  NormalizedGame,
  NormalizedNews,
  NormalizedPrice,
  NormalizedRelease,
  SourceAdapter,
} from './adapter.types.js';

interface FeaturedItem {
  id: number;
  name: string;
  discounted?: boolean;
  discount_percent?: number;
  original_price?: number | null;
  final_price?: number | null;
  currency?: string;
  header_image?: string;
}

interface FeaturedCategoriesResponse {
  specials?: { items?: FeaturedItem[] };
  coming_soon?: { items?: FeaturedItem[] };
  new_releases?: { items?: FeaturedItem[] };
  top_sellers?: { items?: FeaturedItem[] };
}

interface SteamNewsResponse {
  appnews?: {
    newsitems?: {
      gid: string;
      title: string;
      url: string;
      contents: string;
      date: number; // epoch seconds
      feed_type: number;
    }[];
  };
}

@Injectable()
export class SteamAdapter implements SourceAdapter {
  readonly source = 'steam' as const;
  private readonly http = new HttpClient();
  private readonly storefront: string;

  constructor(config: ConfigService<Env, true>) {
    this.storefront = config.get('STEAM_STOREFRONT_BASE_URL', { infer: true });
  }

  isEnabled(): boolean {
    return true;
  }

  async run(ctx?: AdapterRunContext): Promise<AdapterResult> {
    const games = new Map<string, NormalizedGame>();
    const prices: NormalizedPrice[] = [];
    const releases: NormalizedRelease[] = [];
    const news: NormalizedNews[] = [];

    const cats = await this.http.getJson<FeaturedCategoriesResponse>(
      `${this.storefront}/featuredcategories?cc=br&l=portuguese`,
      { conditionalKey: 'steam:featuredcategories' },
    );

    const ingest = (items: FeaturedItem[] | undefined, kind: 'sale' | 'new' | 'soon'): void => {
      for (const it of items ?? []) {
        if (!it.id || !it.name) continue;
        const sourceId = `steam:${it.id}`;
        if (!games.has(sourceId)) {
          games.set(sourceId, {
            source: 'steam',
            sourceId,
            title: it.name,
            coverUrl: it.header_image ?? null,
          });
        }
        if (it.final_price != null && it.original_price != null) {
          prices.push({
            source: 'steam',
            sourceId,
            store: 'steam',
            currency: (it.currency ?? 'BRL').toUpperCase(),
            amountCents: it.final_price,
            regularCents: it.original_price,
            discountPct: it.discount_percent ?? 0,
            url: `https://store.steampowered.com/app/${it.id}`,
          });
        }
        if (kind !== 'sale') {
          releases.push({
            source: 'steam',
            sourceId,
            platform: 'pc',
            type: 'base',
            name: it.name,
            releaseDate: kind === 'new' ? new Date().toISOString() : null,
          });
        }
      }
    };

    ingest(cats.specials?.items, 'sale');
    ingest(cats.new_releases?.items, 'new');
    ingest(cats.coming_soon?.items, 'soon');
    ingest(cats.top_sellers?.items, 'sale');

    // notícias/patches para os appids sob acompanhamento (recebidos por parâmetro,
    // nunca guardados em campo da instância — o provider é singleton e pode ser
    // chamado concorrentemente por um re-sync manual + o agendamento).
    const wishlistedAppIds = ctx?.steamWishlistedAppIds ?? [];
    for (const appid of wishlistedAppIds.slice(0, 40)) {
      try {
        const res = await this.http.getJson<SteamNewsResponse>(
          `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${appid}&count=5&maxlength=300&format=json`,
        );
        for (const n of res.appnews?.newsitems ?? []) {
          news.push({
            source: 'steam',
            externalId: `steam-news:${n.gid}`,
            gameSourceId: `steam:${appid}`,
            title: n.title,
            url: n.url,
            publishedAt: new Date(n.date * 1000).toISOString(),
            summary: n.contents?.replace(/<[^>]+>/g, '').slice(0, 280) || null,
          });
        }
      } catch {
        /* ignora falha por app individual */
      }
      // pequeno intervalo entre chamadas — evita martelar o endpoint público da Steam
      await sleep(150);
    }

    return { games: [...games.values()], prices, releases, news };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
