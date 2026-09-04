import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { corsConfig, helmetConfig } from './common/security/security.config.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true, // acumula logs do boot até o logger do pino assumir, abaixo
  });
  const config = app.get(ConfigService<Env, true>);
  // substitui o logger padrão do Nest pelo pino (JSON estruturado + redação de
  // segredos, configurado em app.module.ts). Precisa vir cedo, antes de outros app.use().
  app.useLogger(app.get(Logger));
  const logger = app.get(Logger);

  // atrás de 1 proxy (nginx) -> confia no X-Forwarded-* para rate limit por IP
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  // request id para correlação de logs — precisa rodar ANTES do middleware
  // http do pino (que é registrado pelo Nest durante app.listen()/init(), ou
  // seja, depois destes app.use() síncronos), pois o pinoHttp reaproveita
  // req.id via genReqId (ver app.module.ts).
  app.use((req: Request & { id?: string }, res: Response, next: NextFunction) => {
    const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    next();
  });

  app.use(helmet(helmetConfig()));
  app.use(cookieParser());
  app.enableCors(corsConfig(config.get('CORS_ORIGINS', { infer: true })));

  // limita o corpo das requisições (defesa contra payloads gigantes)
  const express = await import('express');
  app.use(express.json({ limit: '64kb' }));
  app.use(express.urlencoded({ extended: false, limit: '64kb' }));

  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = config.get('PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`API ouvindo em http://0.0.0.0:${port} (${config.get('NODE_ENV', { infer: true })})`);
}

void bootstrap();
