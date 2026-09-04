import { Injectable, NotFoundException } from '@nestjs/common';
import type { Store } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { toLowest, toPricePoint } from '../catalog/mappers.js';

export interface PriceHistoryResponse {
  gameId: string;
  currency: string;
  current: ReturnType<typeof toPricePoint>[];
  lowest: ReturnType<typeof toLowest>[];
  history: {
    store: Store;
    points: { at: string; amountCents: number; discountPct: number }[];
  }[];
}

@Injectable()
export class PricesService {
  constructor(private readonly prisma: PrismaService) {}

  async history(gameId: string, currency = 'BRL', days = 365): Promise<PriceHistoryResponse> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game) throw new NotFoundException('Jogo não encontrado.');

    const since = new Date(Date.now() - days * 864e5);
    const [points, lowest] = await this.prisma.$transaction([
      this.prisma.pricePoint.findMany({
        where: { gameId, currency, capturedAt: { gte: since } },
        orderBy: { capturedAt: 'asc' },
      }),
      this.prisma.priceLowest.findMany({ where: { gameId, currency } }),
    ]);

    const byStore = new Map<string, typeof points>();
    for (const p of points) {
      const arr = byStore.get(p.store) ?? [];
      arr.push(p);
      byStore.set(p.store, arr);
    }

    const latestByStore = new Map<string, (typeof points)[number]>();
    for (const p of points) {
      const cur = latestByStore.get(p.store);
      if (!cur || p.capturedAt > cur.capturedAt) latestByStore.set(p.store, p);
    }

    return {
      gameId,
      currency,
      current: [...latestByStore.values()]
        .sort((a, b) => a.amountCents - b.amountCents)
        .map(toPricePoint),
      lowest: lowest.map(toLowest),
      history: [...byStore.entries()].map(([store, pts]) => ({
        store: store as Store,
        points: pts.map((p) => ({
          at: p.capturedAt.toISOString(),
          amountCents: p.amountCents,
          discountPct: p.discountPct,
        })),
      })),
    };
  }

  /**
   * Recalcula o menor preço histórico por (game, store, currency). Chamado pela
   * ingestão após inserir novos price points.
   */
  async recomputeLowest(gameId: string): Promise<void> {
    const grouped = await this.prisma.pricePoint.groupBy({
      by: ['store', 'currency'],
      where: { gameId },
      _min: { amountCents: true },
    });
    for (const g of grouped) {
      if (g._min.amountCents == null) continue;
      const cheapest = await this.prisma.pricePoint.findFirst({
        where: { gameId, store: g.store, currency: g.currency, amountCents: g._min.amountCents },
        orderBy: { capturedAt: 'asc' },
      });
      if (!cheapest) continue;
      await this.prisma.priceLowest.upsert({
        where: {
          gameId_store_currency: { gameId, store: g.store, currency: g.currency },
        },
        create: {
          gameId,
          store: g.store,
          currency: g.currency,
          amountCents: cheapest.amountCents,
          at: cheapest.capturedAt,
        },
        update: { amountCents: cheapest.amountCents, at: cheapest.capturedAt },
      });
    }
  }
}
