import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../common/redis/redis.module.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { Public } from '../common/decorators/public.decorator.js';
import { SourceHealthService } from '../ingestion/source-health.service.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly sourceHealth: SourceHealthService,
  ) {}

  /** Liveness: o processo está de pé. Não toca em dependências externas. */
  @Public()
  @Get('live')
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: DB e Redis respondem. Usado por orquestradores/healthchecks. */
  @Public()
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; db: boolean; redis: boolean }> {
    const [db, redis] = await Promise.all([this.checkDb(), this.checkRedis()]);
    if (!db || !redis) {
      throw new ServiceUnavailableException({ status: 'degraded', db, redis });
    }
    return { status: 'ok', db, redis };
  }

  /** Painel simples de saúde das fontes de dados externas. */
  @Public()
  @Get('sources')
  sources() {
    return this.sourceHealth.list();
  }

  private async checkDb(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
