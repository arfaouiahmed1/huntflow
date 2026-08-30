export interface ModelDiscoveryInput {
  providerId: string;
  baseURL: string;
  apiKey: string;
}

type Fetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Pick<Response, "ok" | "json">>;

function endpoint(baseURL: string, path: string): string {
  return `${baseURL.replace(/\/+$/, "")}${path}`;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Fetch model IDs from the provider itself. This runs only on the server; API
 * keys never appear in URLs or in the response body sent back to the browser.
 */
export async function discoverProviderModels(
  input: ModelDiscoveryInput,
  fetcher: Fetcher = fetch,
): Promise<string[]> {
  const { providerId, baseURL, apiKey } = input;
  if (!baseURL.trim()) throw new Error("A base URL is required before models can be imported.");

  let url: string;
  let headers: HeadersInit = { Accept: "application/json" };
  let response: Pick<Response, "ok" | "json">;

  if (providerId === "ollama") {
    url = endpoint(baseURL.replace(/\/v1$/i, ""), "/api/tags");
    response = await fetcher(url, { headers });
    if (!response.ok) throw new Error("Ollama did not return a model list.");
    const body = (await response.json()) as { models?: Array<{ name?: unknown }> };
    return uniqueSorted(
      (body.models ?? []).flatMap((model) =>
        typeof model.name === "string" ? [model.name] : [],
      ),
    );
  }

  url = endpoint(baseURL, "/models");
  if (providerId === "gemini") {
    headers = { ...headers, ...(apiKey ? { "x-goog-api-key": apiKey } : {}) };
  } else if (providerId === "anthropic") {
    headers = {
      ...headers,
      ...(apiKey ? { "x-api-key": apiKey } : {}),
      "anthropic-version": "2023-06-01",
    };
  } else if (apiKey) {
    headers = { ...headers, Authorization: `Bearer ${apiKey}` };
  }

  response = await fetcher(url, { headers });
  if (!response.ok) throw new Error(`${providerId} did not return a model list.`);
  const body = (await response.json()) as {
    data?: Array<{ id?: unknown }>;
    models?: Array<{ name?: unknown }>;
  };

  if (providerId === "gemini") {
    return uniqueSorted(
      (body.models ?? []).flatMap((model) => {
        if (typeof model.name !== "string") return [];
        return [model.name.replace(/^models\//, "")];
      }),
    );
  }

  return uniqueSorted(
    (body.data ?? []).flatMap((model) =>
      typeof model.id === "string" ? [model.id] : [],
    ),
  );
}
