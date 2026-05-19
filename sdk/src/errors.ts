export class ModerationError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly body?: { errors: string[] }
  ) {
    super(message);
    this.name = "ModerationError";
  }
}

export class AuthenticationError extends ModerationError {
  constructor(message: string = "Authentication failed. Check your API key.") {
    super(message, 401);
    this.name = "AuthenticationError";
  }
}

export class RateLimitError extends ModerationError {
  constructor(
    public readonly retryAfterSeconds: number,
    message?: string
  ) {
    super(message ?? `Rate limit exceeded. Retry after ${retryAfterSeconds}s.`, 429);
    this.name = "RateLimitError";
  }
}

export class ValidationError extends ModerationError {
  constructor(errors: string[]) {
    super(`Validation failed: ${errors.join(", ")}`, 400, { errors });
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ModerationError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = "NotFoundError";
  }
}

export class ServerError extends ModerationError {
  constructor(message: string = "Internal server error") {
    super(message, 500);
    this.name = "ServerError";
  }
}

export class NetworkError extends ModerationError {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = "NetworkError";
  }
}
