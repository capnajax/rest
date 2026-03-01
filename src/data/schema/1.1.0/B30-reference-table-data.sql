
DO
$do$
BEGIN

	-- new form factors -- so some things will appear in a small box instead
	-- of full-width

	-- added content types 'rocket' (akin to a tweet) and 'link' (link out)
	-- removed all content types that aren't being supported yet

	CREATE TABLE form_factors (
		id SERIAL PRIMARY KEY,
		name TEXT NOT NULL
	);

	INSERT INTO form_factors (name) VALUES ('mini');
	INSERT INTO form_factors (name) VALUES ('feature');

	ALTER TABLE content_types ADD COLUMN form_factor_id INTEGER REFERENCES form_factors;
	UPDATE content_types SET form_factor_id = ( SELECT id FROM form_factors WHERE name = 'feature' );
	ALTER TABLE content_types ALTER COLUMN form_factor_id SET NOT NULL;

	INSERT INTO content_types ( name, form_factor_id )
		SELECT 'rocket' AS name, ff.id AS form_factor_id
		FROM form_factors AS ff
		WHERE ff.name = 'mini';

	DELETE FROM content_types WHERE name = 'script';
	DELETE FROM content_types WHERE name = 'short';
	DELETE FROM content_types WHERE name = 'tool';
	DELETE FROM content_types WHERE name = 'tweet';

END
$do$;
