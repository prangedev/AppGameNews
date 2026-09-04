import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { OAuthFlowService } from './oauth-flow.service.js';

/**
 * Roda ANTES do AuthGuard do provedor no início do fluxo. Valida o
 * `redirect_uri` / `link_ticket` e grava o cookie de estado cifrado — porque
 * o AuthGuard redireciona ao provedor e o corpo do handler nunca executa.
 */
@Injectable()
export class OAuthBeginGuard implements CanActivate {
  constructor(private readonly flow: OAuthFlowService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    await this.flow.begin(http.getRequest<Request>(), http.getResponse<Response>());
    return true;
  }
}
