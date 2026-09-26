# Business AI OS — Usability, Navigation, Settings, and Live Operations Specification

**Purpose:** Make the existing functional system easy, predictable, and safe for a real business user. This is an implementation specification, not a request for a visual-only redesign.

## 1. Product UX rule

The product must guide users through work in business order. A screen must answer: **Where am I? What should I do now? What is happening? What happened? What can I do next?**

Every implementation task is a small vertical slice: real API/data + authorization + UI + loading/empty/error/success states + tests. Do not build fake UI around absent backend behavior, and do not hide a real long-running job behind a spinner with no result.

## 2. Standard primary navigation

Keep the persistent workspace sidebar, but use this order and grouping. Show only modules enabled by the server module registry. A module without a usable user flow must show **Coming Soon**, not look active.

```text
Workspace switcher

Dashboard

WORK
  Leads & CRM
    Leads
    Companies
    Contacts
    Activities
  Proposals
  Presentations

KNOWLEDGE & AI
  Knowledge Hub
  AI Assistant
  Intelligence / Lead Intelligence
  Automation                    (only when enabled)

INSIGHTS
  Analytics
  Notifications

SYSTEM
  Settings

Account menu: Profile, password, sign out
```

Rules:

- The dashboard is the home; it is not a duplicate navigation page.
- CRM starts with Leads because it is the most action-oriented entry; Companies, Contacts, and Activities are child views under the same CRM context.
- Knowledge Hub stores/finds information; AI Assistant uses it. Keep them adjacent.
- Lead Intelligence belongs with Intelligence because it is research/monitoring, not ordinary CRM data entry.
- Settings is the final sidebar item before the account menu. No standalone “AI Settings”, “Billing”, “Integrations”, or “Members” primary-nav entries.
- Active route, expanded group, and Coming Soon state must be keyboard accessible and visible without relying on color alone.
- On mobile, use a labelled drawer. Preserve workspace name, current route, notifications, settings, and account actions; do not leave a fixed desktop sidebar on a narrow screen.

## 3. One centralized Settings workspace

All configuration lives under `/settings`. Existing paths may remain as deep links, but they must render inside one shared Settings layout with a local sub-navigation and common title/action pattern.

```text
Settings
  General
    Organization profile
    Locale / timezone / business preferences
  Team & Access
    Members, invitations, roles
  AI Providers & Models
    Connected providers, keys, connection tests, capability defaults
  Integrations
    Presenton, ScrapLink, Diffy, storage and other approved integrations
  Notifications
    Personal and organization notification preferences
  Security & Audit
    Password/session controls that exist, audit log, security settings
  Branding / White Label                 (only when enabled)
  Billing                                (only when enabled)
```

Rules:

- Settings local navigation is the only place where configuration categories appear. Module pages may link to the relevant settings item, but must not reproduce a second settings form.
- Use permission-aware visibility: hidden/disabled navigation is UX only; every API action must remain server-authorized. A member who lacks access receives a clear 403 page/message without learning sensitive configuration details.
- Use a single `SettingsLayout`, shared page header, unsaved-changes guard, success/error notice pattern, and deep-link-safe route structure.
- Do not combine all fields into one giant form. Each category has its own save action, validation, loading state, success confirmation, and retryable safe error.

## 4. AI Provider and Model Settings UX

Follow `ai-provider-and-model-settings-spec.md` as the security authority. The human flow is:

1. Open **Settings → AI Providers & Models**.
2. See connected provider cards: provider name, label, Connected / Needs Attention / Disabled, masked key suffix if available, last successful test, selected capabilities, and allowed actions.
3. Select **Connect provider**. The wizard is: choose provider → enter secret/configuration → test connection → choose compatible models → assign default model by capability → save.
4. After save, the key input is cleared and never rendered again. The page shows only masked metadata.
5. Choose models by task, not by a single global dropdown:
   - Chat and RAG
   - Embeddings
   - Lead/market research
   - Proposal drafting
   - Presentation brief
   - Evaluation / Diffy
6. Show which provider/model is currently selected, whether it is available, and what fallback/safe error will occur if it is disabled or fails.

Required states: no provider configured, key validation error, testing connection, test succeeded, test failed without key echo, no compatible model, saving defaults, unauthorized, provider unavailable, and mobile layout.

## 5. Live operation/status model

Any action that can take more than a normal page request must create or expose a durable operation/job record. Examples: document ingestion, URL crawl, lead research, embedding, AI generation, proposal/presentation generation, web monitoring, bulk import, and automation.

### Status vocabulary

Use one consistent status model across modules:

| Status | User-visible meaning | Available actions |
|---|---|---|
| Draft | Not submitted | Edit, start, delete |
| Queued | Accepted and waiting | View details, cancel only if backend supports it |
| Running | Work is in progress | View progress, safe refresh |
| Waiting for input | User/admin action required | Resolve setup/input issue |
| Completed | Output is ready | View result, continue workflow |
| Completed with warnings | Usable result has omissions | View warnings and result |
| Failed | Job stopped safely | View safe reason, retry if supported |
| Cancelled | Stopped by user/system | Restart if supported |

