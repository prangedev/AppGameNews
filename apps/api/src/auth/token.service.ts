import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { AuditService, clientIp } from '../common/audit/audit.service.js';
import type { Env } from '../config/env.schema.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // segundos do access token
}

interface AccessClaims {
  sub: string;
  email: string;
  ev: boolean; // emailVerified
  adm: boolean; // isAdmin
}

@Injectable()
export class TokenService {
  private readonly accessTtl: string;
  private readonly refreshTtlMs: number;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.accessTtl = config.get('JWT_ACCESS_TTL', { infer: true });
    this.refreshTtlMs = parseDuration(config.get('JWT_REFRESH_TTL', { infer: true }));
  }

  /** Emite um novo par (nova família de refresh). */
  async issuePair(
    user: { id: string; email: string; emailVerified: boolean; isAdmin: boolean },
    req?: Request,
    familyId = randomUUID(),
  ): Promise<TokenPair> {
    const claims: AccessClaims = {
      sub: user.id,
      email: user.email,
      ev: user.emailVerified,
      adm: user.isAdmin,
    };
    const accessToken = await this.jwt.signAsync(claims, { expiresIn: this.accessTtl });

    const raw = this.crypto.randomToken(48);
    const tokenHash = this.crypto.sha256(raw);
    const expiresAt = new Date(Date.now() + this.refreshTtlMs);
    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        familyId,
        expiresAt,
        ip: req ? clientIp(req).slice(0, 60) : null,
        userAgent: req?.headers['user-agent']?.slice(0, 300) ?? null,
      },
    });

    return {
      accessToken,
      refreshToken: `${familyId}.${raw}`,
      expiresIn: Math.floor(parseDuration(this.accessTtl) / 1000),
    };
  }

  /**
   * Rotaciona um refresh token. Detecta reuso: se o token apresentado já foi
   * usado (ou revogado), revoga a família inteira e recusa.
   */
  async rotate(presented: string, req?: Request): Promise<TokenPair> {
    const [familyId, raw] = presented.split('.', 2);
    if (!familyId || !raw) throw new UnauthorizedException('Refresh token inválido.');
    const tokenHash = this.crypto.sha256(raw);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.familyId !== familyId) {
      throw new UnauthorizedException('Refresh token inválido.');
    }

    if (record.revokedAt || record.usedAt) {
      // reuso detectado -> mata a sessão inteira
      await this.prisma.refreshToken.updateMany({
        where: { familyId: record.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.audit.record({
        action: 'auth.refresh.reuse_detected',
        actorId: record.userId,
        req,
        meta: { familyId: record.familyId },
      });
      throw new UnauthorizedException('Sessão inválida. Faça login novamente.');
    }

    if (record.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Sessão expirada.');
    }
    if (record.user.disabledAt) {
      throw new UnauthorizedException('Conta desativada.');
    }

    // marca o atual como usado e emite o próximo na mesma família
    const next = await this.issuePair(
      {
        id: record.user.id,
        email: record.user.email,
        emailVerified: record.user.emailVerified,
        isAdmin: record.user.isAdmin,
      },
      req,
      record.familyId,
    );
    const nextHash = this.crypto.sha256(next.refreshToken.split('.', 2)[1] ?? '');
    await this.prisma.refreshToken.update({
      where: { tokenHash },
      data: {
        usedAt: new Date(),
        replacedBy: (await this.prisma.refreshToken.findUnique({
          where: { tokenHash: nextHash },
          select: { id: true },
        }))?.id,
      },
    });

    await this.audit.record({ action: 'auth.refresh', actorId: record.userId, req });
    return next;
  }

  /** Revoga toda a sessão (família) associada a um refresh token. */
  async revoke(presented: string): Promise<void> {
    const [, raw] = presented.split('.', 2);
    if (!raw) return;
    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: this.crypto.sha256(raw) },
    });
    if (!record) return;
    await this.prisma.refreshToken.updateMany({
      where: { familyId: record.familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

/** Converte "15m", "30d", "1h", "45s" em milissegundos. */
export function parseDuration(input: string): number {
  const m = /^(\d+)\s*([smhd])$/.exec(input.trim());
  if (!m) return Number(input) || 0;
  const n = Number(m[1]);
  const unit = m[2];
  const mult = unit === 's' ? 1e3 : unit === 'm' ? 6e4 : unit === 'h' ? 36e5 : 864e5;
  return n * mult;
}
