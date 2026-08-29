import {
  CompanyResearch,
  CompanyResearchFact,
  CompanyResearchNewsItem,
  CompanyResearchSource,
} from "@/types";

const WIKIDATA_API = "https://www.wikidata.org/w/api.php";
const WIKIDATA_ENTITY = "https://www.wikidata.org/wiki/Special:EntityData";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const GDELT_API = "https://api.gdeltproject.org/api/v2/doc/doc";

type FetchLike = typeof fetch;

interface ResearchOptions {
  fetchImpl?: FetchLike;
  now?: () => Date;
  timeoutMs?: number;
}

interface WikidataResult {
  entityId?: string;
  summary?: string;
  officialWebsite?: string;
  facts: CompanyResearchFact[];
  sources: CompanyResearchSource[];
  warnings: string[];
}

function normalized(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function fetchJson(
  fetchImpl: FetchLike,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "HuntflowCareerWorkspace/0.1 (local source-backed company research)",
    },
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function claimValue(entity: Record<string, unknown>, property: string): unknown {
  const claims = asRecord(entity.claims);
  const statement = asRecord(asArray(claims?.[property])[0]);
  const mainsnak = asRecord(statement?.mainsnak);
  const datavalue = asRecord(mainsnak?.datavalue);
  return datavalue?.value;
}

function entityIdFromClaim(entity: Record<string, unknown>, property: string): string | undefined {
  const value = asRecord(claimValue(entity, property));
  const id = asString(value?.id);
  return id && /^Q\d+$/.test(id) ? id : undefined;
}

function entityIdsFromClaim(entity: Record<string, unknown>, property: string): string[] {
  const claims = asRecord(entity.claims);
  return asArray(claims?.[property])
    .map((claim) => {
      const value = asRecord(asRecord(asRecord(claim)?.mainsnak)?.datavalue)?.value;
      const id = asString(asRecord(value)?.id);
      return id && /^Q\d+$/.test(id) ? id : undefined;
    })
    .filter((id): id is string => Boolean(id));
}

async function fetchEntityLabels(
  fetchImpl: FetchLike,
  ids: string[],
  timeoutMs: number,
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(ids)).slice(0, 20);
  if (!uniqueIds.length) return new Map();
  const params = new URLSearchParams({
    action: "wbgetentities",
    ids: uniqueIds.join("|"),
    props: "labels",
    languages: "en",
    format: "json",
    origin: "*",
  });
  const payload = asRecord(await fetchJson(fetchImpl, `${WIKIDATA_API}?${params}`, timeoutMs));
  const entities = asRecord(payload?.entities);
  const labels = new Map<string, string>();
  for (const id of uniqueIds) {
    const entity = asRecord(entities?.[id]);
    const label = asString(asRecord(asRecord(entity?.labels)?.en)?.value);
    if (label) labels.set(id, label);
  }
  return labels;
}

