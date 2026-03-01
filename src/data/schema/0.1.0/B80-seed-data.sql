
DO
$do$
BEGIN

    INSERT INTO realm (name) VALUES ('local');
    INSERT INTO people (username, displayname, realm_id, isAuthor)
        SELECT 'thomas', 'Thomas D Wilkinson', realm.id, TRUE
            FROM realm WHERE realm.name = 'local';

    INSERT INTO tags (color, important, seq, title) VALUES
        ('#159DBE', true, 1, 'IBM API Connect');
    INSERT INTO tags (color, important, seq, title) VALUES
        ('#C22544', true, 2, 'Linux');
    INSERT INTO tags (color, important, seq, title) VALUES
        ('#FFCC32', true, 3, 'JavaScript');
    INSERT INTO tags (color, important, seq, title) VALUES
        ('#193380', true, 4, 'Kubernetes');

END
$do$;
