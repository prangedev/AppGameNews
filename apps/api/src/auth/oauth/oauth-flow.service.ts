import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Redis } from 'ioredis';
import { REDIS } from '../../common/redis/redis.module.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { TokenService, type TokenPair } from '../token.service.js';
import { OAuthCodeStore } from './oauth-code.store.js';
import { OAuthService, type OAuthProfile } from './oauth.service.js';
import { escapeHtml } from '../html.util.js';

const OAUTH_COOKIE = 'agn_oauth';

interface FlowState {
  redirectUri: string;
  linkUserId?: string;
}

@Injectable()
export class OAuthFlowService {
  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly oauth: OAuthService,
    private readonly codes: OAuthCodeStore,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /** Cria um ticket curto para vincular um provider a um usuário autenticado. */
  async createLinkTicket(userId: string): Promise<string> {
    const ticket = this.crypto.randomToken(24);
    await this.redis.set(`oauth:link:${this.crypto.sha256(ticket)}`, userId, 'EX', 300);
    return ticket;
  }

  /** Chamado no início do fluxo: valida redirect + ticket e grava cookie de estado. */
  async begin(req: Request, res: Response): Promise<void> {
    const redirectUri = String(req.query.redirect_uri ?? '');
    this.oauth.assertAllowedRedirect(redirectUri);

    let linkUserId: string | undefined;
    const ticket = req.query.link_ticket ? String(req.query.link_ticket) : null;
    if (ticket) {
      const uid = await this.redis.getdel(`oauth:link:${this.crypto.sha256(ticket)}`);
      if (!uid) throw new UnauthorizedException('link_ticket inválido ou expirado.');
      linkUserId = uid;
    }

    const state: FlowState = { redirectUri, linkUserId };
    res.cookie(OAUTH_COOKIE, this.crypto.encrypt(JSON.stringify(state)), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 600_000,
    });
  }

  /** Chamado no callback: consome o cookie, resolve o usuário e redireciona com `code`. */
  async complete(req: Request, res: Response): Promise<void> {
    const profile = req.user as OAuthProfile | undefined;
    const cookie = (req.cookies as Record<string, string> | undefined)?.[OAUTH_COOKIE];
    res.clearCookie(OAUTH_COOKIE, { path: '/auth' });

    if (!profile) return void res.status(400).send(errorPage('Falha na autenticação.'));

    let state: FlowState;
    try {
      state = JSON.parse(this.crypto.decrypt(cookie ?? '')) as FlowState;
    } catch {
      return void res.status(400).send(errorPage('Sessão de login expirada. Tente de novo.'));
    }

    try {
      this.oauth.assertAllowedRedirect(state.redirectUri);
    } catch {
      return void res.status(400).send(errorPage('Destino de redirecionamento inválido.'));
    }

    let userId: string;
    if (state.linkUserId) {
      await this.oauth.linkToUser(state.linkUserId, profile);
      await this.audit.record({
        action: 'auth.oauth.link',
        actorId: state.linkUserId,
        req,
        meta: { provider: profile.provider },
      });
      userId = state.linkUserId;
    } else {
      const user = await this.oauth.findOrCreateUser(profile);
      await this.audit.record({
        action: 'auth.oauth.login',
        actorId: user.id,
        req,
        meta: { provider: profile.provider },
      });
      userId = user.id;
    }

    const code = await this.codes.issue(userId);
    const sep = state.redirectUri.includes('?') ? '&' : '?';
    res.redirect(302, `${state.redirectUri}${sep}code=${encodeURIComponent(code)}`);
  }

  /** Troca o `code` de uso único por um par de tokens. */
  async exchange(code: string, req: Request): Promise<TokenPair> {
    const userId = await this.codes.consume(code);
    if (!userId) throw new UnauthorizedException('code inválido ou expirado.');
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || user.disabledAt) throw new UnauthorizedException('Conta indisponível.');
    return this.tokens.issuePair(
      { id: user.id, email: user.email, emailVerified: user.emailVerified, isAdmin: user.isAdmin },
      req,
    );
  }
}

function errorPage(msg: string): string {
  return `<!doctype html><meta charset="utf-8"><title>Erro</title><p>${escapeHtml(msg)}</p>`;
}
