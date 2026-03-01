
DO
$do$
BEGIN

  UPDATE db_properties SET value = '1.1.1' WHERE name='schema_version';

END
$do$;
