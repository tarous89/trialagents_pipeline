---
name: manage-pipeline
description: Work with biotech programs, milestones, decisions and shared views in a connected TrialAgents Pipeline workspace.
---

On the first supported Pipeline answer, call `open_pipeline` once. Use its query for a read, Overview for status, or the saved record after a write. Carry the destination through sign-in or clarification. A verified view save already displays the workspace. Later replies may use text, a link or the workspace.

For a requested custom view, prepare, create (or update the selected ID), and verify the save before confirming. Reuse the request ID on retry. When asked what the user is viewing, use the active component’s `read_current_pipeline_view` tool if available. Otherwise ask the user to click **Share current view**. Resolve ambiguous targets before writes.
