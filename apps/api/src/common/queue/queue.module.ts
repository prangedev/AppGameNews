import { Global, Module, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../../config/env.schema.js';
import {
  INGEST_QUEUE,
  NOTIFY_QUEUE,
  QUEUE_INGEST,
  QUEUE_NOTIFY,
} from './queue.constants.js';

function makeConnection(url: string): Redis {
  return new Redis(url, { maxRetriesPerRequest: null });
}

const defaultJobOptions = {
  attempts: 5,
  backoff: { type: 'exponential' as const, delay: 5_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: { count: 1_000 },
};

@Global()
@Module({
  providers: [
    {
      provide: INGEST_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Queue(QUEUE_INGEST, {
          connection: makeConnection(config.get('REDIS_URL', { infer: true })),
          defaultJobOptions,
        }),
    },
    {
      provide: NOTIFY_QUEUE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        new Queue(QUEUE_NOTIFY, {
          connection: makeConnection(config.get('REDIS_URL', { infer: true })),
          defaultJobOptions,
        }),
    },
  ],
  exports: [INGEST_QUEUE, NOTIFY_QUEUE],
})
export class QueueModule implements OnApplicationShutdown {
  constructor() {}
  async onApplicationShutdown(): Promise<void> {
    // filas fecham suas conexões junto com o processo
  }
}
