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
CREATE TABLE IF NOT EXISTS pipeline.accepted_invitation (
 digest text PRIMARY KEY, workspace_id uuid REFERENCES pipeline.workspace ON DELETE CASCADE,
 user_id text NOT NULL, expires timestamptz NOT NULL
);
ALTER TABLE pipeline.view ADD COLUMN IF NOT EXISTS presentation text NOT NULL DEFAULT '';

-- Only the workspace initializer can confer example status. Existing rows are user data.
ALTER TABLE pipeline.item ADD COLUMN IF NOT EXISTS is_example boolean NOT NULL DEFAULT false;

-- Business definitions are versioned with their workspace; system tables are never exposed.
ALTER TABLE pipeline.workspace ADD COLUMN IF NOT EXISTS catalog jsonb NOT NULL DEFAULT '[]';
CREATE TABLE IF NOT EXISTS pipeline.data_row (
 workspace_id uuid NOT NULL REFERENCES pipeline.workspace(id), table_id text NOT NULL,
 id text NOT NULL, values_json jsonb NOT NULL, PRIMARY KEY(workspace_id,table_id,id)
);
CREATE TABLE IF NOT EXISTS pipeline.link (
 workspace_id uuid NOT NULL REFERENCES pipeline.workspace(id), relation_id uuid NOT NULL,
 from_table text NOT NULL, from_id text NOT NULL, to_table text NOT NULL, to_id text NOT NULL,
 PRIMARY KEY(workspace_id,relation_id,from_id,to_id)
);
CREATE INDEX IF NOT EXISTS pipeline_link_target ON pipeline.link(workspace_id,relation_id,to_id);
CREATE INDEX IF NOT EXISTS pipeline_item_kind ON pipeline.item(workspace_id,kind,id);
ALTER TABLE pipeline.view ADD COLUMN IF NOT EXISTS spec jsonb;
ALTER TABLE pipeline.view ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE pipeline.view ADD COLUMN IF NOT EXISTS form_state jsonb NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION pipeline.clean_business_links() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 DELETE FROM pipeline.link WHERE workspace_id=OLD.workspace_id AND
 ((from_table=OLD.kind AND from_id=OLD.id) OR (to_table=OLD.kind AND to_id=OLD.id));
 DELETE FROM pipeline.data_row WHERE workspace_id=OLD.workspace_id AND table_id=OLD.kind AND id=OLD.id;
 RETURN OLD;
END $$;
DROP TRIGGER IF EXISTS clean_business_links ON pipeline.item;
CREATE TRIGGER clean_business_links AFTER DELETE ON pipeline.item FOR EACH ROW EXECUTE FUNCTION pipeline.clean_business_links();
CREATE TABLE IF NOT EXISTS pipeline.view_draft (
 workspace_id uuid REFERENCES pipeline.workspace(id) ON DELETE CASCADE,actor text NOT NULL,id uuid NOT NULL,
 payload jsonb NOT NULL, digest text NOT NULL,expires timestamptz NOT NULL DEFAULT now()+interval '1 day',
 PRIMARY KEY(workspace_id,actor,id)
);
