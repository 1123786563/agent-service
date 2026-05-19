export function generateOpenApiSpec(): object {
  return {
    openapi: "3.1.0",
    info: {
      title: "Content Moderation API",
      version: "1.0.0",
      description: "AI-powered content moderation and analytics API for real-time content analysis, queue management, and monitoring.",
      contact: { name: "API Support", email: "support@multica.ai" },
    },
    servers: [{ url: "/api/v1", description: "Current server" }],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: "http",
          scheme: "bearer",
          description: "API key authentication. Pass your API key as a Bearer token.",
        },
      },
      schemas: {
        TextAnalysisRequest: {
          type: "object",
          required: ["text"],
          properties: {
            text: { type: "string", description: "Text content to analyze", minLength: 1, maxLength: 100000 },
            language: { type: "string", description: "Override language detection (en, zh, ja, ko)", enum: ["en", "zh", "ja", "ko"] },
          },
        },
        TextAnalysisResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/TextAnalysisResult" },
          },
        },
        TextAnalysisResult: {
          type: "object",
          properties: {
            toxicityScore: { type: "number", minimum: 0, maximum: 1, description: "Overall toxicity score" },
            flaggedPhrases: { type: "array", items: { $ref: "#/components/schemas/FlaggedPhrase" } },
            recommendation: { type: "string", enum: ["approve", "flag", "reject"], description: "Recommended action" },
            confidence: { type: "string", enum: ["low", "medium", "high"], description: "Confidence level of the analysis" },
            detectedLanguage: { type: "string", enum: ["en", "zh", "ja", "ko", "unknown"] },
            processingTimeMs: { type: "number", description: "Processing time in milliseconds" },
          },
        },
        FlaggedPhrase: {
          type: "object",
          properties: {
            phrase: { type: "string" },
            category: { type: "string" },
            severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
            startIndex: { type: "integer" },
            endIndex: { type: "integer" },
          },
        },
        ImageAnalysisResponse: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/ImageAnalysisResult" },
          },
        },
        ImageAnalysisResult: {
          type: "object",
          properties: {
            safetyCategory: { type: "string", enum: ["safe", "suspicious", "unsafe"] },
            detectedObjects: { type: "array", items: { $ref: "#/components/schemas/DetectedObject" } },
            confidence: { type: "string", enum: ["low", "medium", "high"] },
            processingTimeMs: { type: "number" },
          },
        },
        DetectedObject: {
          type: "object",
          properties: {
            label: { type: "string" },
            confidence: { type: "number" },
            category: { type: "string" },
            flagged: { type: "boolean" },
          },
        },
        QueueItemList: {
          type: "object",
          properties: {
            data: { type: "array", items: { $ref: "#/components/schemas/QueueItem" } },
          },
        },
        QueueItem: {
          type: "object",
          properties: {
            id: { type: "string" },
            contentType: { type: "string", enum: ["TEXT", "IMAGE"] },
            contentRef: { type: "string" },
            contentSnippet: { type: "string" },
            priority: { type: "string", enum: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] },
            status: { type: "string", enum: ["PENDING", "ASSIGNED", "IN_REVIEW", "RESOLVED", "ESCALATED"] },
            toxicityScore: { type: "number" },
            flaggedPhrases: { type: "array", items: { type: "string" } },
            categories: { type: "array", items: { type: "string" } },
            language: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        QueueActionRequest: {
          type: "object",
          required: ["action"],
          properties: {
            action: { type: "string", enum: ["assign", "resolve", "escalate"] },
            itemId: { type: "string", description: "Required for assign/resolve/escalate" },
            resolution: { type: "string", description: "Required for resolve. Reason for resolution." },
          },
        },
        AnalyticsDashboard: {
          type: "object",
          properties: {
            data: { $ref: "#/components/schemas/DashboardMetrics" },
          },
        },
        DashboardMetrics: {
          type: "object",
          properties: {
            realtime: { $ref: "#/components/schemas/RealtimeMetrics" },
            period: { $ref: "#/components/schemas/PeriodMetrics" },
          },
        },
        RealtimeMetrics: {
          type: "object",
          properties: {
            pendingItems: { type: "integer" },
            criticalPending: { type: "integer" },
            itemsLastHour: { type: "integer" },
            avgProcessingTimeMs: { type: "number" },
            activeReviewers: { type: "integer" },
          },
        },
        PeriodMetrics: {
          type: "object",
          properties: {
            totalFlagged: { type: "integer" },
            totalResolved: { type: "integer" },
            falsePositiveRate: { type: "number" },
            avgResponseTimeMs: { type: "number" },
            moderatorThroughput: { type: "number" },
            periodStart: { type: "string" },
            periodEnd: { type: "string" },
          },
        },
        WebhookRegistration: {
          type: "object",
          required: ["url", "events"],
          properties: {
            url: { type: "string", format: "uri", description: "Webhook callback URL" },
            events: {
              type: "array",
              items: { type: "string", enum: ["ITEM_FLAGGED", "ITEM_RESOLVED", "ITEM_ESCALATED", "ITEM_ASSIGNED", "ALERT_TRIGGERED"] },
              description: "Events to subscribe to",
            },
          },
        },
        WebhookResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id: { type: "string" },
                url: { type: "string" },
                events: { type: "array", items: { type: "string" } },
                secret: { type: "string", description: "Use this secret to verify webhook signatures" },
                createdAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
        ApiKeyResponse: {
          type: "object",
          properties: {
            data: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
                keyPrefix: { type: "string" },
                tier: { type: "string", enum: ["STANDARD", "PREMIUM"] },
                rateLimit: { type: "integer" },
                rawKey: { type: "string", description: "Full API key. Store securely - shown only once." },
                createdAt: { type: "string", format: "date-time" },
              },
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            errors: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
    paths: {
      "/moderation/analyze-text": {
        post: {
          summary: "Analyze text content",
          description: "Analyze text for toxicity, profanity, and policy violations",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/TextAnalysisRequest" } } },
          },
          responses: {
            "200": { description: "Analysis result", content: { "application/json": { schema: { $ref: "#/components/schemas/TextAnalysisResponse" } } } },
            "400": { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "Unauthorized", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "429": { description: "Rate limit exceeded", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
          },
        },
      },
      "/moderation/analyze-image": {
        post: {
          summary: "Analyze an image",
          description: "Analyze an image for inappropriate content",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema: { type: "object", required: ["image"], properties: { image: { type: "string", format: "binary" } } } } },
          },
          responses: {
            "200": { description: "Analysis result", content: { "application/json": { schema: { $ref: "#/components/schemas/ImageAnalysisResponse" } } } },
            "400": { description: "Invalid input", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/analyze-images": {
        post: {
          summary: "Batch analyze images",
          description: "Analyze multiple images in a single request (up to 50)",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "multipart/form-data": { schema: { type: "object", required: ["images"], properties: { images: { type: "array", items: { type: "string", format: "binary" }, maxItems: 50 } } } } },
          },
          responses: {
            "200": { description: "Batch analysis results" },
            "400": { description: "Invalid input" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/queue": {
        get: {
          summary: "List queue items",
          description: "Get pending moderation items from the review queue",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "limit", in: "query", schema: { type: "integer", default: 20, minimum: 1, maximum: 100 } },
            { name: "offset", in: "query", schema: { type: "integer", default: 0, minimum: 0 } },
          ],
          responses: {
            "200": { description: "Queue items", content: { "application/json": { schema: { $ref: "#/components/schemas/QueueItemList" } } } },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Queue actions",
          description: "Perform queue actions: assign, resolve, or escalate",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/QueueActionRequest" } } },
          },
          responses: {
            "200": { description: "Action completed" },
            "400": { description: "Invalid action" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/analytics": {
        get: {
          summary: "Get analytics data",
          description: "Retrieve moderation analytics with different views",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "view", in: "query", schema: { type: "string", enum: ["dashboard", "trends", "categories", "languages", "response_times", "realtime", "period"], default: "dashboard" } },
            { name: "period", in: "query", schema: { type: "integer", default: 30, minimum: 1, maximum: 365, description: "Period in days" } },
          ],
          responses: {
            "200": { description: "Analytics data" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/events": {
        get: {
          summary: "Stream moderation events",
          description: "SSE endpoint for real-time moderation events. Accept header 'text/event-stream' for SSE, otherwise returns JSON.",
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "Event stream (SSE) or JSON array" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/health": {
        get: {
          summary: "Health check",
          description: "Check the health status of the moderation pipeline",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "service", in: "query", schema: { type: "string", description: "Check a specific service" } },
          ],
          responses: {
            "200": { description: "Health status" },
          },
        },
      },
      "/moderation/webhooks": {
        get: {
          summary: "List webhooks",
          description: "List all registered webhooks for the authenticated API key",
          security: [{ BearerAuth: [] }],
          responses: {
            "200": { description: "Webhook list" },
            "401": { description: "Unauthorized" },
          },
        },
        post: {
          summary: "Register a webhook",
          description: "Register a new webhook endpoint to receive moderation events",
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookRegistration" } } },
          },
          responses: {
            "201": { description: "Webhook registered", content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookResponse" } } } },
            "400": { description: "Invalid input" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/webhooks/{id}": {
        delete: {
          summary: "Delete a webhook",
          description: "Remove a registered webhook endpoint",
          security: [{ BearerAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: {
            "200": { description: "Webhook deleted" },
            "404": { description: "Webhook not found" },
            "401": { description: "Unauthorized" },
          },
        },
      },
      "/moderation/usage": {
        get: {
          summary: "Get API usage",
          description: "Get usage statistics for the authenticated API key",
          security: [{ BearerAuth: [] }],
          parameters: [
            { name: "period", in: "query", schema: { type: "integer", default: 30, description: "Period in days" } },
          ],
          responses: {
            "200": { description: "Usage statistics" },
            "401": { description: "Unauthorized" },
          },
        },
      },
    },
  };
}
