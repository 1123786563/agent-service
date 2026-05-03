import crypto from "node:crypto";

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
  expiresAt: string;
};

const DEFAULT_TICKET_TTL_SECONDS = 5 * 60;
const DEFAULT_SECRET = "dev-download-ticket-secret";
const DEFAULT_KEY_ID = "dev-key-1";

function getActiveKeyId() {
  return process.env.DOWNLOAD_TICKET_ACTIVE_KEY_ID?.trim() || DEFAULT_KEY_ID;
}

function getSecretForKeyId(keyId: string) {
  if (keyId !== getActiveKeyId()) {
    throw new Error("Unknown download ticket key");
  }

  return process.env.DOWNLOAD_TICKET_SECRET?.trim() || DEFAULT_SECRET;
}

function signPayload(serializedPayload: string, keyId: string) {
  return crypto.createHmac("sha256", getSecretForKeyId(keyId)).update(serializedPayload).digest("base64url");
}

export function createDownloadTicket(
  payload: Omit<DownloadTicketPayload, "expiresAt" | "jti" | "keyId">,
  options: {
    ttlSeconds?: number;
    now?: Date;
  } = {}
) {
  const keyId = getActiveKeyId();
  const now = options.now ?? new Date();
  const expiresAt = new Date(now.getTime() + (options.ttlSeconds ?? DEFAULT_TICKET_TTL_SECONDS) * 1000);
  const completePayload: DownloadTicketPayload = {
    ...payload,
    expiresAt: expiresAt.toISOString(),
    jti: crypto.randomUUID(),
    keyId
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
