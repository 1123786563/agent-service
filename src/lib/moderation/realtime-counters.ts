export interface CounterStore {
  increment(key: string, value?: number): Promise<number>;
  decrement(key: string, value?: number): Promise<number>;
  get(key: string): Promise<number>;
  set(key: string, value: number): Promise<void>;
  getMulti(keys: string[]): Promise<Record<string, number>>;
  expire(key: string, ttlSeconds: number): Promise<void>;
}

export class InMemoryCounterStore implements CounterStore {
  private counters = new Map<string, number>();
  private expirations = new Map<string, number>();

  async increment(key: string, value: number = 1): Promise<number> {
    if (this.isExpired(key)) {
      this.counters.delete(key);
      this.expirations.delete(key);
    }
    const current = this.counters.get(key) ?? 0;
    const newVal = current + value;
    this.counters.set(key, newVal);
    return newVal;
  }

  async decrement(key: string, value: number = 1): Promise<number> {
    if (this.isExpired(key)) {
      this.counters.delete(key);
      this.expirations.delete(key);
    }
    const current = this.counters.get(key) ?? 0;
    const newVal = current - value;
    this.counters.set(key, newVal);
    return newVal;
  }

  async get(key: string): Promise<number> {
    if (this.isExpired(key)) {
      this.counters.delete(key);
      this.expirations.delete(key);
      return 0;
    }
    return this.counters.get(key) ?? 0;
  }

  async set(key: string, value: number): Promise<void> {
    this.counters.set(key, value);
  }

  async getMulti(keys: string[]): Promise<Record<string, number>> {
    const result: Record<string, number> = {};
    for (const key of keys) {
      result[key] = await this.get(key);
    }
    return result;
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    this.expirations.set(key, Date.now() + ttlSeconds * 1000);
  }

  private isExpired(key: string): boolean {
    const exp = this.expirations.get(key);
    if (exp === undefined) return false;
    return Date.now() > exp;
  }
}

export const COUNTER_KEYS = {
  flaggedTotal: "mod:flagged:total",
  flaggedText: "mod:flagged:text",
  flaggedImage: "mod:flagged:image",
  resolvedTotal: "mod:resolved:total",
  pendingTotal: "mod:pending:total",
  criticalPending: "mod:pending:critical",
  falsePositives: "mod:false_positive:total",
  itemsLastHour: "mod:items:last_hour",
  eventsProcessed: "mod:events:processed",
} as const;

export async function incrementFlaggedCounter(
  store: CounterStore,
  contentType: "TEXT" | "IMAGE"
): Promise<void> {
  await Promise.all([
    store.increment(COUNTER_KEYS.flaggedTotal),
    store.increment(contentType === "TEXT" ? COUNTER_KEYS.flaggedText : COUNTER_KEYS.flaggedImage),
    store.increment(COUNTER_KEYS.itemsLastHour),
  ]);
  await store.expire(COUNTER_KEYS.itemsLastHour, 3600);
}

export async function incrementResolvedCounter(
  store: CounterStore,
  isFalsePositive: boolean
): Promise<void> {
  await store.increment(COUNTER_KEYS.resolvedTotal);
  if (isFalsePositive) {
    await store.increment(COUNTER_KEYS.falsePositives);
  }
}

export function createCounterStore(): CounterStore {
  return new InMemoryCounterStore();
}
