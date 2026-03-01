
DO
$do$
BEGIN

  -- A few conventions:
  -- Certain column names have specific meaning
  --  id - of course, this is the primary key. Always a SERIAL, never null.
  --  name - [a-z][a-z\-]
  --  title - a user-friendly name in American English. If a translation is
  --          not available, this can be used.

    -- DROP TABLE IF EXISTS article_tag;
    -- DROP TABLE IF EXISTS tags;
    -- DROP TABLE IF EXISTS content_types;
    -- ALTER TABLE permalinks DROP COLUMN article_id;
    -- DROP TABLE IF EXISTS articles;
    -- DROP TABLE IF EXISTS permalinks;
    -- DROP TABLE IF EXISTS people;
    -- DROP TABLE IF EXISTS authservices;

    -- auth
    CREATE TABLE realm (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    -- people
    CREATE TABLE people (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL,
      displayname TEXT NOT NULL,
      realm_id INTEGER NOT NULL REFERENCES realm,
      isAuthor BOOLEAN NOT NULL DEFAULT FALSE,
      info JSON
    );

    -- content-related

    CREATE TABLE permalinks (
      id SERIAL PRIMARY KEY,
      -- article_id added later in B20-relations.sql
      name TEXT NOT NULL
    );

    CREATE TABLE articles (
      id SERIAL PRIMARY KEY,
      author_id INTEGER NOT NULL REFERENCES people,
      -- date the post is to be made active. If it's null, it's not active.
      active_dt TIMESTAMP DEFAULT NOW(),
      -- it's possible that the last_update can be before the active_dt, in
      -- which case it should not be displayed on the screen.
      last_update TIMESTAMP NOT NULL DEFAULT NOW(),
      content_type_id INTEGER NOT NULL,
      title TEXT,
      uuid TEXT NOT NULL,
      primary_permalink_id INTEGER REFERENCES permalinks,
      -- content of this info field is determined by the content_type_id
      info JSON NOT NULL
    );

    CREATE TABLE content_types (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE tags (
      id SERIAL PRIMARY KEY,
      -- this is a calculated value
      color TEXT,
      important BOOLEAN NOT NULL DEFAULT false,
      seq INTEGER,
      num_articles INTEGER,
      title TEXT NOT NULL UNIQUE
    );

    CREATE TABLE article_tag (
      tag_id INTEGER NOT NULL REFERENCES tags,
      article_id INTEGER NOT NULL REFERENCES articles
    );

END
$do$;
