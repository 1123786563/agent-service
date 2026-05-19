import { NextResponse } from "next/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const { action, moderator, note } = body as {
    action: "approve" | "reject" | "escalate";
    moderator?: string;
    note?: string;
  };

  if (!action || !["approve", "reject", "escalate"].includes(action)) {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  return NextResponse.json({
    id,
    action,
    moderator: moderator ?? "current-user",
    note,
    timestamp: new Date().toISOString(),
  });
}
