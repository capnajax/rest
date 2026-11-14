DO
$do$
BEGIN

  -- Preserve the rows while rebuilding the table in the desired column order.
  LOCK TABLE media IN ACCESS EXCLUSIVE MODE;
  CREATE TEMP TABLE media_transition ON COMMIT DROP AS
    SELECT id, article_id, filename, last_update, data_b64 FROM media;

  DROP TABLE media;

  CREATE TABLE media (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles,
    -- if left null, will not show as an attachment
    attachment_num INTEGER,
    filename TEXT NOT NULL,
    mime_type TEXT,
    last_update TIMESTAMP NOT NULL DEFAULT NOW(),
    metadata JSON CONSTRAINT media_metadata_check CHECK (
      metadata IS NULL OR (
        json_typeof(metadata) = 'object' AND
        json_typeof(metadata -> 'caption') IS NULL OR (
          json_typeof(metadata -> 'caption') = 'object' AND
          json_typeof(metadata -> 'caption' -> 'type') = 'string' AND
          metadata -> 'caption' ->> 'type' IN (
            'plain text', 'markdown', 'html fragment'
          ) AND
          json_typeof(metadata -> 'caption' -> 'text') = 'string'
        ) IS TRUE
      ) IS TRUE
    ),
    data_b64 TEXT NOT NULL
  );

  INSERT INTO media
    ( id, article_id, filename, last_update, data_b64 )
  SELECT id, article_id, filename, last_update, data_b64
    FROM media_transition;

  -- Resume generated IDs after the restored rows, including an empty table.
  PERFORM setval(
    pg_get_serial_sequence('media', 'id'),
    COALESCE(MAX(id), 1),
    MAX(id) IS NOT NULL
  ) FROM media;

  CREATE INDEX media_articles ON media (article_id);

END
$do$;
