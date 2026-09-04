import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { oauthExchangeSchema } from '@appgamenews/shared';
import { Public } from '../../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { OAuthFlowService } from './oauth-flow.service.js';
import { ProviderConfiguredGuard } from './provider-configured.guard.js';
import { OAuthBeginGuard } from './oauth-begin.guard.js';

@Controller('auth')
export class OAuthController {
  constructor(private readonly flow: OAuthFlowService) {}

  /** Client autenticado pede um ticket para vincular um provider à conta atual. */
  @UseGuards(JwtAuthGuard)
  @Post('oauth/link-intent')
  @HttpCode(200)
  async linkIntent(@CurrentUser() user: AuthUser): Promise<{ linkTicket: string }> {
    return { linkTicket: await this.flow.createLinkTicket(user.id) };
  }

  // ---- Google -----------------------------------------------------------
  @Public()
  @Get('google')
  @UseGuards(ProviderConfiguredGuard, OAuthBeginGuard, AuthGuard('google'))
  googleStart(): void {
    /* AuthGuard redireciona ao provedor */
  }

  @Public()
  @Get('google/callback')
  @UseGuards(ProviderConfiguredGuard, AuthGuard('google'))
  googleCallback(@Req() req: Request, @Res() res: Response) {
    return this.flow.complete(req, res);
  }

  // ---- Steam ----------------------------------------------------------
  @Public()
  @Get('steam')
  @UseGuards(ProviderConfiguredGuard, OAuthBeginGuard, AuthGuard('steam'))
  steamStart(): void {}

  @Public()
  @Get('steam/callback')
  @UseGuards(ProviderConfiguredGuard, AuthGuard('steam'))
  steamCallback(@Req() req: Request, @Res() res: Response) {
    return this.flow.complete(req, res);
  }

  // ---- Epic ---------------------------------------------------------------
  @Public()
  @Get('epic')
  @UseGuards(ProviderConfiguredGuard, OAuthBeginGuard, AuthGuard('epic'))
  epicStart(): void {}

  @Public()
  @Get('epic/callback')
  @UseGuards(ProviderConfiguredGuard, AuthGuard('epic'))
  epicCallback(@Req() req: Request, @Res() res: Response) {
    return this.flow.complete(req, res);
  }

  // ---- troca do code por tokens --------------------------------------
  @Public()
  @Throttle({ auth: { limit: 20, ttl: 60_000 } })
  @Post('oauth/exchange')
  @HttpCode(200)
  async exchange(
    @Body(new ZodValidationPipe(oauthExchangeSchema)) body: { code: string },
    @Req() req: Request,
  ) {
    return this.flow.exchange(body.code, req);
  }
}
