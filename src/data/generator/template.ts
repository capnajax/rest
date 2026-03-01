import type { TableInfo, ColumnInfo, RelationshipInfo } from './types.ts';

// Summary columns are fixed by convention across all tables.
const SUMMARY_COLUMNS = ['id', 'name', 'title', 'created_at'];

/**
 * Generates the TypeScript source for a single generated base file.
 * The file is named _<table>-row-base.ts and should never be edited by hand.
 */
export function generateMutableBase(table: TableInfo): string {
  const { tableName, className, pkColumn, columns, relationships } = table;

  const simpleColumns   = columns.map(c => c.name);
  // summary = intersection of SUMMARY_COLUMNS and actual columns
  const summaryColumns  = SUMMARY_COLUMNS.filter(n => simpleColumns.includes(n));
  // 'all' column set at the scalar level is the same as simple;
  // loadAll() adds relationships not in simple.
  const allColumns      = simpleColumns;

  const simpleRels = relationships.filter(r => r.loadWith === 'simple');
  const allRels    = relationships; // loadAll loads everything

  // Related table class names for imports
  const relatedTables = [...new Set(relationships.map(r => r.targetTable))];

  const schemaInterface = generateSchemaInterface(className, columns);
  const columnDecls     = generateColumnDecls(columns);
  const relDecls        = generateRelDecls(relationships);
  const relDefs         = generateRelDefs(relationships);
  const factoryMethods  = generateFactoryMethods(className, pkColumn);

  const relImports = relatedTables.length > 0
    ? relatedTables.map(t => {
        const cls = toPascalCase(t);
        return `import type { _${cls}RowBase } from './_${toKebabCase(t)}-row-base.ts';`;
      }).join('\n')
    : '';

  return `\
// AUTO-GENERATED — do not edit. Run \`npm run generate\` to regenerate.
// Table: ${tableName}

import { Column }            from '../orm/column.ts';
import { RelationshipArray } from '../orm/relationship-array.ts';
import { MutableRow }        from '../orm/mutable-row.ts';
import { registerRow }       from '../orm/row-registry.ts';
import type { ColumnSets, RelationshipDef } from '../orm/types.ts';
import type { PoolClient }   from 'pg';
${relImports ? '\n' + relImports : ''}

// ── Schema interface ───────────────────────────────────────────────────────

${schemaInterface}

// ── Generated base ─────────────────────────────────────────────────────────

export class _${className}RowBase extends MutableRow {
  static readonly tableName  = '${tableName}';
  static readonly pkColumn   = '${pkColumn}';

  static readonly columnSets: ColumnSets = {
    summary: ${JSON.stringify(summaryColumns)},
    simple:  ${JSON.stringify(simpleColumns)},
    all:     ${JSON.stringify(allColumns)},
  };

  static readonly relationshipDefs: RelationshipDef[] = ${relDefs};

  // ── Scalar columns ───────────────────────────────────────────────────────

${columnDecls}
  // ── Relationship arrays ──────────────────────────────────────────────────

${relDecls}
  constructor() {
    super();
    this._registerColumns(
${columns.map(c => `      this.${c.name}`).join(',\n')},
    );
  }

  // ── Load methods ─────────────────────────────────────────────────────────

  /** Loads id, name, title, created_at only. Never includes arrays. */
  loadSummary(connection?: PoolClient): Promise<void> {
    return this._load(
      _${className}RowBase.columnSets.summary,
      [],
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSummary'));
  }

  /** Loads all scalar columns + relationships where loadWith = 'simple'. */
  loadSimple(connection?: PoolClient): Promise<void> {
    return this._load(
      _${className}RowBase.columnSets.simple,
      ${JSON.stringify(simpleRels.map(r => r.name))}.map(
        n => _${className}RowBase.relationshipDefs.find(d => d.name === n)!,
      ),
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadSimple'));
  }

  /** Loads all scalar columns + all relationships. */
  loadAll(connection?: PoolClient): Promise<void> {
    return this._load(
      _${className}RowBase.columnSets.all,
      _${className}RowBase.relationshipDefs,
      this._whereByPk(),
      connection,
    ).then(this._assertFound('loadAll'));
  }

  // ── Static factory methods ────────────────────────────────────────────────

${factoryMethods}
  // ── Private helpers ───────────────────────────────────────────────────────

  private _whereByPk(): Record<string, unknown> {
    return { ['${pkColumn}']: this.${pkColumn}.value };
  }

  private _assertFound(method: string): (found: boolean) => void {
    return (found) => {
      if (!found) throw new Error(\`${className}: row not found (called from \${method})\`);
    };
  }
}

// Register so MutableRow._loadRelationship() can instantiate this class.
registerRow('${tableName}', _${className}RowBase);
`;
}

/**
 * Generates the TypeScript source for a reference-table (immutable) base file.
 */
