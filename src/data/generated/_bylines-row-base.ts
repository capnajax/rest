// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: bylines

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
import type { PoolClient }   from 'pg';


// ── Schema interface ───────────────────────────────────────────────────────

export interface BylinesSchema {
  id: number;
  person_id: number;
  name: string;
  sequence: number | null;
  text: string;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _BylinesRowBase extends MutableRow {
  static readonly tableName  = 'bylines';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id","name"],
    simple:  ["id","person_id","name","sequence","text"],
    all:     ["id","person_id","name","sequence","text"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id');  // number
  readonly person_id = new Column<number>('person_id');  // number
  readonly name = new Column<string>('name');  // string
  readonly sequence = new Column<number>('sequence');  // number | null
  readonly text = new Column<string>('text');  // string

  // ── Relationship arrays ──────────────────────────────────────────────────

  // (none)

  constructor() {
    super();
    this._registerColumns(
      this.id,
      this.person_id,
      this.name,
      this.sequence,
      this.text,
    );
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _BylinesRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _BylinesRowBase.columnSets.simple,
      [].map(
        n => _BylinesRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _BylinesRowBase.columnSets.all,
      _BylinesRowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_BylinesRowBase | null> {
    const row   = new _BylinesRowBase();
    const found = await row._load(
      _BylinesRowBase.columnSets.simple,
      _BylinesRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_BylinesRowBase | null> {
    const row   = new _BylinesRowBase();
    const found = await row._load(
      _BylinesRowBase.columnSets.simple,
      _BylinesRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
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
      if (!found) throw new Error(`Bylines: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('bylines', _BylinesRowBase);
