# ORM Code Generator

Reads the live PostgreSQL schema and generates typed row base classes for every table. Run it after any schema change.

---

## Quick start

1. Set `DATABASE_URL` in your environment (same value used by the application).
2. Copy and fill in `orm.config.yaml` at the project root (see [Configuration](#configuration) below).
3. Run:

```bash
npm run generate
```

Generated files are written to `src/data/generated/`. Commit them alongside your schema migrations.

---

## What gets generated

For each table in the `public` schema the generator produces a single file:

**`_<table-name>-row-base.ts`** — never edit this file.

- A `<Table>Schema` interface with all column types.
- A `_<Table>RowBase` class extending either `MutableRow` or `ImmutableRow`.
- Static `columnSets` (`summary`, `simple`, `all`) derived from the schema.
- Static `relationshipDefs` from `orm.config.yaml`.
- `loadSummary()`, `loadSimple()`, `loadAll()` instance methods.
- Static `findById()` and `findByName()` factory methods (mutable tables only).
- A `registerRow()` or `ReferenceData.register()` call at the bottom.

A barrel `index.ts` is also written that re-exports every generated class. Import it once at startup so all registrations run before any queries execute.

---

## Configuration

`orm.config.yaml` lives at the project root. All sections are optional; the generator works with an empty config but produces no relationships or reference-table treatment.

### Reference tables

Tables that are small, immutable, and loaded once at startup. They generate `ImmutableRow` subclasses with no `save()` or `delete()`.

```yaml
referenceTables:
  - statuses
  - media_types
  - categories
```

### Link tables

Junction/bridge tables for many-to-many relationships. They are used inside generated JOIN queries but no row class is generated for them — they are transparent to application code.

```yaml
linkTables:
  - article_tags
  - article_categories
```

### Relationships

Declares which array relationships appear on a table's row class and which load method includes them.

```yaml
relationships:
  articles:
    - name: tags              # Property name on ArticleRow
      kind: link              # Many-to-many via a link table
      linkTable: article_tags
      sourceFk: article_id    # FK pointing to the parent (articles)
      targetFk: tag_id        # FK pointing to the related row (tags)
      targetTable: tags
      loadWith: simple        # Loaded by loadSimple() and loadAll()

    - name: comments
      kind: direct            # One-to-many via FK on the target table
      foreignKey: article_id  # FK on comments pointing to articles
      targetTable: comments
      loadWith: simple

    - name: attachments       # Heavy data — only load when explicitly needed
      kind: direct
      foreignKey: article_id
      targetTable: media
      loadWith: all           # Loaded only by loadAll()
```

**`loadWith` values:**

| Value | Included in |
| --- | --- |
| `simple` | `loadSimple()` and `loadAll()` |
| `all` | `loadAll()` only |

`loadSummary()` never loads any relationships.

### Output directory

```yaml
output:
  directory: src/data/generated   # default
```

---

## Column set rules

The generator derives `summary` and `simple`/`all` column sets automatically:

- **`summary`** — the intersection of `['id', 'name', 'title', 'created_at']` with the table's actual columns. Fixed by convention; not configurable.
- **`simple`** — all scalar columns on the table.
- **`all`** — same scalar columns as `simple` (relationship loading, not additional columns, is what distinguishes `loadAll()` from `loadSimple()`).

---

## PostgreSQL → TypeScript type mapping

| PostgreSQL type | TypeScript type |
| --- | --- |
| `integer`, `serial`, `bigint`, `numeric`, `real`, … | `number` |
| `text`, `varchar`, `uuid`, `citext`, … | `string` |
| `boolean` | `boolean` |
| `timestamp`, `date`, `time` | `Date` |
| `json`, `jsonb` | `Record<string, unknown>` |
| `bytea` | `Buffer` |
| `ARRAY` (any element type) | `string[]` / `number[]` / `unknown[]` |
| user-defined / enum | `string` (narrow in your extension class) |

Nullable columns are typed as `T | null`.

---

## Extending generated classes

Generated files are overwritten on every `npm run generate`. To add domain-specific behaviour, create an extension class that the rest of the application uses:

```text
src/data/
  generated/             ← generated, never edited
    _article-row-base.ts
    _tag-row-base.ts
    index.ts             ← barrel, import at startup
  tables/                ← hand-maintained extensions
    article-row.ts
    tag-row.ts
```

```typescript
// src/data/tables/article-row.ts
import { _ArticleRowBase } from '../generated/_article-row-base.ts';

export class ArticleRow extends _ArticleRowBase {
  get isPublished(): boolean {
    return this.status_id.value === PUBLISHED_ID;
  }

  static async findDrafts(authorId: number): Promise<ArticleRow[]> {
    // write a custom query here
  }
}
```

Most tables will not need an extension class at all.

---

## File structure

```text
generator/
  index.ts          CLI entry point — reads config, runs schema reader, writes files
  config.ts         Reads and validates orm.config.yaml
  schema-reader.ts  Introspects information_schema for tables, columns, and PKs
  type-mapper.ts    PostgreSQL data_type → TypeScript type strings
  template.ts       Generates file content for mutable and immutable base classes
  writer.ts         Writes generated files and the barrel index.ts
  types.ts          Internal types (TableInfo, ColumnInfo, RelationshipInfo)
```

---

## When to re-run

Re-run `npm run generate` after:

- Any schema migration (new table, added/dropped column, type change)
- Changes to `orm.config.yaml` (new relationship, reference table added, etc.)

The generator is read-only with respect to the database — it never writes to it.
