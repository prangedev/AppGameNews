import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { loadConfig } from './config/configuration.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { IngestionWorkerModule } from './ingestion/ingestion-worker.module.js';
import { NotificationsWorkerModule } from './notifications/notifications-worker.module.js';

/**
 * Processo separado (`node dist/worker.js`): consome as filas BullMQ
 * (ingestão + notificações). Não expõe HTTP, não registra guards de rota.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [loadConfig] }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    QueueModule,
    IngestionWorkerModule,
    NotificationsWorkerModule,
  ],
})
export class WorkerModule {}
