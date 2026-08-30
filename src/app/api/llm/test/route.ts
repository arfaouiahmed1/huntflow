import { NextRequest } from "next/server";
import { routeError } from "@/lib/errors";
import { resolveChain, callLLM, loadChainFromDb } from "@/lib/llm/router";
import { toLLMProvider } from "@/lib/llm/providers";
import { isMasked } from "@/lib/masking";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      providerId?: string;
      model?: string;
      provider?: { id?: string; providerId?: string; apiKey?: string; model?: string; baseURL?: string; kind?: string };
    };
    let chain = resolveChain();

    const requestedId = body.providerId || (body.provider && (body.provider.id || body.provider.providerId)) || "";

    if (requestedId) {
      let apiKey = body.provider?.apiKey ?? "";
      if (isMasked(apiKey)) {
        const stored = loadChainFromDb();
        apiKey = stored?.find((p) => p.id === requestedId)?.apiKey ?? "";
      }
      const target = apiKey
        ? toLLMProvider({
            providerId: body.provider?.providerId || requestedId,
            apiKey,
            model: body.model || body.provider?.model || "",
            baseURL: body.provider?.baseURL,
          })
        : chain.find((p) => p.id === requestedId);
      if (!target) {
        return Response.json({ error: "Provider not configured." }, { status: 400 });
      }
      if (!target.apiKey) {
        return Response.json({ error: "This provider has no API key yet." }, { status: 400 });
      }
      chain = [{ ...target, model: body.model || body.provider?.model || target.model }];
    } else if (chain.every((p) => !p.apiKey && p.id !== "ollama")) {
      return Response.json({ error: "No API keys configured — add a provider key first." }, { status: 400 });
    }

    const started = Date.now();
    const result = await callLLM(
      {
        system: "You are a connectivity test. Reply with the single word: OK",
        user: "Ping.",
        maxOutput: 16,
        agent: "llm_test",
      },
      chain
    );
    const provider = chain.find((p) => p.id === result.providerId);
    return Response.json({
      ok: true,
      providerId: result.providerId,
      model: result.model,
      latencyMs: Date.now() - started,
      attempts: result.attempts,
      label: provider?.label ?? result.providerId,
      reply: result.text.trim().slice(0, 60),
    });
  } catch (err) {
    return routeError(err);
  }
}
