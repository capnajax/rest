DO $$
DECLARE
  schema_version INTEGER;
BEGIN
  IF NOT EXISTS (
   SELECT FROM information_schema.tables WHERE table_name = 'db_properties'
   ) THEN
    -- not exposed in graphql
    CREATE TABLE db_properties (
      id SERIAL PRIMARY KEY,      
      name TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL
    );
    CREATE INDEX db_properties_idx ON db_properties USING HASH(name);
    INSERT INTO db_properties (name, value) VALUES ('schema_version', '0.0.0');
  END IF;

END
$$;
