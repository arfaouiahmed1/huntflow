import { NextRequest, NextResponse } from "next/server";
import { notificationsRepo } from "@/lib/db";

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    notificationsRepo.markRead(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to mark notification read:", err);
    return NextResponse.json({ error: "Failed to update notification" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    notificationsRepo.delete(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to delete notification:", err);
    return NextResponse.json({ error: "Failed to delete notification" }, { status: 500 });
  }
}
