import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../common/prisma/prisma.service.js';
import {
  NOTIFY_QUEUE,
  QUEUE_NOTIFY,
  type NotifyDispatchPayload,
  type NotifyEvaluatePayload,
} from '../common/queue/queue.constants.js';
import { NotificationsService } from './notifications.service.js';
import { RuleEvaluatorService } from './rule-evaluator.service.js';
import { FcmService } from './fcm.service.js';

/**
 * Processador da fila `notify`. Roda apenas no processo worker
 * (WorkerModule o registra; o processo HTTP não).
 */
@Injectable()
export class NotificationsProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsProcessor.name);
  private worker?: Worker;

  constructor(
    private readonly config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly evaluator: RuleEvaluatorService,
    private readonly fcm: FcmService,
    @Inject(NOTIFY_QUEUE) private readonly notifyQueue: Queue,
  ) {}

  onModuleInit(): void {
    const connection = new Redis(this.config.get('REDIS_URL', { infer: true }), {
      maxRetriesPerRequest: null,
    });
    this.worker = new Worker(
      QUEUE_NOTIFY,
      async (job: Job) => {
        switch (job.name) {
          case 'evaluate':
            return this.onEvaluate(job.data as NotifyEvaluatePayload);
          case 'dispatch':
            return this.onDispatch(job.data as NotifyDispatchPayload);
          case 'digest':
            return this.onDigest();
          default:
            this.logger.warn(`job notify desconhecido: ${job.name}`);
        }
      },
      { connection, concurrency: 5 },
    );
    this.worker.on('failed', (job, err) =>
      this.logger.error(`notify:${job?.name} falhou: ${err.message}`),
    );
    this.logger.log('worker de notificações ativo');
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }

  private async onEvaluate(payload: NotifyEvaluatePayload): Promise<void> {
    await this.evaluator.evaluateGames(payload.gameIds, payload.reason);
  }

  private async onDispatch(payload: NotifyDispatchPayload): Promise<void> {
    const notification = await this.prisma.notification.findUnique({
      where: { id: payload.notificationId },
      include: { user: { include: { devices: true, notificationPref: true } } },
    });
    if (!notification || notification.sentAt) return;
    if (notification.channel !== 'push') return;

    const pref = notification.user.notificationPref;
    if (pref && NotificationsService.inQuietHours(pref)) {
      // não conta como falha: reagenda explicitamente para o fim do quiet hours
      // (o backoff genérico de retry esgotaria as tentativas em minutos, não horas).
      const delay = msUntilQuietHoursEnd(pref.quietHoursEnd);
      await this.notifyQueue.add(
        'dispatch',
        { notificationId: payload.notificationId } satisfies NotifyDispatchPayload,
        { jobId: `dispatch:${payload.notificationId}:${Date.now()}`, delay },
      );
      this.logger.log(
        `notificação ${payload.notificationId} adiada ${Math.round(delay / 60_000)}min (quiet hours)`,
      );
      return;
    }

    const tokens = notification.user.devices.map((d) => d.fcmToken);
    const { invalidTokens } = await this.fcm.sendToTokens(tokens, {
      title: notification.title,
      body: notification.body,
      data: {
        type: notification.type,
        ...(notification.gameId ? { gameId: notification.gameId } : {}),
      },
    });
    if (invalidTokens.length) {
      await this.prisma.device.deleteMany({ where: { fcmToken: { in: invalidTokens } } });
    }
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { sentAt: new Date() },
    });
  }

  private async onDigest(): Promise<void> {
    // resumo diário/semanal — implementação simplificada: marca timestamp.
    this.logger.log('digest job (stub)');
  }
}

/** Milissegundos até o fim do quiet hours atual (mínimo 5min, para evitar loop apertado). */
function msUntilQuietHoursEnd(endHour: number | null): number {
  if (endHour == null) return 60 * 60_000;
  const now = new Date();
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  end.setHours(endHour);
  if (end.getTime() <= now.getTime()) end.setDate(end.getDate() + 1);
  return Math.max(5 * 60_000, end.getTime() - now.getTime());
}
