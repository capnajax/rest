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

### Single-object relationships

Foreign keys targeting a table in `referenceTables` automatically generate
`kind: single`, `loadWith: simple` relationships from database constraints.
`content_type_id` becomes `content_type`; names without `_id` get a `_ref`
suffix. This also works between reference tables (e.g. `content_type.form_factor`).
Single-column foreign keys to other unique columns are resolved using the
referenced column. Composite foreign keys are unsupported and cause a generation
error. Property-name collisions require an explicit name in configuration.

Explicit single relationships for the same local FK override inferred ones.
Other relationships still require configuration. Apply schema migrations before
regenerating: a column name alone does not establish a foreign-key relationship.
Migration `1.2.1` adds the previously missing articles/content_types constraint.

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
  loading its relationships. Explicit loads refresh the target from the database.

```typescript
article.content_type?.name.value; // Shared, immutable startup row; no query.
await article.loadRelationship('primary_permalink'); // Requires the local FK.
article.primary_permalink?.name.value;

article.primary_permalink_id.value = anotherPermalinkId;
await article.save(); // Persists the FK.
await article.loadRelationship('primary_permalink'); // Load the new target.
```

Getters return `undefined` when the FK or dynamic target has not been loaded,
`null` for a null FK or missing target, and a row otherwise. JSON includes resolved
single objects (or null), omits unloaded ones, and retains the scalar FK column.
Changing an FK makes a previously loaded target unavailable until reloaded;
reference getters immediately resolve the new key against the startup snapshot.
A parent hydration also clears loaded dynamic single targets.

Single getters are read-only navigation properties. Assign the scalar FK to
change the relationship. Saving or deleting the owner never saves or deletes a
single target; save an edited dynamic target explicitly. Custom bulk queries
resolve reference getters automatically, but must explicitly load dynamic targets.

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

For convenience, use the `inTransaction()` helper function which handles all the boilerplate:

```typescript
import { inTransaction } from '../query.js';

await inTransaction(async (conn) => {
  await article.save(conn);
  await audit.save(conn);
  return 'success';  // Optional return value
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

## Working with Rows

### Loading a Single Row

To load an existing row from the database, use the static factory methods on the row class:

```typescript
// Load by primary key (returns null if not found)
const article = await ArticlesRow.findById(123);

// Load by name column (if available, returns null if not found)
const user = await PeopleRow.findByName('john_doe');
```

Alternatively, create a new instance, set the primary key, and call a load method:

```typescript
const article = new ArticlesRow();
article.id.value = 123;
await article.loadSimple();  // Loads scalar columns + simple relationships
// or await article.loadAll();  // Loads everything
```

### Loading Multiple Rows

For loading multiple rows, use the query system with `sqlQuery()` or predefined queries from `queries.yaml`:

```typescript
import { sqlQuery } from '../query.js';

// Load all articles
const result = await sqlQuery('SELECT * FROM articles');
const articles = result.rows.map(row => {
  const article = new ArticlesRow();
  article._hydrate(row);
  article._markLoaded();
  return article;
});

// Using a predefined query
const userRows = await query('user.getUser', ['john_doe']);
```

### Creating a New Row (New Object)

To create a new row that doesn't exist in the database yet:

```typescript
const newArticle = new ArticlesRow();

// Set required column values
newArticle.title.value = 'My New Article';
newArticle.author_id.value = 1;
newArticle.content_type_id.value = 1;
newArticle.uuid.value = 'unique-uuid-here';

// Optional: set relationships
// newArticle.tags?.add(existingTag);

// Save to database (performs INSERT)
await newArticle.save();
```

You can also initialize with default values:

```typescript
const newArticle = new ArticlesRow({
  title: 'My New Article',
  author_id: 1,
  content_type_id: 1,
  uuid: 'unique-uuid-here'
});

// Values are set but marked as dirty (will be included in INSERT)
await newArticle.save();
```

### Creating a Row Instance for an Existing Object (Primary Key Known)

When you know the primary key of an existing database row and want to work with it:

```typescript
const existingArticle = new ArticlesRow();

// Set the primary key to the known value
existingArticle.id.value = 123;

// If you know other values already exist in the DB, mark them as clean
// to avoid unnecessary UPDATEs
existingArticle.assumeClean('title', 'Existing Title');
existingArticle.assumeClean('author_id', 1);

// Load any additional data you need
await existingArticle.loadSimple();  // Loads remaining columns + relationships

// Now you can modify and save
existingArticle.title.value = 'Updated Title';  // This will be dirty
await existingArticle.save();  // Performs UPDATE only for changed columns
```

Alternatively, you can work directly with column objects:

```typescript
const existingArticle = new ArticlesRow();
existingArticle.id.value = 123;
existingArticle.title.assumeClean('Existing Title');  // Direct column access
await existingArticle.loadSimple();
```

Or initialize with known values from the database:

```typescript
// If you have data from a previous query or cache
const dbData = { id: 123, title: 'Existing Title', author_id: 1 };
const existingArticle = new ArticlesRow(dbData, true);  // true = assume from DB

// Row is marked as loaded, values are clean
// Load any additional data you need
await existingArticle.loadSimple();  // Loads remaining columns + relationships
```

Note: For existing rows, it's often more convenient to use `findById()` which handles the loading in one step. Use these approaches when you want to avoid loading data you already know.

## Runtime Type Checking

When hydrating rows from database results or initializing with data, the ORM performs runtime type validation to ensure data integrity:

```typescript
// This will throw an error if title is not a string or null
const article = new ArticlesRow({ title: 'Valid Title' });

// This will throw an error if id is not a number
const article = new ArticlesRow({ id: 'not-a-number' }, true);

// Type validation happens during hydration from database queries too
await article.loadSimple();  // Validates all loaded column types
```

### Supported Types

The ORM validates these TypeScript types at runtime:

- `number` - validates numeric values (not NaN)
- `string` - validates string values  
- `boolean` - validates boolean values
- `Date` - validates Date instances
- `Record<string, unknown>` - validates plain objects (not arrays or null)
- Nullable variants: `number | null`, `string | null`, etc.

### Error Handling

Type validation errors throw descriptive errors:

```text
Type validation failed for column 'id': expected valid type, got string (not-a-number)
```

This helps catch data corruption or malformed API inputs early in development.
