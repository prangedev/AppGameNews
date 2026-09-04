import { validateEnv, type Env } from './env.schema.js';

/**
 * Carrega e valida `process.env` uma única vez. Usado pelo ConfigModule.
 */
export function loadConfig(): Env {
  return validateEnv(process.env);
}

export type AppConfig = Env;
