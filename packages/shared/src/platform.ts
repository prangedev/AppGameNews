/** Plataformas de hardware suportadas. */
export const PLATFORMS = [
  'pc',
  'xbox',
  'playstation',
  'switch',
  'switch2',
  'android',
  'ios',
] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  pc: 'PC',
  xbox: 'Xbox',
  playstation: 'PlayStation',
  switch: 'Nintendo Switch',
  switch2: 'Nintendo Switch 2',
  android: 'Android',
  ios: 'iOS',
};

export function isPlatform(value: unknown): value is Platform {
  return typeof value === 'string' && (PLATFORMS as readonly string[]).includes(value);
}
