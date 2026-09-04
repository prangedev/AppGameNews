import { ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

/**
 * Rate limiting em duas camadas:
 *  - "default": limite geral por IP;
 *  - "auth": bem mais rígido, aplicado explicitamente nas rotas de /auth.
 * O armazenamento é em memória por instância; atrás do nginx (limit_req) e,
 * em produção, idealmente com storage Redis (ThrottlerStorageRedisService).
 */
export function throttlerConfig(config: ConfigService<Env, true>): ThrottlerModuleOptions {
  const ttl = config.get('RATE_LIMIT_TTL_SECONDS', { infer: true }) * 1000;
  return {
    throttlers: [
      { name: 'default', ttl, limit: config.get('RATE_LIMIT_MAX', { infer: true }) },
      { name: 'auth', ttl, limit: config.get('AUTH_RATE_LIMIT_MAX', { infer: true }) },
    ],
  };
}
