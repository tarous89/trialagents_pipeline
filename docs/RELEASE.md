# Pipeline build and deployment

## Source and runtime

Pipeline owns the app, migrations, worker, MCP descriptors and implementation, widget, assets and manifest in this repository. Its HTTP handler runs inside the existing Frankfurt Node web service. The web and ChatGPT entry points use the same application database, workspace roles, revision checks, durable receipts and invitation outbox. The shared host provides the existing TrialAgents authentication, OAuth issuer, billing and mail configuration.

| Public path | Handler |
| --- | --- |
| `https://pipeline.trialagents.com/` | Existing web service loads the compiled Pipeline app |
| `https://mcp.trialagents.com/pipeline/chatgpt` | Existing web service runs the Pipeline Node MCP handler |
| `https://mcp.trialagents.com/.well-known/oauth-protected-resource/pipeline/chatgpt` | Shared web service returns Pipeline resource metadata |
| `https://mcp.trialagents.com/pipeline/claude` | Same Pipeline Node MCP handler, with the Claude OAuth audience |
| `https://mcp.trialagents.com/.well-known/oauth-protected-resource/pipeline/claude` | Shared web service returns the Claude resource metadata |
| `https://pipeline.trialagents.com/pipeline-renderer` | Inert sandbox for authored HTML, SVG and local controls |
| `about`, `support`, `privacy`, `terms` under `https://pipeline.trialagents.com/pipeline-info/` | Public listing, support and legal pages |

**Routing the MCP hostname.** Preserve the existing host for other MCP products. Before activation, route the four exact Pipeline paths on the MCP hostname to the existing web service. Preserve the request method, body, bearer header, response content type, streaming and status. The OAuth audience is the external HTTPS URL even if the request reaches the service through a different internal hostname. DNS alone cannot route individual paths. If the current ingress cannot forward these paths, the direct web-service alternative is `https://pipeline.trialagents.com/pipeline/chatgpt`. Changing the public URL requires updating the manifest and OAuth audience together and reconnecting the client.

## Build and integrate

1. Check out the desired commit from `https://github.com/tarous89/trialagents_pipeline.git`. Use Node 24 and run `npm ci` and `npm test`. The build produces the web shell, browser JavaScript, immutable widget content, sandbox and bundled Node MCP module. GitHub branch and pull request checks stop after building and testing.
2. For a shared Render deployment, make the pinned checkout of `tarous89/trialagents_pipeline` available to the existing web build. The baseline shared web build already includes standalone Pipeline and the shared account system. From the Pipeline checkout run `npm run build:widget` followed by `node scripts/stage-app.mjs /path/to/shared-web-build`. The script assembles the checkout used for that deployment. It is repeatable and checks compatibility before changing files. Keep the service's existing source, start command and other applications.
3. Run the shared service's usual build command against the assembled directory. The host imports Pipeline's prebuilt MCP bundle directly. It does not need an additional language runtime, dependency installation for the MCP, listening port, Render service or database. Register the two exact ingress paths above. The existing worker applies additive migrations under its existing advisory lock.
4. Set the shared web service's existing `PIPELINE_ENABLED` and `PIPELINE_MCP_ENABLED` flags for staging. Keep existing issuer, service and database credentials in Render. Verify challenge and discovery on the public hostname, sign in, consent and return from ChatGPT, and inspect role revocation on an already-open widget. Verify other products on their existing paths. Rolling back to the previous web build preserves the additive Pipeline data.

The production MCP service uses its existing `intel-mcp` entrypoint. From the same pinned checkout, run `python scripts/stage-ingress.py /path/to/shared-mcp-build` before its existing `pip install .` build command. The adapter reuses an HTTP connection to the shared web server at its Render private address, `intel-agent-app:10000`. Only the two exact public paths are forwarded. The two staging scripts operate on disposable build directories, and the Git repositories for the hosting services retain their existing sources.

## ChatGPT browser testing and submission

| Deliverable | Build | Contents |
| --- | --- | --- |
| Private browser test ZIP | `python scripts/package-plugins.py --host chatgpt --browser-app-id "$PIPELINE_TEST_APP_ID" --output dist` | The manifest points to a required Pipeline registration in `.app.json`. The name contains `chatgpt-browser`. |
| Public submission ZIP | `python scripts/package-plugins.py --host chatgpt --output dist` | The portable `mcp.json` describes the hosted OAuth endpoint. The manifest includes the five positive and three negative MCP review cases. The name contains `chatgpt-submission`. |

For a private browser test, use ChatGPT on the web in the target account or workspace. In **Plugins → + → Add custom MCP server**, register **TrialAgents Pipeline** with `https://mcp.trialagents.com/pipeline/chatgpt`, OAuth and dynamic client registration. If Pipeline is already registered in that account, reuse its connection. Verify its URL and copy its actual app ID into `PIPELINE_TEST_APP_ID` when building. Intel's November 6 browser test succeeded with this app-reference layout after a portable ZIP imported as desktop-only. An Intel ID or an independently uploaded desktop plugin ID cannot identify the Pipeline connection.

Import the private browser ZIP and connect a writable personal workspace containing the fictional EX-101 example. In ChatGPT web, try the program, milestone, deliverable, change and activity prompts from the submission manifest, each in a fresh chat. Confirm one inline workspace on the first response and an appropriate text, link or workspace follow-up. Record the result for the exact ZIP version and test account.

## Candidate checks

