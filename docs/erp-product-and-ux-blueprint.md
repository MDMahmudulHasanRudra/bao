# Business AI OS — ERP-Style Product and UX Blueprint

**Purpose:** Describe how the existing Business AI OS capabilities should become one coherent, responsive business workspace. This is an implementation specification for a future frontend task; it does not claim that the screens already exist.

**Product boundary:** This product is an AI-native business workspace with CRM and knowledge workflows. It is not an accounting, inventory, payroll, or full ERP replacement in v1. Do not add those modules unless the product specification is explicitly changed.

**Reference input:** `../../software ui refarance.png` (workspace-root reference image). Preserve its general information architecture—persistent workspace navigation, a useful dashboard, quick actions, and contextual AI help—while simplifying visual density and ensuring real data and accessible controls.

## 1. Audit: current state vs. target

| Area | Current repository evidence | Target described here |
|---|---|---|
| Web app | `apps/web/src/app/page.tsx` renders only a product title and subtitle; `layout.tsx` sets basic metadata; `globals.css` has brand colors and a dark-mode media rule. | Auth pages, authenticated app shell, module pages, real states, responsive and accessible design. |
| Shared UI | `packages/ui/src/index.ts` is empty. | Shared, documented design primitives used by web routes; avoid a premature all-purpose component framework. |
| API | `apps/api/src/main.ts` mounts versioned Hono routes; modules are mostly route files, with a few service/helper files. | Web data-access layer maps UI actions to versioned endpoints and typed contracts. Backend refactors are separate, incremental tasks. |
| Existing feature foundation | API routes and schema cover identity, organizations, access, knowledge, AI conversations, sales, proposals, presentations, intelligence, notifications, analytics, settings, and module registry. | UI flows expose only functions verified in the API. No fake buttons or invented records. |
| Authentication | Register, login, and `/me` API endpoints exist; JWT middleware protects API routes. | Login, registration/invite acceptance, session loading, expiration, logout, and unauthorized states. Session transport/storage must be decided and security-reviewed before implementation; do not casually store bearer tokens in local storage. |
| Product surface | No login, dashboard, navigation shell, or module screens in `apps/web`. | Unified authenticated workspace with clear organization context and role-aware actions. |

The prior reference image includes example names, counts, status badges, and AI suggestions. Treat these as illustrative only. Do not ship them as hard-coded tenant data or display unsupported metrics. Dashboard values must come from authenticated, tenant-scoped API responses.

## 2. Product navigation and route map

Use App Router route groups to distinguish public identity pages from the authenticated workspace. The following is a proposed structure, not a claim about existing files:

```text
apps/web/src/app/
├── (public)/
│   ├── login/page.tsx
│   ├── register/page.tsx                 # only if open registration remains enabled
│   ├── invite/[token]/page.tsx            # only when invite-token flow is implemented
│   └── layout.tsx
├── (workspace)/
│   ├── layout.tsx                        # auth gate + app shell
│   ├── dashboard/page.tsx
│   ├── knowledge/page.tsx
│   ├── knowledge/[sourceId]/page.tsx
│   ├── assistant/page.tsx
│   ├── assistant/[conversationId]/page.tsx
│   ├── sales/page.tsx                    # pipeline landing
│   ├── sales/companies/page.tsx
│   ├── sales/contacts/page.tsx
│   ├── sales/leads/page.tsx
│   ├── sales/leads/[leadId]/page.tsx
│   ├── sales/activities/page.tsx
│   ├── proposals/page.tsx
│   ├── proposals/[proposalId]/page.tsx
│   ├── presentations/page.tsx
│   ├── intelligence/page.tsx             # monitor targets + reviewed events
│   ├── notifications/page.tsx
│   ├── analytics/page.tsx
│   ├── settings/page.tsx
│   ├── settings/members/page.tsx
│   └── settings/integrations/page.tsx     # only for settings supported by API
└── layout.tsx
```

Map the navigation to existing API capability:

