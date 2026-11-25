# Standalone Pipeline implementation scope

## Product and release boundary

A biotech team owns a shared pipeline at pipeline.trialagents.com. A member can plan in the browser, ask an assistant what changed, open the same filtered workspace in ChatGPT or Claude, and edit within their role. The browser, MCP tools and embedded interface use the same records and operations. The public repository holds source and fictional fixtures. New workspaces start with removable EX-101 examples. Onboarding offers one action on each page and opens the corresponding record form after cleanup. Preserve the approved planning experience in prototypes/pipeline/Pipeline.html. Use the accompanying prototypes/pipeline/README.md as the authoritative workflow specification. The older Platform Programs catalog version provides integration history.

The first release includes the full planning workspace, team accounts, paid collaboration, shared custom views, owner customization, personal preferences, notifications, support, billing and audit history. Launch includes a public app submission for each assistant. Directory approval and private-connector verification are distinct milestones.

## Planning workflows

| Screen | Production behavior |
| --- | --- |
| Overview | Portfolio health, budget and time to deadline, next milestone, risk signals and review queue. Preserve the final prototype's click targets, filters and typography. |
| Programs | Program cards contain milestones, activities and decisions. Preserve stable program identity when assets or indications repeat. Maintain autocomplete, parent/child membership, optional sequencing rules, decision outcomes, cycle validation and the edit drawer. |
| Timeline | Expandable program cards, activity spans, milestone markers and decision points. Filter by program, status and dates. Retain marker spacing for first and last dates. |
| Deliverables, Risks, Changes | Linked records retain affected items, owners, organizations and dates. Keep risk propagation to affected activities and their parents. Manage contact people on organization records. |
| Custom views | One searchable, filterable list. Filter by program, author and view type. Open an item in place or via a stable workspace link. Preserve Intel's chart frames, summary, save verification and recovery flow. |
| Settings | Single navigation entry. The seven sections below share Intel's settings controls. |

Retain add, edit, duplicate, save, discard and delete workflows in the approved preview. Preserve record links during renaming and concurrent updates. Store attachments in restricted workspace storage with membership-checked downloads. Confirm dependent effects before deletion. Import of legacy local data, if offered, is explicit and validated with a preview, stable identifiers, and retry protection. Demo fixtures and personal contact examples are confined to the design preview.

### Production parity checks

Verify that one downstream risk reached along multiple dependency paths appears once on each affected ancestor, and that closing it recalculates exposure from the other open risks. Test field-by-field forecast recomputation after editing/deleting a dated change. Preserve atomic creation of a plan draft and its staged events. Test the completion review with a direct deliverable, a required decision and an unmet activity prerequisite. Distinguish the **assigned record owner** from the **workspace owner**. Proposed approval rule: the assigned record owner must be a current editor or workspace owner and the audit event must name the actual approver. The current prototype stores a name only. Resolve unassigned and departed owners by reassignment. Explicitly define how the stored milestone lookahead affects the live Overview before changing its current behavior.

## Access and customization

| Action | Owner | Editor | Read only |
| --- | --- | --- | --- |
| Read the whole workspace, custom views and Logs | Yes | Yes | Yes |
| Search, filter, use read tools, update own preferences | Yes | Yes | Yes |
| Create, edit, duplicate or delete planning records | Yes | Yes | — |
| Create and edit shared custom views | Yes | Yes | — |
| Manage custom tables, columns and relationships | Yes | — | — |
| Change app styling, add/edit/reorder top-level tabs, promote a view to navigation | Yes | — | — |
| Invite, remove, change member roles, manage billing | Yes | — | — |

Membership is workspace-wide. Use a unique workspace/user membership and an explicit owner. Permissions follow the signed-in person across hosts. Opening a link always resolves membership. Require the current actor for browser and MCP writes. A revoked session or suspended team membership loses access on the next authorized request.

**Owner customization.** Through ChatGPT or Claude, describe a tab or style change, preview the proposed configuration and save an exact revision. Reuse Intel presentation primitives for Intel-derived elements. Provide supported layout and style controls for Pipeline-owned content. Keep stable tab IDs, version configurations, check the expected revision on save, and log the change. A saved view is a workspace data object. Creating it never alters navigation. Owners and editors can revise shared views at the expected version. An editor can remove a view they authored. Only a workspace owner can remove a pinned view and its navigation tab together. Read-only users can apply temporary filters.

