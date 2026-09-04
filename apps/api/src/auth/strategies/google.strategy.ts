import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import type { Env } from '../../config/env.schema.js';
import type { OAuthProfile } from '../oauth/oauth.service.js';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService<Env, true>) {
    super({
      clientID: config.get('GOOGLE_CLIENT_ID', { infer: true }) || 'not-configured',
      clientSecret: config.get('GOOGLE_CLIENT_SECRET', { infer: true }) || 'not-configured',
      callbackURL: config.get('GOOGLE_CALLBACK_URL', { infer: true }),
      scope: ['openid', 'email', 'profile'],
      state: true, // proteção CSRF do fluxo
    });
  }

  validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const mapped: OAuthProfile = {
      provider: 'google',
      providerUid: profile.id,
      email: profile.emails?.[0]?.value ?? null,
      displayName: profile.displayName ?? null,
      tokens: { accessToken, refreshToken },
    };
    done(null, mapped);
  }
}
