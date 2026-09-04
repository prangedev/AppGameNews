import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminController } from './admin.controller.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AdminController],
})
export class AdminModule {}
