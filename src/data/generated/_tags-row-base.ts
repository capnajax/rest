// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: tags

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
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

  readonly id = new Column<number>('id');  // number
  readonly color = new Column<string>('color');  // string | null
  readonly important = new Column<boolean>('important');  // boolean
  readonly seq = new Column<number>('seq');  // number | null
  readonly num_articles = new Column<number>('num_articles');  // number | null
  readonly title = new Column<string>('title');  // string

  // ── Relationship arrays ──────────────────────────────────────────────────

  // (none)

  constructor() {
    super();
    this._registerColumns(
      this.id,
      this.color,
      this.important,
      this.seq,
      this.num_articles,
      this.title,
    );
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
