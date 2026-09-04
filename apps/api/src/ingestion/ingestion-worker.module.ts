import { Module } from '@nestjs/common';
import { IngestionModule } from './ingestion.module.js';
import { IngestionProcessor } from './ingestion.processor.js';
import { IngestionScheduler } from './ingestion.scheduler.js';

/** Só é importado pelo WorkerModule (processo separado). */
@Module({
  imports: [IngestionModule],
  providers: [IngestionProcessor, IngestionScheduler],
})
export class IngestionWorkerModule {}
