import { Injectable, NotFoundException } from '@nestjs/common';
import type { CatalogQueryDTO, GameDetailDTO, GameSummaryDTO } from '@appgamenews/shared';
import { normalizeTitle } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { toDetail, toSummary } from './mappers.js';

const RECENT_PRICE_WINDOW_DAYS = 120;

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async search(query: CatalogQueryDTO): Promise<{
    items: GameSummaryDTO[];
    page: number;
    pageSize: number;
    total: number;
  }> {
    const where: Record<string, unknown> = {};
    if (query.q) {
      const norm = normalizeTitle(query.q);
      where.OR = [
        { normalized: { contains: norm } },
        { title: { contains: query.q, mode: 'insensitive' } },
      ];
    }
    if (query.platform) {
      where.releases = { some: { platform: query.platform } };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.game.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          releases: true,
          freebies: true,
          pricePoints: {
            where: {
              capturedAt: {
                gte: new Date(Date.now() - RECENT_PRICE_WINDOW_DAYS * 864e5),
              },
            },
            orderBy: { capturedAt: 'desc' },
            take: 40,
          },
        },
      }),
      this.prisma.game.count({ where }),
    ]);

    return {
      items: rows.map(toSummary),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  async getBySlugOrId(idOrSlug: string): Promise<GameDetailDTO> {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      idOrSlug,
    );
    const game = await this.prisma.game.findFirst({
      where: isUuid ? { id: idOrSlug } : { slug: idOrSlug },
      include: {
        releases: { orderBy: { releaseDate: 'asc' } },
        lowestPrices: true,
        freebies: { orderBy: { endsAt: 'desc' } },
        news: { orderBy: { publishedAt: 'desc' }, take: 20 },
        pricePoints: {
          orderBy: { capturedAt: 'desc' },
          take: 200,
        },
      },
    });
    if (!game) throw new NotFoundException('Jogo não encontrado.');
    return toDetail(game);
  }
}
