import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Env } from '../../config/env.schema.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';

interface JwtPayload {
  sub: string;
  email: string;
  ev: boolean;
  adm: boolean;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(config: ConfigService<Env, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'],
    });
  }

  validate(payload: JwtPayload): AuthUser {
    if (!payload?.sub) throw new UnauthorizedException();
    return {
      id: payload.sub,
      email: payload.email,
      emailVerified: payload.ev,
      isAdmin: payload.adm,
    };
  }
}
