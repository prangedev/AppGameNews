/* eslint-disable @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import type { Env } from '../../config/env.schema.js';
import type { OAuthProfile } from '../oauth/oauth.service.js';

// passport-steam não publica tipos; carregamos via require.
const PassportSteam = require('passport-steam').Strategy as any;

interface SteamProfile {
  id: string;
  displayName?: string;
  photos?: { value: string }[];
}

@Injectable()
export class SteamStrategy extends PassportStrategy(PassportSteam, 'steam') {
  constructor(config: ConfigService<Env, true>) {
    super({
      returnURL: config.get('STEAM_CALLBACK_URL', { infer: true }),
      realm: config.get('STEAM_REALM', { infer: true }),
      apiKey: config.get('STEAM_API_KEY', { infer: true }) || 'not-configured',
    });
  }

  validate(_identifier: string, profile: SteamProfile): OAuthProfile {
    // Steam OpenID não fornece e-mail. A conta fica sem e-mail verificável
    // até o usuário vincular outro provider com e-mail ou definir uma senha.
    return {
      provider: 'steam',
      providerUid: profile.id,
      email: null,
      displayName: profile.displayName ?? null,
      tokens: {},
    };
  }
}
