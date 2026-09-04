import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { RuleEvaluatorService } from './rule-evaluator.service.js';
import { FcmService } from './fcm.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, RuleEvaluatorService, FcmService],
  exports: [NotificationsService, RuleEvaluatorService, FcmService],
})
export class NotificationsModule {}
