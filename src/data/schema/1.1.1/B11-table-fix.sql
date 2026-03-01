DO
$do$
BEGIN

  ALTER TABLE IF EXISTS byline RENAME TO bylines;
  ALTER TABLE IF EXISTS realm RENAME TO realms;

END
$do$;
