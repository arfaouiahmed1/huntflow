import { NextRequest, NextResponse } from "next/server";
import { resumeVariantsRepo, jobsRepo, ResumeVariant } from "@/lib/db";

export async function GET() {
  try {
    resumeVariantsRepo.seedDefaults();
    const variants = resumeVariantsRepo.list();
    const allJobs = jobsRepo.list();

    // Compute empirical conversion funnel per variant
    const stats = variants.map((v) => {
      // Find jobs where notes or multiAgentOutputs match this variant tag or archetype
      const matchedJobs = allJobs.filter((j) => {
        const text = `${j.notes || ""} ${j.multiAgentOutputs?.recommendedTemplate || ""}`.toLowerCase();
        return text.includes(v.tag.toLowerCase()) || text.includes(v.archetype.toLowerCase());
      });

      const totalApplications = matchedJobs.length;
      const screeningCount = matchedJobs.filter((j) => ["interviewing", "offer"].includes(j.status)).length;
      const offerCount = matchedJobs.filter((j) => j.status === "offer").length;
      const conversionRate = totalApplications > 0 ? Math.round((screeningCount / totalApplications) * 100) : 0;

      return {
        variantId: v.id,
        name: v.name,
        archetype: v.archetype,
        tag: v.tag,
        templateId: v.templateId,
        totalApplications,
        screeningCount,
        offerCount,
        conversionRate,
      };
    });

    return NextResponse.json({
      success: true,
      variants,
      funnelAnalytics: stats,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to load variants" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<ResumeVariant>;

    if (!body.name || !body.archetype || !body.content) {
      return NextResponse.json(
        { success: false, error: "Missing required fields: name, archetype, content" },
        { status: 400 }
      );
    }

    const id = body.id || `var-${Date.now()}`;
    const variant: ResumeVariant = {
      id,
      name: body.name,
      archetype: body.archetype,
      tag: body.tag || body.archetype.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      templateId: body.templateId || "classic-ats",
      content: body.content,
      createdAt: body.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    resumeVariantsRepo.upsert(variant);

    return NextResponse.json({
      success: true,
      variant,
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to save variant" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
    }
    resumeVariantsRepo.remove(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Failed to delete variant" },
      { status: 500 }
    );
  }
}