Open a fictional EX-101 workspace in a fresh chat. The first scoped question opens it once. Follow up in text, add a record, define and link custom tables as the owner, archive and restore a field with a dependent view, and reopen the same saved view through the web link. Test the free personal workflow on both surfaces, an authorized invitation with a controlled team account, and an unavailable invitation without a billing redirect. Confirm that a reader cannot replay a previous write after revocation.

Authored views load the Pipeline-owned renderer on demand. The parent sanitizes content and passes it into an opaque-origin sandbox. Its fixed script supports local interactive controls and explicit version-checked saves. Content never needs to be included in a renderer URL. Listings, a real ChatGPT session, staging latency and review access should be checked on the chosen deployment before submission.

## Claude plugin

The Claude plugin in `plugins/claude` mirrors ChatGPT 0.2.5. It uses the same name, version, author, legal and support URLs, keywords and skill rules, and the `assets/claude-mark.png` icon. Only host details differ:

| ChatGPT | Claude |
| --- | --- |
| `plugin.json` with the `com.openai` interface, review cases and release notes | `.claude-plugin/plugin.json` with display name, icon and legal/support URLs. Starter prompts, review cases and release notes go in the Claude directory submission form. |
| `mcp.json` (`/pipeline/chatgpt`), or `.app.json` for the private browser test | `.mcp.json` with a remote HTTP server at `https://mcp.trialagents.com/pipeline/claude`. Claude discovers OAuth from that endpoint's resource metadata and registers dynamically. |
| Skill: display the workspace in the same reply | Same rules. Claude web, desktop and mobile render the workspace inline. Claude Code answers in text with the returned workspace link and asks which view or record is meant. |

Build it with `python scripts/package-plugins.py --host claude --output dist`. The repository root also has `.claude-plugin/marketplace.json`, so Claude Code can install it with `/plugin install trialagents-pipeline --marketplace tarous89/trialagents_pipeline`. Check it with `claude plugin validate plugins/claude`.

The build also produces a Claude copy of the widget (`pipeline-claude.html`) and of the embedded workspace (`pipeline-embedded-claude.html` and `.js`). They use Claude wording, such as **Ask Claude to create a custom view**, and the ChatGPT build outputs stay byte for byte the same. The Claude MCP route serves that widget. It also replaces the shared `ui.domain` with Claude's sandbox host for this server, `902202f9dd8f7b5c489c362d072e95f2.claudemcpcontent.com`, which is the first 32 hex characters of the SHA-256 of `https://mcp.trialagents.com/pipeline/claude`. `/pipeline-embedded-claude` allows framing only by itself, that sandbox host and `https://claude.ai`. If the Claude MCP URL changes, recompute the host in that route.

The Claude route runs the same handler, tools and store as ChatGPT. It has its own OAuth audience, metadata and gateway path. Claude writes follow the same assistant rules as ChatGPT and are recorded as Claude in audit history. The workspace panel accepts either assistant's token. Consent provisions the personal workspace for both audiences. In the shared web baseline, `pipelineResource(true)` now returns `/pipeline/claude`. Connect Claude to the dedicated review workspace and repeat the candidate checks before submission.

Review packaging is a separate manual action.

## ChatGPT workspace rendering

The browser and embedded builds share the Pipeline shell, styles, navigation, planner, record drawers and saved-view renderer. Both headers place the sidebar toggle before the brand. The sidebar starts open, with a compact rail at narrow widths. The embedded header opens the current web workspace. The component can supply the current saved selection when asked. The assistant can request the active selection on demand using the panel instance returned to that conversation. A first-party frame answers through transient PostgreSQL notifications. Browsing and draft values are never sent into chat. Only Ask ChatGPT to create a custom view sends a user message. Initial status reads carry the workspace renderer and request expanded conversation-panel presentation. Subsequent reads can return text using the context from a presented workspace. Saved-view removal checks the selected view version and an owner can confirm removal of a pinned view together with its navigation tab. Personal and Support use the standalone account component. Account security and billing administration take place on the website.

The MCP component frames the app at `https://pipeline.trialagents.com/pipeline-embedded`. This keeps portfolio and account data on the first-party origin. The model receives the scoped tool projection. The frame creates a random secret in memory and sends its SHA-256 digest to the app-only `connect_pipeline_frame` tool. The first-party API verifies the corresponding grant, workspace, current membership and unrevoked OAuth token on use. The frame can renew a ten-minute grant while the OAuth connection remains valid. The renderer for authored content stays on the same allowlisted origin in its own isolated sandbox.

After deploying, refresh tools on the existing private MCP connection if its cached tool list predates the frame operation. Start a new ChatGPT conversation and ask for program status. Verify the overview cards, navigation, both sidebar states, the record drawer and a saved view. Open the web app from the header and compare the same tab or view.

## Live workspace updates

The browser and first-party ChatGPT frame subscribe to a workspace-scoped event stream through their existing authenticated Pipeline endpoints. The worker applies the notification trigger in `schema.sql`. PostgreSQL publishes the signal on commit. Each open workspace checks its revision after a signal, on connection, and when it regains focus. If the trigger or stream is unavailable, visible workspaces use five-second revision polling while reconnecting.

For a hosted release check, keep the same workspace open in the browser and ChatGPT, then add a record from chat. Verify both views update. In the browser network inspector the `workspace.events` request should receive `text/event-stream` events progressively through the production proxy.
