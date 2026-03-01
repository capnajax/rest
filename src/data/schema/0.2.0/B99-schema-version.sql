
DO
$do$
BEGIN

  UPDATE db_properties SET value = '0.2.0' WHERE name='schema_version';

END
$do$;
