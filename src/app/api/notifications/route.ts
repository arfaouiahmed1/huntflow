import { NextRequest, NextResponse } from "next/server";
import { notificationsRepo } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Number(searchParams.get("limit")) || 50;
    const notifications = notificationsRepo.list(limit);
    return NextResponse.json({ success: true, notifications });
  } catch (err) {
    console.error("Failed to fetch notifications:", err);
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, message, kind, link, action } = body;

    if (action === "markAllRead") {
      notificationsRepo.markAllRead();
      return NextResponse.json({ success: true });
    }

    if (!title || !message) {
      return NextResponse.json({ error: "Title and message are required" }, { status: 400 });
    }

    const item = notificationsRepo.add({ title, message, kind, link });
    return NextResponse.json({ success: true, notification: item });
  } catch (err) {
    console.error("Failed to create notification:", err);
    return NextResponse.json({ error: "Failed to create notification" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    notificationsRepo.clear();
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to clear notifications:", err);
    return NextResponse.json({ error: "Failed to clear notifications" }, { status: 500 });
  }
}
