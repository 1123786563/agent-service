import { NextResponse } from "next/server";

const OBJECTS = ["person", "text overlay", "graphic", "weapon", "drug", "violence", "nudity", "gore"];

export async function POST() {
  const severity = Math.random();
  let category: "safe" | "suspicious" | "unsafe";
  if (severity > 0.7) category = "unsafe";
  else if (severity > 0.3) category = "suspicious";
  else category = "safe";

  const detectedObjects = category === "safe"
    ? []
    : OBJECTS.sort(() => Math.random() - 0.5).slice(0, Math.floor(Math.random() * 3) + 1);

  return NextResponse.json({
    category,
    detectedObjects,
    confidence: Math.round((0.6 + Math.random() * 0.35) * 100) / 100,
    severity: category === "unsafe" ? "high" : category === "suspicious" ? "medium" : "low",
  });
}
