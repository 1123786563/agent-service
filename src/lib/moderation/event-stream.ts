type EventListener = (event: ModerationEvent) => void;

export interface ModerationEvent {
  id: string;
  type: "item_flagged" | "item_resolved" | "item_escalated" | "item_assigned" | "alert_triggered";
  timestamp: string;
  data: Record<string, unknown>;
}

class EventEmitter {
  private listeners: Set<EventListener> = new Set();
  private eventBuffer: ModerationEvent[] = [];
  private maxBufferSize = 1000;

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: ModerationEvent): void {
    this.eventBuffer.push(event);
    if (this.eventBuffer.length > this.maxBufferSize) {
      this.eventBuffer.shift();
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Remove failing listeners
        this.listeners.delete(listener);
      }
    }
  }

  getRecentEvents(limit: number = 50): ModerationEvent[] {
    return this.eventBuffer.slice(-limit);
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}

const globalForEmitter = globalThis as unknown as { moderationEmitter?: EventEmitter };

function getEmitter(): EventEmitter {
  if (!globalForEmitter.moderationEmitter) {
    globalForEmitter.moderationEmitter = new EventEmitter();
  }
  return globalForEmitter.moderationEmitter;
}

export function subscribeToModerationEvents(listener: EventListener): () => void {
  return getEmitter().subscribe(listener);
}

export function emitModerationEvent(event: Omit<ModerationEvent, "id" | "timestamp">): void {
  const fullEvent: ModerationEvent = {
    ...event,
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date().toISOString(),
  };
  getEmitter().emit(fullEvent);
}

export function getRecentEvents(limit: number = 50): ModerationEvent[] {
  return getEmitter().getRecentEvents(limit);
}

export function getSubscriberCount(): number {
  return getEmitter().listenerCount();
}

export function formatSSE(event: ModerationEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\nid: ${event.id}\n\n`;
}
