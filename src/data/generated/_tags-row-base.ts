// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: tags

import { Column, TypeValidators }            from '../orm/column.js';
import { RelationshipArray } from '../orm/relationship-array.js';
import { MutableRow }        from '../orm/mutable-row.js';
import { registerRow }       from '../orm/row-registry.js';
import type { ColumnSets, RelationshipDef } from '../orm/types.js';
import type { PoolClient }   from 'pg';


// ── Schema interface ───────────────────────────────────────────────────────

export interface TagsSchema {
  id: number;
  color: string | null;
  important: boolean;
  seq: number | null;
  num_articles: number | null;
  title: string;
}
export type TagsRecord = {id: number} & Partial<TagsSchema>;

// ── Generated base ─────────────────────────────────────────────────────────

export class _TagsRowBase extends MutableRow {
  static readonly tableName  = 'tags';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id","title"],
    simple:  ["id","color","important","seq","num_articles","title"],
    all:     ["id","color","important","seq","num_articles","title"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id', TypeValidators.number, true);  // number
  readonly color = new Column<string>('color', TypeValidators.stringOrNull);  // string | null
  readonly important = new Column<boolean>('important', TypeValidators.boolean);  // boolean
  readonly seq = new Column<number>('seq', TypeValidators.numberOrNull);  // number | null
  readonly num_articles = new Column<number>('num_articles', TypeValidators.numberOrNull);  // number | null
  readonly title = new Column<string>('title', TypeValidators.string);  // string

  // ── Relationships ──────────────────────────────────────────────────

  // (none)

  constructor(
    initialData?: Record<string, unknown>,
    assumeFromDb: boolean = false
  ) {
    super();
    this._registerColumns(
      this.id,
      this.color,
      this.important,
      this.seq,
      this.num_articles,
      this.title,
    );
    this._initialize(initialData, assumeFromDb);
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _TagsRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _TagsRowBase.columnSets.simple,
      [].map(
        n => _TagsRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _TagsRowBase.columnSets.all,
      _TagsRowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  /** Loads all the column sets in the set specified. */
  loadColumns(connection: PoolClient, columnSet?: 'summary'|'simple'|'all'): Promise<void>;
  loadColumns(connection: 'summary'|'simple'|'all'): Promise<void>;
  loadColumns(connection?: PoolClient|'summary'|'simple'|'all', columnSet?: 'summary'|'simple'|'all'): Promise<void> {
    if (typeof connection === 'string') {
      columnSet = connection;
      connection = undefined;
    }
    switch (columnSet) {
      case 'all':
        return this.loadAll(connection);
      case 'simple':
        return this.loadSimple(connection);
      default:
        return this.loadSummary(connection);
    }
  }

  // ── Export methods ────────────────────────────────────────────────────────
  /**
   * Generates an object representation of the current state of this
   * row object. Throws if the primary key is not set -- this is only
   * intended for objects that are already in the database
   */
  exportRecord(): {id: number} & Partial<TagsSchema> {
    if (!this.id.isLoaded) {
      throw new Error('Primary Key not set');
    }
    const result: {id: number} & Partial<TagsSchema> = {
      id: this.id.value as number
    };
    if (this.color.isLoaded) {
      result.color = this.color.value as string | null;
    }
    if (this.important.isLoaded) {
      result.important = this.important.value as boolean;
    }
    if (this.seq.isLoaded) {
      result.seq = this.seq.value as number | null;
    }
    if (this.num_articles.isLoaded) {
      result.num_articles = this.num_articles.value as number | null;
    }
    if (this.title.isLoaded) {
      result.title = this.title.value as string;
    }
    return result;
  }

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_TagsRowBase | null> {
    const row   = new _TagsRowBase();
    const found = await row._load(
      _TagsRowBase.columnSets.simple,
      _TagsRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_TagsRowBase | null> {
    const row   = new _TagsRowBase();
    const found = await row._load(
      _TagsRowBase.columnSets.simple,
      _TagsRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { name },
      connection,
    );
    return found ? row : null;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private _whereByPk(): Record<string, unknown> {
    return { ['id']: this.id.value };
  }

  private _assertFound(method: string): (found: boolean) => void {
    return (found) => {
      if (!found) throw new Error(`Tags: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('tags', _TagsRowBase);
