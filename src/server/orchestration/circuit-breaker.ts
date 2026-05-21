export type CircuitBreakerConfig = {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  monitor?: (event: CircuitBreakerEvent) => void;
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,
  halfOpenMaxAttempts: 1,
};

export type CircuitState = "closed" | "open" | "half-open";

export type CircuitBreakerEvent = {
  type: "state_change" | "success" | "failure" | "rejected";
  from?: CircuitState;
  to?: CircuitState;
  error?: unknown;
  timestamp: number;
};

export class CircuitOpenError extends Error {
  state: CircuitState;
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
    this.state = "open";
  }
}

type CircuitBreakerState = {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureAt: number | null;
  halfOpenAttempts: number;
};

export class CircuitBreaker {
  private config: CircuitBreakerConfig;
  private circuits: Map<string, CircuitBreakerState> = new Map();

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  private getCircuit(name: string): CircuitBreakerState {
    let circuit = this.circuits.get(name);
    if (!circuit) {
      circuit = {
        state: "closed",
        failureCount: 0,
        successCount: 0,
        lastFailureAt: null,
        halfOpenAttempts: 0,
      };
      this.circuits.set(name, circuit);
    }
    return circuit;
  }

  private emit(event: CircuitBreakerEvent) {
    this.config.monitor?.(event);
  }

  getState(name: string): CircuitState {
    const circuit = this.getCircuit(name);
    if (circuit.state === "open" && circuit.lastFailureAt !== null) {
      if (Date.now() - circuit.lastFailureAt >= this.config.resetTimeoutMs) {
        const prev = circuit.state;
        circuit.state = "half-open";
        circuit.halfOpenAttempts = 0;
        this.emit({ type: "state_change", from: prev, to: "half-open", timestamp: Date.now() });
      }
    }
    return circuit.state;
  }

  getStats(name: string) {
    const circuit = this.getCircuit(name);
    return {
      state: this.getState(name),
      failureCount: circuit.failureCount,
      successCount: circuit.successCount,
      lastFailureAt: circuit.lastFailureAt,
    };
  }

  async execute<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const state = this.getState(name);
    const circuit = this.getCircuit(name);

    if (state === "open") {
      this.emit({ type: "rejected", timestamp: Date.now() });
      throw new CircuitOpenError(`Circuit "${name}" is open`);
    }

    if (state === "half-open") {
      if (circuit.halfOpenAttempts >= this.config.halfOpenMaxAttempts) {
        this.emit({ type: "rejected", timestamp: Date.now() });
        throw new CircuitOpenError(`Circuit "${name}" is half-open and has exhausted probe attempts`);
      }
      circuit.halfOpenAttempts++;
    }

    try {
      const result = await fn();
      this.recordSuccess(name);
      return result;
    } catch (error: unknown) {
      this.recordFailure(name, error);
      throw error;
    }
  }

  private recordSuccess(name: string) {
    const circuit = this.getCircuit(name);
    circuit.successCount++;
    if (circuit.state === "half-open") {
      const prev = circuit.state;
      circuit.state = "closed";
      circuit.failureCount = 0;
      this.emit({ type: "state_change", from: prev, to: "closed", timestamp: Date.now() });
    }
    this.emit({ type: "success", timestamp: Date.now() });
  }

  private recordFailure(name: string, error: unknown) {
    const circuit = this.getCircuit(name);
    circuit.failureCount++;
    circuit.lastFailureAt = Date.now();
    this.emit({ type: "failure", error, timestamp: Date.now() });

    if (circuit.state === "half-open") {
      const prev = circuit.state;
      circuit.state = "open";
      this.emit({ type: "state_change", from: prev, to: "open", timestamp: Date.now() });
      return;
    }

    if (circuit.failureCount >= this.config.failureThreshold) {
      const prev = circuit.state;
      circuit.state = "open";
      this.emit({ type: "state_change", from: prev, to: "open", timestamp: Date.now() });
    }
  }

  reset(name: string) {
    const circuit = this.getCircuit(name);
    const prev = circuit.state;
    circuit.state = "closed";
    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.lastFailureAt = null;
    circuit.halfOpenAttempts = 0;
    this.emit({ type: "state_change", from: prev, to: "closed", timestamp: Date.now() });
  }
}
