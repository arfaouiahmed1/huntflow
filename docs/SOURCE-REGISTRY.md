# Source Registry & Connector Guide (v2)

The HUNTFLOW Source Registry (`scrapling-agent/sources.json`) is a versioned JSON document validated against `scrapling-agent/source-registry.schema.json`.

## Schema Specification (v2)

Each source entry in `sources.json` declares the following required fields:

```json
{
  "id": "greenhouse",
  "name": "Greenhouse Public Job Boards",
  "channel": "ats",
  "connector": "greenhouse",
  "regions": ["global", "americas", "europe", "mena", "africa", "apac"],
  "countryCodes": ["US", "GB", "DE"],
  "languages": ["en"],
  "capabilities": ["search", "location_filter", "pagination", "etag_caching"],
  "authMode": "none",
  "crawlPolicy": "automatic",
  "cadenceMinutes": 180,
  "perDomainRps": 5.0,
  "termsUrl": "https://www.greenhouse.com/privacy-policy",
  "attribution": {
    "name": "Greenhouse Software, Inc.",
    "url": "https://boards-api.greenhouse.io"
  },
  "enabledByDefault": true,
  "description": "Direct ATS JSON feed for companies hosted on Greenhouse boards-api."
}
```

### Enumeration Values

- **Channel (`channel`)**: `ats` | `aggregator` | `regional` | `community` | `directory`
- **Regions (`regions`)**: `global` | `americas` | `europe` | `mena` | `africa` | `apac`
- **Auth Mode (`authMode`)**: `none` | `optional_key` | `required_key` | `user_session`
- **Crawl Policy (`crawlPolicy`)**: `automatic` | `manual_only` | `disabled`
- **Capabilities (`capabilities`)**: `search` | `location_filter` | `pagination` | `structured_salary` | `structured_remote` | `rss_feed` | `rate_limit_headers` | `etag_caching`

## Registered Connector Adapters

### ATS Connectors (`connectors/ats.py`)
- `greenhouse` — Direct Greenhouse `boards-api.greenhouse.io/v1/boards/{token}/jobs`
- `lever` — Direct Lever `api.lever.co/v0/postings/{company}`
- `ashby` — Direct Ashby `api.ashbyhq.com/posting-api/job-board/{company}`
- `smartrecruiters` — Direct SmartRecruiters `api.smartrecruiters.com/v1/companies/{company}/postings`
- `personio` — Personio XML feed `https://{company}.jobs.personio.de/xml`
- `recruitee` — Recruitee public offers `https://{company}.recruitee.com/api/offers`
- `workable` — Workable public widget `apply.workable.com/api/v1/widget/accounts/{company}`
- `teamtailor` — Teamtailor API (optional key)
- `workday` — Workday CXS (manual tenant-assisted)
- `bamboohr` — BambooHR public boards (manual tenant-assisted)

### Aggregator Connectors (`connectors/aggregators.py`)
- `arbeitnow` — Zero-key European and remote tech API with structured visa/salary tags.
- `jobicy` — Zero-key remote developer API.
- `remotive` — Zero-key software engineering API.
- `himalayas` — Zero-key community developer API with salary ranges.
- `reliefweb` — Open humanitarian and engineering jobs API covering Africa, MENA, and APAC.
- `themuse` — North American career API with company culture insights (optional key).
- `adzuna` — Multi-country job search API with salary modeling (optional key).
- `jooble` — Multi-region search API (optional key).
- `findwork` — Developer job board API (optional key).
- `usajobs` — Official US Federal employment opportunities API (optional key).

## Adding a New Source

1. **Check Terms & Permissions**: Ensure the target feed provides a public JSON/XML endpoint, open terms, or permitted HTML path.
2. **Implement Connector**: If a new protocol is needed, add an adapter class in `scrapling-agent/connectors/` implementing the `Connector` protocol.
3. **Register Entry in `sources.json`**: Add the source record with `id`, `name`, `channel`, `connector`, `regions`, `capabilities`, `authMode`, `crawlPolicy: "disabled"`, `cadenceMinutes`, `perDomainRps`, `termsUrl`, and `attribution`.
4. **Validate Schema**: Run `npm run sources:validate` to ensure schema compliance.
5. **Run Tests**: Add deterministic fixture tests in `scrapling-agent/tests/test_connectors.py` and run `npm run test:crawler` and `npm run test:sidecar`.
