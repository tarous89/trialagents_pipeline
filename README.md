# TrialAgents Pipeline

This repository owns the Pipeline web application, PostgreSQL schema, ChatGPT MCP server, interactive workspace, plugin manifest, onboarding skill and artwork. Pipeline runs on the existing TrialAgents Render web service and uses the existing application database. Its ChatGPT tools call the same workspace store as the browser inside the same Node process.

| Component | Source |
| --- | --- |
| Web application and saved-view renderer | [app/web](app/web) |
| Workspace database, permissions, queries and writes | [app/server](app/server) |
| ChatGPT Streamable HTTP server and tool contracts | [mcp](mcp) |
| ChatGPT manifest, connection and skill | [plugins/chatgpt](plugins/chatgpt) |
| Integration with the shared web host and account system | [integration/shared-web](integration/shared-web) |
| Build, verification and deployment routing | [docs/RELEASE.md](docs/RELEASE.md) |

Individual workspaces support the full planning, customization and saved-view workflow. Team invitations require an eligible workspace owner. The ChatGPT workspace opens the current record, tab or saved view through **Open TrialAgents app**. Billing belongs to the independently opened website.

Use Node 24. Run `npm ci` followed by `npm test`. CI builds the application and exercises the database, MCP transport and browser experiences. Directory packaging is a separate release action.
