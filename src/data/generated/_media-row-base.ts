// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: media

import { Column, TypeValidators }            from '../orm/column.js';
import { RelationshipArray } from '../orm/relationship-array.js';
import { MutableRow }        from '../orm/mutable-row.js';
import { registerRow }       from '../orm/row-registry.js';
import type { ColumnSets, RelationshipDef } from '../orm/types.js';
import type { PoolClient }   from 'pg';


// ── Schema interface ───────────────────────────────────────────────────────

export interface MediaSchema {
  id: number;
  article_id: number;
  attachment_num: number | null;
  filename: string;
  mime_type: string | null;
  last_update: Date;
  metadata: Record<string, unknown> | null;
  data_b64: string;
}
export type MediaRecord = {id: number} & Partial<MediaSchema>;

// ── Generated base ─────────────────────────────────────────────────────────

export class _MediaRowBase extends MutableRow {
  static readonly tableName  = 'media';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id"],
    simple:  ["id","article_id","attachment_num","filename","mime_type","last_update","metadata","data_b64"],
    all:     ["id","article_id","attachment_num","filename","mime_type","last_update","metadata","data_b64"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id', TypeValidators.number, true);  // number
  readonly article_id = new Column<number>('article_id', TypeValidators.number);  // number
  readonly attachment_num = new Column<number>('attachment_num', TypeValidators.numberOrNull);  // number | null
  readonly filename = new Column<string>('filename', TypeValidators.string);  // string
  readonly mime_type = new Column<string>('mime_type', TypeValidators.stringOrNull);  // string | null
  readonly last_update = new Column<Date>('last_update', TypeValidators.date);  // Date
  readonly metadata = new Column<Record<string, unknown>>('metadata', TypeValidators.objectOrNull);  // Record<string, unknown> | null
  readonly data_b64 = new Column<string>('data_b64', TypeValidators.string);  // string

  // ── Relationships ──────────────────────────────────────────────────

  // (none)

  constructor(
    initialData?: Record<string, unknown>,
    assumeFromDb: boolean = false
  ) {
    super();
    this._registerColumns(
      this.id,
      this.article_id,
      this.attachment_num,
      this.filename,
      this.mime_type,
      this.last_update,
      this.metadata,
      this.data_b64,
    );
    this._initialize(initialData, assumeFromDb);
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
  exportRecord(): {id: number} & Partial<MediaSchema> {
    if (!this.id.isLoaded) {
      throw new Error('Primary Key not set');
    }
    const result: {id: number} & Partial<MediaSchema> = {
      id: this.id.value as number
    };
    if (this.article_id.isLoaded) {
      result.article_id = this.article_id.value as number;
    }
    if (this.attachment_num.isLoaded) {
      result.attachment_num = this.attachment_num.value as number | null;
    }
    if (this.filename.isLoaded) {
      result.filename = this.filename.value as string;
    }
    if (this.mime_type.isLoaded) {
      result.mime_type = this.mime_type.value as string | null;
    }
    if (this.last_update.isLoaded) {
      result.last_update = this.last_update.value as Date;
    }
    if (this.metadata.isLoaded) {
      result.metadata = this.metadata.value as Record<string, unknown> | null;
    }
    if (this.data_b64.isLoaded) {
      result.data_b64 = this.data_b64.value as string;
    }
    return result;
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
