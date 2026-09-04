import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Platform } from '@appgamenews/shared';
import type { Env } from '../../config/env.schema.js';
import { HttpClient } from '../http-client.js';
import type {
  AdapterResult,
  NormalizedGame,
  NormalizedRelease,
  SourceAdapter,
} from './adapter.types.js';

function mapPlatform(slug: string): Platform | null {
  if (slug === 'pc') return 'pc';
  if (slug.startsWith('playstation')) return 'playstation';
  if (slug.startsWith('xbox')) return 'xbox';
  if (slug === 'nintendo-switch') return 'switch';
  if (slug === 'android') return 'android';
  if (slug === 'ios') return 'ios';
  return null;
}

interface RawgList {
  results?: {
    id: number;
    name: string;
    released: string | null;
    tba?: boolean;
    background_image: string | null;
    metacritic: number | null;
    platforms?: { platform: { slug: string } }[];
  }[];
}

@Injectable()
export class RawgAdapter implements SourceAdapter {
  readonly source = 'rawg' as const;
  private readonly http = new HttpClient();
  private readonly key: string;
  private readonly baseUrl: string;

  constructor(config: ConfigService<Env, true>) {
    this.key = config.get('RAWG_API_KEY', { infer: true });
    this.baseUrl = config.get('RAWG_BASE_URL', { infer: true });
  }

  isEnabled(): boolean {
    return this.key.length > 0;
  }

  async run(): Promise<AdapterResult> {
    if (!this.isEnabled()) return {};
    const games: NormalizedGame[] = [];
    const releases: NormalizedRelease[] = [];

    const today = new Date();
    const from = new Date(today.getTime() - 30 * 864e5).toISOString().slice(0, 10);
    const to = new Date(today.getTime() + 120 * 864e5).toISOString().slice(0, 10);

    for (let page = 1; page <= 3; page++) {
      const url = `${this.baseUrl}/games?key=${encodeURIComponent(this.key)}&dates=${from},${to}&ordering=released&page_size=40&page=${page}`;
      const body = await this.http.getJson<RawgList>(url);
      const results = body.results ?? [];
      if (results.length === 0) break;

      for (const g of results) {
        const sourceId = `rawg:${g.id}`;
        games.push({
          source: 'rawg',
          sourceId,
          title: g.name,
          coverUrl: g.background_image,
          metacritic: g.metacritic,
        });
        const platforms = new Set<Platform>();
        for (const p of g.platforms ?? []) {
          const mapped = mapPlatform(p.platform.slug);
          if (mapped) platforms.add(mapped);
        }
        for (const platform of platforms) {
          releases.push({
            source: 'rawg',
            sourceId,
            platform,
            type: 'base',
            name: g.name,
            releaseDate: g.tba || !g.released ? null : new Date(g.released).toISOString(),
          });
        }
      }
    }

    return { games, releases };
  }
}
