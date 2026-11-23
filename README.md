# TrialAgents Pipeline

Plan biotech programs, milestones, activities, decisions, deliverables, risks and changes in the browser or inside an assistant. Pipeline targets **pipeline.trialagents.com** and reuses TrialAgents Intel accounts, its existing Render web and MCP services, and its control database.

Individual workspaces are free. Pipeline Team costs **US$49 per workspace per month for unlimited seats**. The owner manages team access, billing and app appearance. Editors can manage records and publish custom views. Read-only members can explore the whole workspace and set their own preferences.

## Release candidate

| Deliverable | Location |
| --- | --- |
| Web application, data model and permissions | [Editable production source](https://github.com/tarous89/intel_agent_app/tree/feat/pipeline-standalone-release/products/pipeline) · [Intel web integration PR #342](https://github.com/tarous89/intel_agent_app/pull/342) |
| Inline ChatGPT and Claude workspaces | [MCP source](https://github.com/tarous89/intel_mcp/blob/feat/pipeline-standalone-release/src/intel_mcp/pipeline.py) · [Intel MCP integration PR #167](https://github.com/tarous89/intel_mcp/pull/167) |
| Plugin listings, assistant guidance and reproducible packages | [Plugin sources](plugins) · [Build and release instructions](docs/RELEASE.md) |
| Original approved app and complete workflow description | [Original Pipeline HTML](prototypes/pipeline/Pipeline.html) · [Capabilities and workflows](prototypes/pipeline/README.md) |
| Product and visual references | [Scope](docs/IMPLEMENTATION.md) · [Intel source map](docs/SOURCES.md) · [Fictional, locally editable design preview](preview/Pipeline.html) |

In the production source directory linked above, use Node 24 and run `npm ci`, then `npm test` to build both surfaces and exercise the workspace in Chromium and a disposable PostgreSQL-compatible database. From this repository, run `python scripts/package-plugins.py /path/to/intel_mcp` to generate the two plugin ZIPs in `dist/`. The package workflow attaches those ZIPs to its GitHub Actions run. The private web integration runs the application tests and captures browser screenshots. The original preview remains available for design reference.

Deploy the web integration first. Verify the app, payment and account lifecycle in staging before enabling the two assistant routes. The shared services, production domain and directory releases each have separate activation steps.
