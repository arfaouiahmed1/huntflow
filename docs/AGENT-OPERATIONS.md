# Agent and crawler operations

## Operating model

HUNTFLOW separates job discovery from application automation. A crawl can only collect candidates for review; it never adds a role to the tracker or submits an application by itself. Browser-assisted application runs begin from a tracked role and default to review mode.

```text
select sources → start crawl → inspect source outcomes → review role
                                                       ↓
                                      prepare profile and documents
                                                       ↓
                                     run agent → inspect proof → decide
```

## Discovery controls

The Job Finder does not start work when the page opens. The operator chooses:

- search terms;
- category or region;
- result cap;
- individual source boards;
- the configured worker limit.

Each completed run reports its run identifier, duration context, boards crawled, candidate count, and a per-source outcome. A successful source with zero matching cards is different from a source failure; the interface shows both states.

Low-precision, blocked, or placeholder-only sources are disabled by default but remain available for explicit experiments. Source selectors live in `scrapling-agent/sources.json` and should be treated as versioned integrations because third-party markup can drift.

## Selector healing (observability stub)

Third-party boards rewrite their markup without notice, so selectors drift.
HUNTFLOW's current answer is deliberately conservative: detect and report,
never auto-write.

`POST /heal-selectors` on the sidecar (`scrapling-agent/server.py:1225`),
proxied through `POST /api/agent/heal-selectors`
(`src/app/api/agent/heal-selectors/route.ts`), accepts
`{ board_ids?: string[], dry_run?: boolean }` and:

1. loads `sources.json` (optionally filtered to the requested board ids);
2. checks each board for the required `item`, `title`, and `url` selectors;
3. returns one drift entry per board with `missing_required`, a `drift`
   flag, and the board's effective enabled state;
4. logs a warning per drifted board (`heal-selectors drift — ... — no
   auto-write`) and an info line per healthy board.

The response always carries `"dry_run": true` and `"auto_write": false`.
The stub never modifies `sources.json`; healing an actual drift remains a
manual edit to that versioned file, reviewed like any other integration
change. Like every sidecar endpoint, the route is loopback-only and
requires the `X-Huntflow-Token` header when `HUNTFLOW_AGENT_TOKEN` is set.

## Live evidence

The activity console polls the local sidecar through authenticated Next.js proxy routes. It displays:

- concurrent active runs;
- timestamped navigation, reasoning, field-fill, selection, click, verification, warning, and error events;
- locally stored or deliberately Cloudinary-hosted screenshots;
- selectable run history so one execution can be isolated from the aggregate feed.

Local screenshot requests pass through the web process. This keeps the shared agent token out of browser image URLs and allows protected sidecar screenshots to render in the UI.

## Application modes

**Review mode** is the default. The agent may navigate and fill supported text/select fields, then stops before submit. File uploads, CAPTCHAs, unsupported controls, and ambiguous fields remain manual.

**Confirm and submit mode** requires a second explicit acknowledgement. The agent records the submit click, captures the post-click state, and looks for confirmation evidence. A click without detectable confirmation becomes `manual_required`, not `applied`.

If the sidecar is offline or returns an error, the run is `failed`. HUNTFLOW does not fabricate filled fields, simulate a successful application, or update the tracker to applied without browser evidence.

## Run statuses

| Status | Meaning |
| --- | --- |
| `running` | A sidecar worker is active. |
| `success` | The technical run completed; inspect its result and events. |
| `manual_required` | The agent paused before submit or could not verify the post-click outcome. |
| `applied` | Submit mode ran and confirmation evidence was detected. |
| `failed` | Navigation, form automation, sidecar access, or another required step failed. |
| `skipped` | A match/dealbreaker gate intentionally stopped the workflow. |

## Demo guidance

For a public recording, use synthetic profile and job data. Start with one or two reliable sources, show the per-source result cards, then open Auto-Apply in review mode and demonstrate the timeline plus a screenshot. Do not expose provider keys, cookies, personal contact details, or private application URLs.

