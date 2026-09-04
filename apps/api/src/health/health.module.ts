import { Module } from '@nestjs/common';
import { IngestionModule } from '../ingestion/ingestion.module.js';
import { HealthController } from './health.controller.js';

@Module({
  imports: [IngestionModule],
  controllers: [HealthController],
})
export class HealthModule {}
