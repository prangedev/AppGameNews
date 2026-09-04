import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import type { Env } from '../config/env.schema.js';

/**
 * Bloqueio de força-bruta em login: conta tentativas malsucedidas recentes
 * por e-mail e por IP. O e-mail é guardado só como hash (emailKey).
 */
@Injectable()
export class LoginThrottleService {
  private readonly maxAttempts: number;
  private readonly lockoutMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    config: ConfigService<Env, true>,
  ) {
    this.maxAttempts = config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
    this.lockoutMs = config.get('LOGIN_LOCKOUT_MINUTES', { infer: true }) * 60_000;
  }

  emailKey(email: string): string {
    return this.crypto.sha256(`email:${email.toLowerCase().trim()}`);
  }

  /** true se e-mail OU IP excederam o limite na janela de lockout. */
  async isLocked(email: string, ip: string | null): Promise<boolean> {
    const since = new Date(Date.now() - this.lockoutMs);
    const [byEmail, byIp] = await Promise.all([
      this.prisma.loginAttempt.count({
        where: { emailKey: this.emailKey(email), success: false, createdAt: { gte: since } },
      }),
      ip
        ? this.prisma.loginAttempt.count({
            where: { ip, success: false, createdAt: { gte: since } },
          })
        : Promise.resolve(0),
    ]);
    return byEmail >= this.maxAttempts || byIp >= this.maxAttempts * 4;
  }

  async record(params: {
    email: string;
    ip: string | null;
    success: boolean;
    userId?: string | null;
  }): Promise<void> {
    await this.prisma.loginAttempt.create({
      data: {
        emailKey: this.emailKey(params.email),
        ip: params.ip ?? undefined,
        success: params.success,
        userId: params.userId ?? undefined,
      },
    });
  }

  /** Limpa o histórico de falhas após um login bem-sucedido. */
  async clear(email: string): Promise<void> {
    await this.prisma.loginAttempt.deleteMany({
      where: { emailKey: this.emailKey(email), success: false },
    });
  }
}
