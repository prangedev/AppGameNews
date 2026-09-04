import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'node:fs';
import type { Env } from '../config/env.schema.js';

/**
 * Envio de push via Firebase Cloud Messaging (firebase-admin). Se nenhuma
 * service account estiver configurada, o serviço fica em modo "log only":
 * as notificações são gravadas no feed in-app, mas o push é apenas logado.
 */
@Injectable()
export class FcmService implements OnModuleInit {
  private readonly logger = new Logger(FcmService.name);
  private messaging: import('firebase-admin/messaging').Messaging | null = null;

  constructor(private readonly config: ConfigService<Env, true>) {}

  async onModuleInit(): Promise<void> {
    const raw = this.loadServiceAccount();
    if (!raw) {
      this.logger.warn('FCM sem service account — push em modo "log only".');
      return;
    }
    try {
      const admin = await import('firebase-admin/app');
      const messaging = await import('firebase-admin/messaging');
      const app = admin.getApps().length
        ? admin.getApps()[0]!
        : admin.initializeApp({ credential: admin.cert(JSON.parse(raw)) });
      this.messaging = messaging.getMessaging(app);
      this.logger.log('FCM inicializado.');
    } catch (err) {
      this.logger.error(`falha ao inicializar FCM: ${(err as Error).message}`);
    }
  }

  private loadServiceAccount(): string | null {
    const b64 = this.config.get('FCM_SERVICE_ACCOUNT_BASE64', { infer: true });
    if (b64) {
      try {
        return Buffer.from(b64, 'base64').toString('utf8');
      } catch {
        return null;
      }
    }
    const path = this.config.get('FCM_SERVICE_ACCOUNT_PATH', { infer: true });
    if (path) {
      try {
        return readFileSync(path, 'utf8');
      } catch {
        return null;
      }
    }
    return null;
  }

  /** Retorna os tokens que o FCM reportou como inválidos (para limpeza). */
  async sendToTokens(
    tokens: string[],
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<{ invalidTokens: string[] }> {
    if (tokens.length === 0) return { invalidTokens: [] };
    if (!this.messaging) {
      this.logger.log(`[log-only] push "${payload.title}" -> ${tokens.length} device(s)`);
      return { invalidTokens: [] };
    }
    const res = await this.messaging.sendEachForMulticast({
      tokens,
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: { priority: 'high' },
    });
    const invalidTokens: string[] = [];
    res.responses.forEach((r, i) => {
      if (
        !r.success &&
        ['messaging/registration-token-not-registered', 'messaging/invalid-argument'].includes(
          r.error?.code ?? '',
        )
      ) {
        invalidTokens.push(tokens[i]!);
      }
    });
    return { invalidTokens };
  }
}
