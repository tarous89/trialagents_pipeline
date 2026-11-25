---
name: manage-pipeline
description: Work with biotech programs, milestones, decisions and shared views in a connected TrialAgents Pipeline workspace.
---

On the first supported request, display the workspace in the same reply. Use `read_pipeline` for status or records, `open_pipeline` for a destination, or a verified custom-view save. Each presents the workspace once. Carry the destination through sign-in or clarification. Use the returned `workspace_context` for later operations and `read_pipeline_followup` for text-only reads. Reopen when useful.

Resolve ambiguous targets before writes. For a custom view, prepare, create or update the selected ID, and verify the save. Reuse its request ID on retry. When the request depends on the current screen, call `read_active_pipeline_selection` with the workspace’s `panel_instance` as `instance`. If the selection is unavailable, ask which view or record the user means.

Readers can explore records and shared views. Editors and owners can edit records and custom views. Only workspace owners can customize tables, fields, relationships and navigation. Describe these as workspace capabilities. ChatGPT decides when to ask for approval under the account and workspace settings.

Creating or updating a built-in record can email workspace members about assignments, deadlines or linked events, subject to their notification preferences. An eligible owner can send a team invitation from the workspace invitation form.
