# Functional Delivery Execution Plan

## Delivery principle

Build the complete planned product through **small vertical slices**. A slice includes backend/domain/API/worker work plus the corresponding real UI workflow, validation, authorization, loading/empty/error states, tests, and handoff. UI is improved continuously; it is not deferred until every backend feature exists. Do not start a broad visual redesign while a flow is non-functional.

## Ordered delivery slices

1. Foundation: auth/session, workspace selection, RBAC, tenant isolation, module registry, dashboard data contract.
2. AI Settings: provider connection, encrypted credentials, model discovery/catalogue, capability defaults, audit trail.
3. Knowledge Hub: upload/URL intake, processing status, source permissions, search, useful empty/onboarding UI.
4. AI Assistant: real configured provider/model resolution, permission-aware RAG, cited answers, safe failure UX.
5. Sales: company/contact/lead/pipeline/activity lifecycle, dashboard metrics, follow-up insight rules.
6. Proposals + Presentations: versioned drafts/approval and Presenton adapter workflow.
7. Intelligence: monitored targets, ScrapLink workflow, reviewed events and business insight cards.
8. Notifications + analytics: real event-driven notifications and scoped metrics.
9. Diffy integration, settings completion, end-to-end hardening and production release evidence.

## For every slice

- First inspect current code and audit only the slice’s real gaps.
- Use installed skills deliberately: Ponytail/UI UX Pro Max for UI and UX work; suitable installed security, database, testing, docs, or deployment skills for their own domains. Read the installed skill instructions first and record usage.
- Implement no more than one user workflow per task. Avoid fake data unless explicitly labelled as local development seed data.
- Treat all exposed metrics, insights, badges, module statuses, and “Coming Soon” labels as contracts backed by real data/capability state.
- Before handoff: run relevant checks; update `CURRENT_STATUS.md` with changed files, skills, test evidence, risks, and exact next task.

## Dashboard definition

The dashboard becomes useful from the first empty workspace: onboarding checklist, contextual empty state, safe Ask Business AI entry point, quick actions, and truthful module availability. As sources arrive, it adds only evidence-backed insight cards with a source/data condition, organization/permission rule, freshness rule, action, and empty/error behavior.
