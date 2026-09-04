import { Module } from '@nestjs/common';
import { PricesModule } from '../prices/prices.module.js';
import { IngestionService } from './ingestion.service.js';
import { SourceHealthService } from './source-health.service.js';
import { CheapSharkAdapter } from './adapters/cheapshark.adapter.js';
import { EpicAdapter } from './adapters/epic.adapter.js';
import { SteamAdapter } from './adapters/steam.adapter.js';
import { ItadAdapter } from './adapters/itad.adapter.js';
import { RawgAdapter } from './adapters/rawg.adapter.js';
import { GogAdapter } from './adapters/gog.adapter.js';

/** Peças compartilhadas entre o processo HTTP (painel de saúde) e o worker. */
@Module({
  imports: [PricesModule],
  providers: [
    IngestionService,
    SourceHealthService,
    CheapSharkAdapter,
    EpicAdapter,
    SteamAdapter,
    ItadAdapter,
    RawgAdapter,
    GogAdapter,
  ],
  exports: [
    IngestionService,
    SourceHealthService,
    CheapSharkAdapter,
    EpicAdapter,
    SteamAdapter,
    ItadAdapter,
    RawgAdapter,
    GogAdapter,
  ],
})
export class IngestionModule {}
