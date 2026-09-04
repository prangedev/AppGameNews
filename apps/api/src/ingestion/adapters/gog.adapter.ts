import { Injectable, Logger } from '@nestjs/common';
import { HttpClient } from '../http-client.js';
import type {
  AdapterResult,
  NormalizedGame,
  NormalizedPrice,
  SourceAdapter,
} from './adapter.types.js';

/**
 * GOG não tem API pública documentada. Usamos o endpoint interno de catálogo
 * (best-effort). Se o formato mudar, o adapter falha silenciosamente e a
 * saúde da fonte reflete isso — sem quebrar a ingestão.
 */
interface GogCatalog {
  products?: {
    id: number | string;
    title: string;
    coverHorizontal?: string;
    price?: { finalMoney?: { amount?: string; currency?: string }; baseMoney?: { amount?: string }; discount?: string };
    storeLink?: string;
  }[];
}

@Injectable()
export class GogAdapter implements SourceAdapter {
  readonly source = 'gog' as const;
  private readonly logger = new Logger(GogAdapter.name);
  private readonly http = new HttpClient();

  isEnabled(): boolean {
    return true;
  }

  async run(): Promise<AdapterResult> {
    const games = new Map<string, NormalizedGame>();
    const prices: NormalizedPrice[] = [];

    try {
      const body = await this.http.getJson<GogCatalog>(
        'https://catalog.gog.com/v1/catalog?limit=48&order=desc:discount&discounted=eq:true&countryCode=BR&locale=pt-BR&currencyCode=BRL',
        { conditionalKey: 'gog:catalog', timeoutMs: 10_000 },
      );
      for (const p of body.products ?? []) {
        const sourceId = `gog:${p.id}`;
        games.set(sourceId, {
          source: 'gog',
          sourceId,
          title: p.title,
          coverUrl: p.coverHorizontal ?? null,
        });
        const finalAmt = Number(p.price?.finalMoney?.amount);
        const baseAmt = Number(p.price?.baseMoney?.amount);
        if (Number.isFinite(finalAmt) && finalAmt > 0) {
          prices.push({
            source: 'gog',
            sourceId,
            store: 'gog',
            currency: (p.price?.finalMoney?.currency ?? 'BRL').toUpperCase(),
            amountCents: Math.round(finalAmt * 100),
            regularCents: Math.round((Number.isFinite(baseAmt) ? baseAmt : finalAmt) * 100),
            discountPct: Number(p.price?.discount?.replace(/[^0-9]/g, '')) || 0,
            url: p.storeLink && p.storeLink.startsWith('https://www.gog.com/') ? p.storeLink : null,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`GOG best-effort falhou: ${(err as Error).message}`);
    }

    return { games: [...games.values()], prices };
  }
}
