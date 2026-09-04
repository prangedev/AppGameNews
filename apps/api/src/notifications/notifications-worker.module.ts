import { Module } from '@nestjs/common';
import { NotificationsModule } from './notifications.module.js';
import { NotificationsProcessor } from './notifications.processor.js';

/** Só é importado pelo WorkerModule (processo separado). */
@Module({
  imports: [NotificationsModule],
  providers: [NotificationsProcessor],
})
export class NotificationsWorkerModule {}
