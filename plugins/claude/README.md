# TrialAgents Pipeline for Claude

Manage your biotech pipeline from Claude. TrialAgents Pipeline keeps your programs, milestones, activities, deliverables, decisions and changes in one shared workspace, and this plugin lets you read and update it in plain language.

## What you can do

- **Check status.** Ask "What's the status of EX-101?" or "What's our next milestone?" and get an answer from your live workspace.
- **Add and update records.** Create a milestone, move a deadline, assign an owner or log a change without leaving the conversation.
- **Shape your workspace.** Workspace owners can add custom tables, columns and relationships, and adjust the workspace design.
- **Build custom views.** Ask Claude to create a report, timeline or dashboard, save it to the workspace, and reopen it later in Claude or on the web.

In Claude on the web, desktop and mobile, the workspace opens inline in the conversation. In Claude Code, Claude answers in text and gives you a link to the workspace.

## Getting started

1. Install the plugin from the Claude directory, or in Claude Code run:

   ```
   /plugin install trialagents-pipeline --marketplace tarous89/trialagents_pipeline
   ```

   Then start a conversation about your pipeline.
2. When asked, sign in with your TrialAgents account (or create one) and approve the connection.
3. A personal workspace is ready on first sign-in. All individual workspace features are free. Team invitations require an eligible workspace owner.

## Permissions

Pipeline checks your workspace role on every request:

- **Readers** can open the workspace and read shared data.
- **Editors** can also create, update and delete records and custom views.
- **Owners** can also change the workspace structure and design.

Claude asks for your approval before any change. Reads never change data. Some changes, such as a new assignment or deadline, can email workspace members according to their notification preferences, and an email cannot be recalled once sent. Every change made through Claude is recorded as Claude in the workspace's audit history.

## Privacy and data

Pipeline stores operational business records only. Do not enter patient-level health data. Your data stays in your TrialAgents workspace and is used only to provide the service. See the [privacy policy](https://pipeline.trialagents.com/pipeline-info/privacy) and [terms](https://pipeline.trialagents.com/pipeline-info/terms).

## Help

- Setup, permissions and troubleshooting: https://pipeline.trialagents.com/pipeline-info/connectors
- Support: https://pipeline.trialagents.com/pipeline-info/support
- About: https://pipeline.trialagents.com/pipeline-info/about

Published by Atlas Consulting. Contact: contact@trialagents.com
