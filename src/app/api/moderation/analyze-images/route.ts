import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const files = formData.getAll("images");
  const results = files.map(() => ({
    category: (["safe", "suspicious", "unsafe"] as const)[Math.floor(Math.random() * 3)],
    detectedObjects: [],
    confidence: Math.round((0.6 + Math.random() * 0.35) * 100) / 100,
    severity: (["low", "medium", "high"] as const)[Math.floor(Math.random() * 3)],
  }));

  return NextResponse.json({ results });
}
