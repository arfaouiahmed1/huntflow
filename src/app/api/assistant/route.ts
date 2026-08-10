import { NextRequest } from "next/server";
import { routeError, readBody } from "@/lib/errors";
import { runAssistant, ChatMessage } from "@/agents/orchestrator";
import { settingsRepo } from "@/lib/db";
import { UserProfile } from "@/types";

export async function POST(req: NextRequest) {
  try {
    const raw = await readBody(req);
    const body = (raw ?? {}) as { message?: string; history?: ChatMessage[] };
    if (!body.message?.trim()) {
      return Response.json({ error: "message is required." }, { status: 400 });
    }
    const rawProfile = settingsRepo.get("profile");
    if (!rawProfile) {
      return Response.json({ error: "Profile not found in database." }, { status: 400 });
    }
    const profile = JSON.parse(rawProfile) as UserProfile;
    
    const result = await runAssistant({
      message: body.message.trim(),
      history: body.history ?? [],
      profile,
    });
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return routeError(err);
  }
}
