DO
$do$
BEGIN

  CREATE TABLE media (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles,
    filename TEXT NOT NULL,
    last_update TIMESTAMP NOT NULL DEFAULT NOW(),
    data_b64 TEXT NOT NULL
  );
  CREATE INDEX media_articles ON media (article_id);

END
$do$;
