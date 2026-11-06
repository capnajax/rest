# ORM Runtime Library

A lightweight, hand-rolled data layer for PostgreSQL. No third-party ORM
dependencies. The runtime uses `pg`, and streaming searches use
`pg-query-stream`.

---

## Core concepts

### Column-level state

Every scalar column on a row is wrapped in a `Column<T>` instance. The column
tracks three states internally using an `UNSET` sentinel symbol:

| State | Meaning |
| --- | --- |
| `UNSET` | Never selected or assigned |
| `null` | Database `NULL`, or an assigned null |
| `T` | A loaded or assigned value |

This makes `null` (a real database value) unambiguous from "not loaded".
Accessing `.value` on an unloaded column throws immediately rather than silently
returning `undefined`.

```typescript
row.body.isLoaded; // false if column was not in the SELECT
row.body.value; // throws if not loaded
row.body.isDirty; // true if current value differs from original
row.body.original; // the value as it came from the DB
```

Setting a mutable column makes it dirty when its value differs from its
original value. Setting it back clears the dirty state. Primary keys reject
assignment once hydrated; other columns can also be marked immutable:

```typescript
row.title.value = 'New title'; // marks dirty
row.isDirty(); // true if the title differs from its original value
```

### Partial loading

Queries only need to load the columns they need. Unloaded columns stay `UNSET`.
The three named column sets provide a consistent API:

| Method | Scalars | Array relationships |
| --- | --- | --- |
| `loadSummary()` | Conventional summary columns | None |
| `loadSimple()` | All | `loadWith: simple` |
| `loadAll()` | All | All configured arrays |

`summary` selects `id`, `name`, `title` and `created_at` when they exist.
`simple` is the default for most operations. `all` is explicit when you need
heavy data (media, attachments, etc.).

### Dirty tracking

`row.isDirty()` checks scalar changes and array membership changes. It does
not inspect changes inside related rows. Tracking uses strict equality, so
replace a `Date` or object value rather than mutating it in place.

A successful `save()` resets the row's scalar and array baselines. With a
caller-owned transaction, this happens before the outer transaction commits;
a later rollback does not restore in-memory state. Reload or recreate affected
rows after a rollback.

### Single-object relationships

Foreign keys targeting a table in `referenceTables` automatically generate
`kind: single`, `loadWith: simple` relationships from database constraints.
`content_type_id` becomes `content_type`; names without `_id` get a `_ref`
suffix. This also works between reference tables (e.g.
`content_type.form_factor`).
Single-column foreign keys to other unique columns are resolved using the
referenced column. Composite foreign keys are unsupported and cause a generation
error. Property-name collisions require an explicit name in configuration.

Explicit single relationships for the same local FK override inferred ones.
Other relationships still require configuration. Apply schema migrations before
regenerating: a column name alone does not establish a foreign-key relationship.

Use `kind: single` when the foreign key lives on the current row. This covers
many-to-one and one-to-one relationships; a database UNIQUE constraint on the
local foreign key is what enforces one-to-one cardinality.

```yaml
relationships:
  articles:
    # content_type is inferred from its FK to referenceTables.
    - name: primary_permalink
      kind: single
      foreignKey: primary_permalink_id
      targetTable: permalinks
      loadWith: simple
```

The generator determines whether the target is preloaded from `referenceTables`:

- Reference targets resolve synchronously from `ReferenceData` whenever the FK
  is available, including rows constructed from custom query results. Initialize
  reference data and import the generated barrel before accessing these getters.
- Dynamic targets load with `loadSimple()` / `loadAll()` according to `loadWith`
  (default: `simple`), or explicitly with `loadRelationship(name, connection?)`.
  Each single target uses one query for its scalar columns, without recursively
  loading its relationships. Explicit loads refresh the target from the
database.

```typescript
article.content_type?.name.value; // Shared, immutable startup row; no query.
await article.loadRelationship('primary_permalink'); // Requires the local FK.
article.primary_permalink?.name.value;

article.primary_permalink_id.value = anotherPermalinkId;
await article.save(); // Persists the FK.
await article.loadRelationship('primary_permalink'); // Load the new target.
```

