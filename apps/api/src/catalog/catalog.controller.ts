import { Controller, Get, Param, Query } from '@nestjs/common';
import { catalogQuerySchema, type CatalogQueryDTO } from '@appgamenews/shared';
import { Public } from '../common/decorators/public.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CatalogService } from './catalog.service.js';

@Controller('games')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get()
  search(
    @Query(new ZodValidationPipe(catalogQuerySchema)) query: CatalogQueryDTO,
  ) {
    return this.catalog.search(query);
  }

  @Public()
  @Get(':idOrSlug')
  detail(@Param('idOrSlug') idOrSlug: string) {
    return this.catalog.getBySlugOrId(idOrSlug);
  }
}