## Settings and ownership

| Section | Contents and persistence |
| --- | --- |
| App settings | Owner changes shared planning defaults, currency, date presentation, lookahead, reminder timing, tab configuration and style revisions. Use the prototype's existing planning semantics. |
| Personal settings | Intel profile, verified email display, password management, sign-out, ChatGPT/Claude connection and disconnect flows. Account fields follow the user. |
| Team | Owner sees members and pending invitations, sets Editor or Read only, resends/revokes invites and removes members. Count seats for display only. |
| Logs | Member-readable append-only activity stream. Filter by actor, time, action, source and program. Show before/after values for permitted business fields. Paginate with a stable cursor. |
| Billing | Owner sees current plan, monthly price, payment method, invoices, renewal/cancellation date and portal. Reuse Intel checkout and portal presentation with Pipeline wording. |
| Notifications | Personal switches for assignment, deadline, completion review, change, risk and deliverable events. Persist by user/workspace. Queue delivery after commit. Deduplicate by event, recipient and reminder interval. Remove ineligible recipients at send time. |
| Support | Reuse Intel's support form and delivery flow. Include product and authorized workspace context. Keep support content and personal billing details out of the team's activity feed. |

Read-only members can change their own profile and preference records. An owner role change, data edit, shared view save or customization creates an audit event in the same transaction as the operation. Include actor, workspace, entity, timestamp, source (web, ChatGPT, Claude or system) and change details. Record invitation, membership and entitlement changes. Retain event history across renames and member removal. Limit logged payment information to entitlement state and identifiers needed for reconciliation.

## Accounts, invitations and payment

Use Intel signup, login, reset, account settings and OAuth. Resolve the same TrialAgents user ID and keep Pipeline workspace membership separate. Hosted sign-in must return to the initiating Pipeline workspace or assistant connection. Validate the host/audience, redirect and active workspace. Test existing Intel users and first-time users.

**Pricing contract.** Individual use is free. Pipeline Team costs **USD 49 per workspace per month**, unlimited editors and read-only members combined. One recurring Stripe price, quantity one. The owner pays. Existing Intel subscriptions are independent. A second invite or changing a role never creates a second subscription.

1. Owner selects **Invite member**. A free workspace sees the price and what it unlocks. Keep the draft address and role through checkout. Send the invitation after verified entitlement and owner confirmation.
2. Build checkout and portal sessions server-side using the authenticated owner and workspace. Map the Pipeline-specific price, customer, subscription and workspace. Reuse Intel's Stripe client and test/live configuration. Redirect return shows pending status until the server confirms payment.
3. Extend the existing signed webhook dispatcher with a Pipeline-specific handler. Persist event IDs, reconcile subscription state idempotently, and tolerate duplicates and out-of-order events. Verify product, amount/currency and workspace association. A delayed event for an older subscription cannot overwrite a newer renewal.
4. Invitations are verified-email-bound, single-use, expiring and revocable. Store token digests. Both issue and accept operations check current owner authority or recipient identity as appropriate, workspace and active team entitlement. Duplicate acceptance is idempotent. Re-inviting an existing member must preserve their current role unless the owner explicitly changes it.
5. Use Stripe test mode to exercise first checkout, repeated checkout clicks, renewal, canceled checkout, pending payment, invoice failure/recovery, portal cancellation, expiry and resubscription. Quarantine unknown mappings for reconciliation. Email retries never create extra memberships.
6. **Subscription expiry.** Retain teammate access through the verified paid period. Suspend invitee access afterwards, preserve data and memberships, and restore access on renewal. The owner retains individual access.

## Shared services and data

Use the existing Frankfurt Render web service **intel-agent-app** and application database **intel-agent-control-db**. Pipeline owns its Node MCP handler and its schema in this repository. Assemble the shared web build from a pinned Pipeline commit. See [release routing](RELEASE.md).

