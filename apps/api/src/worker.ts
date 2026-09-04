import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module.js';

/**
 * Entrypoint do processo worker: só consome filas BullMQ (ingestão +
 * notificações), sem servidor HTTP. Rodado via `node dist/worker.js`
 * (ver docker-compose.yml, serviço `worker`).
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('WorkerBootstrap');
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    bufferLogs: false,
  });
  app.enableShutdownHooks();
  logger.log(`worker iniciado (${process.env.NODE_ENV ?? 'development'})`);

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => {
      logger.log(`recebido ${signal}, encerrando worker...`);
      void app.close().then(() => process.exit(0));
    });
  }
}

void bootstrap();
