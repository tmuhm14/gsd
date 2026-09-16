-- Sync support. Applied manually, like 001.

-- Monotonic write counter, used as the sync cursor.
--
-- Deliberately NOT a timestamp: two clients whose clocks disagree by even a
-- second would silently skip rows at the cursor boundary. A sequence is
-- assigned by one authority (the database) and only ever moves forward.
CREATE SEQUENCE IF NOT EXISTS items_server_seq;

ALTER TABLE items
    ADD COLUMN IF NOT EXISTS server_seq bigint NOT NULL DEFAULT nextval('items_server_seq');

-- A trigger rather than setting it in each query: every write must bump the
-- sequence, and a code path that forgets would make rows invisible to sync.
CREATE OR REPLACE FUNCTION items_bump_server_seq() RETURNS trigger AS $$
BEGIN
    NEW.server_seq := nextval('items_server_seq');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS items_server_seq_trg ON items;
CREATE TRIGGER items_server_seq_trg
    BEFORE INSERT OR UPDATE ON items
    FOR EACH ROW EXECUTE FUNCTION items_bump_server_seq();

CREATE INDEX IF NOT EXISTS items_server_seq_idx ON items (server_seq);