- Build a versioned Pipeline UI/server bundle and MCP adapter from this repository. Pin both in the Intel deployment repos, or vendor the exact reviewed revision at build time. Coordinate migrations before code activation. Each service continues to build from its current repo and production branch.
- Register pipeline.trialagents.com as a custom domain on the existing web service and verify DNS/TLS. Route by explicit host allowlist. Serve Pipeline pages, auth returns, health checks and deep links on that host. Forward the dedicated Pipeline MCP route to the existing MCP service using streaming-compatible transport, or map a dedicated MCP hostname to that same service. Verify host headers, resource discovery, audience and callback URLs in both assistants before directory submission.
- Workspace-scoped tables cover membership/invites, programs/records/links, organizations, attachments, saved views, app revisions/settings, user preferences, audit events, notification outbox and billing mappings. Reuse Intel accounts. Use workspace-qualified foreign keys and uniqueness constraints. Record edits and history commit together. Use optimistic concurrency and idempotent write receipts to handle conflicting edits and assistant retries.
- Add product-specific route flags to both services, isolated test/live price configuration and a migration rollback plan. Turning off Pipeline routes must leave existing Intel routes, subscriptions and MCP resource identities operational. Measure service headroom and exercise an Intel login, saved view, paid route and webhook before and after a shared-service release.

## AI-first workflows

Use Intel's MCP transport, hosted OAuth and embedded workspace bridge. Register separate Pipeline tools and UI resource URIs. Anonymous requests get connection guidance. Private records require authenticated membership. Keep clinical search, paid Intel research allowances and anonymous research preview policies scoped to Intel.

The tool contract covers workspace bootstrap, record query/detail, transactional mutations, custom view prepare/save/list/open, owner-only configuration preview/apply and opening the embedded workspace to a specific tab, record or view. Each write supplies an expected revision or idempotency key and returns the saved ID/version. Validate selections and joins server-side. First workspace opening presents the app inside the assistant. Later requests can return a concise answer, a filtered interactive view or a deep link according to the user's intent. Keep credentials and private app payloads out of public resources.

Test with real browser, ChatGPT and Claude accounts: connect, open, navigate, ask a question, save a view, retry a write, disconnect, downgrade an editor mid-session and remove membership. Prepare host-specific icons, listing copy, screenshots, privacy/support URLs, review accounts and a reproducible review script. Record submission and approval separately for each directory.

## Performance acceptance

Return current membership, capability flags, navigation and the requested first screen in the initial workspace response. Use indexed membership and workspace-scoped set queries. The UI derives control states locally. Authorize every API/tool operation server-side. Store the current entitlement locally from verified billing events. Opening an ordinary screen must make zero Stripe calls and zero per-element permission requests.

Page heavy feeds, attachments, saved views and logs on demand. Cache by workspace and user where appropriate. Handle role, membership and entitlement changes on the next protected request. Avoid fetching all settings or all programs to open one record. Benchmark cold and warm first open, Overview, Programs, Timeline, Settings, and embedded startup at representative small and large volumes. Capture p50/p95, query count, payload size and client request waterfall. Query count for permission checks must stay constant from 20 to 200 visible records. Record measured baselines and release budgets before rollout.

## Implementation sequence and sign-off

| Phase | Exit evidence |
| --- | --- |
| 1. Design baseline | Approve browser and embedded visual diffs against the pinned Intel controls and final Pipeline flows. Check desktop, mobile, active/hover/focus, drawers and filters. |
| 2. Persistence and identity | One owner signs in, creates a program and milestone, reopens them after a new session and sees a matching Logs entry. Two independent workspaces cannot read each other's records. |
| 3. Paid collaboration | Test-mode purchase, invitation, both member roles, removal, renewal, cancellation and replay tests pass. Verify the approved expiry and renewal behavior. |
| 4. Assistant integration and customization | Same milestone write is visible on all three surfaces. Editors save and filter shared views. Only the owner can change navigation or styling. Conflicts and retries produce one saved change and audit event. |
| 5. Settings and operations | Preferences follow the user across hosts, support reaches the configured team, notification delivery respects membership and deduplication, billing portal is owner-only. |
| 6. Shared Render launch | Review pinned integrations in Intel repos, run migrations, performance and existing-Intel regression checks, verify domain and TLS, then verify live web and both private assistant connections. Submit each directory package and record its result. |

The browser and assistant release candidates, integration pull requests, and live acceptance steps are described in [the release guide](RELEASE.md).
