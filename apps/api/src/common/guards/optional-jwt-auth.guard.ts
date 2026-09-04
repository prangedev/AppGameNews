import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Autenticação opcional: popula req.user se houver token válido,
 * mas não bloqueia a requisição se não houver. Usado em rotas de catálogo
 * que enriquecem a resposta para usuários logados (ex.: flag "na wishlist").
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  override handleRequest<TUser = unknown>(_err: unknown, user: TUser): TUser {
    return (user ?? undefined) as TUser;
  }

  override canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
