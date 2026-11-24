---
name: manage-pipeline
description: Work with biotech programs, milestones, decisions and shared views in a connected TrialAgents Pipeline workspace. Use whenever the user mentions TrialAgents Pipeline, their pipeline workspace, or asks to view, add or change programs, milestones, activities, deliverables, changes, dependencies or custom views there.
---

On the first supported request, display the workspace in the same reply. Use `read_pipeline` for status or records, `open_pipeline` for a destination, or a verified custom-view save. Each presents the workspace once. Carry the destination through sign-in or clarification. Use the returned `workspace_context` for later operations and `read_pipeline_followup` for text-only reads. Reopen when useful.

Where Claude renders MCP Apps (Claude web, desktop and mobile), the workspace appears inline in the conversation. Where it does not (for example Claude Code), answer in text from the returned records and give the workspace link returned by the tool. Never construct or guess a link or ID.

Resolve ambiguous targets before writes. For a custom view, prepare, create or update the selected ID, and verify the save. Reuse its request ID on retry. When the request depends on the current screen, call `read_active_pipeline_selection` with the workspace’s `panel_instance` as `instance`. If the selection is unavailable, or Claude is not showing the workspace inline, ask which view or record the user means.