| Navigation item | Route | Existing API foundation | MVP UI scope |
|---|---|---|---|
| Dashboard | `/dashboard` | `GET /api/v1/dashboard`, analytics and notifications | Summaries, recent activity, assigned follow-ups, quick actions. Render partial sections if one endpoint fails. |
| Knowledge Hub | `/knowledge` | list, upload, URL, detail, delete, download, search | Source table/cards, upload and URL intake, status, visibility, search, detail and permission feedback. |
| AI Assistant | `/assistant` | conversations, messages, knowledge search/retrieval | Conversation list, chat, citations, loading/error/retry, feedback if API supports it. |
| Sales | `/sales` | companies, contacts, leads, activities, pipeline | Pipeline view plus table/list alternatives; lead create/edit/detail and activity timeline. |
| Proposals | `/proposals` | list/create/detail/update/approve; template list/create | Draft list, detail/editor, template selection, review/approval state. No send/export control without a supported endpoint. |
| Presentations | `/presentations` | create/list/detail/status; Presenton adapter | Request form and job status/output link; distinguish queued, generating, ready, and failed. |
| Intelligence | `/intelligence` | monitoring targets and events/review | Target management and event review; show source/provenance and collection freshness where present. |
| Notifications | `/notifications` | list, read, read-all | Inbox with unread counts and safe deep links. |
| Analytics | `/analytics` | sales and knowledge statistics | Show only API-provided metrics with date range, empty, and error states. |
| Settings | `/settings` | organization settings; membership endpoints | Organization settings and member/role management based on actual server permission. Integration UI requires a confirmed settings API contract. |
| Integrations | not yet established as a user-facing page | Adapter files exist for AI, storage, Presenton, ScrapLink, Diffy | Keep configuration hidden until real, authorized configuration endpoints and audit behavior exist. |

`GET /api/v1/modules` is the source for module availability. Hide unavailable entries or show a concise disabled/coming-soon treatment based on registry data; never link a user to a fake functional screen. Registry availability is not a substitute for server-side authorization.

## 3. App shell and visual system

### Desktop layout

- **Left navigation rail:** product mark, active workspace switcher, primary enabled modules, notification entry, settings, and account menu. Collapse to icons only when labels remain discoverable to assistive technology.
- **Top bar:** global search only if a real cross-module search contract exists; otherwise use module-local search. Include breadcrumb/page title context, notification shortcut, theme control only if theme support is complete, and user menu.
- **Main content:** readable page width, stable title/action row, filters, then the content. Lists and detail panes should not compete with persistent assistant UI for width.
- **Assistant access:** provide a persistent entry point and optionally a resizable side panel on desktop. Do not keep a full-height assistant panel open on every page by default; it can compress high-value CRM tables. Use the reference image as a visual option, not a fixed requirement.

### Responsive behavior

- At narrow widths, replace the rail with a labeled menu/drawer; keep workspace and current page visible.
- Convert multi-column dashboard cards to one column; tables need deliberate horizontal scrolling or a card layout, not clipped controls.
- Assistant becomes a dedicated route or full-screen sheet on small screens.
- Forms use a single column, persistent visible labels, and sticky action buttons only when they do not cover content.
- Test keyboard navigation, zoom/reflow, touch targets, focus order, and screen reader names before release.

### Visual direction

Use the reference's dark navy navigation and bright blue accent as a starting point, with a calm light content canvas, high-contrast text, restrained color-coded statuses, and consistent spacing. Avoid using color alone to signal stage or health. Establish tokens for semantic colors, surfaces, borders, spacing, type scale, focus ring, and elevation before building screens. Keep charts simple, labeled, and accompanied by accessible summaries/tables.

Implement primitives only as needed: `Button`, `IconButton` with accessible name, `TextField`, `Select`, `Dialog`, `Toast/Alert`, `Badge`, `Card`, `DataTable` or table primitives, `EmptyState`, `Skeleton`, `PageHeader`, `ConfirmDialog`, `FormField`, and `VisuallyHidden`. Prefer native semantics and the smallest dependency set.

## 4. Login, identity, and organization selection

### Login flow

1. User opens a public route; render a centered, branded form with email and password, visible labels, show/hide password control with accessible state, submit action, and registration link only if open registration is enabled.
2. Client validates format for quick feedback; server remains authoritative. Disable duplicate submit while pending; announce errors without clearing the entered email.
3. On success, fetch the current identity and memberships using supported endpoints. If there is one organization, select it; if multiple, ask the user to choose. Do not trust an organization ID retained from an unvalidated browser value.
4. Load the authenticated workspace. If authentication is invalid/expired, clear client session state and return to login with a safe message.
5. Logout clears the chosen session mechanism and navigates to login.

### Security requirement before frontend implementation

The current API uses bearer JWT middleware and `x-organization-id`; the web code has no session integration. Product/engineering must approve the session transport, CSRF posture, refresh/expiry behavior, and API origin/CORS contract before implementing auth. Prefer a server-managed secure, HttpOnly, SameSite cookie or a carefully designed backend-for-frontend. Do not put secrets in client bundles or assume an in-memory/local-storage token is production-safe. The browser must never set a role or permission flag; API authorization is final.

