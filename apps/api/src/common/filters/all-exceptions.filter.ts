import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/**
 * Filtro global. Em produção NUNCA vaza stack trace / detalhes internos;
 * responde um corpo estável. Loga o erro completo no servidor com requestId.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { id?: string }>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const requestId =
      (req.headers['x-request-id'] as string | undefined) ?? req.id ?? undefined;

    if (status >= 500) {
      this.logger.error(
        `[${requestId ?? '-'}] ${req.method} ${req.url} -> ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    let body: Record<string, unknown>;
    if (isHttp) {
      const raw = exception.getResponse();
      body =
        typeof raw === 'string'
          ? { statusCode: status, message: raw }
          : { statusCode: status, ...(raw as object) };
    } else {
      body = {
        statusCode: status,
        error: 'InternalServerError',
        message: this.isProd
          ? 'Erro interno. Tente novamente mais tarde.'
          : String(exception instanceof Error ? exception.message : exception),
      };
    }
    if (requestId) body.requestId = requestId;

    res.status(status).json(body);
  }
}
