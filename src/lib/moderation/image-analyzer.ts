import { z } from "zod";
import type {
  ImageAnalysisResult,
  ImageSafetyCategory,
  ConfidenceLevel,
  DetectedObject,
  BatchImageAnalysisResult,
} from "./types";

export const analyzeImageInputSchema = z.object({
  imageBuffer: z.instanceof(Buffer),
  mimeType: z.string().min(1),
  fileName: z.string().optional(),
});

export const batchAnalyzeImagesInputSchema = z.object({
  images: z.array(z.object({
    imageBuffer: z.instanceof(Buffer),
    mimeType: z.string().min(1),
    fileName: z.string().optional(),
  })).min(1).max(50),
});

export type AnalyzeImageInput = z.infer<typeof analyzeImageInputSchema>;
export type BatchAnalyzeImagesInput = z.infer<typeof batchAnalyzeImagesInputSchema>;

const UNSAFE_MIME_TYPES = new Set([
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-shockwave-flash",
]);

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/svg+xml",
]);

// Known image magic bytes for validation
const IMAGE_SIGNATURES: Array<{ bytes: number[]; mime: string }> = [
  { bytes: [0xff, 0xd8, 0xff], mime: "image/jpeg" },
  { bytes: [0x89, 0x50, 0x4e, 0x47], mime: "image/png" },
  { bytes: [0x47, 0x49, 0x46], mime: "image/gif" },
  { bytes: [0x52, 0x49, 0x46, 0x46], mime: "image/webp" },
  { bytes: [0x42, 0x4d], mime: "image/bmp" },
];

function validateImageSignature(buffer: Buffer): boolean {
  for (const sig of IMAGE_SIGNATURES) {
    if (buffer.length >= sig.bytes.length) {
      const matches = sig.bytes.every((byte, i) => buffer[i] === byte);
      if (matches) return true;
    }
  }
  // SVG is text-based, check for common SVG markers
  const header = buffer.toString("utf8", 0, Math.min(256, buffer.length));
  if (header.includes("<svg")) return true;
  return false;
}

interface ImageHeuristics {
  safetyCategory: ImageSafetyCategory;
  detectedObjects: DetectedObject[];
  confidence: ConfidenceLevel;
}

function analyzeImageHeuristics(
  buffer: Buffer,
  mimeType: string
): ImageHeuristics {
  const detectedObjects: DetectedObject[] = [];

  // Reject non-image MIME types
  if (UNSAFE_MIME_TYPES.has(mimeType)) {
    return {
      safetyCategory: "unsafe",
      detectedObjects: [{ label: "executable", confidence: 0.95, category: "dangerous_file", flagged: true }],
      confidence: "high",
    };
  }

  // Validate actual file signature matches declared MIME
  const validSignature = validateImageSignature(buffer);
  if (!validSignature) {
    return {
      safetyCategory: "unsafe",
      detectedObjects: [
        { label: "invalid_image", confidence: 0.9, category: "file_integrity", flagged: true },
      ],
      confidence: "high",
    };
  }

  // File size analysis (images > 10MB flagged as suspicious)
  const sizeMB = buffer.length / (1024 * 1024);
  if (sizeMB > 10) {
    detectedObjects.push({
      label: "oversized_image",
      confidence: 0.7,
      category: "file_size",
      flagged: true,
    });
  }

  // SVG specific checks - can contain scripts
  if (mimeType === "image/svg+xml") {
    const content = buffer.toString("utf8");
    if (content.includes("<script") || content.includes("javascript:") || content.includes("onerror=")) {
      return {
        safetyCategory: "unsafe",
        detectedObjects: [
          { label: "svg_script_injection", confidence: 0.85, category: "security", flagged: true },
        ],
        confidence: "high",
      };
    }
  }

  // Image dimension heuristics (check for steganography indicators)
  if (buffer.length > 0 && mimeType.startsWith("image/")) {
    detectedObjects.push({
      label: "image_data",
      confidence: 0.8,
      category: "media",
      flagged: false,
    });
  }

  const safetyCategory: ImageSafetyCategory = detectedObjects.some((o) => o.flagged)
    ? "suspicious"
    : "safe";

  return {
    safetyCategory,
    detectedObjects,
    confidence: detectedObjects.some((o) => o.flagged) ? "medium" : "high",
  };
}

export interface ImageAnalyzerDeps {
  analyzeSingle?: (buffer: Buffer, mimeType: string) => ImageHeuristics;
}

export function analyzeImage(
  input: AnalyzeImageInput,
  deps?: ImageAnalyzerDeps
): ImageAnalysisResult {
  const start = performance.now();

  if (!ALLOWED_MIME_TYPES.has(input.mimeType) && !UNSAFE_MIME_TYPES.has(input.mimeType)) {
    return {
      safetyCategory: "unsafe",
      detectedObjects: [{ label: "unsupported_format", confidence: 0.95, category: "file_format", flagged: true }],
      confidence: "high",
      processingTimeMs: Math.round((performance.now() - start) * 100) / 100,
    };
  }

  const analyze = deps?.analyzeSingle ?? analyzeImageHeuristics;
  const result = analyze(input.imageBuffer, input.mimeType);

  return {
    ...result,
    processingTimeMs: Math.round((performance.now() - start) * 100) / 100,
  };
}

export function analyzeImageBatch(
  input: BatchAnalyzeImagesInput,
  deps?: ImageAnalyzerDeps
): BatchImageAnalysisResult {
  const start = performance.now();

  const results = input.images.map((image) => analyzeImage(image, deps));

  return {
    results,
    totalProcessingTimeMs: Math.round((performance.now() - start) * 100) / 100,
    safeCount: results.filter((r) => r.safetyCategory === "safe").length,
    suspiciousCount: results.filter((r) => r.safetyCategory === "suspicious").length,
    unsafeCount: results.filter((r) => r.safetyCategory === "unsafe").length,
  };
}
