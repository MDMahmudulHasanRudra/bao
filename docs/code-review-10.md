# Prompt 10 — Release Hardening Review

**Reviewed:** 2026-09-23  
**Scope:** Prompt 09 hardening and release evidence, with security review of the existing worker paths that affect release readiness.  
**Result:** **BLOCK**

## Findings (severity order)

### BLOCK — Worker can mutate a source outside the job's organization

`apps/worker/src/ingest.ts` accepts `sourceId` and `organizationId` as separate job fields. `setStatus()` updates `knowledge_sources` with `WHERE id = sourceId` only (lines 49–62); it never checks `organization_id`. `processDocument()` then trusts the supplied organization ID when inserting chunks (lines 65–74). A malformed, replayed, or compromised queue payload can therefore change another tenant's source status, and may create chunks whose source and organization do not match. Queue payload tenant fields are not authorization evidence.

**Required before release:** Load/lock the source using both identifiers (or a composite tenant-safe key) before any status or chunk mutation. Enforce the organization relationship in the database, and reject mismatched jobs without exposing source existence. Add worker integration coverage for cross-tenant source IDs and mismatched source/org pairs.

### BLOCK — Document ingestion can report success without reading the uploaded document

`apps/worker/src/ingest.ts` lines 91–98 passes an empty buffer to the extractor when `storageKey` exists. PDF/DOCX extraction returns placeholder text in lines 37–46, then the worker chunks and marks the source `ready` (lines 100–103). This can create a false-success knowledge source with no usable content. The API's `downloadFile()` at `apps/api/src/integrations/storage/index.ts` lines 43–47 is not used by the worker.

**Required before release:** Use the same tenant-aware storage client from the worker, download the exact source object, extract supported formats, and fail visibly for unsupported/empty extraction. Do not mark a source ready until content and chunks have been committed.

### HIGH — URL ingestion turns network failures into successful placeholder content

`apps/worker/src/ingest.ts` lines 119–138 replaces any failed fetch with a descriptive placeholder, then writes chunks and marks the source ready. In addition to false search results, unrestricted URL fetching needs an explicit SSRF policy (private/link-local address rejection, redirect revalidation, scheme allowlist, response size and content-type limits).

**Required before release:** Preserve a failed/retryable status on fetch and extraction errors; apply SSRF and bounded-response controls before shipping URL ingestion.

## Release evidence review

- The Prompt 09 handoff records successful lint, typecheck, format check, 29 tests, generated migration, and a live PostgreSQL backup/restore drill restoring 18 tables. Evidence is recorded in `docs/backup-restore-evidence.md`.
- Production configuration was reported as requiring secrets with no defaults; this review did not rerun the release commands or the recovery drill.
- Known operational risks are recorded in `docs/risk-register.md`. In particular, MinIO/Redis backup is incomplete, existing database migration baselining needs a controlled procedure, and accessibility review remains incomplete.
- The available tests cited in the handoff are not worker-vs-live-database integration tests. The worker authorization and extraction paths above therefore remain unverified.

## Mandatory review questions

| Question | Review result |
|---|---|
| Can tenant A reach tenant B by ID/list/search/cache/job/vector/storage/export? | **Job path: yes, risk demonstrated structurally.** Worker status mutation scopes only by source ID and chunk insertion trusts a separate tenant ID. Other paths were not exhaustively re-executed in this review. |
| Can a lower role perform a higher-role action? | Prior handoff reports role hierarchy checks and tests; release task evidence does not independently exercise every route. |
| Is every provider call server-side and auditable? | Adapters are server-side by architecture; this review did not verify audit coverage for every provider operation. |
| Is failure safe and recoverable? | Database restore evidence passes for PostgreSQL. Ingestion fetch failure is currently converted to success, and object-storage recovery is an open risk. |

## Other gaps to carry forward

- **Missing tests:** tenant-mismatch and retry/idempotency tests for worker source status/chunk writes; URL SSRF and failure-path tests; restore coverage for object storage and Redis.
- **Authorization:** Queue payload fields must not stand in for authorization. Validate source ownership against the authoritative database for every job.
- **Data/migration:** Existing databases need the documented baseline procedure before applying the new migration journal.
- **Async/idempotency:** Chunk writes are not shown to be idempotent; retrying after partial insertion can duplicate chunks.
- **UI/accessibility:** `apps/web/src/app/page.tsx` is still a title-only shell. There is no login/dashboard workflow or visible loading, empty, failure, unauthorized, or responsive module state. `docs/release-checklist.md` already identifies accessibility review as incomplete.
- **Scope:** The blueprints describe a modular monolith, while the current API modules are mostly route files. This is an architectural gap to address incrementally, not a reason to rewrite the release task.

## Verification

No commands were rerun for this review. The cited lint/typecheck/test and restore outcomes are from the prior session handoff, not independently reproduced here. Repository has no Git metadata, so a change diff could not be inspected.

**Decision: BLOCK** until the two worker tenant/document ingestion blockers are fixed and covered by tests. URL fetch failure/SSRF controls are also required before enabling URL ingestion for untrusted users.