async function researchWikidata(
  company: string,
  fetchImpl: FetchLike,
  retrievedAt: string,
  timeoutMs: number,
): Promise<WikidataResult> {
  const output: WikidataResult = { facts: [], sources: [], warnings: [] };
  const searchParams = new URLSearchParams({
    action: "wbsearchentities",
    search: company,
    language: "en",
    uselang: "en",
    type: "item",
    limit: "5",
    format: "json",
    origin: "*",
  });
  const searchPayload = asRecord(await fetchJson(fetchImpl, `${WIKIDATA_API}?${searchParams}`, timeoutMs));
  const candidates = asArray(searchPayload?.search).map(asRecord).filter(Boolean) as Record<string, unknown>[];
  const query = normalized(company);
  const organizationWords = /company|business|corporation|enterprise|organization|software|technology|manufacturer|laboratory|startup|platform/i;
  const candidate = candidates.find((item) => normalized(asString(item.label) || "") === query)
    ?? candidates.find((item) => {
      const label = normalized(asString(item.label) || "");
      const description = asString(item.description) || "";
      return Boolean(label && (label.includes(query) || query.includes(label)) && organizationWords.test(description));
    });

  const entityId = asString(candidate?.id);
  if (!entityId || !/^Q\d+$/.test(entityId)) {
    output.warnings.push("No sufficiently confident Wikidata company identity match was found.");
    return output;
  }

  output.entityId = entityId;
  const entitySourceId = `wikidata:${entityId}`;
  output.sources.push({
    id: entitySourceId,
    kind: "wikidata",
    title: `${asString(candidate?.label) || company} — Wikidata`,
    url: `https://www.wikidata.org/wiki/${entityId}`,
    publisher: "Wikidata",
    retrievedAt,
  });

  const entityPayload = asRecord(await fetchJson(fetchImpl, `${WIKIDATA_ENTITY}/${entityId}.json`, timeoutMs));
  const entity = asRecord(asRecord(entityPayload?.entities)?.[entityId]);
  if (!entity) {
    output.warnings.push("The matched Wikidata entity could not be loaded.");
    return output;
  }

  const website = asString(claimValue(entity, "P856"));
  if (website && /^https?:\/\//i.test(website)) {
    output.officialWebsite = website;
    output.facts.push({ label: "Official website", value: website, sourceIds: [entitySourceId], confidence: "verified" });
  }

  const inceptionValue = asRecord(claimValue(entity, "P571"));
  const inceptionTime = asString(inceptionValue?.time);
  const yearMatch = inceptionTime?.match(/[+-](\d{4})-/);
  if (yearMatch) {
    output.facts.push({ label: "Founded", value: yearMatch[1], sourceIds: [entitySourceId], confidence: "verified" });
  }

  const headquartersId = entityIdFromClaim(entity, "P159");
  const industryIds = entityIdsFromClaim(entity, "P452").slice(0, 4);
  const instanceIds = entityIdsFromClaim(entity, "P31").slice(0, 3);
  try {
    const labels = await fetchEntityLabels(fetchImpl, [headquartersId, ...industryIds, ...instanceIds].filter(Boolean) as string[], timeoutMs);
    const headquarters = headquartersId ? labels.get(headquartersId) : undefined;
    const industries = industryIds.map((id) => labels.get(id)).filter((label): label is string => Boolean(label));
    const organizationTypes = instanceIds.map((id) => labels.get(id)).filter((label): label is string => Boolean(label));
    if (headquarters) output.facts.push({ label: "Headquarters", value: headquarters, sourceIds: [entitySourceId], confidence: "verified" });
    if (industries.length) output.facts.push({ label: "Industry", value: industries.join(", "), sourceIds: [entitySourceId], confidence: "verified" });
    if (organizationTypes.length) output.facts.push({ label: "Organization type", value: organizationTypes.join(", "), sourceIds: [entitySourceId], confidence: "verified" });
  } catch {
    output.warnings.push("Some Wikidata entity labels were unavailable during this research pass.");
  }

  const sitelinks = asRecord(entity.sitelinks);
  const enwikiTitle = asString(asRecord(sitelinks?.enwiki)?.title);
  if (enwikiTitle) {
    try {
      const wikiParams = new URLSearchParams({
        action: "query",
        prop: "extracts",
        exintro: "1",
        explaintext: "1",
        redirects: "1",
        titles: enwikiTitle,
        format: "json",
        origin: "*",
      });
      const wikiPayload = asRecord(await fetchJson(fetchImpl, `${WIKIPEDIA_API}?${wikiParams}`, timeoutMs));
      const pages = asRecord(asRecord(wikiPayload?.query)?.pages);
      const page = pages ? Object.values(pages).map(asRecord).find(Boolean) : undefined;
      const extract = asString(page?.extract);
      const wikipediaSourceId = `wikipedia:${entityId}`;
      const wikipediaUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(enwikiTitle.replace(/ /g, "_"))}`;
      output.sources.push({
        id: wikipediaSourceId,
        kind: "wikipedia",
        title: `${enwikiTitle} — Wikipedia`,
        url: wikipediaUrl,
        publisher: "Wikipedia",
        retrievedAt,
      });
      if (extract) {
        output.summary = extract.replace(/\s+/g, " ").trim().slice(0, 900);
        output.facts.push({ label: "Company overview", value: output.summary, sourceIds: [wikipediaSourceId], confidence: "verified" });
      }
    } catch {
      output.warnings.push("The linked Wikipedia overview was unavailable during this research pass.");
    }
  }

  return output;
}

function gdeltDate(value: unknown): string | undefined {
  const raw = asString(value);
  const match = raw?.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return match ? `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z` : undefined;
}

async function researchNews(
  company: string,
  fetchImpl: FetchLike,
  retrievedAt: string,
  timeoutMs: number,
): Promise<{ news: CompanyResearchNewsItem[]; sources: CompanyResearchSource[]; warning?: string }> {
  if (normalized(company).length < 4) return { news: [], sources: [], warning: "Company name is too short for a reliable news query." };
  const params = new URLSearchParams({
    query: `\"${company.replace(/[\"()]/g, " ").trim()}\" sourcelang:english`,
    mode: "artlist",
    maxrecords: "8",
    timespan: "3months",
    sort: "datedesc",
    format: "json",
  });
  try {
    const payload = asRecord(await fetchJson(fetchImpl, `${GDELT_API}?${params}`, timeoutMs));
    const seen = new Set<string>();
    const news: CompanyResearchNewsItem[] = [];
    const sources: CompanyResearchSource[] = [];
    for (const rawArticle of asArray(payload?.articles)) {
      const article = asRecord(rawArticle);
      const url = asString(article?.url);
      const title = asString(article?.title);
      if (!url || !title || !/^https?:\/\//i.test(url) || seen.has(url)) continue;
      seen.add(url);
      const sourceId = `news:${news.length + 1}`;
      const publisher = asString(article?.domain) || "News publisher";
      const publishedAt = gdeltDate(article?.seendate);
      news.push({ title, url, publisher, publishedAt, sourceId });
      sources.push({ id: sourceId, kind: "news", title, url, publisher, publishedAt, retrievedAt });
    }
    return { news, sources };
  } catch {
    return { news: [], sources: [], warning: "Current news search timed out or was unavailable." };
  }
}

