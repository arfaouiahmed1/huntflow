# Docker and deployment

## Supported shape

The provided Compose configuration is intended for local evaluation, portfolio demonstrations, and trusted single-user operation.

```text
localhost:3000 → Next.js standalone container → /app/data volume
                                      └──────→ optional Scrapling agent
```

The web image contains the Next.js standalone server and LaTeX packages needed by the current resume templates. The optional agent is a separate Python image and is disabled unless the `agent` profile is selected.

## Start the web workspace — from source (today)

```bash
git clone https://github.com/arfaouiahmed1/huntflow.git
cd huntflow
cp .env.docker.example .env   # set HUNTFLOW_AGENT_TOKEN + any LLM keys you use
docker compose up --build
```

Open `http://localhost:3000`. The published port is explicitly bound to `127.0.0.1` (`127.0.0.1:3000->3000/tcp`, `healthcheck GET /api/health`). Data lives in the `huntflow-data` volume (SQLite WAL at `data/huntflow.db`).

> **GHCR pull path:** GitHub Actions builds and publishes `ghcr.io/arfaouiahmed1/huntflow-web:main` and `ghcr.io/arfaouiahmed1/huntflow-agent:main`. Use the pull-based Compose file below instead of building on a constrained workstation.

## Start with the optional agent

The agent image (`huntflow-agent:local` 2.74GB) is `profiles: ["agent"]` — it **does not** start with plain `up`. Generate a long random shared token in `.env`, then:

```bash
docker compose --profile agent up --build   # first run builds + starts both web + agent
docker compose --profile agent ps            # verify huntflow-agent-1 Up (health: starting → healthy)
curl http://127.0.0.1:8001/health            # {"status":"ok","sources":{"total":30,...}}
```

Or use the GHCR pull path below: `docker compose -f docker-compose.images.yml --profile agent pull && docker compose -f docker-compose.images.yml --profile agent up -d`.

The agent port is also bound to loopback. Agent screenshots remain in the named run volume unless Cloudinary is deliberately configured.
## Build in GitHub Actions and pull locally

The repository workflow `.github/workflows/container-images.yml` builds both images on a hosted GitHub runner. It publishes a stable `main` tag and an immutable commit-SHA tag to GitHub Container Registry (GHCR). The workflow does not require Docker Desktop on the developer machine.

Trigger and monitor the build with the GitHub CLI after the source has been pushed to `main`:

```bash
gh workflow run container-images.yml --ref main
gh run list --workflow container-images.yml --limit 3
gh run watch <run-id> --exit-status
```

For private GHCR packages, authenticate Docker with a GitHub token that has `read:packages`:

```bash
echo "$GHCR_READ_TOKEN" | docker login ghcr.io -u arfaouiahmed1 --password-stdin
docker compose -f docker-compose.images.yml --profile agent pull
docker compose -f docker-compose.images.yml --profile agent up -d
docker compose -f docker-compose.images.yml --profile agent ps
```

The pull-based file keeps the same loopback-only ports and named volumes as the source build. `huntflow-data` remains the SQLite/application volume and `huntflow-agent-runs` stores sidecar artifacts.

`ghcr.io` is the selected registry because this project already uses GitHub Actions and GitHub identity. Docker Hub would require separate `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets.

The image registry is not a hosted runtime. To run HUNTFLOW on a cloud host, use a provider with persistent storage for SQLite and sufficient memory for the Playwright sidecar; pull the same GHCR tags there.

The agent port is also bound to loopback. Agent screenshots remain in the named run volume unless Cloudinary is deliberately configured.
## Persistence

| Volume | Contents |
| --- | --- |
| `huntflow-data` | SQLite database, uploaded vault files, and application runtime data |
| `huntflow-agent-runs` | Optional Scrapling run artifacts and screenshots |

`docker compose down` preserves named volumes. `docker compose down -v` deletes them and therefore removes persisted local application data; use it only when that loss is intended.

## Environment variables

Copy `.env.docker.example` and set only the providers in use. Do not commit `.env`.

- `HUNTFLOW_AGENT_TOKEN` authenticates web-to-agent requests.
- `HUNTFLOW_CRAWL_CONCURRENCY` limits optional agent concurrency.
- Provider API keys enable their corresponding LLM or embedding routes.
- Cloudinary variables opt agent screenshots into external storage.

Application-level provider settings may also be stored through the UI. Those local secrets are not encrypted at rest in the current product.

## Health checks

The web container calls `/api/health`, which performs a lightweight SQLite query. The optional agent exposes its own `/health` endpoint.

A passing health check confirms that the process and database respond. It does not validate every configured external provider.

## Public deployment warning

Do not expose the current container directly to the internet. A hosted mode needs, at minimum:

- authenticated sessions and authorization on every data/action route;
- encrypted secret storage and rotation;
- CSRF and abuse controls;
- rate, concurrency, and resource limits;
- hardened OAuth token verification;
- isolated LaTeX and document-processing workloads;
- tenant-specific storage and deletion guarantees;
- TLS termination, backups, observability, and incident procedures.

Changing the port binding from loopback is a security decision, not a deployment convenience.

## Troubleshooting

- **PDF compilation fails:** inspect container logs and confirm the selected template only uses installed LaTeX packages.
- **Data disappears after recreation:** verify the `huntflow-data` volume is mounted and was not removed with `-v`.
- **Agent is unavailable:** start with `--profile agent`, confirm the shared token matches, and inspect the agent health check.
- **A provider is unavailable:** confirm its key and model settings; the vault can fall back to local embeddings, but chat workflows still require a compatible configured model.

