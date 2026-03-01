
DO
$do$
BEGIN

  UPDATE db_properties SET value = '1.1.0' WHERE name='schema_version';

END
$do$;
