import { analyzeImage, analyzeImageInputSchema } from "@/lib/moderation/image-analyzer";
import { addToQueue } from "@/lib/moderation/queue-service";
import { createPrismaQueueStore } from "@/lib/moderation/queue-store";

export async function POST(request: Request) {
  const formData: FormData = await request.formData();
  const file = formData.get("image");

  if (!file || !(file instanceof File)) {
    return Response.json({ errors: ["'image' file field is required"] }, { status: 400 });
  }

  const imageBuffer = Buffer.from(await file.arrayBuffer());
  const parsed = analyzeImageInputSchema.safeParse({
    imageBuffer,
    mimeType: file.type,
    fileName: file.name,
  });

  if (!parsed.success) {
    return Response.json({
      errors: parsed.error.issues.map((i) => i.message),
    }, { status: 400 });
  }

  const result = analyzeImage(parsed.data);

  if (result.safetyCategory !== "safe") {
    try {
      const queueStore = createPrismaQueueStore();
      await addToQueue({
        contentType: "IMAGE",
        contentRef: `image:${Date.now()}:${file.name}`,
        toxicityScore: result.safetyCategory === "unsafe" ? 0.9 : 0.5,
        flaggedPhrases: result.detectedObjects.filter((o) => o.flagged).map((o) => o.label),
        categories: [...new Set(result.detectedObjects.filter((o) => o.flagged).map((o) => o.category))],
      }, queueStore);
    } catch {
      // Queue insertion failure should not block the response
    }
  }

  return Response.json({ data: result }, { status: 200 });
}
