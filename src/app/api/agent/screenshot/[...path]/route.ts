import pathModule from "node:path";
import { NextResponse } from "next/server";
import { AGENT_BASE_URL, agentHeaders } from "@/lib/agentClient";

function isInside(base: string, target: string): boolean {
  const rel = pathModule.relative(base, target);
  return !!rel && !rel.startsWith("..") && !pathModule.isAbsolute(rel);
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  if (
    !path?.length ||
    path.some((part) => !part || part === "." || part === ".." || part.includes("\\") || part.includes("/") || part.includes("\0"))
  ) {
    return NextResponse.json({ error: "Invalid screenshot path." }, { status: 400 });
  }
  const baseDir = pathModule.resolve(".agent_runs");
  const targetPath = pathModule.resolve(pathModule.join(baseDir, ...path));
  if (!isInside(baseDir, targetPath) && targetPath !== baseDir) {
    return NextResponse.json({ error: "Invalid screenshot path." }, { status: 400 });
  }

  try {
    const upstream = await fetch(
      `${AGENT_BASE_URL}/screenshots/${path.map(encodeURIComponent).join("/")}`,
      {
        headers: agentHeaders(),
        cache: "no-store",
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!upstream.ok) {
      return NextResponse.json({ error: "Screenshot unavailable." }, { status: upstream.status });
    }

    return new NextResponse(await upstream.arrayBuffer(), {
      headers: {
        "Content-Type": upstream.headers.get("content-type") || "image/png",
        "Cache-Control": "private, no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Agent screenshot service is offline." }, { status: 503 });
  }
}
