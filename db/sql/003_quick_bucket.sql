-- Adds the "quick" bucket: scratch capture, categorised later.
-- Applied manually, like the others.

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_bucket_check;

ALTER TABLE items ADD CONSTRAINT items_bucket_check CHECK (bucket IN (
    'quick', 'inbox', 'next', 'waiting', 'scheduled', 'someday', 'reference', 'done', 'trash'
));
