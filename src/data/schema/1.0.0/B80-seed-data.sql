
DO
$do$
BEGIN

    INSERT INTO byline (person_id, name, sequence, text)
    SELECT
        id,
        'experience',
        1,
        'Thomas Wilkinson has over 25 years of professional experience in platforms ranging from mobile devices to big iron.'
    FROM people WHERE username = 'thomas';

END
$do$;
