import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { notificationPrefSchema, registerDeviceSchema } from '@appgamenews/shared';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser, type AuthUser } from '../common/decorators/current-user.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { NotificationsService } from './notifications.service.js';

const feedQuery = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(30),
});
const tokenBody = z.object({ fcmToken: z.string().min(20).max(4096) });

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  feed(@CurrentUser() user: AuthUser, @Query() raw: unknown) {
    const q = feedQuery.parse(raw);
    return this.notifications.feed(user.id, q.page, q.pageSize);
  }

  @Post('read-all')
  @HttpCode(204)
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.id);
  }

  @Patch(':id/read')
  @HttpCode(204)
  read(@CurrentUser() user: AuthUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.notifications.markRead(user.id, id);
  }

  // ---- preferências ---------------------------------------------------
  @Get('preferences')
  getPrefs(@CurrentUser() user: AuthUser) {
    return this.notifications.getPrefs(user.id);
  }

  @Patch('preferences')
  updatePrefs(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(notificationPrefSchema))
    dto: z.infer<typeof notificationPrefSchema>,
  ) {
    return this.notifications.updatePrefs(user.id, dto);
  }

  // ---- devices --------------------------------------------------------
  @Post('devices')
  registerDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(registerDeviceSchema))
    dto: z.infer<typeof registerDeviceSchema>,
  ) {
    return this.notifications.registerDevice(user.id, dto);
  }

  @Delete('devices')
  @HttpCode(204)
  removeDevice(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(tokenBody)) body: { fcmToken: string },
  ) {
    return this.notifications.removeDevice(user.id, body.fcmToken);
  }
}
