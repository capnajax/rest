
DO
$do$
BEGIN

    ALTER TABLE permalinks
      ADD COLUMN article_id INTEGER NOT NULL REFERENCES articles;

END
$do$;
