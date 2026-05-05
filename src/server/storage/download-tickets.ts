import crypto from "node:crypto";
import { prisma } from "@/server/db";

export type DownloadTicketAudience = "agent-download" | "delivery-download";
export type DownloadTicketResourceType = "agent_zip" | "delivery_asset";
export type DownloadTicketActorScope = "anonymous" | "buyer" | "provider" | "admin";

export type DownloadTicketPayload = {
  resourceType: DownloadTicketResourceType;
  resourceId: string;
  objectKey: string;
  actorScope: DownloadTicketActorScope;
  actorId?: string | null;
  sessionId?: string | null;
  audience: DownloadTicketAudience;
  resourceVersion: string;
  jti: string;
  keyId: string;
  singleUse?: boolean;
  expiresAt: string;
};

const DEFAULT_TICKET_TTL_SECONDS = 5 * 60;
const DEFAULT_SECRET = "dev-download-ticket-secret";
const DEFAULT_KEY_ID = "dev-key-1";

function getActiveKeyId() {
  return process.env.DOWNLOAD_TICKET_ACTIVE_KEY_ID?.trim() || DEFAULT_KEY_ID;
}

function getSecretForKeyId(keyId: string) {
  const activeKeyId = getActiveKeyId();
  if (keyId === activeKeyId) {
    return process.env.DOWNLOAD_TICKET_SECRET?.trim() || DEFAULT_SECRET;
  }

  const previousKeyId = process.env.DOWNLOAD_TICKET_PREVIOUS_KEY_ID?.trim();
  if (previousKeyId && keyId === previousKeyId) {
    const previousSecret = process.env.DOWNLOAD_TICKET_PREVIOUS_SECRET?.trim();
    if (!previousSecret) {
      throw new Error("DOWNLOAD_TICKET_PREVIOUS_SECRET is required for previous ticket key");
    }

    return previousSecret;
  }

  throw new Error("Unknown download ticket key");
}

function signPayload(serializedPayload: string, keyId: string) {
  return crypto.createHmac("sha256", getSecretForKeyId(keyId)).update(serializedPayload).digest("base64url");
}

export function createDownloadTicket(
  payload: Omit<DownloadTicketPayload, "expiresAt" | "jti" | "keyId">,
  options: {
    ttlSeconds?: number;
    now?: Date;
    singleUse?: boolean;
  } = {}
) {
  const keyId = getActiveKeyId();
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS) * 1000);
  const completePayload: DownloadTicketPayload = {
    ...payload,
    expiresAt: expiresAt.toISOString(),
    jti: crypto.randomUUID(),
    keyId,
    singleUse: options.singleUse ?? false
  };
  const serializedPayload = JSON.stringify(completePayload);
  const encodedPayload = Buffer.from(serializedPayload, "utf8").toString("base64url");
  const signature = signPayload(serializedPayload, keyId);

  return `${encodedPayload}.${signature}`;
}

export function verifyDownloadTicket(
  ticket: string,
  options: {
    audience: DownloadTicketAudience;
    now?: Date;
    actorId?: string | null;
  }
) {
  const [encodedPayload, signature] = ticket.split(".");

  if (!encodedPayload || !signature) {
    throw new Error("Invalid download ticket");
  }

  const serializedPayload = Buffer.from(encodedPayload, "base64url").toString("utf8");
  const payload = JSON.parse(serializedPayload) as DownloadTicketPayload;
  const expectedSignature = signPayload(serializedPayload, payload.keyId);

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    throw new Error("Invalid download ticket");
  }

  if (payload.audience !== options.audience) {
    throw new Error("Download ticket audience mismatch");
  }

  if (new Date(payload.expiresAt).getTime() <= (options.now ?? new Date()).getTime()) {
    throw new Error("Download ticket expired");
  }

  if (payload.actorId && options.actorId && payload.actorId !== options.actorId) {
    throw new Error("Download ticket actor mismatch");
  }

  return payload;
}

type DownloadTicketUseStore = {
  create(args: {
    data: {
      jti: string;
      keyId: string;
      audience: string;
      resourceType: string;
      resourceId: string;
      actorId?: string | null;
      sessionId?: string | null;
      expiresAt: Date;
    };
  }): Promise<unknown>;
};

const defaultTicketUseStore: DownloadTicketUseStore = {
  create(args) {
    return prisma.downloadTicketUse.create(args);
  }
};

export async function verifyAndConsumeDownloadTicket(
  ticket: string,
  options: {
    audience: DownloadTicketAudience;
    now?: Date;
    actorId?: string | null;
  },
  store: DownloadTicketUseStore = defaultTicketUseStore
) {
  const payload = verifyDownloadTicket(ticket, options);

  if (!payload.singleUse) {
    return payload;
  }

  try {
    await store.create({
      data: {
        jti: payload.jti,
        keyId: payload.keyId,
        audience: payload.audience,
        resourceType: payload.resourceType,
        resourceId: payload.resourceId,
        actorId: payload.actorId ?? null,
        sessionId: payload.sessionId ?? null,
        expiresAt: new Date(payload.expiresAt)
      }
    });
  } catch {
    throw new Error("Download ticket already used");
  }

  return payload;
}
