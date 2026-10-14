import type { TableInfo, ColumnInfo, RelationshipInfo } from './types.js';

// Summary columns are fixed by convention across all tables.
const SUMMARY_COLUMNS = ['id', 'name', 'title', 'created_at'];

/**
 * Maps TypeScript types to runtime type validators.
 */
function getTypeValidator(tsType: string, isNullable: boolean): string {
  const baseValidator = (() => {
    switch (tsType) {
      case 'number': return 'TypeValidators.number';
      case 'string': return 'TypeValidators.string';
      case 'boolean': return 'TypeValidators.boolean';
      case 'Date': return 'TypeValidators.date';
      case 'Record<string, unknown>': return 'TypeValidators.object';
      default: return 'undefined'; // No validation for unknown types
    }
  })();

  if (isNullable && baseValidator !== 'undefined') {
    return `${baseValidator}OrNull`;
  }
  return baseValidator;
}

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
        return `import type { _${cls}RowBase } from './_${toKebabCase(t)}-row-base.js';`;
      }).join('\n')
    : '';

  return `\
// AUTO-GENERATED — do not edit. Run \`npm run generate\` to regenerate.
// Table: ${tableName}

import { Column, TypeValidators }            from '../orm/column.js';
import { RelationshipArray } from '../orm/relationship-array.js';
import { MutableRow }        from '../orm/mutable-row.js';
import { registerRow }       from '../orm/row-registry.js';
import type { ColumnSets, RelationshipDef } from '../orm/types.js';
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
  // ── Relationships ──────────────────────────────────────────────────

${relDecls}
  constructor(
    initialData?: Record<string, unknown>,
    assumeFromDb: boolean = false
  ) {
    super();
    this._registerColumns(
${columns.map(c => `      this.${c.name}`).join(',\n')},
    );
    this._initialize(initialData, assumeFromDb);
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
  const { tableName, className, pkColumn, columns, relationships } = table;
  const referenceRels = relationships.filter(r => r.kind === 'single' && r.isReference);
  const referenceImports = [...new Set(referenceRels.map(r => r.targetTable))].map(t =>
    `import type { _${toPascalCase(t)}RowBase } from './_${toKebabCase(t)}-row-base.js';`,
  ).join('\n');

  const schemaInterface = generateSchemaInterface(className, columns);
  const immutableDecls  = columns.map(c => {
    const tsType = c.isNullable ? `${c.tsType} | null` : c.tsType;
    const validator = getTypeValidator(c.tsType, c.isNullable);
    const validatorArg = validator === 'undefined' ? 'undefined' : validator;
    return `  readonly ${c.name} = new Column<${c.tsType}>('${c.name}', ${validatorArg}, true);  // ${tsType}`;
  }).join('\n');

  return `\
// AUTO-GENERATED — do not edit. Run \`npm run generate\` to regenerate.
// Reference table: ${tableName}

import { Column, TypeValidators } from '../orm/column.js';
import { ImmutableRow } from '../orm/immutable-row.js';
import { ReferenceData }   from '../orm/reference-data.js';
${referenceImports}

// ── Schema interface ───────────────────────────────────────────────────────

${schemaInterface}

// ── Generated base ─────────────────────────────────────────────────────────

export class _${className}RowBase extends ImmutableRow {
  static readonly tableName = '${tableName}';
  static readonly pkColumn  = '${pkColumn}';

  // ── Columns ──────────────────────────────────────────────────────────────

${immutableDecls}

${referenceRels.map(r => `
  get ${r.name}(): _${toPascalCase(r.targetTable)}RowBase | null | undefined {
    const value = this.${r.foreignKey}.toJSON();
    if (value === undefined || value === null) return value;
    return (ReferenceData.byTableId('${r.targetTable}', value${r.targetColumn ? `, '${r.targetColumn}'` : ''}) ?? null) as _${toPascalCase(r.targetTable)}RowBase | null;
  }
`).join('')}

  // ── Construction ─────────────────────────────────────────────────────────

  _fromRecord(data: Record<string, unknown>): this {
    const row = new (this.constructor as new () => this)();
${columns.map(c => {
    const getter = c.tsType === 'Date'
      ? `data['${c.name}'] != null ? new Date(data['${c.name}'] as string) : null`
      : `(data['${c.name}'] ?? null) as ${c.tsType} | null`;
    return `    row.${c.name}.assumeClean(${getter});`;
  }).join('\n')}
    row._registerColumns(
${columns.map(c => `      row.${c.name}`).join(',\n')},
    );${referenceRels.filter(r => r.isReference).length ? `
    row._registerImmutableRefs(
${referenceRels.filter(r => r.isReference).map(r => {
  return `      '${r.name}'`;
    }).join(',\n')}\n    );` : ''}
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
  const baseFile = `../generated/_${toKebabCase(tableName)}-row-base.js`;

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
  const baseFile = `../generated/_${toKebabCase(tableName)}-row-base.js`;

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
    const validator = getTypeValidator(c.tsType, c.isNullable);
    const immutableFlag = c.isPrimaryKey ? ', true' : '';
    return `  readonly ${c.name} = new Column<${c.tsType}>('${c.name}', ${validator}${immutableFlag});  // ${tsType}`;
  }).join('\n') + '\n';
}

function generateRelDecls(relationships: RelationshipInfo[]): string {
  if (relationships.length === 0) return '  // (none)\n';
  return relationships.map(r => {
    const cls = `_${toPascalCase(r.targetTable)}RowBase`;
    if (r.kind === 'single') {
      return `  get ${r.name}(): ${cls} | null | undefined {
    return this._getSingleRelationship('${r.name}') as ${cls} | null | undefined;
  }`;
    }
    return `  get ${r.name}(): RelationshipArray<${cls}> | undefined {
    return this._relationships.get('${r.name}');
  }`;
  }).join('\n') + '\n';
}

function generateRelDefs(relationships: RelationshipInfo[]): string {
  if (relationships.length === 0) return '[]';
  const entries = relationships.map(r => {
    const base = `{ name: '${r.name}', targetTable: '${r.targetTable}', loadWith: '${r.loadWith}'`;
    if (r.kind === 'single') {
      return `    ${base}, kind: 'single', foreignKey: '${r.foreignKey}', isReference: ${r.isReference === true}${r.targetColumn ? `, targetColumn: '${r.targetColumn}'` : ''} }`;
    }
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
