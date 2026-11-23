# Standalone Pipeline release

## Release order

| Order | Release candidate | Hosted destination |
| --- | --- | --- |
| 1 | [Intel web PR #342](https://github.com/tarous89/intel_agent_app/pull/342) | Existing Frankfurt intel-agent-app and intel-agent-control-db. Route the Pipeline hostname to this service. |
| 2 | [Intel MCP PR #167](https://github.com/tarous89/intel_mcp/pull/167) | Existing Frankfurt intel-mcp. Both protocols forward the connected member's authorization to the same web API. |
| 3 | ChatGPT plugin and Claude plugin/connector | Distinct downloadable packages and OAuth audiences. Verify the real clients before each submission. |

Team is a recurring USD 49 subscription per workspace. Seat count never enters checkout. Existing teammates retain access through the verified paid period. After expiry the owner keeps individual access, teammate access pauses and records, memberships and custom views remain. A verified renewal restores access. The workspace role is rechecked on each protected operation. Ordinary navigation makes no per-record or per-control permission requests.

## Build and reproduce

From the [private production source directory](https://github.com/tarous89/intel_agent_app/tree/feat/pipeline-standalone-release/products/pipeline), with Node 24 and Python 3.11 or later:

```sh
npm ci
npm test
python scripts/package-plugins.py ../intel_mcp
```

The build produces a browser HTML/JS pair, the complete embedded MCP Apps document, and two ZIPs named trialagents-pipeline-chatgpt-0.1.0.zip and trialagents-pipeline-claude-0.1.0.zip. Package artwork comes from Intel commit eaee7070e05a8247f1121209a1345daa7e7d7000. Packaging reads immutable Git blobs for identical artwork and fixed ZIP timestamps. The public packaging workflow builds both ZIPs from the pinned artwork. The private web workflow runs the application tests, compares the build with the deployable files, and attaches screenshots from a fictional workspace. Set PIPELINE_CAPTURE_DIR to an output directory when running npm test to capture those screenshots locally.

For a clean integration rebuild, check out the web and MCP base revisions from [the source map](SOURCES.md). From the private production source directory run the following commands, pointing at your two clean checkouts.

```sh
npm run build:widget
node scripts/stage-app.mjs ../intel_agent_app
node scripts/stage-mcp.mjs ../intel_mcp
```

The staging commands apply reviewed patches and copy the built code. Use clean checkouts. Changes in the deployment repositories remain subject to those repositories’ own checks.

## Web and billing activation

1. Verify checks on the web integration. Deploy it to a staging instance of the existing web configuration using a staging database and test provider credentials. The deployed web service exposes the browser through its host rewrite, the protected POST /api/pipeline handler, and the shared account/support surface.
2. Set PIPELINE_ENABLED=true for the web service. Its existing start script launches the Pipeline schema and mail worker. The schema is additive and runs under a PostgreSQL advisory lock. Verify that startup can create schema pipeline using the control database role and that /api/pipeline bootstrap completes before directing users to it. The worker polls the outbox every 15 seconds and rechecks membership, preferences and subscription state at send time.
3. Use the existing Intel authentication and Stripe configuration. Supply PIPELINE_TEAM_PRICE_TEST in test mode and PIPELINE_TEAM_PRICE_LIVE in live mode. Each price must be active and recurring monthly at USD 49. Keep price mappings independent of Intel subscriptions. The webhook handler shares Intel's signature verification. Stripe checkout creates one subscription with quantity one and Pipeline workspace metadata. The web app locks the workspace and reuses an open session on repeated clicks.
4. Verify the existing Resend configuration, RESEND_API_KEY and AUTH_FROM_EMAIL with a controlled test mailbox. Sign up, sign in, reset a password, create a program and reopen it. Use the test checkout, wait for the signed webhook, then invite two controlled accounts. Accept one Editor and one Read only invitation. Try a prohibited write from the reader. Remove and reinvite the editor. Confirm that revocation takes effect on the next request. Test cancellation, renewal, replay, email retries, and portal return without altering Intel billing.
5. Add pipeline.trialagents.com to the existing Render web service. Use the CNAME target shown by Render and verify TLS. Check the named host in a clean browser, its cookie and auth returns, cross-workspace isolation, personal settings, support, notification delivery and audit history. Verify Intel login, a saved Intel project and its normal billing route after the shared deploy.
6. Activate live pricing and outbound invitations only after test-mode and domain checks. Track web error rate, startup readiness, database load and outbox retries on the existing services. To pause new operations, disable the assistant flag first, then disable web access. Preserve schema and Stripe mappings. Pause new checkout, reconcile Stripe subscriptions and replay any undelivered signed events before reopening. Disabling the app does not cancel existing Stripe subscriptions.

## ChatGPT and Claude activation

| Surface | Remote MCP URL |
| --- | --- |
| ChatGPT | https://mcp.trialagents.com/pipeline/mcp |
| Claude | https://mcp.trialagents.com/pipeline-claude/mcp |

Set PIPELINE_MCP_ENABLED=true on **both** the Intel authorization/web service and the Intel MCP service. Keep the existing MCP_RESEARCH_ENABLED mount active. Reuse the existing OAuth issuer, dynamic client registration, internal control-plane URL and service configuration. The resource in the token must match the exact endpoint. Each endpoint advertises its own protected-resource metadata. Authorization, role changes and disconnection remain independent of the other product and assistant.

Check challenge and discovery without credentials. Connect each assistant using a dedicated fictional review workspace. Open it inline, read one program, save a new program and a filtered or illustrated view, and reopen both in a clean browser. Try an editor design change and a read-only mutation. Revoke the member in the browser and repeat from an existing assistant session. Test inline and expanded layouts, the account link and an empty workspace. Standalone billing opens the website, and card details stay in Stripe Checkout.

The five model-facing capabilities open and read the workspace, save records, create views, and change owner-managed appearance. A sixth app-only tool handles UI interactions. Browser and assistant writes share revision checks, request receipts, workspace authorization and audit history. Saved custom views can contain filtered live records, grouped charts and sanitized, assistant-authored HTML/SVG. The renderer loads rich view documents only when opened. Custom presentation snapshots should state the data date. Questions on current values should use the stored records.

## Directory materials and outstanding live evidence

Use the [public plugin definitions](https://github.com/tarous89/trialagetns_pipeline/tree/main/plugins) for listing copy, starter prompts, skills, five positive and three negative ChatGPT scenarios, OAuth metadata, and the Claude plugin manifest. The archives reuse the Intel brand images. Use the Atlas Consulting legal URLs declared in the manifests and verify Pipeline data processing is covered before submission. The support route opens the shared TrialAgents form.

Run the listing scenarios with real ChatGPT and Claude accounts against the deployed candidate. Start with a fictional owner workspace containing a planned program named NT-101, and dedicated editor and reader accounts with preconfigured team access. Place reviewer credentials in the respective private submission form. Capture an accessible recording from the live assistant and include it in the submission. A simulator screenshot or a locally generated ZIP establishes packaging and browser behavior only.

Directory references: [OpenAI package and review workflow](https://developers.openai.com/plugins/deploy/submission), [Anthropic Connectors Directory FAQ](https://support.claude.com/en/articles/11596036-anthropic-connectors-directory-faq). Record actual public URLs, review receipt and approval for each host after submission.
