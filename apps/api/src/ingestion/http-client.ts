import { Logger } from '@nestjs/common';

interface FetchJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** chave de cache condicional (ETag / Last-Modified) por URL */
  conditionalKey?: string;
}

const etagCache = new Map<string, { etag?: string; lastModified?: string; body: unknown }>();

/**
 * Cliente HTTP para as fontes externas:
 *  - timeout por requisição;
 *  - retry com backoff exponencial + jitter em 429/5xx/erro de rede;
 *  - suporte a ETag/If-Modified-Since (304 -> devolve corpo cacheado);
 *  - User-Agent identificável.
 */
export class HttpClient {
  private readonly logger = new Logger(HttpClient.name);
  private readonly ua = 'AppGameNews/0.1 (+https://appgamenews.local)';

  async getJson<T>(url: string, opts: FetchJsonOptions = {}): Promise<T> {
    const { timeoutMs = 8000, retries = 3, conditionalKey } = opts;
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      attempt++;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const cached = conditionalKey ? etagCache.get(conditionalKey) : undefined;
        const headers: Record<string, string> = {
          'User-Agent': this.ua,
          Accept: 'application/json',
          ...opts.headers,
        };
        if (cached?.etag) headers['If-None-Match'] = cached.etag;
        if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

        const res = await fetch(url, { headers, signal: controller.signal });

        if (res.status === 304 && cached) {
          return cached.body as T;
        }
        if (res.status === 429 || res.status >= 500) {
          throw new RetryableError(`HTTP ${res.status}`);
        }
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} em ${safeUrl(url)}`);
        }

        const body = (await res.json()) as T;
        if (conditionalKey) {
          etagCache.set(conditionalKey, {
            etag: res.headers.get('etag') ?? undefined,
            lastModified: res.headers.get('last-modified') ?? undefined,
            body,
          });
        }
        return body;
      } catch (err) {
        const retryable =
          err instanceof RetryableError ||
          (err as Error).name === 'AbortError' ||
          (err as { code?: string }).code === 'ECONNRESET';
        if (!retryable || attempt > retries) {
          throw err instanceof Error ? err : new Error(String(err));
        }
        const delay = Math.min(30_000, 2 ** attempt * 500) + Math.random() * 400;
        this.logger.warn(
          `retry ${attempt}/${retries} para ${safeUrl(url)} em ${Math.round(delay)}ms (${(err as Error).message})`,
        );
        await sleep(delay);
      } finally {
        clearTimeout(timer);
      }
    }
  }
}

class RetryableError extends Error {}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Remove querystring de logs (pode conter api keys). */
function safeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}
