import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Store } from '@appgamenews/shared';
import type { Env } from '../../config/env.schema.js';
import { HttpClient } from '../http-client.js';
import type {
  AdapterResult,
  NormalizedGame,
  NormalizedPrice,
  SourceAdapter,
} from './adapter.types.js';

/** Nomes de loja da ITAD -> nossa Store (parcial; o resto vira "other"). */
const SHOP_MAP: Record<string, Store> = {
  steam: 'steam',
  'epic game store': 'epic',
  'epic games store': 'epic',
  gog: 'gog',
  'ea store': 'ea',
  origin: 'ea',
  ubisoft: 'ubisoft',
  'ubisoft store': 'ubisoft',
  'humble store': 'humble',
  fanatical: 'fanatical',
  'green man gaming': 'greenmangaming',
  'microsoft store': 'microsoft',
};

interface ItadDealsV2 {
  nextOffset?: number;
  hasMore?: boolean;
  list?: {
    id: string;
    slug: string;
    title: string;
    deal?: {
      shop?: { name?: string };
      price?: { amountInt?: number; currency?: string };
      regular?: { amountInt?: number };
      cut?: number;
      url?: string;
    };
  }[];
}

@Injectable()
export class ItadAdapter implements SourceAdapter {
  readonly source = 'itad' as const;
  private readonly http = new HttpClient();
  private readonly key: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.key = config.get('ITAD_API_KEY', { infer: true });
    this.baseUrl = config.get('ITAD_BASE_URL', { infer: true });
  }

  isEnabled(): boolean {
    return this.key.length > 0;
  }

  async run(): Promise<AdapterResult> {
    if (!this.isEnabled()) return {};
    const games = new Map<string, NormalizedGame>();
    const prices: NormalizedPrice[] = [];

    let offset = 0;
    for (let page = 0; page < 3; page++) {
      const url = `${this.baseUrl}/deals/v2?key=${encodeURIComponent(this.key)}&country=BR&offset=${offset}&limit=100&sort=-cut`;
      const body = await this.http.getJson<ItadDealsV2>(url);
      const list = body.list ?? [];
      if (list.length === 0) break;

      for (const item of list) {
        const sourceId = `itad:${item.id}`;
        if (!games.has(sourceId)) {
          games.set(sourceId, { source: 'itad', sourceId, title: item.title });
        }
        const deal = item.deal;
        if (deal?.price?.amountInt != null) {
          const shopName = (deal.shop?.name ?? '').toLowerCase();
          prices.push({
            source: 'itad',
            sourceId,
            store: SHOP_MAP[shopName] ?? 'other',
            currency: (deal.price.currency ?? 'BRL').toUpperCase(),
            amountCents: deal.price.amountInt,
            regularCents: deal.regular?.amountInt ?? deal.price.amountInt,
            discountPct: deal.cut ?? 0,
            url: deal.url ?? null,
          });
        }
      }

      if (!body.hasMore) break;
      offset = body.nextOffset ?? offset + list.length;
    }

    return { games: [...games.values()], prices };
  }
}
