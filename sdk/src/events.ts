import type { ModerationEvent, SdkConfig } from "./types";

export type EventListener = (event: ModerationEvent) => void;
export type ErrorListener = (error: Error) => void;

export class ModerationEventEmitter {
  private listeners = new Map<string, Set<EventListener>>();
  private errorListeners = new Set<ErrorListener>();
  private eventSource: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private config: SdkConfig;
  private closed = false;

  constructor(config: SdkConfig) {
    this.config = config;
  }

  on(event: string, listener: EventListener): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.listeners.get(event)?.delete(listener);
  }

  onAny(listener: EventListener): () => void {
    return this.on("*", listener);
  }

  onError(listener: ErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  connect(): void {
    if (this.closed) throw new Error("EventEmitter has been closed");
    this.createEventSource();
  }

  disconnect(): void {
    this.closed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  get connected(): boolean {
    if (!this.eventSource || typeof EventSource === "undefined") return false;
    return this.eventSource.readyState === EventSource.OPEN;
  }

  private createEventSource(): void {
    const url = new URL("/api/v1/moderation/events", this.config.baseUrl);

    this.eventSource = new EventSource(url.toString(), {
      withCredentials: false,
    });

    // SSE doesn't support custom headers natively, so we'll use query param
    // In production, the EventSource polyfill or a custom implementation
    // would pass the API key. For now, we handle the SSE protocol.
    // Note: The actual auth is handled by the API route which expects
    // the Bearer token. A real deployment would use a polyfill like
    // eventsource-polyfill with headers support, or token-in-URL approach.

    this.eventSource.onopen = () => {
      this.reconnectAttempts = 0;
    };

    this.eventSource.onerror = () => {
      this.eventSource?.close();
      this.eventSource = null;
      this.scheduleReconnect();
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    if (!this.eventSource) return;

    const eventTypes = [
      "item_flagged",
      "item_resolved",
      "item_escalated",
      "item_assigned",
      "alert_triggered",
    ];

    for (const type of eventTypes) {
      this.eventSource.addEventListener(type, (e: MessageEvent) => {
        try {
          const event: ModerationEvent = JSON.parse(e.data);
          this.emit(type, event);
          this.emit("*", event);
        } catch (err) {
          this.notifyError(err instanceof Error ? err : new Error(String(err)));
        }
      });
    }
  }

  private emit(type: string, event: ModerationEvent): void {
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch (err) {
          this.notifyError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    }
    if (type !== "*") {
      const wildcardListeners = this.listeners.get("*");
      if (wildcardListeners) {
        for (const listener of wildcardListeners) {
          try {
            listener(event);
          } catch (err) {
            this.notifyError(err instanceof Error ? err : new Error(String(err)));
          }
        }
      }
    }
  }

  private notifyError(error: Error): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch {}
    }
  }

  private scheduleReconnect(): void {
    if (this.closed || this.reconnectAttempts >= this.maxReconnectAttempts) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.closed) {
        this.createEventSource();
      }
    }, delay);
  }
}