Getters return `undefined` when the FK or dynamic target has not been loaded,
`null` for a null FK or missing target, and a row otherwise. JSON includes
resolved
single objects (or null), omits unloaded ones, and retains the scalar FK column.
Changing an FK makes a previously loaded target unavailable until reloaded;
reference getters immediately resolve the new key against the startup snapshot.
A parent hydration also clears loaded dynamic single targets.

Single getters are read-only navigation properties. Assign the scalar FK to
change the relationship. Saving or deleting the owner never saves or deletes a
single target; save an edited dynamic target explicitly. Custom bulk queries
resolve reference getters automatically, but must explicitly load dynamic
targets.

### Array relationships

Related rows are held in `RelationshipArray<T>`, which tracks additions and
removals explicitly:

```typescript
article.tags?.add(tag); // adds to pending changes
article.tags?.remove(tag); // removes from pending changes
article.tags?.isDirty; // true if changed since load
article.tags?.added; // rows added since load
article.tags?.removed; // rows removed since load
```

Read the collection through `.items` (a read-only array). Membership uses object
identity: removing a different instance with the same ID has no effect.
An unloaded relationship is `undefined`; optional chaining silently skips a
mutation in that case. Load it first when the mutation is required:

```typescript
await article.loadRelationship('tags');
article.tags!.add(tag);
await article.save();
```

Loading an array again replaces its contents and pending membership changes.
Array targets are loaded at summary level, even through `loadAll()`; load a
child explicitly when you need its other columns.

---

## Row classes

### `MutableRow` (most tables)

The base for all generated editable row classes. Provides:

- `isNew: boolean` — true until the first successful `save()`
- `isDirty(): boolean` — any scalar or relationship changed
- `loadSummary() / loadSimple() / loadAll()` — defined on the generated subclass
- `save()` — INSERT if new, UPDATE dirty columns if not; wraps in a transaction
- `delete()` — hard delete; cleans up link rows and recursively deletes
  direct-FK children if loaded, otherwise relies on database CASCADE

`save()` processes arrays only when their membership is dirty. Editing an
existing child alone does not trigger a cascading save; save that child
explicitly. Link targets that already exist are not saved by the owner.

**save() behaviour by relationship kind:**

| Kind | Added new row | Added existing row | Removed row |
| --- | --- | --- | --- |
| Direct FK | Set FK, save child | Set FK, save child | Delete child |
| Link table | Save target, add link | Add link | Delete link |

### `ImmutableRow` (reference tables)

The base for reference-table row classes. No `save()`, no `delete()`, no dirty
tracking. Columns are
`ImmutableColumn<T>` instances that reject value assignment after loading. Rows
are constructed by `_fromRecord()` and never modified after that.

---

## Reference tables

Reference tables (small, immutable lookup tables like statuses or media types)
are loaded once at application startup and held for the lifetime of the process.
The word "cache" is avoided deliberately — there is no liveness, no expiry, no
invalidation.

```typescript
// At startup (call once, before handling requests)
await ReferenceData.initialize();

// Anywhere in the application
const statuses = ReferenceData.all(StatusRow);
const draft = ReferenceData.byName(StatusRow, 'draft');
const status = ReferenceData.byId(StatusRow, 3);
```

`ReferenceData.initialize()` queries every registered reference table. Public
reference-table row modules call `ReferenceData.register()` at module load time.
Import the generated barrel before initialization to register every public
reference row class. The snapshot contains instances of those public classes,
including their custom methods.

---

## Row registry

`MutableRow._loadRelationship()` needs to instantiate related row classes by
table name at runtime, without importing them directly (which would create
circular dependencies across generated files). The `RowRegistry` solves this:

- Generated mutable files call `registerRow('table_name', MyRowBase)` at module
  load time.
