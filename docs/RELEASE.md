# Pipeline build and deployment

## Source and runtime

Pipeline owns the app, migrations, worker, MCP descriptors and implementation, widget, assets and manifest in this repository. Its HTTP handler runs inside the existing Frankfurt Node web service. The web and ChatGPT entry points use the same application database, workspace roles, revision checks, durable receipts and invitation outbox. The shared host provides the existing TrialAgents authentication, OAuth issuer, billing and mail configuration.

| Public path | Handler |
| --- | --- |
| `https://pipeline.trialagents.com/` | Existing web service loads the compiled Pipeline app |
| `https://mcp.trialagents.com/pipeline/chatgpt` | Existing web service runs the Pipeline Node MCP handler |
| `https://mcp.trialagents.com/.well-known/oauth-protected-resource/pipeline/chatgpt` | Shared web service returns Pipeline resource metadata |
| `https://pipeline.trialagents.com/pipeline-renderer` | Inert sandbox for authored HTML, SVG and local controls |
| `about`, `support`, `privacy`, `terms` under `https://pipeline.trialagents.com/pipeline-info/` | Public listing, support and legal pages |

**Routing the MCP hostname.** Preserve the existing host for other MCP products. Before activation, route the two exact Pipeline paths on the MCP hostname to the existing web service. Preserve the request method, body, bearer header, response content type, streaming and status. The OAuth audience is the external HTTPS URL even if the request reaches the service through a different internal hostname. DNS alone cannot route individual paths. If the current ingress cannot forward these paths, the direct web-service alternative is `https://pipeline.trialagents.com/pipeline/chatgpt`. Changing the public URL requires updating the manifest and OAuth audience together and reconnecting the client.

## Build and integrate

1. Check out the desired commit from `https://github.com/tarous89/trialagents_pipeline.git`. Use Node 24 and run `npm ci` and `npm test`. The build produces the web shell, browser JavaScript, immutable widget content, sandbox and bundled Node MCP module. GitHub branch and pull request checks stop after building and testing.
2. For a shared Render deployment, make the pinned checkout of `tarous89/trialagents_pipeline` available to the existing web build. The baseline shared web build already includes standalone Pipeline and the shared account system. From the Pipeline checkout run `npm run build:widget` followed by `node scripts/stage-app.mjs /path/to/shared-web-build`. The script assembles the checkout used for that deployment. It is repeatable and checks compatibility before changing files. Keep the service's existing source, start command and other applications.
3. Run the shared service's usual build command against the assembled directory. The host imports Pipeline's prebuilt MCP bundle directly. It does not need an additional language runtime, dependency installation for the MCP, listening port, Render service or database. Register the two exact ingress paths above. The existing worker applies additive migrations under its existing advisory lock.
4. Set the shared web service's existing `PIPELINE_ENABLED` and `PIPELINE_MCP_ENABLED` flags for staging. Keep existing issuer, service and database credentials in Render. Verify challenge and discovery on the public hostname, sign in, consent and return from ChatGPT, and inspect role revocation on an already-open widget. Verify other products on their existing paths. Rolling back to the previous web build preserves the additive Pipeline data.

## Candidate checks

Open a fictional EX-101 workspace in a fresh chat. The first scoped question opens it once. Follow up in text, add a record, define and link custom tables as the owner, archive and restore a field with a dependent view, and reopen the same saved view through the web link. Test the free personal workflow on both surfaces, an authorized invitation with a controlled team account, and an unavailable invitation without a billing redirect. Confirm that a reader cannot replay a previous write after revocation.

Authored views load the Pipeline-owned renderer on demand. The parent sanitizes content and passes it into an opaque-origin sandbox. Its fixed script supports local interactive controls and explicit version-checked saves. Content never needs to be included in a renderer URL. Listings, a real ChatGPT session, staging latency and review access should be checked on the chosen deployment before submission.

The existing Claude plugin material is retained. This release changes the ChatGPT MCP path. Review packaging is a separate manual action.
