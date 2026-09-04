import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  loginSchema,
  refreshSchema,
  registerSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  emailSchema,
  type LoginDTO,
  type RegisterDTO,
} from '@appgamenews/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { Public } from '../common/decorators/public.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { AuthService } from './auth.service.js';
import { TokenService, type TokenPair } from './token.service.js';
import { escapeHtml } from './html.util.js';

const REFRESH_COOKIE = 'agn_rt';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
  ) {}

  private setRefreshCookie(res: Response, pair: TokenPair): void {
    res.cookie(REFRESH_COOKIE, pair.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/auth',
      maxAge: 30 * 24 * 3600 * 1000,
    });
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('register')
  @HttpCode(202)
  register(
    @Body(new ZodValidationPipe(registerSchema)) dto: RegisterDTO,
    @Req() req: Request,
  ) {
    return this.auth.register(dto, req);
  }

  @Public()
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @Post('resend-verification')
  @HttpCode(202)
  resend(
    @Body(new ZodValidationPipe(z.object({ email: emailSchema }))) body: { email: string },
  ) {
    return this.auth.resendVerification(body.email);
  }

  @Public()
  @Get('verify-email')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'")
  async verifyEmailPage(@Query('token') token: string, @Req() req: Request): Promise<string> {
    try {
      verifyEmailSchema.parse({ token });
      await this.auth.verifyEmail(token, req);
      return page('E-mail confirmado', 'Pode voltar ao aplicativo e fazer login.');
    } catch {
      return page('Link inválido', 'O link de confirmação expirou ou já foi usado.');
    }
  }

  @Public()
  @Post('verify-email')
  @HttpCode(200)
  verifyEmailApi(
    @Body(new ZodValidationPipe(verifyEmailSchema)) body: { token: string },
    @Req() req: Request,
  ) {
    return this.auth.verifyEmail(body.token, req);
  }

  @Public()
  @Throttle({ auth: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  async login(
    @Body(new ZodValidationPipe(loginSchema)) dto: LoginDTO,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenPair> {
    const user = await this.auth.validateLocal(dto, req);
    const pair = await this.tokens.issuePair(
      {
        id: user.id,
        email: user.email,
        emailVerified: user.emailVerified,
        isAdmin: user.isAdmin,
      },
      req,
    );
    this.setRefreshCookie(res, pair);
    return pair;
  }

  @Public()
  @Throttle({ auth: { limit: 30, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<TokenPair> {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const fromBody = refreshSchema.safeParse(body);
    const presented = fromCookie ?? (fromBody.success ? fromBody.data.refreshToken : null);
    if (!presented) throw new UnauthorizedException('Refresh token ausente.');
    const pair = await this.tokens.rotate(presented, req);
    this.setRefreshCookie(res, pair);
    return pair;
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const fromCookie = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
    const fromBody = refreshSchema.safeParse(body);
    const presented = fromCookie ?? (fromBody.success ? fromBody.data.refreshToken : null);
    if (presented) await this.tokens.revoke(presented);
    res.clearCookie(REFRESH_COOKIE, { path: '/auth' });
  }

  @Public()
  @Throttle({ auth: { limit: 3, ttl: 60_000 } })
  @Post('password/forgot')
  @HttpCode(202)
  forgot(
    @Body(new ZodValidationPipe(requestPasswordResetSchema)) body: { email: string },
    @Req() req: Request,
  ) {
    return this.auth.requestPasswordReset(body.email, req);
  }

  @Public()
  @Throttle({ auth: { limit: 5, ttl: 60_000 } })
  @Post('password/reset')
  @HttpCode(200)
  reset(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: { token: string; password: string },
    @Req() req: Request,
  ) {
    return this.auth.resetPassword(body.token, body.password, req);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}

function page(title: string, body: string): string {
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>body{font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1rem;text-align:center}</style>
<h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p>`;
}
