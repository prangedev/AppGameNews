import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type StrategyOptions } from 'passport-oauth2';
import type { Env } from '../../config/env.schema.js';
import type { OAuthProfile } from '../oauth/oauth.service.js';

/**
 * Epic Games — OAuth2 / OIDC (Epic Online Services).
 * Endpoints públicos do EOS:
 *   authorize: https://www.epicgames.com/id/authorize
 *   token:     https://api.epicgames.dev/epic/oauth/v2/token
 *   userinfo:  https://api.epicgames.dev/epic/oauth/v2/userInfo
 */
const EPIC_AUTHORIZE_URL = 'https://www.epicgames.com/id/authorize';
const EPIC_TOKEN_URL = 'https://api.epicgames.dev/epic/oauth/v2/token';
const EPIC_USERINFO_URL = 'https://api.epicgames.dev/epic/oauth/v2/userInfo';

@Injectable()
export class EpicStrategy extends PassportStrategy(Strategy, 'epic') {
  constructor(config: ConfigService<Env, true>) {
    const options: StrategyOptions = {
      authorizationURL: EPIC_AUTHORIZE_URL,
      tokenURL: EPIC_TOKEN_URL,
      clientID: config.get('EPIC_CLIENT_ID', { infer: true }) || 'not-configured',
      clientSecret: config.get('EPIC_CLIENT_SECRET', { infer: true }) || 'not-configured',
      callbackURL: config.get('EPIC_CALLBACK_URL', { infer: true }),
      scope: ['basic_profile', 'openid'],
      state: true,
    };
    super(options);
  }

  async validate(accessToken: string, refreshToken: string): Promise<OAuthProfile> {
    const res = await fetch(EPIC_USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Epic userInfo falhou: ${res.status}`);
    const info = (await res.json()) as { sub: string; preferred_username?: string; email?: string };
    return {
      provider: 'epic',
      providerUid: info.sub,
      email: info.email ?? null,
      displayName: info.preferred_username ?? null,
      tokens: { accessToken, refreshToken },
    };
  }
}