- The registry maps table name → constructor and is used internally during
  relationship loading.
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
  pg-types.ts           PostgreSQL parameter types and operators
  pg/                   PostgreSQL type validation helpers
  search-tools.ts       Parameterised searches and ID batch loading
  index.ts              Core runtime barrel export
```

---

## Working with generated classes

Generated files live in `src/data/generated/` and should never be edited. To add
domain behaviour, create an extension class in `src/data/tables/`:

```typescript
// src/data/tables/articles-row.ts
import { _ArticlesRowBase } from '../generated/_articles-row-base.js';

export class ArticlesRow extends _ArticlesRowBase {
  get isVisible(): boolean {
    return this.is_hidden.value === false;
  }
}
```

Inherited static factories currently construct generated base instances.
Dynamic relationship loading also uses registered base constructors, so custom
extension methods are not available on those results. Construct your public
extension explicitly from a database record when its methods are required.

The generated base is regenerated freely. Your extension file is stable.

---

## Transactions

Load methods, `save()` and `delete()` accept an optional `PoolClient`. Pass one
to participate in an external transaction:

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

For convenience, use the `inTransaction()` helper function which handles all the
boilerplate:

```typescript
import { inTransaction } from '../query.js';

await inTransaction(async (conn) => {
  await article.save(conn);
  await audit.save(conn);
  return 'success'; // Optional return value
});
```

The `inTransaction()` function automatically:

- Acquires a connection from the pool
- Begins a transaction
- Executes your callback with the connection
- Commits on success
- Rolls back on error
- Returns the connection to the pool
- Re-throws any errors from your callback

## Working with rows

### Loading a single row

To load an existing row from the database, use the static factory methods on the
row class:

```typescript
// Load by primary key (returns null if not found)
const article = await ArticlesRow.findById(123);

// Only use findByName() on tables with an actual name column.
const permalink = await PermalinksRow.findByName('my-article');
```

Alternatively, create a new instance, set the primary key, and call a load
method:

```typescript
const article = new ArticlesRow();
article.id.value = 123;
await article.loadSimple(); // Loads scalar columns + simple relationships
// or await article.loadAll();  // Loads everything
```

The instance load methods throw if the row is missing. They refresh selected
columns, including any unsaved values for those columns; they do not just fill
unloaded columns. `loadColumns()` defaults to `summary` and also accepts
`'simple'` or `'all'`.

### Loading multiple rows

`query()` runs named queries from `src/data/queries.yaml` and returns an array
of plain records. `sqlQuery()` returns a PostgreSQL `QueryResult`, whose
records are in `.rows`. Neither constructs ORM instances or loads relationships.
For example, `user.getUser` looks up `people.username`, not a `name` column:

```typescript
import { query } from '../query.js';
import { PeopleRow } from '../tables/people-row.js';

const records = await query('user.getUser', ['john_doe']);
const users = records.map((record) => new PeopleRow(record, true));
```

For parameterised searches, import helpers directly from `search-tools.js`:

```typescript
import type { ArticlesRecord } from '../generated/_articles-row-base.js';
import { loadByIds, search } from './search-tools.js';
import { ArticlesRow } from '../tables/articles-row.js';

const records = await loadByIds<ArticlesRecord>('articles', [123, 456]);
const articles = records.map((record) => new ArticlesRow(record, true));

const visibleRecords = await search<ArticlesRecord>(
  'articles',
  [{ column: 'is_hidden', type: 'bool', value: false }],
  {
    columns: ['id', 'title'],
    orderBy: { column: 'id', direction: 'ASC' },
    limit: 20,
    offset: 0,
  }
);
```

`search()` joins conditions with `AND`. Empty conditions select without a
`WHERE` clause; omitted or empty `columns` select all scalars. Values are
parameterised, but table names, column names, ordering and SQL fragments must
come from trusted application code. Include the primary key when constructing
an existing row from partial results.

Both helpers accept an optional caller-owned `connection` in their options.
`loadByIds()` also accepts additional `wheres`; an empty ID list skips the
query.
Neither helper guarantees input-ID order.

Both support a final callback instead of returning an array. This streams
records and resolves with `void`; callback promises are not awaited. Convert
records to row instances with `new ArticlesRow(record, true)` as needed.

### Creating a new row

To create a new row that doesn't exist in the database yet:

```typescript
const newArticle = new ArticlesRow();

