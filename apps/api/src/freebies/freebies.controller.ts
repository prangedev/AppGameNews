import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { PLATFORMS } from '@appgamenews/shared';
import { Public } from '../common/decorators/public.decorator.js';
import { FreebiesService } from './freebies.service.js';

const querySchema = z.object({
  upcoming: z.coerce.boolean().default(false),
  platform: z.enum(PLATFORMS).optional(),
});

@Controller('freebies')
export class FreebiesController {
  constructor(private readonly freebies: FreebiesService) {}

  @Public()
  @Get()
  list(@Query() rawQuery: unknown) {
    const q = querySchema.parse(rawQuery);
    return this.freebies.list({ includeUpcoming: q.upcoming, platform: q.platform });
  }
}
