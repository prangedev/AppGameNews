import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../../common/redis/redis.module.js';
import { CryptoService } from '../../common/crypto/crypto.service.js';

/**
 * Códigos de uso único trocados por tokens após um fluxo OAuth.
 * O código cru vai na URL de redirecionamento para o app/extensão; guardamos
 * só o hash + o userId, com TTL curto e consumo atômico (GETDEL).
 */
@Injectable()
export class OAuthCodeStore {
  private readonly ttlSeconds = 120;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly crypto: CryptoService,
  ) {}

  private key(hash: string): string {
    return `oauth:code:${hash}`;
  }

  async issue(userId: string): Promise<string> {
    const code = this.crypto.randomToken(32);
    await this.redis.set(this.key(this.crypto.sha256(code)), userId, 'EX', this.ttlSeconds);
    return code;
  }

  /** Consome o código (só funciona uma vez). Retorna o userId ou null. */
  async consume(code: string): Promise<string | null> {
    const k = this.key(this.crypto.sha256(code));
    // GETDEL é atômico no Redis >= 6.2
    const userId = await this.redis.getdel(k);
    return userId ?? null;
  }
}