export function generateImmutableBase(table: TableInfo): string {
  const { tableName, className, pkColumn, columns } = table;

  const schemaInterface = generateSchemaInterface(className, columns);
  const immutableDecls  = columns.map(c => {
    const tsType = c.isNullable ? `${c.tsType} | null` : c.tsType;
    return `  readonly ${c.name} = new ImmutableColumn<${c.tsType}>('${c.name}', null as unknown as ${tsType});`;
  }).join('\n');

  return `\
// AUTO-GENERATED — do not edit. Run \`npm run generate\` to regenerate.
// Reference table: ${tableName}

import { ImmutableColumn } from '../orm/immutable-column.ts';
import { ImmutableRow }    from '../orm/immutable-row.ts';
import { ReferenceData }   from '../orm/reference-data.ts';

// ── Schema interface ───────────────────────────────────────────────────────

${schemaInterface}

// ── Generated base ─────────────────────────────────────────────────────────

export class _${className}RowBase extends ImmutableRow {
  static readonly tableName = '${tableName}';
  static readonly pkColumn  = '${pkColumn}';

  // ── Columns ──────────────────────────────────────────────────────────────

${immutableDecls}

  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
${columns.map(c => {
    const getter = c.tsType === 'Date'
      ? `data['${c.name}'] != null ? new Date(data['${c.name}'] as string) : null`
      : `(data['${c.name}'] ?? null) as ${c.tsType} | null`;
    return `    (row as any).${c.name} = new ImmutableColumn('${c.name}', ${getter});`;
  }).join('\n')}
    row._registerColumns(
${columns.map(c => `      row.${c.name}`).join(',\n')},
    );
    return row;
  }
}

// Register so ReferenceData.initialize() finds this class automatically.
ReferenceData.register(_${className}RowBase as any);
`;
}

// ── Extension stubs (written once, never overwritten) ────────────────────

/**
 * Generates the initial stub for a mutable table's hand-maintained extension
 * class. Written once to src/data/tables/; never overwritten by the generator.
 */
export function generateMutableStub(table: TableInfo): string {
  const { tableName, className } = table;
  const baseFile = `../generated/_${toKebabCase(tableName)}-row-base.ts`;

  return `\
// Hand-maintained extension of the generated base class for '${tableName}'.
// The generator will NOT overwrite this file.
// Add domain-specific methods, computed properties, and custom queries here.

import { _${className}RowBase } from '${baseFile}';

export class ${className}Row extends _${className}RowBase {
}
`;
}

/**
 * Generates the initial stub for a reference table's hand-maintained extension
 * class. Written once to src/data/tables/; never overwritten by the generator.
 */
export function generateImmutableStub(table: TableInfo): string {
  const { tableName, className } = table;
  const baseFile = `../generated/_${toKebabCase(tableName)}-row-base.ts`;

  return `\
// Hand-maintained extension of the generated base class for '${tableName}'.
// The generator will NOT overwrite this file.
// Add domain-specific lookup helpers here, e.g.:
//   static byCode(code: string) { return ReferenceData.all(${className}Row).find(...) }

import { _${className}RowBase } from '${baseFile}';

export class ${className}Row extends _${className}RowBase {
}
`;
}

// ── Shared helpers ────────────────────────────────────────────────────────

function generateSchemaInterface(className: string, columns: ColumnInfo[]): string {
  const fields = columns.map(c => {
    const tsType = c.isNullable ? `${c.tsType} | null` : c.tsType;
    return `  ${c.name}: ${tsType};`;
  }).join('\n');
  return `export interface ${className}Schema {\n${fields}\n}`;
}

function generateColumnDecls(columns: ColumnInfo[]): string {
  return columns.map(c => {
    const tsType = c.isNullable ? `${c.tsType} | null` : c.tsType;
    return `  readonly ${c.name} = new Column<${c.tsType}>('${c.name}');  // ${tsType}`;
  }).join('\n') + '\n';
}

function generateRelDecls(relationships: RelationshipInfo[]): string {
  if (relationships.length === 0) return '  // (none)\n';
  return relationships.map(r => {
    const cls = `_${toPascalCase(r.targetTable)}RowBase`;
    return `  ${r.name}?: RelationshipArray<${cls}>;`;
  }).join('\n') + '\n';
}

function generateRelDefs(relationships: RelationshipInfo[]): string {
  if (relationships.length === 0) return '[]';
  const entries = relationships.map(r => {
    const base = `{ name: '${r.name}', targetTable: '${r.targetTable}', loadWith: '${r.loadWith}'`;
    if (r.kind === 'link') {
      return `    ${base}, kind: 'link', linkTable: '${r.linkTable}', sourceFk: '${r.sourceFk}', targetFk: '${r.targetFk}' }`;
    } else {
      return `    ${base}, kind: 'direct', foreignKey: '${r.foreignKey}' }`;
    }
  });
  return `[\n${entries.join(',\n')},\n  ]`;
}

function generateFactoryMethods(className: string, pkColumn: string): string {
  return `\
  /** Load a row by primary key at simple column set. Returns null if not found. */
  static async findById(
    id:          number,
    connection?: PoolClient,
  ): Promise<_${className}RowBase | null> {
    const row   = new _${className}RowBase();
    const found = await row._load(
      _${className}RowBase.columnSets.simple,
      _${className}RowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { ${pkColumn}: id },
      connection,
    );
    return found ? row : null;
  }

  /** Load a row by its name column at simple column set. Returns null if not found. */
  static async findByName(
    name:        string,
    connection?: PoolClient,
  ): Promise<_${className}RowBase | null> {
    const row   = new _${className}RowBase();
    const found = await row._load(
      _${className}RowBase.columnSets.simple,
      _${className}RowBase.relationshipDefs.filter(r => r.loadWith === 'simple'),
      { name },
      connection,
    );
    return found ? row : null;
  }
`;
}

// ── String utilities ──────────────────────────────────────────────────────

function toPascalCase(name: string): string {
  return name.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

function toKebabCase(name: string): string {
  return name.replace(/_/g, '-');
}
