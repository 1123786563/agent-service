export type DeadLetterEntry<T = unknown> = {
  id: string;
  operation: string;
  payload: T;
  error: string;
  failedAt: number;
  retryCount: number;
  lastRetryAt: number | null;
  metadata: Record<string, unknown>;
};

export type DeadLetterQueueConfig = {
  maxSize: number;
  ttlMs: number;
  onEvict?: (entry: DeadLetterEntry) => void;
};

export const DEFAULT_DLQ_CONFIG: DeadLetterQueueConfig = {
  maxSize: 1000,
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
};

export class DeadLetterQueue<T = unknown> {
  private config: DeadLetterQueueConfig;
  private queue: Map<string, DeadLetterEntry<T>> = new Map();
  private idCounter = 0;

  constructor(config: Partial<DeadLetterQueueConfig> = {}) {
    this.config = { ...DEFAULT_DLQ_CONFIG, ...config };
  }

  push(entry: {
    operation: string;
    payload: T;
    error: unknown;
    retryCount?: number;
    metadata?: Record<string, unknown>;
  }): DeadLetterEntry<T> {
    // Evict expired entries first
    this.evictExpired();

    // Enforce max size by removing oldest
    if (this.queue.size >= this.config.maxSize) {
      const oldest = this.queue.keys().next().value;
      if (oldest) {
        const evicted = this.queue.get(oldest);
        if (evicted) this.config.onEvict?.(evicted);
        this.queue.delete(oldest);
      }
    }

    const id = `dlq_${++this.idCounter}_${Date.now()}`;
    const deadLetterEntry: DeadLetterEntry<T> = {
      id,
      operation: entry.operation,
      payload: entry.payload,
      error: entry.error instanceof Error ? entry.error.message : String(entry.error),
      failedAt: Date.now(),
      retryCount: entry.retryCount ?? 0,
      lastRetryAt: null,
      metadata: entry.metadata ?? {},
    };

    this.queue.set(id, deadLetterEntry);
    return deadLetterEntry;
  }

  getAll(): DeadLetterEntry<T>[] {
    this.evictExpired();
    return Array.from(this.queue.values());
  }

  getByOperation(operation: string): DeadLetterEntry<T>[] {
    return this.getAll().filter((e) => e.operation === operation);
  }

  get(id: string): DeadLetterEntry<T> | undefined {
    const entry = this.queue.get(id);
    if (!entry) return undefined;
    if (Date.now() - entry.failedAt > this.config.ttlMs) {
      this.queue.delete(id);
      return undefined;
    }
    return entry;
  }

  size(): number {
    this.evictExpired();
    return this.queue.size;
  }

  remove(id: string): boolean {
    return this.queue.delete(id);
  }

  retry(id: string): DeadLetterEntry<T> | undefined {
    const entry = this.queue.get(id);
    if (!entry) return undefined;
    entry.retryCount++;
    entry.lastRetryAt = Date.now();
    return entry;
  }

  clear(): number {
    const count = this.queue.size;
    this.queue.clear();
    return count;
  }

  private evictExpired() {
    const now = Date.now();
    for (const [id, entry] of this.queue) {
      if (now - entry.failedAt > this.config.ttlMs) {
        this.config.onEvict?.(entry);
        this.queue.delete(id);
      }
    }
  }
}
