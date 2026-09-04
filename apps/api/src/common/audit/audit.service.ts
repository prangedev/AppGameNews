import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';

export type AuditAction =
  | 'auth.register'
  | 'auth.login.success'
  | 'auth.login.fail'
  | 'auth.logout'
  | 'auth.refresh'
  | 'auth.refresh.reuse_detected'
  | 'auth.email.verified'
  | 'auth.password.reset_requested'
  | 'auth.password.reset'
  | 'auth.oauth.link'
  | 'auth.oauth.login'
  | 'user.account.deleted'
  | 'user.data.exported'
  | 'admin.resync'
  | 'admin.push_test'
  | 'report.created';

@Injectable()
export class AuditService {
  private readonly logger = new Logger('Audit');

  constructor(private readonly prisma: PrismaService) {}

  async record(params: {
    action: AuditAction;
    actorId?: string | null;
    target?: string;
    req?: Request;
    meta?: Record<string, unknown>;
  }): Promise<void> {
    const { action, actorId, target, req, meta } = params;
    try {
      await this.prisma.auditLog.create({
        data: {
          action,
          actorId: actorId ?? null,
          target: target ?? null,
          ip: req ? clientIp(req) : null,
          userAgent: req?.headers['user-agent']?.slice(0, 300) ?? null,
          meta: meta ?? undefined,
        },
      });
    } catch (err) {
      // auditoria não deve quebrar o fluxo principal
      this.logger.error(`falha ao gravar audit ${action}: ${(err as Error).message}`);
    }
  }
}

export function clientIp(req: Request): string {
  const xff = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
  return xff || req.ip || req.socket.remoteAddress || 'unknown';
}
