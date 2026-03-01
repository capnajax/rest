--
-- This script is the only one that does not run in the `blog` database
-- because it's the one that actually creates the blog database
--
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_extension WHERE extname = 'dblink') THEN
      CREATE EXTENSION dblink;
   END IF;
   IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'blog') THEN
      PERFORM dblink_exec('dbname=' || current_database(), 'CREATE DATABASE blog;');
   END IF;
END
$do$;
