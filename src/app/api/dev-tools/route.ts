import { readFile } from "node:fs/promises";
import path from "node:path";

import { shouldInitializeDevDiagnostics } from "@/components/dev/gate";

interface DevToolEntry {
  readonly name: string;
  readonly file: string;
}

const TOOL_CONFIG_PATH = path.join(process.cwd(), "src", "components", "dev", "tools.json");
const ALLOWED_DIST_FILES = new Set(["auto.global.js", "index.global.js"]);

function parseToolConfig(raw: unknown): readonly DevToolEntry[] {
  if (!Array.isArray(raw)) {
    throw new Error("tools.json must contain an array of { name, file } entries");
  }
  return raw.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("name" in entry) ||
      !("file" in entry) ||
      typeof entry.name !== "string" ||
      typeof entry.file !== "string" ||
      entry.name.length === 0 ||
      !ALLOWED_DIST_FILES.has(entry.file)
    ) {
      throw new Error("tools.json entries must be { name: string, file: allowed-dist-file }");
    }
    return { name: entry.name, file: entry.file };
  });
}

async function readToolConfig(): Promise<readonly DevToolEntry[]> {
  const raw: unknown = JSON.parse(await readFile(TOOL_CONFIG_PATH, "utf8"));
  return parseToolConfig(raw);
}

function developmentOnly(): Response | null {
  const enabled = shouldInitializeDevDiagnostics({
    nodeEnv: process.env.NODE_ENV,
    disableFlag: process.env.NEXT_PUBLIC_DISABLE_REACT_DEVTOOLS,
  });
  if (enabled) return null;
  return Response.json({ error: "not available" }, { status: 404 });
}

/**
 * Development-only loader for the React diagnostic tools.
 *
 * The tool bundles are served straight from node_modules so that no
 * `import()` edge to them ever exists in application source — Turbopack
 * follows dynamic-import edges unconditionally and would otherwise emit the
 * diagnostic libraries into production chunks even behind a compile-time-false
 * guard (verified empirically; see task-03 evidence). In production this route
 * answers 404 before touching the filesystem.
 *
 * GET /api/dev-tools            -> manifest: [{ name, src }]
 * GET /api/dev-tools?asset=name -> the configured dist bundle, text/javascript
 */
export async function GET(request: Request): Promise<Response> {
  const notAvailable = developmentOnly();
  if (notAvailable) return notAvailable;

  const assetName = new URL(request.url).searchParams.get("asset");
  const tools = await readToolConfig();

  if (assetName === null) {
    return Response.json(
      tools.map((tool) => ({ name: tool.name, src: `/api/dev-tools?asset=${tool.name}` })),
    );
  }

  const tool = tools.find((candidate) => candidate.name === assetName);
  if (tool === undefined) {
    return Response.json({ error: "unknown asset" }, { status: 404 });
  }

  const bundlePath = path.join(process.cwd(), "node_modules", tool.name, "dist", tool.file);
  const bundle = await readFile(bundlePath);
  return new Response(new Uint8Array(bundle), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
