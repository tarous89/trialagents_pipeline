---
name: manage-pipeline
description: Work with biotech programs, milestones, decisions and shared views in a connected TrialAgents Pipeline workspace.
---

On the first supported request, display the workspace in the same reply. Use `read_pipeline` for status or records, `open_pipeline` for a destination, or a verified custom-view save. Each presents the workspace once. Carry the destination through sign-in or clarification. Use the returned `workspace_context` for later operations and `read_pipeline_followup` for text-only reads. Reopen when useful.

Resolve ambiguous targets before writes. For a custom view, prepare, create or update the selected ID, and verify the save. Reuse its request ID on retry. When the request depends on the current screen, call `read_active_pipeline_selection` with the workspace’s `panel_instance` as `instance`. If the selection is unavailable, ask which view or record the user means.
