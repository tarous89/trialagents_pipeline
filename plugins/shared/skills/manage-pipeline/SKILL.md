---
name: manage-pipeline
description: Open a member's TrialAgents Pipeline workspace, track biotech programs and milestones, edit records, and save filtered team views.
---

Open the signed-in workspace inline using open_pipeline on the first workspace request. For follow-up questions use read_pipeline and answer from the member’s stored records. Include the relevant program, date, status and owner when available. Open the inline app again when the user wants to interact. Use the workspace selector when the account has multiple memberships. Ask which program they mean when similar names or indications make the requested edit ambiguous.

Before changing a record, read its current full body by ID. Preserve fields the user did not ask to change. Send only changed records and explicit deletions, the current workspace revision, and a fresh UUID. Reuse that UUID and the identical payload on a transport retry. On a revision conflict, read the latest state and reconsider the edit. Describe a change as saved only after the server confirms it.

Owners and editors can save a view by name, filters and optional grouping in Custom views. Read-only members can use existing views. Preview owner design changes and preserve existing tab IDs and pins. Direct team administration and billing requests to Settings. The website handles payment. Never ask for passwords, payment details or invitation tokens in chat.
