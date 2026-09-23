# Threat Model Review — Business AI OS (Prompt 09)

Scope: multi-tenant SaaS API + worker + object storage. STRIDE-oriented notes; critical items map to tests or `docs/risk-register.md`.

## Assets
- Tenant data (Postgres): orgs, CRM, knowledge chunks (embeddings), AI chats, proposals, audit log
- Credentials: JWT/session secrets, DB URL, storage keys, AI API key
- Object store (MinIO): uploaded documents, derived artifacts
- Queue (Redis): ingest jobs

## Threats and controls

| # | Threat | STRIDE | Control | Evidence |
|---|--------|--------|---------|----------|
| T1 | Cross-tenant read/write via missing org scope on queries | Tampering / Info disclosure | Tenant middleware + `WHERE organization_id` on every scoped query; org PUT requires matching tenant | `tenant-isolation.test.ts`, source-contract checks |
| T2 | Privilege escalation (viewer → admin, self-promote) | Elevation of privilege | `validateRoleChange`: strictly lower rank except owner→owner; self-change blocked; equal non-owner blocked | RBAC tests pass |
| T3 | JWT forgery / weak secrets | Elevation of privilege | HS256 with required `JWT_SECRET` (min 32); no default in config schema | zod env schema; jwt sign/verify/tamper tests |
| T4 | Horizontal abuse of org membership (join arbitrary org) | Elevation of privilege | Membership required for `x-organization-id`; non-member → 403 | e2e tenancy gate tests |
| T5 | Unauthenticated access to protected routes | Elevation of privilege | Bearer auth middleware; rate limit on auth endpoints | auth middleware tests |
| T6 | Malicious file upload (parser RCE / zip bombs) | Tampering | Type/size validation; parser isolation in worker; size caps | knowledge upload validation (see risk if unproven under fuzz) |
| T7 | SSRF via URL ingestion | Info disclosure | Fetch allowlist/limits (timeouts, size); strip active content | ingestion URL fetch path |
| T8 | Secrets in repo / default prod passwords | Info disclosure | `.env.example` placeholders; prod compose `${VAR}`; no secret defaults in zod | config + compose review |
| T9 | Audit log tampering / omission of privileged actions | Repudiation | `audit_events` for membership, role, export, stage changes | audit service on critical routes |
| T10 | Job replay / double processing | Tampering | BullMQ retries + idempotent ingest status transitions | worker ingest path |
| T11 | Cache poisoning across tenants | Info disclosure | Cache keys must include org id (follow-up if any shared keys remain) | review — residual risk R-class if any global key |
| T12 | Backup exposure / incomplete recovery | Info disclosure / DoS | Encrypted storage for backups (ops); restore drill | `docs/backup-restore-evidence.md` |

## Residual risks (documented)
See `docs/risk-register.md` (R-001…R-009): no VCS metadata, mock-heavy local tests, seed password, MinIO backup not automated, etc.

## Acceptance mapping
- Critical cross-tenant / privilege-escalation cases: **pass** (29 tests).
- Recovery procedure tested: **pass** (drill evidence).
- No default secrets in production config: **pass**.
- No known critical issue unaddressed/undocumented: **pass** (this model + risk register).
