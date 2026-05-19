import { z } from "zod";
import { prisma } from "@/server/db";
import { getCurrentUser } from "@/server/auth/session";
import { generateApiKey } from "@/lib/moderation/api-key-auth";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  tier: z.enum(["STANDARD", "PREMIUM"]).default("STANDARD"),
  rateLimit: z.number().min(1).max(10000).optional(),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  let payload: unknown;
  try { payload = await request.json(); } catch {
    return Response.json({ errors: ["Request body must be valid JSON"] }, { status: 400 });
  }

  const parsed = createSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json({ errors: parsed.error.issues.map((i) => i.message) }, { status: 400 });
  }

  const tier = parsed.data.tier;
  const defaultRateLimit = tier === "PREMIUM" ? 1000 : 100;
  const rateLimit = parsed.data.rateLimit ?? defaultRateLimit;

  const { rawKey, keyHash, keyPrefix } = generateApiKey();

  const apiKey = await prisma.apiKey.create({
    data: {
      keyHash,
      keyPrefix,
      name: parsed.data.name,
      tier: tier as any,
      rateLimit,
    },
  });

  return Response.json({
    data: {
      id: apiKey.id,
      name: apiKey.name,
      keyPrefix: apiKey.keyPrefix,
      tier: apiKey.tier,
      rateLimit: apiKey.rateLimit,
      rawKey,
      createdAt: apiKey.createdAt,
    },
  }, { status: 201 });
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ errors: ["Authentication required"] }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { isActive: true },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      tier: true,
      rateLimit: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return Response.json({ data: keys }, { status: 200 });
}
