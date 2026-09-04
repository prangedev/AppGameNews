import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { Env } from '../config/env.schema.js';
import { INGEST_QUEUE, type IngestJob } from '../common/queue/queue.constants.js';

interface ScheduleEntry {
  job: IngestJob;
  cronEnvKey: keyof Env;
}

const SCHEDULE: ScheduleEntry[] = [
  { job: 'cheapshark', cronEnvKey: 'INGEST_CHEAPSHARK_CRON' },
  { job: 'epic', cronEnvKey: 'INGEST_EPIC_CRON' },
  { job: 'steam', cronEnvKey: 'INGEST_STEAM_CRON' },
  { job: 'itad', cronEnvKey: 'INGEST_ITAD_CRON' },
  { job: 'rawg', cronEnvKey: 'INGEST_RAWG_CRON' },
  // GOG não tem cron dedicado no .env.example; roda junto com o ciclo do ITAD.
  { job: 'gog', cronEnvKey: 'INGEST_ITAD_CRON' },
];

/**
 * Registra os jobs repetíveis da fila `ingest` no boot do worker. Remove
 * agendamentos anteriores antes de recriar, para não duplicar a cada restart
 * e para refletir mudanças de cron feitas no .env.
 */
@Injectable()
export class IngestionScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(IngestionScheduler.name);

  constructor(
    @Inject(INGEST_QUEUE) private readonly queue: Queue,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('INGEST_ENABLED', { infer: true })) {
      this.logger.warn('ingestão desabilitada (INGEST_ENABLED=false)');
      return;
    }

    const existing = await this.queue.getRepeatableJobs();
    for (const job of existing) {
      await this.queue.removeRepeatableByKey(job.key);
    }

    for (const entry of SCHEDULE) {
      const cron = this.config.get(entry.cronEnvKey, { infer: true }) as string;
      await this.queue.add(
        entry.job,
        {},
        { repeat: { pattern: cron }, jobId: `sched:${entry.job}` },
      );
      this.logger.log(`agendado: ${entry.job} (${cron})`);
    }

    // dispara uma primeira rodada imediata, sem esperar o primeiro cron
    for (const entry of SCHEDULE) {
      await this.queue.add(entry.job, {}, { jobId: `boot:${entry.job}:${Date.now()}` });
    }
  }
}
