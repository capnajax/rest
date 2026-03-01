
DO
$do$
BEGIN

    INSERT INTO content_types (name) VALUES ('article');
    INSERT INTO content_types (name) VALUES ('cheat');
    INSERT INTO content_types (name) VALUES ('link');
    INSERT INTO content_types (name) VALUES ('script');
    INSERT INTO content_types (name) VALUES ('short');
    INSERT INTO content_types (name) VALUES ('tool');
    INSERT INTO content_types (name) VALUES ('tweet');

END
$do$;
