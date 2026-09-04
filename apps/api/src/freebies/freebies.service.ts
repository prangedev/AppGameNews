import { Injectable } from '@nestjs/common';
import type { FreebieDTO } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { toFreebie } from '../catalog/mappers.js';

@Injectable()
export class FreebiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Freebies ativos ou que começam em breve. Já filtrados pela allowlist de URL. */
  async list(params: { includeUpcoming?: boolean; platform?: string }): Promise<FreebieDTO[]> {
    const now = new Date();
    const rows = await this.prisma.freebie.findMany({
      where: {
        ...(params.platform ? { platform: params.platform } : {}),
        AND: [
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
          ...(params.includeUpcoming
            ? []
            : [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }]),
        ],
      },
      orderBy: [{ endsAt: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows
      .map(toFreebie)
      .filter((f): f is FreebieDTO => f !== null);
  }
}
