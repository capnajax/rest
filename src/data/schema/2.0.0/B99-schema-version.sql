
DO
$do$
BEGIN

  UPDATE db_properties SET value = '2.0.0' WHERE name='schema_version';

END
$do$;
