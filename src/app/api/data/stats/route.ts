import { NextResponse } from "next/server";
import { computeStats } from "@/lib/db";
import { toErrorMessage } from "@/lib/errors";

export async function GET() {
  try {
    return NextResponse.json(computeStats());
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
