import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { slugify } from '@appgamenews/shared';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import type { Env } from '../../config/env.schema.js';

export interface OAuthProfile {
  provider: 'google' | 'steam' | 'epic';
  providerUid: string;
  email?: string | null;
  displayName?: string | null;
  tokens?: Record<string, unknown>;
}

@Injectable()
export class OAuthService {
  private readonly allowedRedirects: string[];

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    config: ConfigService<Env, true>,
  ) {
    this.allowedRedirects = config
      .get('OAUTH_POST_LOGIN_REDIRECTS', { infer: true })
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Valida o redirect_uri pós-login contra a allowlist (anti open-redirect). */
  assertAllowedRedirect(target: string): void {
    const ok = this.allowedRedirects.some(
      (prefix) => target === prefix || target.startsWith(prefix),
    );
    if (!ok) throw new BadRequestException('redirect_uri não permitido.');
  }

  /**
   * Encontra o usuário para um profile OAuth, criando conta se necessário.
   * Regras de vínculo:
   *  - se já existe identity (provider+uid) -> retorna aquele usuário;
   *  - senão, se há e-mail verificável e bate com um usuário existente -> vincula;
   *  - senão -> cria usuário novo (emailVerified = true, pois veio do provedor).
   */
  async findOrCreateUser(profile: OAuthProfile): Promise<{ id: string; email: string; emailVerified: boolean; isAdmin: boolean }> {
    const existing = await this.prisma.identity.findUnique({
      where: { provider_providerUid: { provider: profile.provider, providerUid: profile.providerUid } },
      include: { user: true },
    });
    if (existing) {
      await this.touchTokens(existing.id, profile.tokens);
      return this.pick(existing.user);
    }

    const email = profile.email?.toLowerCase().trim() || null;
    if (email) {
      const byEmail = await this.prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        await this.prisma.identity.create({
          data: {
            userId: byEmail.id,
            provider: profile.provider,
            providerUid: profile.providerUid,
            email,
            encryptedTokens: this.encTokens(profile.tokens),
          },
        });
        return this.pick(byEmail);
      }
    }

    const displayName = (profile.displayName || email?.split('@')[0] || `player_${profile.providerUid.slice(-6)}`).slice(0, 40);
    const created = await this.prisma.user.create({
      data: {
        email: email ?? `${profile.provider}_${profile.providerUid}@users.appgamenews.local`,
        displayName,
        emailVerified: Boolean(email),
        identities: {
          create: {
            provider: profile.provider,
            providerUid: profile.providerUid,
            email,
            encryptedTokens: this.encTokens(profile.tokens),
          },
        },
        notificationPref: { create: {} },
      },
    });
    return this.pick(created);
  }

  /** Vincula um provider a um usuário já autenticado. */
  async linkToUser(userId: string, profile: OAuthProfile): Promise<void> {
    const existing = await this.prisma.identity.findUnique({
      where: { provider_providerUid: { provider: profile.provider, providerUid: profile.providerUid } },
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException('Essa conta já está vinculada a outro usuário.');
    }
    if (existing) return;
    await this.prisma.identity.create({
      data: {
        userId,
        provider: profile.provider,
        providerUid: profile.providerUid,
        email: profile.email?.toLowerCase().trim() || null,
        encryptedTokens: this.encTokens(profile.tokens),
      },
    });
  }

  private encTokens(tokens?: Record<string, unknown>): string | null {
    if (!tokens || Object.keys(tokens).length === 0) return null;
    return this.crypto.encrypt(JSON.stringify(tokens));
  }

  private async touchTokens(identityId: string, tokens?: Record<string, unknown>): Promise<void> {
    const enc = this.encTokens(tokens);
    if (enc) await this.prisma.identity.update({ where: { id: identityId }, data: { encryptedTokens: enc } });
  }

  private pick(u: { id: string; email: string; emailVerified: boolean; isAdmin: boolean }) {
    return { id: u.id, email: u.email, emailVerified: u.emailVerified, isAdmin: u.isAdmin };
  }

  // reservado para futuras colisões de slug de displayName público
  buildSlug(name: string): string {
    return slugify(name);
  }
}
