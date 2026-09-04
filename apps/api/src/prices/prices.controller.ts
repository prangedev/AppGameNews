import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { z } from 'zod';
import { Public } from '../common/decorators/public.decorator.js';
import { PricesService } from './prices.service.js';

const querySchema = z.object({
  currency: z.string().length(3).toUpperCase().default('BRL'),
  days: z.coerce.number().int().min(7).max(1825).default(365),
});

@Controller('games/:gameId/prices')
export class PricesController {
  constructor(private readonly prices: PricesService) {}

  @Public()
  @Get()
  history(@Param('gameId') gameId: string, @Query() rawQuery: unknown) {
    if (!/^[0-9a-f-]{36}$/i.test(gameId)) throw new BadRequestException('gameId inválido.');
    const q = querySchema.parse(rawQuery);
    return this.prices.history(gameId, q.currency, q.days);
  }
}
