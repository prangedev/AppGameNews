import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { HttpClient } from '../http-client.js';
import type { AdapterResult, NormalizedFreebie, SourceAdapter } from './adapter.types.js';

interface EpicPromoResponse {
  data?: {
    Catalog?: {
      searchStore?: {
        elements?: EpicElement[];
      };
    };
  };
}

interface EpicElement {
  title: string;
  productSlug?: string | null;
  urlSlug?: string | null;
  offerMappings?: { pageSlug?: string }[];
  catalogNs?: { mappings?: { pageSlug?: string }[] };
  keyImages?: { type: string; url: string }[];
  price?: {
    totalPrice?: { discountPrice?: number; originalPrice?: number };
  };
  promotions?: {
    promotionalOffers?: { promotionalOffers?: EpicOfferWindow[] }[];
    upcomingPromotionalOffers?: { promotionalOffers?: EpicOfferWindow[] }[];
  } | null;
}

interface EpicOfferWindow {
  startDate: string;
  endDate: string;
  discountSetting?: { discountPercentage?: number };
}

@Injectable()
export class EpicAdapter implements SourceAdapter {
  readonly source = 'epic' as const;
  private readonly http = new HttpClient();
  private readonly url: string;

  constructor(config: ConfigService<Env, true>) {
    this.url = `${config.get('EPIC_FREEGAMES_URL', { infer: true })}?locale=pt-BR&country=BR&allowCountries=BR`;
  }

  isEnabled(): boolean {
    return true;
  }

  async run(): Promise<AdapterResult> {
    const body = await this.http.getJson<EpicPromoResponse>(this.url, {
      conditionalKey: 'epic:freegames',
    });
    const elements = body.data?.Catalog?.searchStore?.elements ?? [];
    const freebies: NormalizedFreebie[] = [];

    for (const el of elements) {
      const current = el.promotions?.promotionalOffers?.[0]?.promotionalOffers ?? [];
      const upcoming = el.promotions?.upcomingPromotionalOffers?.[0]?.promotionalOffers ?? [];
      const windows = [...current, ...upcoming].filter(
        (w) => (w.discountSetting?.discountPercentage ?? 0) === 0,
      );
      if (windows.length === 0) continue;

      const slug =
        el.productSlug ||
        el.urlSlug ||
        el.offerMappings?.[0]?.pageSlug ||
        el.catalogNs?.mappings?.[0]?.pageSlug ||
        null;
      if (!slug) continue;

      const cover =
        el.keyImages?.find((k) => k.type === 'OfferImageWide' || k.type === 'DieselStoreFrontWide')?.url ??
        el.keyImages?.[0]?.url ??
        null;

      for (const w of windows) {
        freebies.push({
          source: 'epic',
          title: el.title,
          store: 'epic',
          platform: 'pc',
          kind: 'keep',
          startsAt: w.startDate ?? null,
          endsAt: w.endDate ?? null,
          claimUrl: `https://store.epicgames.com/p/${slug.replace(/^\//, '')}`,
          coverUrl: cover,
        });
      }
    }

    return { freebies };
  }
}
