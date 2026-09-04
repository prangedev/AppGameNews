import { Injectable } from '@nestjs/common';
import type { DataSource } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';

@Injectable()
export class SourceHealthService {
  constructor(private readonly prisma: PrismaService) {}

  async recordSuccess(source: DataSource, itemsProcessed: number): Promise<void> {
    const now = new Date();
    await this.prisma.sourceHealth.upsert({
      where: { source },
      create: { source, lastRunAt: now, lastSuccessAt: now, itemsLastRun: itemsProcessed },
      update: { lastRunAt: now, lastSuccessAt: now, itemsLastRun: itemsProcessed, lastError: null },
    });
  }

  async recordFailure(source: DataSource, error: string): Promise<void> {
    const now = new Date();
    await this.prisma.sourceHealth.upsert({
      where: { source },
      create: { source, lastRunAt: now, lastError: error.slice(0, 500) },
      update: { lastRunAt: now, lastError: error.slice(0, 500) },
    });
  }

  list() {
    return this.prisma.sourceHealth.findMany({ orderBy: { source: 'asc' } });
  }
}
