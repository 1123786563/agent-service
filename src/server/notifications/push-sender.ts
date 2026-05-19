import { prisma } from "@/server/db";

interface PushResult {
  success: boolean;
  providerRef?: string;
  error?: string;
}

export async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  actionUrl?: string
): Promise<PushResult> {
  const tokens = await prisma.pushToken.findMany({
    where: { userId },
  });

  if (tokens.length === 0) {
    return { success: true };
  }

  const firebaseProjectId = process.env.FIREBASE_PROJECT_ID;
  if (!firebaseProjectId) {
    // No Firebase config — log and skip gracefully
    console.log(`[push-sender] No Firebase config. Would push to ${tokens.length} token(s): ${title}`);
    return { success: true };
  }

  const results = await Promise.allSettled(
    tokens.map((t) => sendFcmMessage(t.token, title, body, actionUrl))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled" && r.value.success).length;
  if (succeeded === 0) {
    const firstError = results.find((r) => r.status === "rejected");
    return {
      success: false,
      error: firstError
        ? (firstError as PromiseRejectedResult).reason?.message
        : "All push deliveries failed",
    };
  }

  return { success: true, providerRef: `fcm:${succeeded}/${tokens.length}` };
}

async function sendFcmMessage(
  token: string,
  title: string,
  body: string,
  actionUrl?: string
): Promise<PushResult> {
  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!serviceAccount) {
    return { success: false, error: "Firebase service account not configured" };
  }

  // Minimal FCM HTTP v1 API call via fetch — avoids depending on firebase-admin SDK
  let accessToken: string;
  try {
    accessToken = await getFirebaseAccessToken(serviceAccount);
  } catch {
    return { success: false, error: "Failed to obtain Firebase access token" };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: {
        token,
        notification: { title, body },
        ...(actionUrl ? { data: { actionUrl } } : {}),
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    return { success: false, error: `FCM error ${res.status}: ${errBody}` };
  }

  const json = (await res.json()) as { name?: string };
  return { success: true, providerRef: json.name };
}

async function getFirebaseAccessToken(serviceAccountJson: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);

  // JWT for Google OAuth2
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const signInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signInput));
  const jwt = `${signInput}.${btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status}`);
  }
  const tokenData = (await tokenRes.json()) as { access_token: string };
  return tokenData.access_token;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN.*?-----/g, "").replace(/-----END.*?-----/g, "").replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
