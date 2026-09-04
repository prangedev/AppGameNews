import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import type { Env } from '../config/env.schema.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { TokenService } from './token.service.js';
import { PasswordService } from './password.service.js';
import { MailService } from './mail.service.js';
import { LoginThrottleService } from './login-throttle.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';
import { GoogleStrategy } from './strategies/google.strategy.js';
import { SteamStrategy } from './strategies/steam.strategy.js';
import { EpicStrategy } from './strategies/epic.strategy.js';
import { OAuthController } from './oauth/oauth.controller.js';
import { OAuthService } from './oauth/oauth.service.js';
import { OAuthFlowService } from './oauth/oauth-flow.service.js';
import { OAuthCodeStore } from './oauth/oauth-code.store.js';
import { OAuthBeginGuard } from './oauth/oauth-begin.guard.js';
import { ProviderConfiguredGuard } from './oauth/provider-configured.guard.js';

@Module({
  imports: [
    PassportModule.register({ session: false }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { algorithm: 'HS256' },
      }),
    }),
  ],
  controllers: [AuthController, OAuthController],
  providers: [
    AuthService,
    TokenService,
    PasswordService,
    MailService,
    LoginThrottleService,
    JwtStrategy,
    GoogleStrategy,
    SteamStrategy,
    EpicStrategy,
    OAuthService,
    OAuthFlowService,
    OAuthCodeStore,
    OAuthBeginGuard,
    ProviderConfiguredGuard,
  ],
  exports: [TokenService, JwtModule, PassportModule],
})
export class AuthModule {}
