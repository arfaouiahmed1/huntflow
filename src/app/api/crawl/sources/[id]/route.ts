import { NextRequest, NextResponse } from "next/server";
import { crawlerSourcesRepo } from "@/lib/db";
import { z } from "zod";

const PatchSourceSchema = z.object({
  enabled: z.boolean(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  try {
    const { id } = await ctx.params;
    if (!id || !id.trim()) {
      return NextResponse.json({ success: false, error: "Missing source id" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    const parsed = PatchSourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Invalid body: 'enabled' boolean required" }, { status: 400 });
    }

    crawlerSourcesRepo.setEnabled(id, parsed.data.enabled);

    return NextResponse.json({
      success: true,
      id,
      enabled: parsed.data.enabled,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to update source" },
      { status: 500 }
    );
  }
}
