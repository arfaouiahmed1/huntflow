# Legal, Source Policy & Compliance Guide

HUNTFLOW operates under a **compliance-first, public-data model**.

## Core Data Policy

1. **Public APIs & Feeds First**: HUNTFLOW prioritizes official public ATS endpoints (Greenhouse, Lever, Ashby, SmartRecruiters, Personio XML) and open developer APIs (Arbeitnow, Jobicy, Remotive, Himalayas, ReliefWeb).
2. **No Bulk Authenticated Scraping**: Restricted platforms (such as LinkedIn or Indeed) are never subjected to automated bulk scraping, background credential rotation, or CAPTCHA/WAF bypass. They exist only as manual links or explicit user-directed browser sessions.
3. **Respect for Robots.txt & Rate Limits**: Every source record declares `perDomainRps` (requests per second) and `cadenceMinutes`. The Python sidecar enforces token-bucket throttling and respects `Retry-After` headers.
4. **Attribution & Transparency**: Every job record retains its original URL and source name in `job_source_edges`. Sources in the registry declare `termsUrl` and `attribution`.
5. **Cited Knowledge & Licensing**: Community data repositories (e.g. `poteto/hiring-without-whiteboards`, `yangshun/tech-interview-handbook`) are referenced strictly as cited data sources under their respective open licenses. They are never executed as code plugins.

## Source Removal Requests

If you are a job board operator or employer and wish to modify how your public feed is indexed or request removal:
- Open a GitHub Issue using the **Source Adapter Drift / Removal** template.
- Or submit a pull request modifying `scrapling-agent/sources.json` to mark the source `crawlPolicy: "disabled"`.
