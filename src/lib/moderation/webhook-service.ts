import { prisma } from "@/server/db";
import { signWebhookPayload } from "./api-key-auth";
import { emitModerationEvent } from "./event-stream";

export interface WebhookRegistration {
  url: string;
  events: string[];
}

export interface WebhookPayload {
  id: string;
  event: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export async function registerWebhook(
  apiKeyId: string,
  registration: WebhookRegistration
) {
  const secret = generateWebhookSecret();

  const endpoint = await prisma.webhookEndpoint.create({
    data: {
      apiKeyId,
      url: registration.url,
      secret,
      events: registration.events as any[],
      isActive: true,
    },
  });

  return {
    id: endpoint.id,
    url: endpoint.url,
    events: endpoint.events,
    secret: endpoint.secret,
    createdAt: endpoint.createdAt,
  };
}

export async function listWebhooks(apiKeyId: string) {
  return prisma.webhookEndpoint.findMany({
    where: { apiKeyId, isActive: true },
    select: {
      id: true,
      url: true,
      events: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { deliveries: true } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function deleteWebhook(webhookId: string, apiKeyId: string) {
  const webhook = await prisma.webhookEndpoint.findFirst({
    where: { id: webhookId, apiKeyId },
  });
  if (!webhook) throw new Error("Webhook not found");

  await prisma.webhookEndpoint.delete({ where: { id: webhookId } });
  return true;
}

export async function deliverWebhooks(
  event: string,
  data: Record<string, unknown>
): Promise<void> {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { isActive: true, events: { has: event } },
    select: { id: true, url: true, secret: true, apiKeyId: true },
  });

  if (endpoints.length === 0) return;

  const payload: WebhookPayload = {
    id: `wh_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  const payloadStr = JSON.stringify(payload);

  await Promise.all(
    endpoints.map((ep) =>
      createDelivery(ep.id, ep.url, ep.secret, event, payload, payloadStr)
    )
  );
}

async function createDelivery(
  webhookId: string,
  url: string,
  secret: string,
  event: string,
  payload: WebhookPayload,
  payloadStr: string
) {
  const signature = signWebhookPayload(payloadStr, secret);

  await prisma.webhookDelivery.create({
    data: {
      webhookId,
      event: event as any,
      payload: payload as any,
      attempts: 0,
      maxAttempts: 5,
    },
  });

  attemptDelivery(webhookId, url, payloadStr, signature, 0).catch(() => {});
}

export async function attemptDelivery(
  webhookId: string,
  url: string,
  payloadStr: string,
  signature: string,
  attempt: number
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Signature": signature,
        "X-Webhook-Attempt": String(attempt + 1),
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10000),
    });

    const responseText = await response.text().catch(() => "");

    if (response.ok) {
      await prisma.webhookDelivery.updateMany({
        where: { webhookId, deliveredAt: null },
        data: {
          statusCode: response.status,
          response: responseText.slice(0, 1000),
          attempts: attempt + 1,
          deliveredAt: new Date(),
        },
        orderBy: { createdAt: "desc" },
        take: 1,
      });
      return true;
    }

    await recordDeliveryFailure(webhookId, response.status, responseText, attempt + 1);
    return false;
  } catch (error) {
    await recordDeliveryFailure(webhookId, 0, String(error), attempt + 1);
    return false;
  }
}

async function recordDeliveryFailure(
  webhookId: string,
  statusCode: number,
  response: string,
  attempts: number
) {
  const backoffMs = Math.min(1000 * Math.pow(2, attempts - 1), 60000);
  const nextRetryAt = new Date(Date.now() + backoffMs);

  const pending = await prisma.webhookDelivery.findFirst({
    where: { webhookId, deliveredAt: null, failedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!pending) return;

  if (attempts >= pending.maxAttempts) {
    await prisma.webhookDelivery.update({
      where: { id: pending.id },
      data: {
        statusCode,
        response: response.slice(0, 1000),
        attempts,
        failedAt: new Date(),
      },
    });
  } else {
    await prisma.webhookDelivery.update({
      where: { id: pending.id },
      data: {
        statusCode,
        response: response.slice(0, 1000),
        attempts,
        nextRetryAt,
      },
    });
  }
}

export async function processRetryQueue(): Promise<number> {
  const pending = await prisma.webhookDelivery.findMany({
    where: {
      deliveredAt: null,
      failedAt: null,
      nextRetryAt: { lte: new Date() },
      attempts: { lt: 5 },
    },
    include: { webhook: { select: { url: true, secret: true } } },
    take: 50,
  });

  let retried = 0;
  for (const delivery of pending) {
    const payloadStr = JSON.stringify(delivery.payload);
    const signature = signWebhookPayload(payloadStr, delivery.webhook.secret);
    const success = await attemptDelivery(
      delivery.webhookId,
      delivery.webhook.url,
      payloadStr,
      signature,
      delivery.attempts
    );
    if (!success) retried++;
  }

  return retried;
}

function generateWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
