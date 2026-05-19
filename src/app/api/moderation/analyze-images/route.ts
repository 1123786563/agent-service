import { analyzeImageBatch, batchAnalyzeImagesInputSchema, analyzeImageInputSchema } from "@/lib/moderation/image-analyzer";

export async function POST(request: Request) {
  const formData: FormData = await request.formData();
  const files = formData.getAll("images");

  if (!files || files.length === 0) {
    return Response.json({ errors: ["'images' file fields are required"] }, { status: 400 });
  }

  if (files.length > 50) {
    return Response.json({ errors: ["Maximum 50 images per batch"] }, { status: 400 });
  }

  const images: Array<{ imageBuffer: Buffer; mimeType: string; fileName?: string }> = [];

  for (const file of files) {
    if (!(file instanceof File)) continue;
    const imageBuffer = Buffer.from(await file.arrayBuffer());
    const parsed = analyzeImageInputSchema.safeParse({
      imageBuffer,
      mimeType: file.type,
      fileName: file.name,
    });
    if (parsed.success) {
      images.push(parsed.data);
    }
  }

  if (images.length === 0) {
    return Response.json({ errors: ["No valid images provided"] }, { status: 400 });
  }

  const parsed = batchAnalyzeImagesInputSchema.safeParse({ images });
  if (!parsed.success) {
    return Response.json({
      errors: parsed.error.issues.map((i) => i.message),
    }, { status: 400 });
  }

  const result = analyzeImageBatch(parsed.data);
  return Response.json({ data: result }, { status: 200 });
}
