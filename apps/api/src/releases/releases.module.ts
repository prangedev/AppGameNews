import { Module } from '@nestjs/common';
import { ReleasesController } from './releases.controller.js';
import { ReleasesService } from './releases.service.js';

@Module({
  controllers: [ReleasesController],
  providers: [ReleasesService],
})
export class ReleasesModule {}
