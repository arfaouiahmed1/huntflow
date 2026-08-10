import { NextResponse } from "next/server";
import { gmailStatus } from "@/lib/gmailAuth";

export async function GET() {
  return NextResponse.json(gmailStatus());
}
