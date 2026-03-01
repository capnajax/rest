// AUTO-GENERATED — do not edit. Run `npm run generate` to regenerate.
// Table: articles

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
import type { PoolClient }   from 'pg';

import type { _MediaRowBase } from './_media-row-base.ts';
import type { _PermalinksRowBase } from './_permalinks-row-base.ts';
import type { _TagsRowBase } from './_tags-row-base.ts';

// ── Schema interface ───────────────────────────────────────────────────────

export interface ArticlesSchema {
  id: number;
  author_id: number;
  active_dt: Date | null;
  last_update: Date;
  content_type_id: number;
  title: string | null;
  uuid: string;
  primary_permalink_id: number | null;
  info: Record<string, unknown>;
  byline_id: number | null;
  is_featured: boolean;
  is_hidden: boolean;
}

// ── Generated base ─────────────────────────────────────────────────────────

export class _ArticlesRowBase extends MutableRow {
  static readonly tableName  = 'articles';
  static readonly pkColumn   = 'id';

  static readonly columnSets: ColumnSets = {
    summary: ["id","title"],
    simple:  ["id","author_id","active_dt","last_update","content_type_id","title","uuid","primary_permalink_id","info","byline_id","is_featured","is_hidden"],
    all:     ["id","author_id","active_dt","last_update","content_type_id","title","uuid","primary_permalink_id","info","byline_id","is_featured","is_hidden"],
  };

  static readonly relationshipDefs: RelationshipDef[] = [
    { name: 'attachments', targetTable: 'media', loadWith: 'simple', kind: 'link', linkTable: 'article_attachments', sourceFk: 'article_id', targetFk: 'media_id' },
    { name: 'permalinks', targetTable: 'permalinks', loadWith: 'all', kind: 'direct', foreignKey: 'article_id' },
    { name: 'tags', targetTable: 'tags', loadWith: 'simple', kind: 'link', linkTable: 'article_tag', sourceFk: 'article_id', targetFk: 'tag_id' },
  ];

  // ── Scalar columns ───────────────────────────────────────────────────────

  readonly id = new Column<number>('id');  // number
  readonly author_id = new Column<number>('author_id');  // number
  readonly active_dt = new Column<Date>('active_dt');  // Date | null
  readonly last_update = new Column<Date>('last_update');  // Date
  readonly content_type_id = new Column<number>('content_type_id');  // number
  readonly title = new Column<string>('title');  // string | null
  readonly uuid = new Column<string>('uuid');  // string
  readonly primary_permalink_id = new Column<number>('primary_permalink_id');  // number | null
  readonly info = new Column<Record<string, unknown>>('info');  // Record<string, unknown>
  readonly byline_id = new Column<number>('byline_id');  // number | null
  readonly is_featured = new Column<boolean>('is_featured');  // boolean
  readonly is_hidden = new Column<boolean>('is_hidden');  // boolean

  // ── Relationship arrays ──────────────────────────────────────────────────

  attachments?: RelationshipArray<_MediaRowBase>;
  permalinks?: RelationshipArray<_PermalinksRowBase>;
  tags?: RelationshipArray<_TagsRowBase>;

  constructor() {
    super();
    this._registerColumns(
      this.id,
      this.author_id,
      this.active_dt,
      this.last_update,
      this.content_type_id,
      this.title,
      this.uuid,
      this.primary_permalink_id,
      this.info,
      this.byline_id,
      this.is_featured,
      this.is_hidden,
    );
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _ArticlesRowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _ArticlesRowBase.columnSets.simple,
      ["attachments","tags"].map(
        n => _ArticlesRowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _ArticlesRowBase.columnSets.all,
      _ArticlesRowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  // ── Static factory methods ────────────────────────────────────────────────

  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_ArticlesRowBase | null> {
    const row   = new _ArticlesRowBase();
    const found = await row._load(
      _ArticlesRowBase.columnSets.simple,
      _ArticlesRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { id: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_ArticlesRowBase | null> {
    const row   = new _ArticlesRowBase();
    const found = await row._load(
      _ArticlesRowBase.columnSets.simple,
      _ArticlesRowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
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
      if (!found) throw new Error(`Articles: row not found (called from ${method})`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('articles', _ArticlesRowBase);
