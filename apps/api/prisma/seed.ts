/**
 * Seed de demonstração: cobre o que as fontes gratuitas (CheapShark/Epic/
 * Steam) não alcançam — consoles, EA, Ubisoft, Prime Gaming, Google Play —
 * além de um usuário de teste. Roda com `pnpm --filter @appgamenews/api prisma:seed`.
 * Idempotente: pode ser executado várias vezes sem duplicar linhas.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { normalizeTitle, slugify } from '@appgamenews/shared';

const prisma = new PrismaClient();

async function upsertSeedGame(input: {
  sourceId: string;
  title: string;
  coverUrl?: string;
  description?: string;
  developer?: string;
  publisher?: string;
  tags?: string[];
  metacritic?: number;
}) {
  const existing = await prisma.gameExternalId.findUnique({
    where: { source_sourceId: { source: 'seed', sourceId: input.sourceId } },
  });
  if (existing) return existing.gameId;

  const normalized = normalizeTitle(input.title);
  const slug = slugify(input.title);
  const game = await prisma.game.create({
    data: {
      slug,
      title: input.title,
      normalized,
      coverUrl: input.coverUrl ?? null,
      description: input.description ?? null,
      developer: input.developer ?? null,
      publisher: input.publisher ?? null,
      tags: input.tags ?? [],
      metacritic: input.metacritic ?? null,
      externalIds: { create: { source: 'seed', sourceId: input.sourceId } },
    },
  });
  return game.id;
}

async function main(): Promise<void> {
  console.log('Seed: criando catálogo de demonstração (consoles, EA, Ubisoft, Prime, Google Play)...');

  // ---- Xbox --------------------------------------------------------------
  const haloId = await upsertSeedGame({
    sourceId: 'xbox-halo-infinite',
    title: 'Halo Infinite',
    developer: '343 Industries',
    publisher: 'Xbox Game Studios',
    tags: ['fps', 'sci-fi'],
    metacritic: 87,
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: haloId, platform: 'xbox', type: 'base', name: 'Halo Infinite' } },
    create: {
      gameId: haloId, platform: 'xbox', type: 'base', name: 'Halo Infinite',
      releaseDate: new Date('2021-12-08'), source: 'seed',
    },
    update: {},
  });
  await prisma.dlc.upsert({
    where: { gameId_store_title: { gameId: haloId, store: 'xbox', title: 'Temporada 6: Um Novo Amanhecer' } },
    create: {
      gameId: haloId, store: 'xbox', title: 'Temporada 6: Um Novo Amanhecer',
      releaseDate: new Date('2025-03-01'), source: 'seed',
    },
    update: {},
  });
  await createPrice(haloId, 'xbox', 24990, 24990, 0);

  // ---- PlayStation ---------------------------------------------------------
  const spidermanId = await upsertSeedGame({
    sourceId: 'psn-spiderman-2',
    title: "Marvel's Spider-Man 2",
    developer: 'Insomniac Games',
    publisher: 'Sony Interactive Entertainment',
    tags: ['action', 'super-heroi'],
    metacritic: 90,
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: spidermanId, platform: 'playstation', type: 'base', name: "Marvel's Spider-Man 2" } },
    create: {
      gameId: spidermanId, platform: 'playstation', type: 'base', name: "Marvel's Spider-Man 2",
      releaseDate: new Date('2023-10-20'), source: 'seed',
    },
    update: {},
  });
  await createPrice(spidermanId, 'psn', 34990, 34990, 0);
  await createPrice(spidermanId, 'psn', 24990, 34990, 29); // promo passada, ainda histórico

  // ---- Nintendo Switch / Switch 2 -----------------------------------------
  const zeldaId = await upsertSeedGame({
    sourceId: 'nintendo-totk',
    title: 'The Legend of Zelda: Tears of the Kingdom',
    developer: 'Nintendo EPD',
    publisher: 'Nintendo',
    tags: ['aventura', 'mundo-aberto'],
    metacritic: 96,
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: zeldaId, platform: 'switch', type: 'base', name: 'Tears of the Kingdom' } },
    create: {
      gameId: zeldaId, platform: 'switch', type: 'base', name: 'Tears of the Kingdom',
      releaseDate: new Date('2023-05-12'), source: 'seed',
    },
    update: {},
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: zeldaId, platform: 'switch2', type: 'update', name: 'Atualização Switch 2 Edition' } },
    create: {
      gameId: zeldaId, platform: 'switch2', type: 'update', name: 'Atualização Switch 2 Edition',
      releaseDate: new Date('2025-06-05'), source: 'seed',
    },
    update: {},
  });
  await createPrice(zeldaId, 'nintendo', 29990, 29990, 0);

  // ---- EA -------------------------------------------------------------
  const fc25Id = await upsertSeedGame({
    sourceId: 'ea-fc25',
    title: 'EA Sports FC 25',
    developer: 'EA Vancouver',
    publisher: 'EA',
    tags: ['esporte', 'futebol'],
    metacritic: 78,
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: fc25Id, platform: 'pc', type: 'base', name: 'EA Sports FC 25' } },
    create: { gameId: fc25Id, platform: 'pc', type: 'base', name: 'EA Sports FC 25', releaseDate: new Date('2024-09-27'), source: 'seed' },
    update: {},
  });
  await createPrice(fc25Id, 'ea', 19990, 34990, 43);

  // ---- Ubisoft --------------------------------------------------------
  const avatarId = await upsertSeedGame({
    sourceId: 'ubi-avatar-frontiers',
    title: 'Avatar: Frontiers of Pandora',
    developer: 'Massive Entertainment',
    publisher: 'Ubisoft',
    tags: ['mundo-aberto', 'ação'],
    metacritic: 78,
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: avatarId, platform: 'pc', type: 'base', name: 'Avatar: Frontiers of Pandora' } },
    create: { gameId: avatarId, platform: 'pc', type: 'base', name: 'Avatar: Frontiers of Pandora', releaseDate: new Date('2023-12-07'), source: 'seed' },
    update: {},
  });
  await createPrice(avatarId, 'ubisoft', 14995, 29990, 50);

  // ---- Google Play -----------------------------------------------------
  const genshinId = await upsertSeedGame({
    sourceId: 'gplay-genshin',
    title: 'Genshin Impact',
    developer: 'HoYoverse',
    publisher: 'HoYoverse',
    tags: ['gacha', 'mundo-aberto', 'free-to-play'],
    metacritic: 84,
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: genshinId, platform: 'android', type: 'base', name: 'Genshin Impact' } },
    create: { gameId: genshinId, platform: 'android', type: 'base', name: 'Genshin Impact', releaseDate: new Date('2020-09-28'), source: 'seed' },
    update: {},
  });
  await prisma.gameRelease.upsert({
    where: { gameId_platform_type_name: { gameId: genshinId, platform: 'android', type: 'update', name: 'Versão 5.4' } },
    create: { gameId: genshinId, platform: 'android', type: 'update', name: 'Versão 5.4', releaseDate: new Date('2025-02-12'), source: 'seed' },
    update: {},
  });
  await createPrice(genshinId, 'google_play', 0, 0, 0);

  // ---- Prime Gaming (freebie) ---------------------------------------------
  const controlId = await upsertSeedGame({
    sourceId: 'prime-control',
    title: 'Control Ultimate Edition',
    developer: 'Remedy Entertainment',
    publisher: '505 Games',
    tags: ['ação', 'sobrenatural'],
    metacritic: 85,
  });
  await prisma.freebie.upsert({
    where: { store_title_startsAt: { store: 'amazon_prime', title: 'Control Ultimate Edition', startsAt: new Date('2025-08-01') } },
    create: {
      gameId: controlId,
      title: 'Control Ultimate Edition',
      store: 'amazon_prime',
      platform: 'pc',
      kind: 'prime',
      startsAt: new Date('2025-08-01'),
      endsAt: new Date('2025-12-31'),
      claimUrl: 'https://gaming.amazon.com/control-ultimate-edition',
      source: 'seed',
    },
    update: {},
  });

  // ---- usuário de demonstração ---------------------------------------------
  const demoEmail = 'demo@appgamenews.local';
  const demoPasswordHash = await argon2.hash('DemoSenha!Forte123', { type: argon2.argon2id });
  const demoUser = await prisma.user.upsert({
    where: { email: demoEmail },
    create: {
      email: demoEmail,
      displayName: 'Jogador Demo',
      passwordHash: demoPasswordHash,
      emailVerified: true,
      notificationPref: { create: { channels: ['in_app', 'push'] } },
    },
    update: {},
  });

  await prisma.wishlistItem.upsert({
    where: { userId_gameId: { userId: demoUser.id, gameId: spidermanId } },
    create: {
      userId: demoUser.id,
      gameId: spidermanId,
      currency: 'BRL',
      targetPriceCents: 19990,
      triggers: ['any_drop', 'target', 'free'],
    },
    update: {},
  });

  console.log(`Seed concluído. Usuário de teste: ${demoEmail} / senha: DemoSenha!Forte123`);
}

async function createPrice(
  gameId: string,
  store: string,
  amountCents: number,
  regularCents: number,
  discountPct: number,
): Promise<void> {
  const already = await prisma.pricePoint.findFirst({
    where: { gameId, store, currency: 'BRL', amountCents },
  });
  if (already) return;
  await prisma.pricePoint.create({
    data: { gameId, store, currency: 'BRL', amountCents, regularCents, discountPct, source: 'seed' },
  });
  const lowest = await prisma.pricePoint.findFirst({
    where: { gameId, store, currency: 'BRL' },
    orderBy: { amountCents: 'asc' },
  });
  if (lowest) {
    await prisma.priceLowest.upsert({
      where: { gameId_store_currency: { gameId, store, currency: 'BRL' } },
      create: { gameId, store, currency: 'BRL', amountCents: lowest.amountCents, at: lowest.capturedAt },
      update: { amountCents: lowest.amountCents, at: lowest.capturedAt },
    });
  }
}

main()
  .catch((err) => {
    console.error('Seed falhou:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
