DO
$do$
BEGIN

  -- Preserve the rows while rebuilding the table in the desired column order.
  LOCK TABLE people, articles, bylines IN ACCESS EXCLUSIVE MODE;
  CREATE TEMP TABLE people_transition ON COMMIT DROP AS
    SELECT id, realm_id, username, displayname, info FROM people;

  -- Remove incoming references before replacing the table.
  ALTER TABLE articles DROP CONSTRAINT articles_author_id_fkey;
  ALTER TABLE bylines DROP CONSTRAINT byline_person_id_fkey;
  DROP TABLE people;

  CREATE TABLE people (
    id SERIAL PRIMARY KEY,
    realm_id INTEGER NOT NULL REFERENCES realms,
    username TEXT NOT NULL,
    shortname TEXT NOT NULL,
    fullname TEXT NOT NULL,
    info JSON
  );

  INSERT INTO people (id, realm_id, username, shortname, fullname, info)
  SELECT id, realm_id, username,
    COALESCE(substring(displayname FROM '[^[:space:]]+'), ''),
    displayname, info
  FROM people_transition;

  -- Resume generated IDs after the restored rows, including an empty table.
  PERFORM setval(
    pg_get_serial_sequence('people', 'id'),
    COALESCE(MAX(id), 1),
    MAX(id) IS NOT NULL
  ) FROM people;

  ALTER TABLE articles ADD CONSTRAINT articles_author_id_fkey
    FOREIGN KEY (author_id) REFERENCES people;
  ALTER TABLE bylines ADD CONSTRAINT byline_person_id_fkey
    FOREIGN KEY (person_id) REFERENCES people;

END
$do$;
