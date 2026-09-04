import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Store } from '@appgamenews/shared';
import type { Env } from '../../config/env.schema.js';
import { HttpClient } from '../http-client.js';
import type {
  AdapterResult,
  NormalizedGame,
  NormalizedPrice,
  NormalizedRelease,
  SourceAdapter,
} from './adapter.types.js';

/** storeID da CheapShark -> nossa Store. */
const STORE_MAP: Record<string, Store> = {
  '1': 'steam',
  '7': 'gog',
  '8': 'ea', // Origin
  '11': 'humble',
  '13': 'ubisoft', // Uplay
  '15': 'fanatical',
  '24': 'greenmangaming',
  '25': 'epic',
};

interface CheapSharkDeal {
  title: string;
  dealID: string;
  storeID: string;
  gameID: string;
  salePrice: string;
  normalPrice: string;
  savings: string;
  steamAppID: string | null;
  thumb: string;
  metacriticScore: string;
}

@Injectable()
export class CheapSharkAdapter implements SourceAdapter {
  readonly source = 'cheapshark' as const;
  private readonly http = new HttpClient();
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.baseUrl = config.get('CHEAPSHARK_BASE_URL', { infer: true });
  }

  isEnabled(): boolean {
    return true; // não exige chave
  }

  async run(): Promise<AdapterResult> {
    const games = new Map<string, NormalizedGame>();
    const prices: NormalizedPrice[] = [];
    const releases: NormalizedRelease[] = [];

    // páginas de deals ordenadas por maior desconto (limita a 3 páginas = 180 itens)
    for (let page = 0; page < 3; page++) {
      const url = `${this.baseUrl}/deals?pageSize=60&pageNumber=${page}&sortBy=Savings&onSale=1`;
      const deals = await this.http.getJson<CheapSharkDeal[]>(url, {
        conditionalKey: `cheapshark:deals:${page}`,
      });
      if (!Array.isArray(deals) || deals.length === 0) break;

      for (const d of deals) {
        const store = STORE_MAP[d.storeID];
        if (!store) continue;
        const sourceId = `cs:${d.gameID}`;

        if (!games.has(sourceId)) {
          games.set(sourceId, {
            source: 'cheapshark',
            sourceId,
            title: d.title,
            coverUrl: d.thumb || null,
            metacritic: Number(d.metacriticScore) || null,
          });
        }

        prices.push({
          source: 'cheapshark',
          sourceId,
          store,
          currency: 'USD',
          amountCents: toCents(d.salePrice),
          regularCents: toCents(d.normalPrice),
          discountPct: Math.round(Number(d.savings) || 0),
          url:
            store === 'steam' && d.steamAppID
              ? `https://store.steampowered.com/app/${d.steamAppID}`
              : null,
        });

        if (store === 'steam' && d.steamAppID) {
          releases.push({
            source: 'cheapshark',
            sourceId,
            platform: 'pc',
            type: 'base',
            name: d.title,
          });
        }
      }
    }

    return { games: [...games.values()], prices, releases };
  }
}

function toCents(dollars: string): number {
  return Math.round((Number(dollars) || 0) * 100);
}
