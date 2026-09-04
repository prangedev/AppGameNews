import { z } from 'zod';
import { PLATFORMS } from './platform.js';
import {
  NOTIFICATION_CHANNELS,
  RELEASE_TYPES,
  WISHLIST_TRIGGERS,
} from './domain.js';

/**
 * Política de senha: 12+ chars, com pelo menos uma minúscula, uma maiúscula e
 * um dígito. Comprimento máximo evita DoS de hashing (argon2).
 */
export const passwordSchema = z
  .string()
  .min(12, 'A senha precisa de ao menos 12 caracteres.')
  .max(128, 'A senha é longa demais.')
  .regex(/[a-z]/, 'Inclua ao menos uma letra minúscula.')
  .regex(/[A-Z]/, 'Inclua ao menos uma letra maiúscula.')
  .regex(/[0-9]/, 'Inclua ao menos um dígito.');

export const emailSchema = z.string().email().max(254).toLowerCase().trim();

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: z.string().min(2).max(40).trim(),
  // honeypot: deve chegar vazio; se vier preenchido, é bot.
  website: z.string().max(0).optional().default(''),
});
export type RegisterDTO = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginDTO = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(10).max(200),
});

export const requestPasswordResetSchema = z.object({ email: emailSchema });

export const resetPasswordSchema = z.object({
  token: z.string().min(10).max(200),
  password: passwordSchema,
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(10).max(4096),
});

export const oauthExchangeSchema = z.object({
  code: z.string().min(10).max(400),
});

/** Vincular um provedor OAuth à conta logada (retoma um `code` já emitido). */
export const linkProviderSchema = oauthExchangeSchema;

export const registerDeviceSchema = z.object({
  fcmToken: z.string().min(20).max(4096),
  platform: z.enum(['android', 'ios', 'web']),
});

export const wishlistAddSchema = z.object({
  gameId: z.string().uuid(),
  // null permite limpar um preço-alvo já definido num update; ausente = não alterar.
  targetPriceCents: z.number().int().positive().max(100_000_00).nullable().optional(),
  currency: z.string().length(3).toUpperCase().default('BRL'),
  triggers: z
    .array(z.enum(WISHLIST_TRIGGERS))
    .min(1)
    .max(WISHLIST_TRIGGERS.length),
});
export type WishlistAddDTO = z.infer<typeof wishlistAddSchema>;

export const wishlistUpdateSchema = wishlistAddSchema.partial().omit({ gameId: true });

export const notificationPrefSchema = z.object({
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).max(NOTIFICATION_CHANNELS.length),
  quietHoursStart: z.number().int().min(0).max(23).nullable().optional(),
  quietHoursEnd: z.number().int().min(0).max(23).nullable().optional(),
  digest: z.enum(['off', 'daily', 'weekly']).default('off'),
});

export const catalogQuerySchema = z.object({
  q: z.string().max(120).trim().optional(),
  platform: z.enum(PLATFORMS).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type CatalogQueryDTO = z.infer<typeof catalogQuerySchema>;

export const releasesQuerySchema = z.object({
  platform: z.enum(PLATFORMS).optional(),
  type: z.enum(RELEASE_TYPES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export const reportSchema = z.object({
  kind: z.enum(['wrong_price', 'bad_link', 'spam', 'other']),
  entityType: z.enum(['game', 'freebie', 'news']),
  entityId: z.string().uuid(),
  message: z.string().max(1000).trim().optional(),
});