export async function researchCompany(
  input: { company: string; jobUrl?: string },
  options: ResearchOptions = {},
): Promise<CompanyResearch> {
  const company = input.company.trim().slice(0, 160);
  const now = options.now ?? (() => new Date());
  const retrievedAt = now().toISOString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 8_000;
  const warnings: string[] = [];

  if (!company) {
    return { company: "Unknown company", status: "unavailable", facts: [], news: [], sources: [], warnings: ["Company name is missing."], researchedAt: retrievedAt };
  }

  let wikidata: WikidataResult = { facts: [], sources: [], warnings: [] };
  const [identityResult, newsResult] = await Promise.allSettled([
    researchWikidata(company, fetchImpl, retrievedAt, timeoutMs),
    researchNews(company, fetchImpl, retrievedAt, timeoutMs),
  ]);
  if (identityResult.status === "fulfilled") wikidata = identityResult.value;
  else warnings.push("Company identity research timed out or was unavailable.");

  const news = newsResult.status === "fulfilled" ? newsResult.value : { news: [], sources: [], warning: "Current news search was unavailable." };
  warnings.push(...wikidata.warnings);
  if (news.warning) warnings.push(news.warning);

  const sources = [...wikidata.sources, ...news.sources];
  if (input.jobUrl && /^https?:\/\//i.test(input.jobUrl)) {
    sources.push({
      id: "job-posting",
      kind: "job_posting",
      title: `${company} job posting`,
      url: input.jobUrl,
      publisher: company,
      retrievedAt,
    });
  }

  return {
    company,
    status: wikidata.entityId ? "verified" : sources.length ? "partial" : "unavailable",
    entityId: wikidata.entityId,
    summary: wikidata.summary,
    officialWebsite: wikidata.officialWebsite,
    facts: wikidata.facts,
    news: news.news,
    sources,
    warnings: Array.from(new Set(warnings)),
    researchedAt: retrievedAt,
  };
}
