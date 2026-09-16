-- Initial schema. Applied manually (see README), per Waltz DDL conventions:
-- the Drizzle schema files mirror the live database rather than generating it.

CREATE TABLE IF NOT EXISTS items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    title        text        NOT NULL DEFAULT '',
    body         text        NOT NULL DEFAULT '',
    kind         text        NOT NULL DEFAULT 'note',
    bucket       text        NOT NULL DEFAULT 'inbox',
    contexts     text[]      NOT NULL DEFAULT '{}',
    project_id   uuid        REFERENCES items (id) ON DELETE SET NULL,
    due_date     timestamptz,
    defer_date   timestamptz,
    energy       text,
    waiting_on   text,
    pinned       boolean     NOT NULL DEFAULT false,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    deleted_at   timestamptz,

    CONSTRAINT items_kind_check   CHECK (kind IN ('note', 'action', 'project')),
    CONSTRAINT items_bucket_check CHECK (bucket IN (
        'inbox', 'next', 'waiting', 'scheduled', 'someday', 'reference', 'done', 'trash'
    )),
    CONSTRAINT items_energy_check CHECK (energy IS NULL OR energy IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS items_bucket_idx     ON items (bucket);
CREATE INDEX IF NOT EXISTS items_updated_at_idx ON items (updated_at);
CREATE INDEX IF NOT EXISTS items_project_id_idx ON items (project_id);
