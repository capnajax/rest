# Database documents

This sets up the databases for the blog app

## `.sql` files

These files have a specific naming convention: `<version>/<db><sequence>-<purpose>.sql`. 

The `version` is a folder with a three-digit version number that must parse to an integer. The versions are applied in order.

The `db` is identified by a single letter. Currently all SQL files except one are identified by `A` or `L` for the `assets` and `language` databases respectively. The other file, identified by `R` for `root`, is needed to create the other databases.

The `sequence` number defines the order in which each databases's files are loaded to the database. There is also a special `XX` sequence number that is intended for loading test data.

### Schema version number

The first field is the schema version number, two digits, zero-padded on the left. Besides the `000` version, which is loaded before the `config` table exists, the number must match the schema version as listed in the `config` table in the database. The `schema_version` number listed each database is not zero-padded.

```sql
SELECT value INTO schema_version FROM db_properties WHERE name = 'schema_version';
```

Each script should check the `schema_version` before running.

```sql
DO
$do$
DECLARE
  schema_version INTEGER;
BEGIN
  RAISE NOTICE 'Executing <filename>.sql';

  SELECT value INTO schema_version FROM db_properties WHERE name = 'schema_version';
    IF schema_version < 1 THEN -- of course, use your version number here

      -- do your stuff here


    END IF;
END
$do$;
```

### Purpose

The third field is to describe the purpose of the file and is a free-form english word.

## Metadata JSON

For each version, there is a metadata file used to describe to the graphQL server how to interpret the schema. Only the most recent metadata file needs to be applied. It should be called `<version>/hasura-metadata.json` where the version matches that of the SQL files. It is loaded after all the data is loaded.

The metadata file is applied after all the `.sql` files have been loaded

## Data load

Each version/database may also have a set of `.js` files that contain some initial data. The files have the same naming convention as the `.sql` files.

## Migrations

Ideally data should be migrated from version to version using PL/pgSQL scripts, included in this hierarchy. GraphQL metadata cannot be loaded during the data load so GraphQL is not available. These are loaded after the GraphQL metadata is loaded and depend on functions defined in `bulkLoad.graphql` in the `assets-common` project.

## Other files

Anything that is not an `*.sql`, `*.js` or `hasura-metadata.json` file is ignored and (besides this `README.md`) will cause a warning message in the logs.
