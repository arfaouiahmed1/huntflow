import { NextRequest } from "next/server";
import { getProvider } from "@/lib/llm/providers";
import { discoverProviderModels } from "@/lib/llm/modelDiscovery";
import { loadChainFromDb } from "@/lib/llm/router";
import { isMasked } from "@/lib/masking";
import { toErrorMessage } from "@/lib/errors";

interface ModelsRequest {
  providerSlotId?: string;
  providerId?: string;
  apiKey?: string;
  baseURL?: string;
}

function validBaseURL(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Server-side proxy for provider model import. It never includes API keys in the response. */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as ModelsRequest;
    const providerSlotId = body.providerSlotId?.trim() || "";
    const stored = providerSlotId
      ? loadChainFromDb()?.find((provider) => provider.id === providerSlotId)
      : undefined;
    const providerId = stored?.providerId || body.providerId?.trim() || "";

    if (!providerId) {
      return Response.json({ error: "Choose a provider before importing models." }, { status: 400 });
    }

    const configured = getProvider(providerId);
    const apiKey = body.apiKey && !isMasked(body.apiKey) ? body.apiKey : stored?.apiKey || "";
    const baseURL = body.baseURL?.trim() || stored?.baseURL || configured.baseURL || "";
    if (!validBaseURL(baseURL)) {
      return Response.json({ error: "Use a valid HTTP(S) provider URL." }, { status: 400 });
    }

    const models = await discoverProviderModels({ providerId, baseURL, apiKey });
    return Response.json({ providerSlotId: stored?.id || providerSlotId || providerId, models });
  } catch (error) {
    return Response.json({ error: toErrorMessage(error) }, { status: 502 });
  }
}
