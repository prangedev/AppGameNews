import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AuditService } from '../common/audit/audit.service.js';
import { UsersService, updateProfileSchema } from './users.service.js';

@UseGuards(JwtAuthGuard)
@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly audit: AuditService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: AuthUser) {
    return this.users.profile(user.id);
  }

  @Patch('profile')
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema))
    dto: z.infer<typeof updateProfileSchema>,
  ) {
    return this.users.updateProfile(user.id, dto);
  }

  @Delete('identities/:provider')
  @HttpCode(204)
  unlink(
    @CurrentUser() user: AuthUser,
    @Param('provider', new ZodValidationPipe(z.enum(['google', 'steam', 'epic'])))
    provider: string,
  ) {
    return this.users.unlinkProvider(user.id, provider);
  }

  @Get('export')
  async exportData(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.audit.record({ action: 'user.data.exported', actorId: user.id, req });
    return this.users.exportData(user.id);
  }

  @Post('delete')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Req() req: Request) {
    await this.audit.record({ action: 'user.account.deleted', actorId: user.id, req });
    await this.users.deleteAccount(user.id);
  }
}
