import { WhitelistStatus } from "@prisma/client";
import { getCurrentUser, requireCreator } from "@/server/auth/session";
import { createDeliveryForOrder } from "@/server/deliveries/service";
import { rateLimiter, RATE_LIMIT_UPLOAD } from "@/server/rate-limit";

const MAX_DELIVERY_FILE_BYTES = 25 * 1024 * 1024; // 25MB
const ALLOWED_DELIVERY_EXTENSIONS = new Set([
  ".zip", ".pdf",
  ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".txt",
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const currentUser = await getCurrentUser();

  if (!currentUser) {
    return Response.redirect(new URL("/login", request.url), 303);
  }

  if (currentUser.whitelistStatus !== WhitelistStatus.ACTIVE) {
    return Response.json({
      errors: ["Creator whitelist is required"]
    }, {
      status: 403
    });
  }

  const creator = await requireCreator();

  const uploadLimit = await rateLimiter.check(`upload:${creator.id}`, RATE_LIMIT_UPLOAD);
  if (!uploadLimit.allowed) {
    return Response.json({
      errors: ["Rate limited"]
    }, {
      status: 429,
      headers: { "Retry-After": String(Math.ceil(uploadLimit.retryAfterMs / 1000)) }
    });
  }

  const { id } = await params;
  const formData = await request.formData();
  const file = formData.get("file");
  const note = String(formData.get("note") ?? "").trim();

  if (!(file instanceof File)) {
    return Response.json({
      errors: ["Missing delivery file"]
    }, {
      status: 400
    });
  }

  // File size check
  if (file.size > MAX_DELIVERY_FILE_BYTES) {
    return Response.json({
      errors: [`File exceeds maximum size of ${MAX_DELIVERY_FILE_BYTES / (1024 * 1024)}MB`]
    }, { status: 413 });
  }

  // File type check
  const fileName = file.name.toLowerCase();
  const extension = fileName.includes(".") ? "." + fileName.split(".").pop() : "";
  if (!ALLOWED_DELIVERY_EXTENSIONS.has(extension)) {
    return Response.json({
      errors: [`File type not allowed. Allowed types: ${Array.from(ALLOWED_DELIVERY_EXTENSIONS).join(", ")}`]
    }, { status: 415 });
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    // Buffer size check (actual bytes)
    if (buffer.byteLength > MAX_DELIVERY_FILE_BYTES) {
      return Response.json({
        errors: [`File exceeds maximum size of ${MAX_DELIVERY_FILE_BYTES / (1024 * 1024)}MB`]
      }, { status: 413 });
    }

    await createDeliveryForOrder({
      orderId: id,
      providerId: creator.id,
      buffer,
      fileName: file.name,
      note
    });

    return Response.redirect(new URL("/creator/orders", request.url), 303);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not upload delivery";
    const status = message === "Service order not found" ? 404 : 400;

    return Response.json({
      errors: [message]
    }, {
      status
    });
  }
}
