# ORM Runtime Library

A lightweight, hand-rolled data layer for PostgreSQL. No third-party ORM dependencies — just `pg` and TypeScript.

---

## Core concepts

### Column-level state

Every scalar column on a row is wrapped in a `Column<T>` instance. The column tracks three states internally using an `UNSET` sentinel symbol:

| State | Meaning |
| --- | --- |
| `UNSET` | Column was not included in the `SELECT`, or is on a new row with no value assigned |
| `null` | Column was loaded and its database value is `NULL` |
| `T` | Column was loaded and has a value |

This makes `null` (a real database value) unambiguous from "not loaded". Accessing `.value` on an unloaded column throws immediately rather than silently returning `undefined`.

```typescript
row.body.isLoaded   // false if column was not in the SELECT
row.body.value      // throws if not loaded
row.body.isDirty    // true if current value differs from original
row.body.original   // the value as it came from the DB
```

Setting a value always succeeds and marks the column dirty:

```typescript
row.title.value = 'New title'  // marks dirty
row.isDirty()                  // true
```

### Partial loading

Queries only need to load the columns they need. Unloaded columns stay `UNSET`. The three named column sets provide a consistent API:

| Method | Scalar columns | Array relationships |
| --- | --- | --- |
| `loadSummary()` | `id`, `name`, `title`, `created_at` | never |
| `loadSimple()` | all scalars | those marked `loadWith: simple` |
| `loadAll()` | all scalars | all relationships |

`summary` columns are fixed by convention. `simple` is the default for most operations. `all` is explicit when you need heavy data (media, attachments, etc.).

### Dirty tracking

`row.isDirty()` checks all scalar columns and all relationship arrays. Dirty columns are committed (original = current) on a successful `save()`.

### Array relationships

Related rows are held in `RelationshipArray<T>`, which tracks additions and removals explicitly:

```typescript
article.tags?.add(tag)     // adds to pending changes
article.tags?.remove(tag)  // removes from pending changes
article.tags?.isDirty      // true if changed since load
article.tags?.added        // rows added since load
article.tags?.removed      // rows removed since load
```

Mutations are explicit — no array index interception. This keeps tracking predictable.

---

## Row classes

### `MutableRow` (most tables)

The base for all generated editable row classes. Provides:

- `isNew: boolean` — true until the first successful `save()`
- `isDirty(): boolean` — any scalar or relationship changed
- `loadSummary() / loadSimple() / loadAll()` — defined on the generated subclass
- `save()` — INSERT if new, UPDATE dirty columns if not; wraps in a transaction
- `delete()` — hard delete; cleans up link rows and recursively deletes direct-FK children if loaded, otherwise relies on database CASCADE

**save() behaviour by relationship kind:**

| Relationship | Added item (new) | Added item (existing) | Removed item |
| --- | --- | --- | --- |
| Direct FK | INSERT child, set FK | UPDATE child if dirty | DELETE child row |
| Link table | INSERT related row + link | INSERT link only | DELETE link only |

### `ImmutableRow` (reference tables)

The base for reference-table row classes. No `save()`, no `delete()`, no dirty tracking. Columns are `ImmutableColumn<T>` with no setter. Rows are constructed by `_fromRecord()` and never modified after that.

---

## Reference tables

Reference tables (small, immutable lookup tables like statuses or media types) are loaded once at application startup and held for the lifetime of the process. The word "cache" is avoided deliberately — there is no liveness, no expiry, no invalidation.

```typescript
// At startup (call once, before handling requests)
await ReferenceData.initialize();

// Anywhere in the application
const statuses = ReferenceData.all(StatusRow);
const draft    = ReferenceData.byName(StatusRow, 'draft');
const status   = ReferenceData.byId(StatusRow, 3);
```

`ReferenceData.initialize()` queries every registered reference table. Generated reference-table files call `ReferenceData.register()` at module load time, so importing the generated barrel is sufficient.

---

## Row registry

`MutableRow._loadRelationship()` needs to instantiate related row classes by table name at runtime, without importing them directly (which would create circular dependencies across generated files). The `RowRegistry` solves this:

- Generated mutable files call `registerRow('table_name', MyRowBase)` at module load time.
- The registry maps table name → constructor and is used internally during relationship loading.
- Application code never touches the registry directly.

---

## File structure

```text
orm/
  column.ts             Column<T> — scalar column with dirty tracking
  immutable-column.ts   ImmutableColumn<T> — read-only, always loaded
  relationship-array.ts RelationshipArray<T> — tracks added/removed
  mutable-row.ts        MutableRow — save, delete, load mechanism
  immutable-row.ts      ImmutableRow — abstract base for reference tables
  reference-data.ts     ReferenceData — startup loader and accessors
  row-registry.ts       Maps table names to constructors at runtime
  types.ts              Shared types (ColumnSets, RelationshipDef, etc.)
  index.ts              Barrel export
```

---

## Working with generated classes

Generated files live in `src/data/generated/` and should never be edited. To add domain behaviour, create an extension class in `src/data/tables/`:

```typescript
// src/data/tables/article-row.ts
import { _ArticleRowBase } from '../generated/_article-row-base.ts';

export class ArticleRow extends _ArticleRowBase {
  get isPublished(): boolean {
    return this.status.value === 'published';
  }

  static async findPublished(): Promise<ArticleRow[]> {
    // custom query using sqlQuery() from data/query.ts
  }
}
```

The generated base is regenerated freely. Your extension file is stable.

---

## Transactions

All `save()` and `delete()` calls accept an optional `PoolClient`. Pass one to participate in an external transaction:

```typescript
const conn = await getConnection();
await conn.query('BEGIN');
try {
  await article.save(conn);
  await audit.save(conn);
  await conn.query('COMMIT');
} catch (err) {
  await conn.query('ROLLBACK');
  throw err;
} finally {
  returnConnection(conn);
}
```

Without a connection argument, `save()` and `delete()` manage their own transaction internally.