### Identity states

- unauthenticated: public route or login redirect;
- authenticating: pending state, one submit;
- authenticated with no workspace: clear onboarding/create/join path only if supported;
- one or multiple memberships: safe selection and switch;
- membership removed or selected tenant forbidden: clear tenant selection and show recovery path;
- expired/invalid session: reauthenticate without leaking prior page data.

## 5. Dashboard content and behavior

The dashboard should answer: what needs my attention, what changed, and what can I do next? Suggested regions:

1. Greeting and current organization context.
2. Action queue: overdue/due activities and review tasks only when backed by real data.
3. Sales pipeline summary from `GET /sales/pipeline`, with filters/date context only when API supports them.
4. Recent activity; clearly label which record/module generated each item.
5. Knowledge processing/errors and asset counts from supported endpoints.
6. Assistant prompt/quick action cards that start a real flow, not fabricated capabilities.

Do not show arbitrary sales targets, trend percentages, AI usage, competitor alerts, or generated charts unless endpoints return those values with clear units/time windows. For each card, provide loading skeleton, meaningful empty state, failure/retry, and permission-limited state. A dashboard should remain useful when one noncritical widget fails.

## 6. Module page behavior

### Knowledge Hub

- Upload form displays permitted formats/size limits from the backend contract, title, visibility, progress if available, and cancellation only if supported.
- After upload, show processing state and poll or refresh using a bounded strategy. Never infer ready from a successful upload response.
- List provides title, type, visibility, owner, status, date, and action menu based on permissions.
- Search results show source title and citations with safe links; do not expose raw restricted content in previews.
- Delete requires confirmation and handles already-deleted/missing records.

### AI Assistant

- Chat is a conversation workflow, not a decorative dashboard widget.
- Display distinct user/assistant messages, pending response, retryable provider failure, and citations tied to source detail.
- Explain when no accessible sources support an answer. Never display unsupported citations or imply external actions were completed.
- For draft content, distinguish generated text and require human review before export, sending, or publication.

### Sales

- Provide a pipeline board and accessible table view; board drag-and-drop is optional and must call the validated stage transition API.
- Company/contact/lead forms use server validation and tenant-scoped relationship selectors.
- Lead detail shows ownership, stage, company/contact, value/currency, expected close, and activity timeline only where data exists.
- Deletion and high-impact stage transitions require explicit confirmation and recoverable error messaging.
- Respect role policy for ownership, exports, and writes; hiding a control is usability only, not authorization.

### Proposals and Presentations

- Show status, version, linked lead, and last update.
- Proposal review and approval must make actor/status transition clear. Do not present approval as a simple generic save.
- Presentation requests show queue/generation status, retry/error outcome, and output link only when API confirms it. Validate provider URLs before opening and use safe link attributes.

### Intelligence

- Separate monitored targets/configuration from collected events.
- Event review actions preserve provenance and show reviewed status/actor/time if the API supports them.
- Communicate collection recency and errors; never imply continuous monitoring when no job/schedule evidence exists.

## 7. Shared UI states and accessibility acceptance

Every data-backed route needs:

- initial loading/skeleton that preserves page structure;
- empty state with one useful next action;
- request error with retry when safe and correlation ID for support if available;
- unauthorized/forbidden state that does not leak record existence;
- stale or processing state for async work;
- success confirmation for writes;
- destructive action confirmation and duplicate-submit prevention.

Keyboard users must reach every action, see focus, operate dialogs and menus, and return focus to the trigger. Inputs have persistent labels and associated errors. Status and async updates are announced accessibly. Maintain adequate contrast, semantic heading order, and non-color status cues. Charts need text alternatives. Include accessibility review in definition of done; no automated scanner alone is sufficient.

## 8. Role-aware experience

Use server-issued membership role for presentation hints only. Define a permission matrix from actual backend authorization behavior before exposing controls. The current API role set is Owner, Admin, Manager, Sales, Contributor, Analyst, Member, Viewer; do not invent role-specific exceptions on the client. If permissions are not available through a stable API contract, use conservative UI defaults and handle server 403 responses. Every user action must still be authorized and tenant-scoped on the server.

## 9. Out of scope until separately approved

Accounting, inventory, payroll, HR, mobile apps, workflow builder, billing, email/calendar sync, advanced automation, broad global search, exports, and integration credential management are not implied by the visual reference. Keep them out of navigation until requirements, APIs, authorization, data rules, and module-registry behavior are approved.
