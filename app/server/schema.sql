CREATE SCHEMA IF NOT EXISTS pipeline;
CREATE TABLE IF NOT EXISTS pipeline.workspace (
 id uuid PRIMARY KEY, owner_id text UNIQUE NOT NULL, title text NOT NULL, revision integer NOT NULL DEFAULT 0,
 settings jsonb NOT NULL DEFAULT '{}', tabs jsonb NOT NULL DEFAULT '[]', accent text NOT NULL DEFAULT '#14644e',
 stripe_mode text, customer text, subscription text, paid_until timestamptz, suspended boolean NOT NULL DEFAULT false,
 UNIQUE(stripe_mode,customer), UNIQUE(stripe_mode,subscription)
);
CREATE TABLE IF NOT EXISTS pipeline.member (
 workspace_id uuid REFERENCES pipeline.workspace ON DELETE CASCADE,
 user_id text NOT NULL, email text NOT NULL, display_name text NOT NULL,
 role text NOT NULL CHECK(role IN ('owner','editor','reader')), preferences jsonb NOT NULL DEFAULT '{}',
 PRIMARY KEY(workspace_id,user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_single_owner ON pipeline.member(workspace_id) WHERE role='owner';
CREATE INDEX IF NOT EXISTS pipeline_user_memberships ON pipeline.member(user_id,workspace_id);
CREATE TABLE IF NOT EXISTS pipeline.item (
 workspace_id uuid REFERENCES pipeline.workspace ON DELETE CASCADE, id text NOT NULL, kind text NOT NULL,
 body jsonb NOT NULL, PRIMARY KEY(workspace_id,id)
);
CREATE TABLE IF NOT EXISTS pipeline.view (
 workspace_id uuid REFERENCES pipeline.workspace ON DELETE CASCADE, id uuid NOT NULL, author text NOT NULL,
 author_name text NOT NULL, title text NOT NULL, filters jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,id)
);
CREATE TABLE IF NOT EXISTS pipeline.invitation (
 id uuid PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES pipeline.workspace ON DELETE CASCADE, email text NOT NULL,
 role text NOT NULL CHECK(role IN ('editor','reader')), digest text NOT NULL UNIQUE, expires timestamptz NOT NULL,
 UNIQUE(workspace_id,email)
);
CREATE TABLE IF NOT EXISTS pipeline.audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, workspace_id uuid NOT NULL REFERENCES pipeline.workspace ON DELETE CASCADE,
 actor text NOT NULL, actor_name text NOT NULL, source text NOT NULL, action text NOT NULL, target text,
 details jsonb NOT NULL, happened_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipeline_audit_page ON pipeline.audit(workspace_id,id DESC);
CREATE TABLE IF NOT EXISTS pipeline.receipt (
 workspace_id uuid REFERENCES pipeline.workspace ON DELETE CASCADE, actor text NOT NULL, key uuid NOT NULL,
 digest text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(workspace_id,actor,key)
);
CREATE TABLE IF NOT EXISTS pipeline.stripe_event (mode text NOT NULL, id text NOT NULL, PRIMARY KEY(mode,id));
CREATE TABLE IF NOT EXISTS pipeline.mail (
 id uuid PRIMARY KEY, workspace_id uuid REFERENCES pipeline.workspace ON DELETE CASCADE,
 recipient text NOT NULL, subject text NOT NULL, message text NOT NULL, dedupe text UNIQUE NOT NULL,
 invitation_id uuid REFERENCES pipeline.invitation ON DELETE CASCADE, category text, due_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0, sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS pipeline_due_mail ON pipeline.mail(due_at) WHERE sent_at IS NULL;
ALTER TABLE pipeline.workspace ADD COLUMN IF NOT EXISTS checkout text;
CREATE TABLE IF NOT EXISTS pipeline.file (
 workspace_id uuid NOT NULL, item_id text NOT NULL, id text NOT NULL, content text NOT NULL,
 PRIMARY KEY(workspace_id,item_id,id), FOREIGN KEY(workspace_id,item_id) REFERENCES pipeline.item(workspace_id,id) ON DELETE CASCADE
);
ALTER TABLE pipeline.view ADD COLUMN IF NOT EXISTS chart text NOT NULL DEFAULT '';
