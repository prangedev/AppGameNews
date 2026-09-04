export const QUEUE_INGEST = 'ingest';
export const QUEUE_NOTIFY = 'notify';

export const INGEST_QUEUE = Symbol('INGEST_QUEUE');
export const NOTIFY_QUEUE = Symbol('NOTIFY_QUEUE');

/** Nomes de job dentro da fila `ingest`. */
export type IngestJob =
  | 'cheapshark'
  | 'itad'
  | 'rawg'
  | 'steam'
  | 'epic'
  | 'gog';

/** Nomes de job dentro da fila `notify`. */
export type NotifyJob = 'evaluate' | 'dispatch' | 'digest';

export interface NotifyEvaluatePayload {
  reason: 'price' | 'freebie' | 'release' | 'dlc' | 'update';
  gameIds: string[];
}

export interface NotifyDispatchPayload {
  notificationId: string;
}
