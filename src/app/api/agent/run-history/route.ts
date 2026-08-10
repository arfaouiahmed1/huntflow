import { NextRequest, NextResponse } from "next/server";
import { agentRunHistoryRepo } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const threadId = searchParams.get("threadId");

  try {
    if (threadId) {
      const history = agentRunHistoryRepo.listByThread(threadId);
      return NextResponse.json({ success: true, history });
    }

    const history = agentRunHistoryRepo.listRecent(20);
    return NextResponse.json({ success: true, history });
  } catch (err) {
    return NextResponse.json({ error: "Failed to fetch run history", details: String(err) }, { status: 500 });
  }
}
