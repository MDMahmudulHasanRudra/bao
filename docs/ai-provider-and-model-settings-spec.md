# AI Provider and Model Settings — Functional Specification

## Outcome

An organization admin can connect an approved AI provider, securely save a provider API key, verify the connection, discover/select usable models, configure defaults by business capability, rotate/revoke credentials, and see safe usage/status information. Users never see another organization’s configuration or a secret value.

## Supported provider model

Start with adapter-backed providers: OpenRouter, OpenAI, Google Gemini, Anthropic, and a generic OpenAI-compatible endpoint only if its security contract is explicitly approved. New providers must be added through a registry/adapter, not scattered conditionals or frontend hard-coding.

## Required user workflow

1. Admin opens **Settings → AI Providers**.
2. Admin selects a provider and sees provider-specific fields, documentation link, key format guidance, privacy/cost notice, and a test-connection action.
3. Admin enters key in a password field. Browser sends it only to the authenticated server over TLS; UI never renders it again. Server encrypts it before persistence and stores only masked metadata for display.
4. Server validates ownership/permissions, stores encrypted key, performs a safe provider verification, and records an audit event without secret content.
5. Server obtains available models through its adapter where the provider supports discovery; otherwise exposes a server-maintained approved model catalogue. The browser receives only allowed model metadata.
6. Admin selects a default model for each enabled capability: chat/RAG, embeddings, proposal drafting, presentation brief, and evaluation. Compatibility validation prevents selecting a chat-only model for embeddings.
7. Runtime AI services resolve organization policy → capability default → provider adapter/model. They never read a browser key or hard-code a provider/model.
8. Admin can disable, rotate, retest, or revoke a provider. Disabling/revoking has a clear fallback/error effect and is audited.

## Security and tenancy rules

- Only Owner/Admin with an explicit `ai.providers.manage` permission can create, update, test, rotate, or revoke credentials.
- Encrypt keys at rest using a server-side envelope/key-management strategy; do not store plaintext in database, logs, queue payloads, error traces, analytics, browser storage, or exports.
- Never return a saved key. UI displays provider, label, masked suffix if safely available, created/updated/tested time, status, and selected models only.
- Configuration, keys, model policies, connection tests, and AI runs are scoped by `organization_id`. Provider keys are never shared across organizations.
- Apply rate limits and timeout/retry policy to test/model-discovery calls. Errors must be user-actionable but secret-safe.
- Audit create/update/test/rotate/revoke/default-model actions with actor, organization, provider, result, and timestamp.

## Functional UI requirements

- Provider cards: Connected / Needs attention / Disabled state, selected models, last test, and actions gated by permission.
- Connection wizard: select provider → key/configuration → verify → choose models → choose capability defaults → confirm.
- Model selector supports capability filter, provider filter, searchable model metadata, context/cost/capability information only where reliably supplied, and explicit “no compatible model” empty state.
- Include loading, first-time empty, validation, failed verification, unauthorized, provider-outage, and responsive/mobile states.
- Use Ponytail and UI/UX Pro Max, when installed, for this settings flow’s UI implementation/review—not as a replacement for the above security contract.

## Explicit non-goals for initial slice

No user-managed arbitrary client-side provider calls, no raw credential export, no billing system, no promise that every provider exposes a live model list, and no autonomous AI action without separate user approval.

## Acceptance evidence

- Admin can connect/test/select compatible models; unauthorized members cannot view or mutate configuration.
- Database/log/queue/browser inspection proves secrets are absent or encrypted/masked as applicable.
- Organization A cannot access Organization B’s provider/model policy by any route, job, cache, or AI run.
- Runtime assistant resolves a configured policy and returns a safe error/fallback when no enabled compatible model exists.
- Unit, API/integration, permission, tenant-isolation, provider-failure, and UI state tests pass.
