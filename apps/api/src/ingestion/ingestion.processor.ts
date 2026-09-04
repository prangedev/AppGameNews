import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { DataSource } from '@appgamenews/shared';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { QUEUE_INGEST, NOTIFY_QUEUE, type IngestJob } from '../common/queue/queue.constants.js';
import { IngestionService } from './ingestion.service.js';
import { SourceHealthService } from './source-health.service.js';
import { CheapSharkAdapter } from './adapters/cheapshark.adapter.js';
import { EpicAdapter } from './adapters/epic.adapter.js';
import { SteamAdapter } from './adapters/steam.adapter.js';
import { ItadAdapter } from './adapters/itad.adapter.js';
import { RawgAdapter } from './adapters/rawg.adapter.js';
import { GogAdapter } from './adapters/gog.adapter.js';
import type { SourceAdapter } from './adapters/adapter.types.js';

@Injectable()
export class IngestionProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IngestionProcessor.name);
  private worker?: Worker;
  private readonly adapters: Record<IngestJob, SourceAdapter>;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
    private readonly health: SourceHealthService,
    @Inject(NOTIFY_QUEUE) private readonly notifyQueue: Queue,
    cheapshark: CheapSharkAdapter,
    epic: EpicAdapter,
    steam: SteamAdapter,
    itad: ItadAdapter,
    rawg: RawgAdapter,
    gog: GogAdapter,
  ) {
    this.adapters = { cheapshark, epic, steam, itad, rawg, gog };
  }

  onModuleInit(): void {
    const connection = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker(
      QUEUE_INGEST,
      async (job: Job) => this.run(job.name as IngestJob),
      { connection, concurrency: 2 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`ingest:${job?.name} falhou: ${err.message}`),
    );
    this.logger.log('worker de ingestão ativo');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async run(name: IngestJob): Promise<void> {
    const adapter = this.adapters[name];
    if (!adapter) {
      this.logger.warn(`sem adapter para job "${name}"`);
      return;
    }
    if (!adapter.isEnabled()) {
      this.logger.debug(`adapter "${name}" desabilitado (sem chave configurada) — pulando`);
      return;
    }

    const source: DataSource = adapter.source;
    try {
      const ctx = name === 'steam' ? { steamWishlistedAppIds: await this.steamWishlistedAppIds() } : undefined;
      const result = await adapter.run(ctx);
      const outcome = await this.ingestion.persist(result);
      await this.health.recordSuccess(source, outcome.itemsProcessed);

      await this.enqueueEvaluations(outcome);

      this.logger.log(
        `${source}: ${outcome.itemsProcessed} itens | preço=${outcome.priceGameIds.size} ` +
          `grátis=${outcome.freebieGameIds.size} lançamento=${outcome.releaseGameIds.size} ` +
          `update=${outcome.updateGameIds.size}`,
      );
    } catch (err) {
      const message = (err as Error).message;
      await this.health.recordFailure(source, message);
      throw err; // deixa o BullMQ registrar e aplicar backoff
    }
  }

  private async enqueueEvaluations(outcome: Awaited<ReturnType<IngestionService['persist']>>): Promise<void> {
    const groups: [typeof outcome.priceGameIds, 'price' | 'freebie' | 'release' | 'dlc' | 'update'][] = [
      [outcome.priceGameIds, 'price'],
      [outcome.freebieGameIds, 'freebie'],
      [outcome.releaseGameIds, 'release'],
      [outcome.updateGameIds, 'update'],
    ];
    for (const [set, reason] of groups) {
      if (set.size === 0) continue;
      await this.notifyQueue.add(
        'evaluate',
        { reason, gameIds: [...set] },
        { jobId: `evaluate:${reason}:${Date.now()}` },
      );
    }
  }

  private async steamWishlistedAppIds(): Promise<number[]> {
    const rows = await this.prisma.gameExternalId.findMany({
      where: { source: 'steam', game: { wishlistedBy: { some: {} } } },
      select: { sourceId: true },
      take: 200,
    });
    return rows.map((r) => Number(r.sourceId)).filter((n) => Number.isFinite(n));
  }
}
