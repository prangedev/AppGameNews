import { Module } from '@nestjs/common';
import { FreebiesController } from './freebies.controller.js';
import { FreebiesService } from './freebies.service.js';

@Module({
  controllers: [FreebiesController],
  providers: [FreebiesService],
  exports: [FreebiesService],
})
export class FreebiesModule {}
