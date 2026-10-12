// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: analytics_records

import { Column, TypeValidators }            from '../orm/column.js';
import { RelationshipArray } from '../orm/relationship-array.js';
import { MutableRow }        from '../orm/mutable-row.js';
import { registerRow }       from '../orm/row-registry.js';
import type { ColumnSets, RelationshipDef } from '../orm/types.js';
import type { PoolClient }   from 'pg';


// ── Schema interface ───────────────────────────────────────────────────────

export interface AnalyticsRecordsSchema {
  id: number;
  date: Date;
  ip: string | null;
  cookie: string | null;
  method: string;
  pathname: string;
  url: string | null;
  request_headers: Record<string, unknown> | null;
  response_headers: Record<string, unknown> | null;
  status_code: string | null;
  latency_ms: number | null;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _AnalyticsRecordsRowBase extends MutableRow {
  static readonly tableName  = 'analytics_records';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id"],
    simple:  ["id","date","ip","cookie","method","pathname","url","request_headers","response_headers","status_code","latency_ms"],
    all:     ["id","date","ip","cookie","method","pathname","url","request_headers","response_headers","status_code","latency_ms"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id', TypeValidators.number, true);  // number
  readonly date = new Column<Date>('date', TypeValidators.date);  // Date
  readonly ip = new Column<string>('ip', TypeValidators.stringOrNull);  // string | null
  readonly cookie = new Column<string>('cookie', TypeValidators.stringOrNull);  // string | null
  readonly method = new Column<string>('method', TypeValidators.string);  // string
  readonly pathname = new Column<string>('pathname', TypeValidators.string);  // string
  readonly url = new Column<string>('url', TypeValidators.stringOrNull);  // string | null
  readonly request_headers = new Column<Record<string, unknown>>('request_headers', TypeValidators.objectOrNull);  // Record<string, unknown> | null
  readonly response_headers = new Column<Record<string, unknown>>('response_headers', TypeValidators.objectOrNull);  // Record<string, unknown> | null
  readonly status_code = new Column<string>('status_code', TypeValidators.stringOrNull);  // string | null
  readonly latency_ms = new Column<number>('latency_ms', TypeValidators.numberOrNull);  // number | null

  // ── Relationships ──────────────────────────────────────────────────

  // (none)

  constructor(
    initialData?: Record<string, unknown>,
    assumeFromDb: boolean = false
  ) {
    super();
    this._registerColumns(
      this.id,
      this.date,
      this.ip,
      this.cookie,
      this.method,
      this.pathname,
      this.url,
      this.request_headers,
      this.response_headers,
      this.status_code,
      this.latency_ms,
    );
    this._initialize(initialData, assumeFromDb);
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _AnalyticsRecordsRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _AnalyticsRecordsRowBase.columnSets.simple,
      [].map(
        n => _AnalyticsRecordsRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _AnalyticsRecordsRowBase.columnSets.all,
      _AnalyticsRecordsRowBase.relationshipDefs,
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

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_AnalyticsRecordsRowBase | null> {
    const row   = new _AnalyticsRecordsRowBase();
    const found = await row._load(
      _AnalyticsRecordsRowBase.columnSets.simple,
      _AnalyticsRecordsRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_AnalyticsRecordsRowBase | null> {
    const row   = new _AnalyticsRecordsRowBase();
    const found = await row._load(
      _AnalyticsRecordsRowBase.columnSets.simple,
      _AnalyticsRecordsRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
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
      if (!found) throw new Error(`AnalyticsRecords: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('analytics_records', _AnalyticsRecordsRowBase);
