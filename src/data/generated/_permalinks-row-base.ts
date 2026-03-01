// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: permalinks

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
import type { PoolClient }   from 'pg';


// ── Schema interface ───────────────────────────────────────────────────────

export interface PermalinksSchema {
  id: number;
  name: string;
  article_id: number;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _PermalinksRowBase extends MutableRow {
  static readonly tableName  = 'permalinks';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id","name"],
    simple:  ["id","name","article_id"],
    all:     ["id","name","article_id"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id');  // number
  readonly name = new Column<string>('name');  // string
  readonly article_id = new Column<number>('article_id');  // number

  // ── Relationship arrays ──────────────────────────────────────────────────

  // (none)

  constructor() {
    super();
    this._registerColumns(
      this.id,
      this.name,
      this.article_id,
    );
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _PermalinksRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _PermalinksRowBase.columnSets.simple,
      [].map(
        n => _PermalinksRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _PermalinksRowBase.columnSets.all,
      _PermalinksRowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_PermalinksRowBase | null> {
    const row   = new _PermalinksRowBase();
    const found = await row._load(
      _PermalinksRowBase.columnSets.simple,
      _PermalinksRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_PermalinksRowBase | null> {
    const row   = new _PermalinksRowBase();
    const found = await row._load(
      _PermalinksRowBase.columnSets.simple,
      _PermalinksRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
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
      if (!found) throw new Error(`Permalinks: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('permalinks', _PermalinksRowBase);
