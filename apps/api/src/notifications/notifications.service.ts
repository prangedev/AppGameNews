import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import type { NotificationType, NotificationChannel } from '@appgamenews/shared';
import { z } from 'zod';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { NOTIFY_QUEUE } from '../common/queue/queue.constants.js';
import { notificationPrefSchema, registerDeviceSchema } from '@appgamenews/shared';

type PrefInput = z.infer<typeof notificationPrefSchema>;
type DeviceInput = z.infer<typeof registerDeviceSchema>;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(NOTIFY_QUEUE) private readonly notifyQueue: Queue,
  ) {}

  // ---- devices ---------------------------------------------------------
  async registerDevice(userId: string, dto: DeviceInput) {
    return this.prisma.device.upsert({
      where: { fcmToken: dto.fcmToken },
      create: { userId, fcmToken: dto.fcmToken, platform: dto.platform },
      update: { userId, platform: dto.platform, lastSeen: new Date() },
      select: { id: true, platform: true, createdAt: true },
    });
  }

  async removeDevice(userId: string, fcmToken: string): Promise<void> {
    await this.prisma.device.deleteMany({ where: { userId, fcmToken } });
  }

  // ---- prefs ----------------------------------------------------------
  async getPrefs(userId: string) {
    const pref = await this.prisma.notificationPref.findUnique({ where: { userId } });
    return pref ?? this.prisma.notificationPref.create({ data: { userId } });
  }

  async updatePrefs(userId: string, dto: PrefInput) {
    return this.prisma.notificationPref.upsert({
      where: { userId },
      create: { userId, ...dto },
      update: dto,
    });
  }

  // ---- feed in-app -------------------------------------------------------
  async feed(userId: string, page = 1, pageSize = 30) {
    const [items, total, unread] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where: { userId, channel: 'in_app' },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where: { userId, channel: 'in_app' } }),
      this.prisma.notification.count({
        where: { userId, channel: 'in_app', readAt: null },
      }),
    ]);
    return { items, total, unread, page, pageSize };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const n = await this.prisma.notification.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!n) throw new NotFoundException();
    if (n.userId !== userId) throw new ForbiddenException();
    await this.prisma.notification.update({ where: { id }, data: { readAt: new Date() } });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  /**
   * Cria uma notificação (idempotente via dedupeKey) e agenda o envio.
   * Cria uma linha por canal habilitado nas preferências do usuário.
   */
  async create(params: {
    userId: string;
    type: NotificationType;
    gameId?: string | null;
    title: string;
    body: string;
    data?: Record<string, unknown>;
    dedupeKey: string;
  }): Promise<void> {
    const pref = await this.getPrefs(params.userId);
    const channels = (pref.channels as NotificationChannel[]).length
      ? (pref.channels as NotificationChannel[])
      : (['in_app'] as NotificationChannel[]);

    for (const channel of channels) {
      const created = await this.prisma.notification
        .create({
          data: {
            userId: params.userId,
            type: params.type,
            gameId: params.gameId ?? null,
            title: params.title.slice(0, 140),
            body: params.body.slice(0, 500),
            data: params.data ?? undefined,
            channel,
            dedupeKey: `${channel}:${params.dedupeKey}`,
          },
        })
        .catch((err: unknown) => {
          // P2002 = violação de unique(userId, dedupeKey): já existe, ignora silenciosamente.
          // Qualquer outro erro é real (conexão, constraint inesperada etc.) e não deve sumir.
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return null;
          }
          this.logger.error(
            `falha ao criar notificação (user=${params.userId} type=${params.type}): ${(err as Error).message}`,
          );
          throw err;
        });

      if (created && channel !== 'in_app') {
        await this.notifyQueue.add(
          'dispatch',
          { notificationId: created.id },
          { jobId: `dispatch:${created.id}` },
        );
      }
      if (created && channel === 'in_app') {
        await this.prisma.notification.update({
          where: { id: created.id },
          data: { sentAt: new Date() },
        });
      }
    }
  }

  /** true se agora está dentro do intervalo de "não perturbe" do usuário. */
  static inQuietHours(pref: { quietHoursStart: number | null; quietHoursEnd: number | null }): boolean {
    const { quietHoursStart: s, quietHoursEnd: e } = pref;
    if (s == null || e == null) return false;
    const h = new Date().getHours();
    return s <= e ? h >= s && h < e : h >= s || h < e;
  }
}
