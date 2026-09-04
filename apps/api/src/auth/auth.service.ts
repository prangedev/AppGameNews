import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { LoginDTO, RegisterDTO } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { AuditService, clientIp } from '../common/audit/audit.service.js';
import { PasswordService } from './password.service.js';
import { MailService } from './mail.service.js';
import { LoginThrottleService } from './login-throttle.service.js';

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  '10minutemail.com',
  'tempmail.com',
  'trashmail.com',
  'yopmail.com',
]);

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
    private readonly throttle: LoginThrottleService,
    private readonly audit: AuditService,
  ) {}

  async register(dto: RegisterDTO, req: Request): Promise<{ ok: true }> {
    // honeypot: campo "website" deve vir vazio
    if (dto.website && dto.website.length > 0) {
      this.logger.warn(`registro bloqueado por honeypot de ${clientIp(req)}`);
      return { ok: true }; // resposta idêntica ao sucesso p/ não dar sinal ao bot
    }

    const domain = dto.email.split('@')[1] ?? '';
    if (DISPOSABLE_DOMAINS.has(domain)) {
      throw new BadRequestException('Use um endereço de e-mail permanente.');
    }
    if (await this.passwords.isPwned(dto.password)) {
      throw new BadRequestException(
        'Essa senha aparece em vazamentos públicos. Escolha outra.',
      );
    }

    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    // resposta genérica: não revela se o e-mail já existe (enumeração)
    if (existing) {
      this.logger.log(`tentativa de registro para e-mail existente: ${maskEmail(dto.email)}`);
      return { ok: true };
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        displayName: dto.displayName,
        passwordHash,
        notificationPref: { create: {} },
      },
    });
    await this.issueVerification(user.id, user.email);
    await this.audit.record({ action: 'auth.register', actorId: user.id, req });
    return { ok: true };
  }

  private async issueVerification(userId: string, email: string): Promise<void> {
    const token = this.crypto.randomToken(32);
    await this.prisma.emailVerification.create({
      data: {
        userId,
        tokenHash: this.crypto.sha256(token),
        expiresAt: new Date(Date.now() + 24 * 3600_000),
      },
    });
    await this.mail.sendVerification(email, token);
  }

  async resendVerification(email: string): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user && !user.emailVerified) await this.issueVerification(user.id, user.email);
    return { ok: true };
  }

  async verifyEmail(token: string, req: Request): Promise<{ ok: true }> {
    const rec = await this.prisma.emailVerification.findUnique({
      where: { tokenHash: this.crypto.sha256(token) },
    });
    if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token de verificação inválido ou expirado.');
    }
    await this.prisma.$transaction([
      this.prisma.emailVerification.update({
        where: { id: rec.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: rec.userId },
        data: { emailVerified: true },
      }),
    ]);
    await this.audit.record({ action: 'auth.email.verified', actorId: rec.userId, req });
    return { ok: true };
  }

  /** Valida credenciais locais. Lança em falha; devolve o usuário em sucesso. */
  async validateLocal(dto: LoginDTO, req: Request) {
    const ip = clientIp(req);
    if (await this.throttle.isLocked(dto.email, ip)) {
      await this.audit.record({ action: 'auth.login.fail', req, meta: { reason: 'locked' } });
      throw new ForbiddenException('Muitas tentativas. Tente novamente em alguns minutos.');
    }

    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    const ok =
      !!user?.passwordHash && (await this.passwords.verify(user.passwordHash, dto.password));

    await this.throttle.record({
      email: dto.email,
      ip,
      success: ok,
      userId: user?.id ?? null,
    });

    if (!ok || !user) {
      await this.audit.record({ action: 'auth.login.fail', actorId: user?.id, req });
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }
    if (user.disabledAt) throw new ForbiddenException('Conta desativada.');

    await this.throttle.clear(dto.email);
    await this.audit.record({ action: 'auth.login.success', actorId: user.id, req });
    return user;
  }

  async requestPasswordReset(email: string, req: Request): Promise<{ ok: true }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (user) {
      const token = this.crypto.randomToken(32);
      await this.prisma.passwordReset.create({
        data: {
          userId: user.id,
          tokenHash: this.crypto.sha256(token),
          expiresAt: new Date(Date.now() + 3600_000),
        },
      });
      await this.mail.sendPasswordReset(user.email, token);
      await this.audit.record({
        action: 'auth.password.reset_requested',
        actorId: user.id,
        req,
      });
    }
    // resposta sempre idêntica (anti enumeração)
    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string, req: Request): Promise<{ ok: true }> {
    const rec = await this.prisma.passwordReset.findUnique({
      where: { tokenHash: this.crypto.sha256(token) },
    });
    if (!rec || rec.usedAt || rec.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token de redefinição inválido ou expirado.');
    }
    if (await this.passwords.isPwned(newPassword)) {
      throw new BadRequestException('Essa senha aparece em vazamentos públicos. Escolha outra.');
    }
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.$transaction([
      this.prisma.passwordReset.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      this.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash } }),
      // invalida todas as sessões após troca de senha
      this.prisma.refreshToken.updateMany({
        where: { userId: rec.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    await this.audit.record({ action: 'auth.password.reset', actorId: rec.userId, req });
    return { ok: true };
  }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split('@');
  return `${(name ?? '').slice(0, 2)}***@${domain ?? ''}`;
}
