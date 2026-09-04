import {
  ArgumentMetadata,
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ZodError, ZodSchema } from 'zod';

/**
 * Valida body/query/params contra um schema zod.
 * Uso: `@Body(new ZodValidationPipe(registerSchema)) dto: RegisterDTO`
 * Erros retornam 400 com mensagens de campo — sem stack trace.
 */
@Injectable()
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    try {
      return this.schema.parse(value);
    } catch (err) {
      if (err instanceof ZodError) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'ValidationError',
          message: err.issues.map((i) => ({
            path: i.path.join('.'),
            message: i.message,
          })),
        });
      }
      throw new BadRequestException('Requisição inválida.');
    }
  }
}
