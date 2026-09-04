import { Controller, Get, Query } from '@nestjs/common';
import { releasesQuerySchema } from '@appgamenews/shared';
import { Public } from '../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ReleasesService } from './releases.service.js';

@Controller('releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Public()
  @Get()
  calendar(
    @Query(new ZodValidationPipe(releasesQuerySchema)) query: Parameters<ReleasesService['calendar']>[0],
  ) {
    return this.releases.calendar(query);
  }
}
