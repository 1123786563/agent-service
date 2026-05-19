import type {
  SdkConfig,
  ApiResponse,
  TextAnalysisRequest,
  TextAnalysisResult,
  ImageAnalysisResult,
  BatchImageAnalysisResult,
  QueueListParams,
  QueueItem,
  QueueActionRequest,
  AnalyticsQueryParams,
  WebhookRegistration,
  WebhookInfo,
  WebhookRegistrationResponse,
  UsageStats,
  ApiKeyInfo,
  RequestInterceptor,
  ResponseInterceptor,
  PipelineHealth,
  ModerationEvent,
} from "./types";

import {
  ModerationError,
  AuthenticationError,
  RateLimitError,
  ValidationError,
  NotFoundError,
  ServerError,
  NetworkError,
} from "./errors";

const DEFAULT_CONFIG: Required<Omit<SdkConfig, "apiKey" | "baseUrl">> = {
  timeout: 30000,
  maxRetries: 3,
  retryBaseDelay: 1000,
};

type RetryableStatus = 429 | 500 | 502 | 503 | 504;

function isRetryable(status: number): status is RetryableStatus {
  return status === 429 || status >= 500;
}

export class ModerationClient {
  private readonly config: Required<SdkConfig>;
  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];

  constructor(config: SdkConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.push(interceptor);
    return () => {
      const idx = this.requestInterceptors.indexOf(interceptor);
      if (idx >= 0) this.requestInterceptors.splice(idx, 1);
    };
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.push(interceptor);
    return () => {
      const idx = this.responseInterceptors.indexOf(interceptor);
      if (idx >= 0) this.responseInterceptors.splice(idx, 1);
    };
  }

  // ── Text Moderation ─────────────────────────────────────────────

  async analyzeText(request: TextAnalysisRequest): Promise<ApiResponse<TextAnalysisResult>> {
    return this.post("/moderation/analyze-text", request);
  }

  // ── Image Moderation ────────────────────────────────────────────

  async analyzeImage(image: File | Blob): Promise<ApiResponse<ImageAnalysisResult>> {
    const formData = new FormData();
    formData.append("image", image);
    return this.postFormData("/moderation/analyze-image", formData);
  }

  async analyzeImages(images: (File | Blob)[]): Promise<ApiResponse<BatchImageAnalysisResult>> {
    const formData = new FormData();
    for (const image of images) {
      formData.append("images", image);
    }
    return this.postFormData("/moderation/analyze-images", formData);
  }

  // ── Queue Management ────────────────────────────────────────────

  async listQueue(params?: QueueListParams): Promise<ApiResponse<QueueItem[]>> {
    const query = new URLSearchParams();
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.offset) query.set("offset", String(params.offset));
    const qs = query.toString();
    return this.get(`/moderation/queue${qs ? `?${qs}` : ""}`);
  }

  async assignItem(itemId: string): Promise<ApiResponse<QueueItem>> {
    return this.post("/moderation/queue", { action: "assign", itemId });
  }

  async resolveItem(itemId: string, resolution: string): Promise<ApiResponse<QueueItem>> {
    return this.post("/moderation/queue", { action: "resolve", itemId, resolution });
  }

  async escalateItem(itemId: string): Promise<ApiResponse<QueueItem>> {
    return this.post("/moderation/queue", { action: "escalate", itemId });
  }

  // ── Analytics ───────────────────────────────────────────────────

  async getAnalytics(params: AnalyticsQueryParams): Promise<ApiResponse<any>> {
    const query = new URLSearchParams({ view: params.view });
    if (params.period) query.set("period", String(params.period));
    return this.get(`/moderation/analytics?${query}`);
  }

  // ── Health ──────────────────────────────────────────────────────

  async getHealth(service?: string): Promise<ApiResponse<PipelineHealth>> {
    const qs = service ? `?service=${encodeURIComponent(service)}` : "";
    return this.get(`/moderation/health${qs}`);
  }

  // ── Events ──────────────────────────────────────────────────────

  async getEvents(): Promise<ApiResponse<ModerationEvent[]>> {
    return this.get("/moderation/events");
  }

  // ── Webhooks ────────────────────────────────────────────────────

  async listWebhooks(): Promise<ApiResponse<WebhookInfo[]>> {
    return this.get("/moderation/webhooks");
  }

  async registerWebhook(registration: WebhookRegistration): Promise<ApiResponse<WebhookRegistrationResponse>> {
    return this.post("/moderation/webhooks", registration);
  }

  async deleteWebhook(webhookId: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.delete(`/moderation/webhooks/${encodeURIComponent(webhookId)}`);
  }

  // ── Usage ───────────────────────────────────────────────────────

  async getUsage(periodDays?: number): Promise<ApiResponse<UsageStats>> {
    const qs = periodDays ? `?period=${periodDays}` : "";
    return this.get(`/moderation/usage${qs}`);
  }

  // ── Core HTTP Methods ───────────────────────────────────────────

  private async get<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path);
  }

  private async post<T>(path: string, body: unknown): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private async postFormData<T>(path: string, formData: FormData): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, { body: formData });
  }

  private async delete<T>(path: string): Promise<ApiResponse<T>> {
    return this.request<T>("DELETE", path);
  }

  private async request<T>(
    method: string,
    path: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.config.baseUrl}${path}`;
    let init: RequestInit & { url: string } = {
      url,
      method,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: options.body,
      signal: options.signal ?? AbortSignal.timeout(this.config.timeout),
    };

    for (const interceptor of this.requestInterceptors) {
      init = interceptor(init);
    }

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        const response = await fetch(init.url, init);

        let interceptedResponse: Response = response;
        for (const interceptor of this.responseInterceptors) {
          interceptedResponse = await interceptor(interceptedResponse);
        }

        if (interceptedResponse.ok) {
          const json = await interceptedResponse.json();
          return json as ApiResponse<T>;
        }

        const errorBody = await interceptedResponse.json().catch(() => ({ errors: ["Unknown error"] }));
        const status = interceptedResponse.status;

        if (status === 401) throw new AuthenticationError();
        if (status === 400) throw new ValidationError(errorBody.errors ?? ["Bad request"]);
        if (status === 404) throw new NotFoundError("Resource");

        if (isRetryable(status) && attempt < this.config.maxRetries) {
          const delay = this.calculateDelay(attempt, status === 429);
          await this.sleep(delay);
          continue;
        }

        if (status === 429) {
          const retryAfter = interceptedResponse.headers.get("Retry-After");
          throw new RateLimitError(Number(retryAfter) || 60);
        }

        throw new ServerError(errorBody.errors?.[0] ?? `Server error: ${status}`);
      } catch (error) {
        if (error instanceof ModerationError) {
          throw error;
        }

        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < this.config.maxRetries) {
          const delay = this.calculateDelay(attempt, false);
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw new NetworkError(lastError?.message ?? "Network request failed", lastError);
  }

  private calculateDelay(attempt: number, isRateLimit: boolean): number {
    const base = isRateLimit ? this.config.retryBaseDelay * 4 : this.config.retryBaseDelay;
    const exponentialDelay = base * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, 30000);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
