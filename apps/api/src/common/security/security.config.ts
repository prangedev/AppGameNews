import type { HelmetOptions } from 'helmet';
import type { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface.js';

/**
 * Headers de segurança. A API é JSON-only; CSP bem restritiva porque nada de
 * HTML é servido (a não ser páginas mínimas de callback OAuth, que trazem CSP própria).
 */
export function helmetConfig(): HelmetOptions {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
    crossOriginOpenerPolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: false },
    frameguard: { action: 'deny' },
    noSniff: true,
    hidePoweredBy: true,
  };
}

/**
 * CORS por allowlist estrita. Aceita chrome-extension:// e o(s) domínio(s) do app.
 * `credentials: true` para permitir cookie de refresh no fluxo web/extensão.
 */
export function corsConfig(originsCsv: string): CorsOptions {
  const allow = originsCsv
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    origin(origin, callback) {
      // requisições sem Origin (curl, apps mobile nativos) são permitidas
      if (!origin) return callback(null, true);
      if (allow.includes(origin)) return callback(null, true);
      return callback(new Error(`Origin não permitida: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    maxAge: 600,
  };
}
