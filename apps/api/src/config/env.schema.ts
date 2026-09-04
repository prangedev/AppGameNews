import { z } from 'zod';

/**
 * Validação de ambiente. Falha rápido no boot se algo essencial faltar.
 * Segredos default_only são rejeitados quando NODE_ENV=production.
 */
const insecureDefaults = [
  'CHANGE_ME_dev_only_access_secret',
  'CHANGE_ME_dev_only_refresh_secret',
  'CHANGE_ME_base64_32_bytes',
];

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
      .default('info'),

    DATABASE_URL: z.string().url(),
    REDIS_URL: z.string().url(),

    JWT_SECRET: z.string().min(24),
    JWT_REFRESH_SECRET: z.string().min(24),
    JWT_ACCESS_TTL: z.string().default('15m'),
    JWT_REFRESH_TTL: z.string().default('30d'),
    DATA_ENCRYPTION_KEY: z.string().min(16),

    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    SMTP_SECURE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    MAIL_FROM: z.string().default('AppGameNews <no-reply@appgamenews.local>'),

    GOOGLE_CLIENT_ID: z.string().optional().default(''),
    GOOGLE_CLIENT_SECRET: z.string().optional().default(''),
    GOOGLE_CALLBACK_URL: z
      .string()
      .url()
      .default('http://localhost:3000/auth/google/callback'),

    STEAM_API_KEY: z.string().optional().default(''),
    STEAM_REALM: z.string().url().default('http://localhost:3000/'),
    STEAM_CALLBACK_URL: z
      .string()
      .url()
      .default('http://localhost:3000/auth/steam/callback'),

    EPIC_CLIENT_ID: z.string().optional().default(''),
    EPIC_CLIENT_SECRET: z.string().optional().default(''),
    EPIC_CALLBACK_URL: z
      .string()
      .url()
      .default('http://localhost:3000/auth/epic/callback'),

    OAUTH_POST_LOGIN_REDIRECTS: z
      .string()
      .default('appgamenews://auth'),

    CHEAPSHARK_BASE_URL: z.string().url().default('https://www.cheapshark.com/api/1.0'),
    ITAD_API_KEY: z.string().optional().default(''),
    ITAD_BASE_URL: z.string().url().default('https://api.isthereanydeal.com'),
    RAWG_API_KEY: z.string().optional().default(''),
    RAWG_BASE_URL: z.string().url().default('https://api.rawg.io/api'),
    STEAM_STOREFRONT_BASE_URL: z
      .string()
      .url()
      .default('https://store.steampowered.com/api'),
    STEAM_WEBAPI_BASE_URL: z.string().url().default('https://api.steampowered.com'),
    EPIC_FREEGAMES_URL: z
      .string()
      .url()
      .default(
        'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions',
      ),

    FCM_SERVICE_ACCOUNT_PATH: z.string().optional().default(''),
    FCM_SERVICE_ACCOUNT_BASE64: z.string().optional().default(''),

    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().positive().default(60),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    LOGIN_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().positive().default(15),

    SENTRY_DSN: z.string().optional().default(''),

    INGEST_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    INGEST_CHEAPSHARK_CRON: z.string().default('*/30 * * * *'),
    INGEST_EPIC_CRON: z.string().default('0 * * * *'),
    INGEST_STEAM_CRON: z.string().default('0 * * * *'),
    INGEST_ITAD_CRON: z.string().default('0 */6 * * *'),
    INGEST_RAWG_CRON: z.string().default('0 */12 * * *'),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === 'string' && insecureDefaults.includes(value)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${key} ainda está com o valor de exemplo — troque em produção.`,
            path: [key],
          });
        }
      }
      if (env.CORS_ORIGINS.split(',').some((o) => o.trim() === '*')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'CORS_ORIGINS não pode conter "*" em produção.',
          path: ['CORS_ORIGINS'],
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${details}`);
  }
  return parsed.data;
}
