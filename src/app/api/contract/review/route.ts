import { NextRequest, NextResponse } from "next/server";
import { scanEmploymentContract } from "@/lib/agents/contractScanner";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      contractText?: string;
      roleTitle?: string;
      companyName?: string;
    };

    if (!body.contractText || body.contractText.trim().length < 20) {
      return NextResponse.json(
        { success: false, error: "Contract text must be at least 20 characters long" },
        { status: 400 }
      );
    }

    const report = scanEmploymentContract(body.contractText);

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Contract scan failed" },
      { status: 500 }
    );
  }
}
