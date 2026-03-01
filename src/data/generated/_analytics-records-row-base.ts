// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: analytics_records

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
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

  readonly id = new Column<number>('id');  // number
  readonly date = new Column<Date>('date');  // Date
  readonly ip = new Column<string>('ip');  // string | null
  readonly cookie = new Column<string>('cookie');  // string | null
  readonly method = new Column<string>('method');  // string
  readonly pathname = new Column<string>('pathname');  // string
  readonly url = new Column<string>('url');  // string | null
  readonly request_headers = new Column<Record<string, unknown>>('request_headers');  // Record<string, unknown> | null
  readonly response_headers = new Column<Record<string, unknown>>('response_headers');  // Record<string, unknown> | null
  readonly status_code = new Column<string>('status_code');  // string | null
  readonly latency_ms = new Column<number>('latency_ms');  // number | null

  // ── Relationship arrays ──────────────────────────────────────────────────

  // (none)

  constructor() {
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
