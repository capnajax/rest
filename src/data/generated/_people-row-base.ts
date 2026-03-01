// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: people

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
import type { PoolClient }   from 'pg';

import type { _ArticlesRowBase } from './_articles-row-base.ts';

// ── Schema interface ───────────────────────────────────────────────────────

export interface PeopleSchema {
  id: number;
  username: string;
  displayname: string;
  realm_id: number;
  isauthor: boolean;
  info: Record<string, unknown> | null;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _PeopleRowBase extends MutableRow {
  static readonly tableName  = 'people';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id"],
    simple:  ["id","username","displayname","realm_id","isauthor","info"],
    all:     ["id","username","displayname","realm_id","isauthor","info"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [
    { name: 'articles', targetTable: 'articles', loadWith: 'simple', kind: 'direct', foreignKey: 'author_id' },
  ];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id');  // number
  readonly username = new Column<string>('username');  // string
  readonly displayname = new Column<string>('displayname');  // string
  readonly realm_id = new Column<number>('realm_id');  // number
  readonly isauthor = new Column<boolean>('isauthor');  // boolean
  readonly info = new Column<Record<string, unknown>>('info');  // Record<string, unknown> | null

  // ── Relationship arrays ──────────────────────────────────────────────────

  articles?: RelationshipArray<_ArticlesRowBase>;

  constructor() {
    super();
    this._registerColumns(
      this.id,
      this.username,
      this.displayname,
      this.realm_id,
      this.isauthor,
      this.info,
    );
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _PeopleRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _PeopleRowBase.columnSets.simple,
      ["articles"].map(
        n => _PeopleRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _PeopleRowBase.columnSets.all,
      _PeopleRowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_PeopleRowBase | null> {
    const row   = new _PeopleRowBase();
    const found = await row._load(
      _PeopleRowBase.columnSets.simple,
      _PeopleRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_PeopleRowBase | null> {
    const row   = new _PeopleRowBase();
    const found = await row._load(
      _PeopleRowBase.columnSets.simple,
      _PeopleRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
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
      if (!found) throw new Error(`People: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('people', _PeopleRowBase);
