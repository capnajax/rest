
DO
$do$
BEGIN

  UPDATE db_properties SET value = '1.3.0' WHERE name='schema_version';

END
$do$;
