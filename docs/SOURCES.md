# Implementation sources and visual acceptance

## Approved Pipeline baseline

The HTML, description and extracted active JavaScript/CSS landed in this repository at [2d5e2895](https://github.com/tarous89/trialagetns_pipeline/tree/2d5e28954602822998737a42fcb7157206d9ffd1/prototypes/pipeline). Use [the original HTML](../prototypes/pipeline/Pipeline.html) and [its full workflow description](../prototypes/pipeline/README.md). The source HTML has 875,405 bytes and SHA-256 `1fe80bbba964c4a571efb1e3b6c63eae2e319aab2ac72f66f6bedeec4d216db8`. This matches the approved design supplied before the commit.

[Platform Programs scope](https://github.com/tarous89/trialy/blob/a7dbaa6e0b74e05f0ea0841cc445686e374c9487/docs/product/app-template-blueprints/apps/PROGRAMS.md) and the [earlier catalog template](https://github.com/tarous89/trialy/tree/a7dbaa6e0b74e05f0ea0841cc445686e374c9487/templates/source/project-oversight) were reviewed for history. Standalone implementation follows the committed Pipeline handoff above.

## Intel source map

All app paths below refer to [intel_agent_app at 4a0b2d86](https://github.com/tarous89/intel_agent_app/tree/4a0b2d8680bb480f41929b062d0ebb01b122c645). MCP paths refer to [intel_mcp at eaee7070](https://github.com/tarous89/intel_mcp/tree/eaee7070e05a8247f1121209a1345daa7e7d7000). Both repositories are deployed from main. Extract shared entry points only when necessary. Give those entry points Pipeline data and product labels. Keep the existing Intel callers covered by regression tests.

| Area | Existing implementation | Pipeline integration |
| --- | --- | --- |
| Workspace chrome | App: `app/preview/combined/SharedProjectFrame.tsx`, `app/research/WorkspaceTables.tsx`, `app/app-icon.tsx` | Reuse the same frame including its extension variant. Supply Pipeline title, workspace name and authorized actions. Preserve the actual brand artwork and host behaviors. |
| Effective styles | App: `app/trialagents-theme.css`, `app/globals.css`, `app/_site-agent/SiteAgentWorkspace.module.css`, `app/components/workspace/workspace-shell.css`, `app/preview/combined/combined-workspace.css`, `app/research/workspace.css` | Include the full cascade and responsive overrides for the reused control. Intel overrides base sidebar tokens in globals.css. Keep Pipeline's sidebar geometry and use Intel's deployed foreground, background, border, hover and active colors. |
| Account and settings | App: `app/components/AccountSettings.tsx`, `ChatGPTConnection.tsx` and `ClaudeConnection.tsx` in the same directory; `app/api/auth/{signup,login,session,account,password,logout}` and password reset routes | Reuse forms, account lifecycle, connections and settings tab styles. Persist the existing browser-only notification choices on the server. Reuse the support form and its contact handler. |
| Billing | App: `app/preview/combined/CombinedPremium.tsx`, `app/lib/combined-subscriptions.ts`, `app/lib/stripe.ts`, `app/api/stripe/webhook/route.ts` | Keep checkout, portal and receipts; introduce a workspace-specific price mapping and entitlement handler. Existing Intel research subscriptions have different semantics. |
| OAuth and MCP | App: `app/lib/oauth-server.ts`, `app/lib/oauth-validation.ts`, `app/lib/oauth-config.ts`; MCP: `src/intel_mcp/research_server.py`, `ui/research/workspace.tsx`, `ui/research/build-workspace.mjs` | Extend the existing deployed MCP service with a Pipeline route and resources. The Intel web app's `app/mcp/route.ts` serves documentation. Use the Python service for protocol traffic. |
| Custom views | MCP: `src/intel_mcp/project_custom_views.py`, `src/intel_mcp/custom_view_contract.py`; App: `app/research/ProjectReports.tsx`, `CustomViewRecovery.tsx`, `InteractiveVisualization.tsx` | Reuse the renderer, durable save and restore interaction. Bind Pipeline-authorized queries, stable view IDs and creator/program metadata. Publish into the team workspace; external/public sharing needs a separate product decision. |
| Hosting | Render inventory: intel-agent-app, intel-mcp, intel-agent-control-db in the existing Intel environment. The intel-agent-db clinical warehouse has a different purpose. | Existing web/MCP deploy repos must adopt a reviewed version from this repo. Confirm migrations, host routing, signing keys, backups and capacity before production traffic. |

## Design handoff

[The standalone preview](../preview/Pipeline.html) adapts the approved HTML. The browser header follows Intel's shared-project-frame markup and CSS. Its shadow root isolates those rules from Pipeline's broad header, main and heading styles. The sidebar keeps Pipeline's structure with Intel colors. Settings uses Intel's tabs, icon paths and active/hover rules. The original design-review archive remains accessible in the baseline HTML. Production must import the shared components and use their responsive and embedded variants. The preview demonstrates section placement; live account forms, a populated Custom views list, payments, logs and invites require the server.

Pixel fidelity applies to every copied component, including buttons, typography, radius, borders, padding, focus, hover, error/loading states, logo assets and responsive breakpoints. Content changes are limited to Pipeline-specific wording, user data and permitted actions. Use the same viewport, browser, font loading, device scale, theme and fixtures for each reference/candidate pair. Capture desktop, tablet, narrow phone, ChatGPT inline/expanded and Claude inline/expanded where supported. Compare identical-copy fixtures pixel for pixel, then inspect production wording for wrapping. Compare sidebar colors separately because Pipeline retains its existing geometry. Preserve the approved content area.

## Verification boundary

The baseline hash was checked against the committed HTML. The standalone script was syntax checked and exercised in a JavaScript rendering harness across all nine top-level entries and seven Settings sections. Screenshot diff approval, live host testing, database migrations, payment tests and shared-service deployment remain implementation gates.