Never use `loading` as the stored business status; loading describes the browser fetching state. Never show “Completed” just because a request was accepted.

### Operation card/drawer

Every run must have a visible detail surface (inline card, activity row, or right-side drawer) showing:

- meaningful operation name and related record (e.g., “Research Acme Ltd.”);
- current status and accessible text, not color only;
- requested by, started time, updated time, and elapsed time where available;
- progress as `current step / total`, percentage only when reliable, and a plain-language current step;
- provider/model for AI work, source/target for crawl work, without secrets;
- result summary or safe error/warning;
- View result, retry, cancel, or continue action only when server supports it;
- auto-refresh/polling indicator and manual refresh. Stop polling when terminal or when page unmounts.

The API contract must expose real lifecycle data. If existing APIs only return a final result, add the smallest scoped status endpoint/field rather than inventing progress on the client. For websocket/SSE, use it only after a documented, authorized, reconnect-safe contract exists; bounded polling is acceptable initially.

### Example: lead research/crawler

When a user starts research from a lead, tag, or selected companies:

1. Confirm the scope: selected records, data sources, chosen research provider/model, and estimated effect where known.
2. Submit once; disable only that submit control while request creation is pending.
3. Show a new operation immediately as **Queued**, then update through candidate discovery, crawl, evidence processing, analysis, and completion/warnings/failure.
4. On completion, show counts and a **Review evidence** / **Open lead intelligence** action. Do not claim a finding is verified unless its evidence is reachable.
5. If AI/provider setup is missing, show **Configure AI Provider** linking to the centralized Settings item—not a duplicate key form.

## 6. Human-first screen behavior

Every actionable page follows the same pattern:

- **Empty:** explain the benefit, say the first step, provide one primary CTA, and optionally a secondary learning link. Example: “Your workspace is ready. Add a company document to make Ask Business AI useful.”
- **Loading:** preserve layout with skeletons; do not flash a blank page. Write actions show the specific pending action: “Testing OpenRouter connection…”, not generic “Loading.”
- **Success:** concise confirmation plus next useful action; do not rely solely on a disappearing toast when the page changed state.
- **Failure:** a safe reason, what the user can do, Retry when idempotent/supported, and support correlation ID if available. Never expose keys, raw provider payloads, private URLs, or cross-tenant data.
- **Destructive/irreversible:** confirmation naming the affected record; prevent accidental duplicate submit.
- **Permission denied:** explain that access is required and point to the right administrator/settings area when safe.

## 7. Dashboard usability

Dashboard is a decision and action page, not a feature inventory. It must show only tenant-scoped data with a clear source/freshness rule.

Order:

1. Workspace context, greeting, and main action: **Ask Business AI** if configured; otherwise **Configure AI Provider**.
2. First-use onboarding checklist: workspace/profile, team if needed, provider connection, first knowledge source, first lead, first AI question. Persist/dismiss only through a real state contract.
3. My attention: due/overdue activities, approvals, failed/running operations, and assigned review work.
4. Evidence-backed business insights: lead follow-up need, proposal awaiting review, new indexed knowledge, reviewed intelligence signal, pipeline change. Each insight links to its source workflow and has an empty/error state.
5. KPI/pipeline/recent activity with explicit time window and real values only.
6. Quick actions and truthful module availability.

## 8. Implementation sequence for OpenCode

Work one bounded task at a time. Use Ponytail and UI/UX Pro Max when installed and applicable; read their instructions first and record use in handoff.

1. Audit current sidebar/module registry/settings routes against this spec; write an affected-file plan before edits.
2. Implement shared workspace navigation + mobile drawer + centralized Settings layout. Preserve working deep links.
3. Move/reframe existing settings screens under the shared layout. Do not duplicate server settings behavior.
4. Implement/review AI Provider & Model Settings under Settings, using the existing secure backend contract.
5. Add/reconcile durable operation status UI starting with Lead Intelligence and document ingestion, using existing data where possible and a small contract addition only if necessary.
6. Apply the human-first state system to each module as it is touched; then dashboard onboarding/attention/insight cards.

For each task: inspect existing code first; change only the planned files; keep tenant and permission checks server-side; add/adjust focused tests; run the approved no-Docker commands from `CURRENT_STATUS.md`; update handoff with exact progress and next task.

## 9. Acceptance checklist

- One primary navigation order and one centralized Settings workspace are visible on desktop and mobile.
- No standalone settings page is presented as a top-level business module.
- Enabled/Coming Soon module status is registry-backed and truthful.
- Provider/model configuration is only under Settings and obeys its security spec.
- Every long-running user action visibly moves through honest lifecycle states and ends with an actionable result or safe error.
- A user can understand their next action on empty, loading, success, failure, and permission-denied states.
- Keyboard, focus, labels, contrast, responsive layout, and screen-reader status announcements are reviewed for every changed flow.
- No secret, privileged state, or another organization's information appears in UI, logs, job payloads, or client storage.
