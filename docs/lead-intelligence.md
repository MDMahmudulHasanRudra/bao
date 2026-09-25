# Lead Intelligence & Research Engine — Operations

What this module does: turns a plain-language request ("UK 3PLs over 50 staff in the
Midlands") into a ranked, evidence-backed list of companies, then promotes the ones a
human approves into the existing CRM.

## Pipeline

```
POST /jobs  →  research queue (worker)  →  analyze queue (API)  →  candidates
                    crawl + extract            AI classify/score      review → CRM
```

Two queues, split on purpose:

- `lead-intelligence-research` runs in the **worker** and does crawling.
- `lead-intelligence-analyze` runs in the **API process** because `generateCompletion`
  needs the tenant's provider key decrypted, which only `resolveOrgRun` can do there.

The worker hands off over Redis, not a direct call. A stalled AI provider therefore
cannot block crawl capacity.

## Environment

| Variable | Default | Notes |
| --- | --- | --- |
| `SCRAPLINK_API_URL` / `SCRAPLINK_API_KEY` | unset | Unset means ScrapLink is **not** used. It is never faked. |
| `CRAWLER_RESPECT_ROBOTS` | `true` | Leave on. |
| `CRAWLER_MAX_DEPTH` | `2` | Link expansion depth. |
| `RESEARCH_MAX_PAGES_PER_COMPANY` | `8` | Hard cap per domain. |
| `RESEARCH_MAX_AI_CALLS` | `500` | Per job. The analysis aborts rather than exceed it. |
| `RESEARCH_CACHE_TTL_SECONDS` | `86400` | Expiry for cached robots rules. |
| `BRAVE_API_KEY` / `SERPER_API_KEY` | unset | With neither set, discovery relies on seed domains only and fails closed. |

## Which crawler actually runs

ScrapLink renders one page per job, so it can only supply the **entry page**. Link
expansion is always the internal crawler. Each stored document records the provider
that produced it in `research_sources.provider` and `web_documents.extracted_by`, so
provenance is never inferred from configuration.

If ScrapLink is unconfigured, or its entry page fails, the whole crawl falls back to
internal. A single domain can never abort a job — the crawlers return failed documents
rather than throwing, and the job loop isolates crawl and persistence per domain.

## Evidence rules

- Nothing is a fact unless a page supports it. `lead_evidence` rows point at a
  `web_documents` row.
- A signal is credited to the page its quote actually appears on, located by
  `sourceForQuote` (exact quote → sentence → leading 60/30-char windows → first page).
- A contact email is taken from the crawler's own extraction
  (`web_documents.emails`), never from AI-written text.

## Retries

Both queues use `attempts: 3` with exponential backoff. A research row is only marked
`failed` on the **final** attempt, so a transient failure is actually retried rather
than being turned into a terminal row that later attempts skip.

Terminal errors — AI unavailable, schema violation, budget exhausted — fail
immediately; retrying them would only burn quota.

## Promotion to the CRM

`POST /candidates/:id/promote`, gated on `lead-intelligence.review`
(owner/admin/manager).

- Reuses an existing `companies` row when the normalized domain is already on file, and
  never reuses a soft-deleted one.
- Writes `leads` with the score, reasons, and evidence in `metadata`.
- Writes an `activities` note so the reason the lead exists is on the timeline.
- Sets the candidate to `imported` and back-links `leadId` / `companyId`.

### Why a double-click cannot create two leads

All CRM writes run in one transaction, and the candidate row is read with
`SELECT ... FOR UPDATE` inside it. A second concurrent request blocks on that row lock
until the first commits, then re-reads and finds `leadId` already set, so it returns that
lead instead of writing anything.

The application-level `if (!leadId)` check is *not* what makes this safe. Two requests
routinely both read `null` before either writes. The guarantee comes from the lock, which
Postgres enforces.

The transaction also makes the writes atomic: a failure part-way through (say the
activity insert) rolls the lead back instead of leaving an orphan revenue record that the
retry would then duplicate.

### Why the domain lock exists

`companies` has **no unique index** on `(organization_id, domain)`. Two candidates
discovered by different research jobs can share a domain, and both would insert their own
account — the same duplication problem, reached by a different route. Promotion therefore
takes a transaction-scoped `pg_advisory_xact_lock` keyed on `organizationId:domain`
before the company lookup, so concurrent promotions serialise on the domain. Keying it
per-tenant means two organisations researching the same domain never wait on each other.

The proper long-term fix is a partial unique index on `(organization_id, domain)`. That
was deliberately **not** added to `0004` because it would fail to apply if the existing
`companies` table already holds duplicate domains. Check first:

```sql
select organization_id, domain, count(*)
from companies
where domain is not null
group by 1, 2 having count(*) > 1;
```

If that returns nothing, the unique index can be added safely.

## Applying the migration

`apps/api/drizzle/0004_lead_intelligence.sql` creates 7 tables, 20 foreign keys, 21
indexes, and 3 unique indexes, and drops nothing. Until it is applied, the API routes
for this module will fail on a missing table.
