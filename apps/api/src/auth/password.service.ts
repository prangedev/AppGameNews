import { Injectable, Logger } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash } from 'node:crypto';

/**
 * Hashing de senha com Argon2id (parâmetros recomendados OWASP) + verificação
 * opcional contra o Have I Been Pwned via k-anonymity (só os 5 primeiros
 * caracteres do SHA-1 saem da máquina; a senha nunca é enviada).
 */
@Injectable()
export class PasswordService {
  private readonly logger = new Logger(PasswordService.name);

  private readonly options: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plain: string): Promise<string> {
    return argon2.hash(plain, this.options);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }

  /** true se a senha aparece em vazamentos conhecidos. Falha "aberto" (retorna false) se a rede cair. */
  async isPwned(plain: string): Promise<boolean> {
    try {
      const sha1 = createHash('sha1').update(plain).digest('hex').toUpperCase();
      const prefix = sha1.slice(0, 5);
      const suffix = sha1.slice(5);
      const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
        headers: { 'Add-Padding': 'true' },
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return false;
      const text = await res.text();
      return text
        .split('\n')
        .some((line) => line.split(':')[0]?.trim() === suffix);
    } catch (err) {
      this.logger.warn(`checagem HIBP indisponível: ${(err as Error).message}`);
      return false;
    }
  }
}
