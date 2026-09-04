import { Body, Controller, Inject, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { Queue } from 'bullmq';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { AdminGuard } from '../common/guards/admin.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../common/audit/audit.service.js';
import { INGEST_QUEUE } from '../common/queue/queue.constants.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const resyncSchema = z.object({
  source: z.enum(['cheapshark', 'epic', 'steam', 'itad', 'rawg', 'gog']),
});
const pushTestSchema = z.object({ message: z.string().max(200).default('Notificação de teste.') });

@UseGuards(JwtAuthGuard, AdminGuard)
@Controller('admin')
export class AdminController {
  constructor(
    @Inject(INGEST_QUEUE) private readonly ingestQueue: Queue,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
  ) {}

  @Post('resync')
  async resync(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(resyncSchema)) body: { source: string },
    @Req() req: Request,
  ) {
    await this.ingestQueue.add(body.source, {}, { jobId: `admin:${body.source}:${Date.now()}` });
    await this.audit.record({
      action: 'admin.resync',
      actorId: user.id,
      req,
      meta: { source: body.source },
    });
    return { ok: true, queued: body.source };
  }

  @Post('push-test')
  async pushTest(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(pushTestSchema)) body: { message: string },
    @Req() req: Request,
  ) {
    await this.notifications.create({
      userId: user.id,
      type: 'system',
      title: 'Teste de notificação',
      body: body.message,
      dedupeKey: `admin-test:${Date.now()}`,
    });
    await this.audit.record({ action: 'admin.push_test', actorId: user.id, req });
    return { ok: true };
  }
}
