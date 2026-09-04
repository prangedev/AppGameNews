import { CanActivate, ExecutionContext, Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema.js';

/**
 * Roda ANTES do AuthGuard do provedor. Se o provedor não tem credenciais
 * configuradas neste servidor, responde 501 em vez de redirecionar para um
 * fluxo OAuth quebrado.
 */
@Injectable()
export class ProviderConfiguredGuard implements CanActivate {
  constructor(private readonly config: ConfigService<Env, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const m = /\/auth\/(google|steam|epic)(\/|$)/.exec(req.path);
    const provider = m?.[1];
    if (!provider) return true;

    const ok =
      provider === 'google'
        ? !!this.config.get('GOOGLE_CLIENT_ID', { infer: true })
        : provider === 'epic'
          ? !!this.config.get('EPIC_CLIENT_ID', { infer: true })
          : !!this.config.get('STEAM_API_KEY', { infer: true });

    if (!ok) {
      throw new NotImplementedException(
        `Login com ${provider} não está configurado neste servidor.`,
      );
    }
    return true;
  }
}