// Set required column values
newArticle.title.value = 'My New Article';
newArticle.author_id.value = 1;
newArticle.content_type_id.value = 1;
newArticle.uuid.value = 'unique-uuid-here';

// Save to database (performs INSERT)
await newArticle.save();
```

Assign new values through column setters so they are included in the INSERT.
Unassigned columns use database defaults. Constructor `initialData` is hydrated
as clean even when `assumeFromDb` is false, so it should not be used to supply
new INSERT values.

### Working with an existing row

When you know the primary key of an existing database row and want to work with
it:

```typescript
const existingArticle = new ArticlesRow();

// Set the primary key to the known value
existingArticle.id.value = 123;

// If you know other values already exist in the DB, mark them as clean
// to avoid unnecessary UPDATEs
existingArticle.assumeClean('title', 'Existing Title');
existingArticle.assumeClean('author_id', 1);

// Load any additional data you need
await existingArticle.loadSimple(); // Refreshes simple columns + relationships

// Now you can modify and save
existingArticle.title.value = 'Updated Title'; // This will be dirty
await existingArticle.save(); // Performs UPDATE only for changed columns
```

Alternatively, you can work directly with column objects:

```typescript
const existingArticle = new ArticlesRow();
existingArticle.id.value = 123;
existingArticle.title.assumeClean('Existing Title'); // Direct column access
await existingArticle.loadSimple();
```

Or initialize with known values from the database:

```typescript
// If you have data from a previous query or cache
const dbData = { id: 123, title: 'Existing Title', author_id: 1 };
const existingArticle = new ArticlesRow(dbData, true); // true = assume from DB

// Row is marked as loaded, values are clean
// Load any additional data you need
await existingArticle.loadSimple(); // Refreshes simple columns + relationships
```

`assumeClean()` changes a column baseline but does not mark the row as existing.
A primary key alone also leaves `isNew` true. Complete a successful load or use
`new ArticlesRow(dbData, true)` before saving an existing row.

For existing rows, it's often more convenient to use `findById()` which handles
the loading in one step. Use these approaches when you want to avoid loading
data you already know.

## Serialisation and record export

`row.toJSON()` (also used by `JSON.stringify()`) emits scalar values, loaded
arrays and resolved single relationships. Unset scalars and unloaded
relationships are omitted. This includes all loaded columns, so select or map
fields explicitly before returning data through an API.

Generated mutable rows also expose `exportRecord()`. It returns scalar columns
whose `isLoaded` flag is true, requires a loaded primary key and omits
relationships. A value assigned to a previously unloaded column is included in
JSON but excluded from `exportRecord()` until it gains a database baseline.

## Runtime type checking

When hydrating rows from database results or initializing with data, the ORM
performs runtime type validation to ensure data integrity:

```typescript
// This will throw an error if title is not a string or null
const article = new ArticlesRow({ title: 'Valid Title' });

// This will throw an error if id is not a number
const article = new ArticlesRow({ id: 'bad' }, true);

// Type validation happens during hydration from database queries too
await article.loadSimple(); // Validates all loaded column types
```

### Supported types

The ORM validates these TypeScript types at runtime:

- `number` - validates numeric values (not NaN)
- `string` - validates string values
- `boolean` - validates boolean values
- `Date` - validates Date instances
- `Record<string, unknown>` - validates objects (not arrays or null)
- Nullable variants: `number | null`, `string | null`, etc.

### Error handling

Type validation errors throw descriptive errors:

```text
Type validation failed for column 'id': expected valid type, got string (bad)
```

Validation runs during hydration, including constructor data and database
loads. Column setters and `assumeClean()` do not run these validators; validate
external inputs before assigning them. Object validation checks for a non-null,
non-array object, rather than enforcing a particular object schema.
