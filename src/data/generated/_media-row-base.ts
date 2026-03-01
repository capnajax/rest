// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: media

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
import type { PoolClient }   from 'pg';


// ── Schema interface ───────────────────────────────────────────────────────

export interface MediaSchema {
  id: number;
  article_id: number;
  filename: string;
  last_update: Date;
  data_b64: string;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _MediaRowBase extends MutableRow {
  static readonly tableName  = 'media';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id"],
    simple:  ["id","article_id","filename","last_update","data_b64"],
    all:     ["id","article_id","filename","last_update","data_b64"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id');  // number
  readonly article_id = new Column<number>('article_id');  // number
  readonly filename = new Column<string>('filename');  // string
  readonly last_update = new Column<Date>('last_update');  // Date
  readonly data_b64 = new Column<string>('data_b64');  // string

  // ── Relationship arrays ──────────────────────────────────────────────────

  // (none)

  constructor() {
    super();
    this._registerColumns(
      this.id,
      this.article_id,
      this.filename,
      this.last_update,
      this.data_b64,
    );
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _MediaRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _MediaRowBase.columnSets.simple,
      [].map(
        n => _MediaRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _MediaRowBase.columnSets.all,
      _MediaRowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_MediaRowBase | null> {
    const row   = new _MediaRowBase();
    const found = await row._load(
      _MediaRowBase.columnSets.simple,
      _MediaRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_MediaRowBase | null> {
    const row   = new _MediaRowBase();
    const found = await row._load(
      _MediaRowBase.columnSets.simple,
      _MediaRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
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
      if (!found) throw new Error(`Media: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('media', _MediaRowBase);
