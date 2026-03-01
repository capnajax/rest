DO
$do$
BEGIN

  CREATE TABLE IF NOT EXISTS analytics_records (
    id SERIAL PRIMARY KEY,
    date TIMESTAMP NOT NULL DEFAULT NOW(),
    ip TEXT,
    cookie TEXT,
    method TEXT NOT NULL,
    pathname TEXT NOT NULL,
    url TEXT,
    request_headers JSON,
    response_headers JSON,
    status_code TEXT,
    latency_ms INTEGER
  );

  CREATE TABLE IF NOT EXISTS article_attachments (
    id SERIAL PRIMARY KEY,
    article_id INTEGER NOT NULL REFERENCES articles,
    media_id INTEGER NOT NULL REFERENCES media
  );

  CREATE TABLE IF NOT EXISTS byline (
    id SERIAL PRIMARY KEY,
    person_id INTEGER NOT NULL REFERENCES people,
    name TEXT NOT NULL,
    sequence INTEGER,
    text TEXT NOT NULL
  );

  ALTER TABLE articles ADD COLUMN IF NOT EXISTS byline_id INTEGER REFERENCES byline;
  ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;
  ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false;

END
$do$;