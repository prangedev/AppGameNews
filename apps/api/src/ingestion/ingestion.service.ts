import { Injectable, Logger } from '@nestjs/common';
import { normalizeTitle, slugify } from '@appgamenews/shared';
import { PrismaService } from '../common/prisma/prisma.service.js';
import { PricesService } from '../prices/prices.service.js';
import type {
  AdapterResult,
  NormalizedFreebie,
  NormalizedGame,
  NormalizedNews,
  NormalizedPrice,
  NormalizedRelease,
} from './adapters/adapter.types.js';

export interface IngestionOutcome {
  /** jogos cujo preço mudou nesta execução (para avaliar gatilhos price/target). */
  priceGameIds: Set<string>;
  /** jogos que ganharam um freebie ativo/futuro nesta execução. */
  freebieGameIds: Set<string>;
  /** jogos com uma nova release/lançamento detectado. */
  releaseGameIds: Set<string>;
  /** jogos com notícia nova classificada como atualização/patch. */
  updateGameIds: Set<string>;
  itemsProcessed: number;
}

/**
 * Persiste o resultado normalizado de um adapter no schema canônico,
 * fazendo dedup entre fontes por (source, sourceId) + fallback por título
 * normalizado, e devolve os jogos afetados por categoria (para a avaliação
 * de regras da wishlist).
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);
  // acima desse intervalo, gravamos um novo price point mesmo sem mudança de valor
  // (mantém um "ainda é esse o preço" periódico para o gráfico de histórico).
  private readonly samePriceReinsertMs = 6 * 3600_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prices: PricesService,
  ) {}

  async persist(result: AdapterResult): Promise<IngestionOutcome> {
    const outcome: IngestionOutcome = {
      priceGameIds: new Set(),
      freebieGameIds: new Set(),
      releaseGameIds: new Set(),
      updateGameIds: new Set(),
      itemsProcessed: 0,
    };

    const sourceKeyToGameId = await this.upsertGames(result.games ?? []);

    if (result.prices?.length) {
      await this.upsertPrices(result.prices, sourceKeyToGameId, outcome);
    }
    if (result.releases?.length) {
      await this.upsertReleases(result.releases, sourceKeyToGameId, outcome);
    }
    if (result.freebies?.length) {
      await this.upsertFreebies(result.freebies, outcome);
    }
    if (result.news?.length) {
      await this.upsertNews(result.news, sourceKeyToGameId, outcome);
    }

    outcome.itemsProcessed =
      (result.games?.length ?? 0) +
      (result.prices?.length ?? 0) +
      (result.releases?.length ?? 0) +
      (result.freebies?.length ?? 0) +
      (result.news?.length ?? 0);

    return outcome;
  }

  // ---- games -------------------------------------------------------------

  /** Retorna o mapa "source:sourceId" -> gameId (uuid interno). */
  private async upsertGames(games: NormalizedGame[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();

    for (const g of games) {
      const key = `${g.source}:${g.sourceId}`;
      try {
        const existing = await this.prisma.gameExternalId.findUnique({
          where: { source_sourceId: { source: g.source, sourceId: g.sourceId } },
        });
        if (existing) {
          map.set(key, existing.gameId);
          // atualiza metadados só se vieram preenchidos (não sobrescreve com null)
          await this.prisma.game.update({
            where: { id: existing.gameId },
            data: compact({
              coverUrl: g.coverUrl,
              description: g.description,
              developer: g.developer,
              publisher: g.publisher,
              metacritic: g.metacritic,
            }),
          });
          continue;
        }

        const normalized = normalizeTitle(g.title);
        const bySameTitle = await this.prisma.game.findFirst({ where: { normalized } });
        if (bySameTitle) {
          await this.prisma.gameExternalId.create({
            data: { gameId: bySameTitle.id, source: g.source, sourceId: g.sourceId },
          });
          map.set(key, bySameTitle.id);
          continue;
        }

        const slug = await this.uniqueSlug(g.title);
        const created = await this.prisma.game.create({
          data: {
            slug,
            title: g.title,
            normalized,
            coverUrl: g.coverUrl ?? null,
            description: g.description ?? null,
            developer: g.developer ?? null,
            publisher: g.publisher ?? null,
            tags: g.tags ?? [],
            metacritic: g.metacritic ?? null,
            externalIds: { create: { source: g.source, sourceId: g.sourceId } },
          },
        });
        map.set(key, created.id);
      } catch (err) {
        this.logger.warn(`upsertGame falhou para ${key}: ${(err as Error).message}`);
      }
    }

    return map;
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'jogo';
    let candidate = base;
    let n = 1;
    // poucas colisões esperadas; loop curto e seguro
    while (await this.prisma.game.findUnique({ where: { slug: candidate } })) {
      n += 1;
      candidate = `${base}-${n}`;
      if (n > 50) {
        candidate = `${base}-${Date.now().toString(36)}`;
        break;
      }
    }
    return candidate;
  }

  // ---- prices --------------------------------------------------------------

  private async upsertPrices(
    prices: NormalizedPrice[],
    sourceKeyToGameId: Map<string, string>,
    outcome: IngestionOutcome,
  ): Promise<void> {
    const touchedGameIds = new Set<string>();

    for (const p of prices) {
      const gameId = sourceKeyToGameId.get(`${p.source}:${p.sourceId}`);
      if (!gameId) continue;

      try {
        const latest = await this.prisma.pricePoint.findFirst({
          where: { gameId, store: p.store, currency: p.currency },
          orderBy: { capturedAt: 'desc' },
        });
        const unchanged =
          latest &&
          latest.amountCents === p.amountCents &&
          latest.discountPct === p.discountPct &&
          Date.now() - latest.capturedAt.getTime() < this.samePriceReinsertMs;
        if (unchanged) continue;

        await this.prisma.pricePoint.create({
          data: {
            gameId,
            store: p.store,
            currency: p.currency,
            amountCents: p.amountCents,
            regularCents: p.regularCents,
            discountPct: p.discountPct,
            url: p.url ?? null,
            source: p.source,
          },
        });
        touchedGameIds.add(gameId);
        if (!latest || latest.amountCents !== p.amountCents) {
          outcome.priceGameIds.add(gameId);
        }
      } catch (err) {
        this.logger.warn(`upsertPrice falhou (game=${gameId}): ${(err as Error).message}`);
      }
    }

    for (const gameId of touchedGameIds) {
      await this.prices.recomputeLowest(gameId).catch((err: Error) =>
        this.logger.warn(`recomputeLowest falhou (game=${gameId}): ${err.message}`),
      );
    }
  }

  // ---- releases -----------------------------------------------------------

  private async upsertReleases(
    releases: NormalizedRelease[],
    sourceKeyToGameId: Map<string, string>,
    outcome: IngestionOutcome,
  ): Promise<void> {
    for (const r of releases) {
      const gameId = sourceKeyToGameId.get(`${r.source}:${r.sourceId}`);
      if (!gameId) continue;
      // nome não pode ser null na chave composta (NULL quebraria a unicidade no Postgres)
      const name = r.name ?? '(sem nome)';

      try {
        const releaseDate = r.releaseDate ? new Date(r.releaseDate) : null;
        const existing = await this.prisma.gameRelease.findUnique({
          where: {
            gameId_platform_type_name: { gameId, platform: r.platform, type: r.type, name },
          },
        });

        if (existing) {
          if (releaseDate && existing.releaseDate?.getTime() !== releaseDate.getTime()) {
            await this.prisma.gameRelease.update({
              where: { id: existing.id },
              data: { releaseDate, region: r.region ?? existing.region, version: r.version ?? existing.version },
            });
            // uma release que passou a ter data (ex.: "em breve" -> lançou) conta como evento
            if (releaseDate.getTime() <= Date.now()) outcome.releaseGameIds.add(gameId);
          }
          continue;
        }

        await this.prisma.gameRelease.create({
          data: {
            gameId,
            platform: r.platform,
            region: r.region ?? null,
            releaseDate,
            type: r.type,
            name,
            version: r.version ?? null,
            source: r.source,
          },
        });
        if (releaseDate && releaseDate.getTime() <= Date.now()) {
          outcome.releaseGameIds.add(gameId);
        }
      } catch (err) {
        this.logger.warn(`upsertRelease falhou (game=${gameId}): ${(err as Error).message}`);
      }
    }
  }

  // ---- freebies -----------------------------------------------------------

  /**
   * `startsAt` pode ser null e a chave `@@unique([store, title, startsAt])`
   * não protege contra duplicatas nesse caso (NULL != NULL no Postgres).
   * Por isso fazemos find + create/update manual em vez de `upsert`.
   */
  private async upsertFreebies(freebies: NormalizedFreebie[], outcome: IngestionOutcome): Promise<void> {
    for (const f of freebies) {
      try {
        const startsAt = f.startsAt ? new Date(f.startsAt) : null;
        const endsAt = f.endsAt ? new Date(f.endsAt) : null;

        const existing = await this.prisma.freebie.findFirst({
          where: { store: f.store, title: f.title, startsAt },
        });

        const normalized = normalizeTitle(f.title);
        const linkedGame = await this.prisma.game.findFirst({ where: { normalized } });

        if (existing) {
          await this.prisma.freebie.update({
            where: { id: existing.id },
            data: { endsAt, claimUrl: f.claimUrl, coverUrl: f.coverUrl ?? existing.coverUrl },
          });
          if (linkedGame) outcome.freebieGameIds.add(linkedGame.id);
          continue;
        }

        await this.prisma.freebie.create({
          data: {
            gameId: linkedGame?.id ?? null,
            title: f.title,
            store: f.store,
            platform: f.platform,
            kind: f.kind,
            startsAt,
            endsAt,
            claimUrl: f.claimUrl,
            coverUrl: f.coverUrl ?? null,
            source: f.source,
          },
        });
        if (linkedGame) outcome.freebieGameIds.add(linkedGame.id);
      } catch (err) {
        this.logger.warn(`upsertFreebie falhou ("${f.title}"): ${(err as Error).message}`);
      }
    }
  }

  // ---- news -----------------------------------------------------------

  /** Palavras que indicam uma notícia de patch/atualização (heurística simples). */
  private static readonly UPDATE_HINTS = /\b(patch|update|atualiza|hotfix|balance|nerf|buff)\w*/i;

  private async upsertNews(
    news: NormalizedNews[],
    sourceKeyToGameId: Map<string, string>,
    outcome: IngestionOutcome,
  ): Promise<void> {
    for (const n of news) {
      try {
        const gameId = n.gameSourceId ? sourceKeyToGameId.get(`${n.source}:${n.gameSourceId}`) : null;
        await this.prisma.newsItem.upsert({
          where: { externalId: n.externalId },
          create: {
            externalId: n.externalId,
            gameId: gameId ?? null,
            source: n.source,
            title: n.title,
            url: n.url,
            publishedAt: new Date(n.publishedAt),
            summary: n.summary ?? null,
          },
          update: { title: n.title, summary: n.summary ?? null },
        });
        if (gameId && IngestionService.UPDATE_HINTS.test(n.title)) {
          outcome.updateGameIds.add(gameId);
        }
      } catch (err) {
        this.logger.warn(`upsertNews falhou ("${n.title}"): ${(err as Error).message}`);
      }
    }
  }
}

/** Remove chaves com valor undefined/null de um objeto (evita sobrescrever com vazio). */
function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}
