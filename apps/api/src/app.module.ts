import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import type { Env } from './config/env.schema.js';
import { loadConfig } from './config/configuration.js';
import { PrismaModule } from './common/prisma/prisma.module.js';
import { RedisModule } from './common/redis/redis.module.js';
import { CryptoModule } from './common/crypto/crypto.module.js';
import { AuditModule } from './common/audit/audit.module.js';
import { QueueModule } from './common/queue/queue.module.js';
import { throttlerConfig } from './common/security/throttler.config.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { CatalogModule } from './catalog/catalog.module.js';
import { PricesModule } from './prices/prices.module.js';
import { ReleasesModule } from './releases/releases.module.js';
import { FreebiesModule } from './freebies/freebies.module.js';
import { WishlistModule } from './wishlist/wishlist.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { IngestionModule } from './ingestion/ingestion.module.js';
import { HealthModule } from './health/health.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [loadConfig] }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          // req.id já vem setado pelo middleware de main.ts (roda antes deste,
          // por ser um app.use() direto anterior ao app.init() que aplica este
          // módulo) — reaproveita para o log casar com o header X-Request-Id.
          genReqId: (req: { id?: string }) => req.id,
          // nunca logar segredos: token de acesso, cookie de refresh, senha em body de erro
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              'req.body.password',
              'req.body.newPassword',
            ],
            censor: '[REDACTED]',
          },
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => throttlerConfig(config),
    }),
    PrismaModule,
    RedisModule,
    CryptoModule,
    AuditModule,
    QueueModule,
    AuthModule,
    UsersModule,
    CatalogModule,
    PricesModule,
    ReleasesModule,
    FreebiesModule,
    WishlistModule,
    NotificationsModule,
    IngestionModule,
    HealthModule,
    AdminModule,
  ],
  providers: [
    // ordem importa: rate limiting roda antes de qualquer verificação de auth
    // (defesa em profundidade — barata e evita gastar ciclos em req. abusivas).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // JWT global: toda rota exige token, exceto as marcadas com @Public()
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}
