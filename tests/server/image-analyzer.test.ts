import { describe, expect, it } from "vitest";
import { analyzeImage, analyzeImageBatch } from "@/lib/moderation/image-analyzer";

function makeJpegBuffer(): Buffer {
  // Minimal valid JPEG: FFD8FF (JPEG SOI) + E0 (JFIF APP0 marker) + minimal data
  const header = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x02, 0x00, 0x00]);
  return Buffer.concat([header, Buffer.alloc(100)]);
}

function makePngBuffer(): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(100)]);
}

function makeGifBuffer(): Buffer {
  const header = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
  return Buffer.concat([header, Buffer.alloc(100)]);
}

describe("analyzeImage", () => {
  it("classifies valid JPEG as safe", () => {
    const result = analyzeImage({
      imageBuffer: makeJpegBuffer(),
      mimeType: "image/jpeg",
    });

    expect(result.safetyCategory).toBe("safe");
    expect(result.detectedObjects.length).toBeGreaterThan(0);
    expect(result.confidence).toBe("high");
    expect(result.processingTimeMs).toBeLessThan(2000);
  });

  it("classifies valid PNG as safe", () => {
    const result = analyzeImage({
      imageBuffer: makePngBuffer(),
      mimeType: "image/png",
    });

    expect(result.safetyCategory).toBe("safe");
  });

  it("flags invalid image signatures as unsafe", () => {
    const result = analyzeImage({
      imageBuffer: Buffer.from("this is not an image"),
      mimeType: "image/jpeg",
    });

    expect(result.safetyCategory).toBe("unsafe");
    expect(result.detectedObjects.some((o) => o.label === "invalid_image")).toBe(true);
  });

  it("flags executable files as unsafe", () => {
    const result = analyzeImage({
      imageBuffer: Buffer.alloc(100),
      mimeType: "application/x-msdos-program",
    });

    expect(result.safetyCategory).toBe("unsafe");
    expect(result.detectedObjects.some((o) => o.label === "executable")).toBe(true);
  });

  it("flags unsupported MIME types as unsafe", () => {
    const result = analyzeImage({
      imageBuffer: Buffer.alloc(100),
      mimeType: "application/pdf",
    });

    expect(result.safetyCategory).toBe("unsafe");
    expect(result.detectedObjects.some((o) => o.label === "unsupported_format")).toBe(true);
  });

  it("flags SVG with script injection as unsafe", () => {
    const svgContent = `<svg><script>alert('xss')</script></svg>`;
    const result = analyzeImage({
      imageBuffer: Buffer.from(svgContent),
      mimeType: "image/svg+xml",
    });

    expect(result.safetyCategory).toBe("unsafe");
    expect(result.detectedObjects.some((o) => o.label === "svg_script_injection")).toBe(true);
  });

  it("allows clean SVG", () => {
    const svgContent = `<svg><circle cx="50" cy="50" r="40"/></svg>`;
    const result = analyzeImage({
      imageBuffer: Buffer.from(svgContent),
      mimeType: "image/svg+xml",
    });

    expect(result.safetyCategory).toBe("safe");
  });

  it("reports processing time", () => {
    const result = analyzeImage({
      imageBuffer: makeJpegBuffer(),
      mimeType: "image/jpeg",
    });

    expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("uses custom analyzer when provided", () => {
    const result = analyzeImage(
      {
        imageBuffer: Buffer.alloc(10),
        mimeType: "image/png",
      },
      {
        analyzeSingle: () => ({
          safetyCategory: "suspicious",
          detectedObjects: [{ label: "test", confidence: 0.5, category: "test", flagged: true }],
          confidence: "medium",
        }),
      }
    );

    expect(result.safetyCategory).toBe("suspicious");
  });
});

describe("analyzeImageBatch", () => {
  it("processes multiple images", () => {
    const result = analyzeImageBatch({
      images: [
        { imageBuffer: makeJpegBuffer(), mimeType: "image/jpeg" },
        { imageBuffer: makePngBuffer(), mimeType: "image/png" },
        { imageBuffer: makeGifBuffer(), mimeType: "image/gif" },
      ],
    });

    expect(result.results).toHaveLength(3);
    expect(result.safeCount).toBe(3);
    expect(result.suspiciousCount).toBe(0);
    expect(result.unsafeCount).toBe(0);
    expect(result.totalProcessingTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("counts categories correctly", () => {
    const result = analyzeImageBatch({
      images: [
        { imageBuffer: makeJpegBuffer(), mimeType: "image/jpeg" },
        { imageBuffer: Buffer.from("not an image"), mimeType: "image/jpeg" },
      ],
    });

    expect(result.safeCount).toBe(1);
    expect(result.unsafeCount).toBe(1);
    expect(result.results).toHaveLength(2);
  });
});
