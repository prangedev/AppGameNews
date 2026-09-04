import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { releasesQuerySchema } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { toRelease } from '../catalog/mappers.js';

type ReleasesQuery = z.infer<typeof releasesQuerySchema>;

@Injectable()
export class ReleasesService {
  constructor(private readonly prisma: PrismaService) {}

  async calendar(query: ReleasesQuery) {
    const where: Record<string, unknown> = {};
    if (query.platform) where.platform = query.platform;
    if (query.type) where.type = query.type;
    if (query.from || query.to) {
      where.releaseDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    } else {
      // padrão: da última semana em diante
      where.releaseDate = { gte: new Date(Date.now() - 7 * 864e5) };
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.gameRelease.findMany({
        where,
        orderBy: { releaseDate: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { game: { select: { id: true, slug: true, title: true, coverUrl: true } } },
      }),
      this.prisma.gameRelease.count({ where }),
    ]);

    return {
      items: rows.map((r) => ({
        ...toRelease(r),
        game: r.game,
      })),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }
}
