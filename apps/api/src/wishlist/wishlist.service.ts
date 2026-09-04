import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { WishlistAddDTO } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { toSummary } from '../catalog/mappers.js';

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    const items = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        game: {
          include: {
            releases: true,
            freebies: true,
            pricePoints: { orderBy: { capturedAt: 'desc' }, take: 30 },
          },
        },
      },
    });
    return items.map((it) => ({
      id: it.id,
      targetPriceCents: it.targetPriceCents,
      currency: it.currency,
      triggers: it.triggers,
      createdAt: it.createdAt.toISOString(),
      game: toSummary(it.game),
    }));
  }

  async add(userId: string, dto: WishlistAddDTO) {
    const game = await this.prisma.game.findUnique({ where: { id: dto.gameId } });
    if (!game) throw new NotFoundException('Jogo não encontrado.');

    return this.prisma.wishlistItem.upsert({
      where: { userId_gameId: { userId, gameId: dto.gameId } },
      create: {
        userId,
        gameId: dto.gameId,
        targetPriceCents: dto.targetPriceCents ?? null,
        currency: dto.currency,
        triggers: dto.triggers,
      },
      update: {
        targetPriceCents: dto.targetPriceCents ?? null,
        currency: dto.currency,
        triggers: dto.triggers,
      },
    });
  }

  /** Atualiza um item garantindo que ele pertence ao usuário (anti-IDOR). */
  async update(
    userId: string,
    itemId: string,
    patch: Partial<Omit<WishlistAddDTO, 'gameId'>>,
  ) {
    await this.assertOwnership(userId, itemId);
    return this.prisma.wishlistItem.update({
      where: { id: itemId },
      data: {
        ...(patch.targetPriceCents !== undefined
          ? { targetPriceCents: patch.targetPriceCents ?? null }
          : {}),
        ...(patch.currency ? { currency: patch.currency } : {}),
        ...(patch.triggers ? { triggers: patch.triggers } : {}),
      },
    });
  }

  async remove(userId: string, itemId: string): Promise<void> {
    await this.assertOwnership(userId, itemId);
    await this.prisma.wishlistItem.delete({ where: { id: itemId } });
  }

  private async assertOwnership(userId: string, itemId: string): Promise<void> {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { id: itemId },
      select: { userId: true },
    });
    if (!item) throw new NotFoundException('Item não encontrado.');
    if (item.userId !== userId) throw new ForbiddenException('Acesso negado.');
  }
}
