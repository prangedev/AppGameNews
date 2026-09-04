import { Injectable, Logger } from '@nestjs/common';
import type { WishlistTrigger } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NotificationsService } from './notifications.service.js';
import { bestPrice } from '../catalog/mappers.js';

/**
 * Avalia as regras da wishlist para um conjunto de jogos que acabaram de ser
 * atualizados pela ingestão, e cria notificações quando um gatilho dispara.
 */
@Injectable()
export class RuleEvaluatorService {
  private readonly logger = new Logger(RuleEvaluatorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async evaluateGames(
    gameIds: string[],
    reason: 'price' | 'freebie' | 'release' | 'dlc' | 'update',
  ): Promise<void> {
    if (gameIds.length === 0) return;
    const items = await this.prisma.wishlistItem.findMany({
      where: { gameId: { in: gameIds } },
      include: {
        game: {
          include: {
            pricePoints: { orderBy: { capturedAt: 'desc' }, take: 40 },
            lowestPrices: true,
            freebies: true,
          },
        },
      },
    });

    for (const item of items) {
      const triggers = item.triggers as WishlistTrigger[];
      const game = item.game;

      try {
        if (reason === 'price' && (triggers.includes('any_drop') || triggers.includes('target'))) {
          const best = bestPrice(game.pricePoints);
          if (best) {
            const lowestEver = game.lowestPrices
              .filter((l) => l.currency === best.price.currency)
              .reduce<number | null>((min, l) => (min == null ? l.amountCents : Math.min(min, l.amountCents)), null);

            const hitTarget =
              triggers.includes('target') &&
              item.targetPriceCents != null &&
              best.price.currency === item.currency &&
              best.price.amountCents <= item.targetPriceCents;

            const isNewLow =
              triggers.includes('any_drop') &&
              lowestEver != null &&
              best.price.amountCents <= lowestEver;

            if (hitTarget || isNewLow) {
              await this.notifications.create({
                userId: item.userId,
                type: hitTarget ? 'target_hit' : 'price_drop',
                gameId: game.id,
                title: hitTarget ? `Preço-alvo atingido: ${game.title}` : `Novo menor preço: ${game.title}`,
                body: `Agora por ${formatMoney(best.price.amountCents, best.price.currency)} (${best.discountPct}% off).`,
                data: { gameId: game.id, slug: game.slug, kind: 'price' },
                dedupeKey: `price:${game.id}:${best.price.amountCents}:${best.price.currency}`,
              });
            }
          }
        }

        if (reason === 'freebie' && triggers.includes('free')) {
          const activeFree = game.freebies.find(
            (f) => f.kind !== 'trial' && (!f.endsAt || f.endsAt.getTime() > Date.now()),
          );
          if (activeFree) {
            await this.notifications.create({
              userId: item.userId,
              type: 'free_game',
              gameId: game.id,
              title: `Grátis agora: ${game.title}`,
              body: `Resgate na ${activeFree.store}${activeFree.endsAt ? ` até ${activeFree.endsAt.toLocaleDateString('pt-BR')}` : ''}.`,
              data: { gameId: game.id, slug: game.slug, kind: 'free' },
              dedupeKey: `free:${game.id}:${activeFree.id}`,
            });
          }
        }

        if (reason === 'release' && triggers.includes('release')) {
          await this.notifications.create({
            userId: item.userId,
            type: 'release',
            gameId: game.id,
            title: `Lançou: ${game.title}`,
            body: 'O jogo da sua wishlist foi lançado.',
            data: { gameId: game.id, slug: game.slug, kind: 'release' },
            dedupeKey: `release:${game.id}`,
          });
        }

        if (reason === 'dlc' && triggers.includes('dlc')) {
          await this.notifications.create({
            userId: item.userId,
            type: 'dlc',
            gameId: game.id,
            title: `Nova DLC: ${game.title}`,
            body: 'Saiu conteúdo adicional para um jogo da sua wishlist.',
            data: { gameId: game.id, slug: game.slug, kind: 'dlc' },
            dedupeKey: `dlc:${game.id}:${Date.now() / 86_400_000 | 0}`,
          });
        }

        if (reason === 'update' && triggers.includes('update')) {
          await this.notifications.create({
            userId: item.userId,
            type: 'update',
            gameId: game.id,
            title: `Atualização: ${game.title}`,
            body: 'Um jogo da sua wishlist recebeu um patch.',
            data: { gameId: game.id, slug: game.slug, kind: 'update' },
            dedupeKey: `update:${game.id}:${Date.now() / 86_400_000 | 0}`,
          });
        }
      } catch (err) {
        this.logger.error(
          `falha ao avaliar regra (user=${item.userId} game=${game.id}): ${(err as Error).message}`,
        );
      }
    }
  }
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}
