import * as fs   from 'fs';
import * as path from 'path';
import * as yaml from 'yaml';
import type { RelationshipInfo } from './types.ts';

// ── Shape of orm.config.yaml ──────────────────────────────────────────────

interface RawRelationship {
  name:        string;
  kind:        'link' | 'direct';
  targetTable: string;
  loadWith?:   'simple' | 'all';
  // link
  linkTable?:  string;
  sourceFk?:   string;
  targetFk?:   string;
  // direct
  foreignKey?: string;
}

interface RawConfig {
  referenceTables?: string[];
  linkTables?:      string[];
  relationships?:   Record<string, RawRelationship[]>;
  output?: {
    directory?: string;
  };
}

// ── Parsed config ─────────────────────────────────────────────────────────

export interface OrmConfig {
  referenceTables: Set<string>;
  linkTables:      Set<string>;
  relationships:   Map<string, RelationshipInfo[]>;
  outputDir:       string;
}

// ── Loader ────────────────────────────────────────────────────────────────

/**
 * Reads and validates orm.config.yaml from the project root (the directory
 * that contains the src/ folder).
 */
export function loadConfig(projectRoot: string): OrmConfig {
  const configPath = path.join(projectRoot, 'orm.config.yaml');

  if (!fs.existsSync(configPath)) {
    throw new Error(
      `orm.config.yaml not found at ${configPath}.\n`
      + `Copy orm.config.yaml.example to orm.config.yaml and fill it in.`,
    );
  }

  const raw = yaml.parse(fs.readFileSync(configPath, 'utf-8')) as RawConfig;

  const relationships = new Map<string, RelationshipInfo[]>();
  for (const [tableName, rels] of Object.entries(raw.relationships ?? {})) {
    relationships.set(
      tableName,
      rels.map(r => validateRelationship(r, tableName)),
    );
  }

  return {
    referenceTables: new Set(raw.referenceTables ?? []),
    linkTables:      new Set(raw.linkTables ?? []),
    relationships,
    outputDir:       raw.output?.directory ?? 'src/data/generated',
  };
}

function validateRelationship(r: RawRelationship, table: string): RelationshipInfo {
  if (!r.name)        throw new Error(`Relationship in '${table}' is missing 'name'`);
  if (!r.kind)        throw new Error(`Relationship '${r.name}' in '${table}' is missing 'kind'`);
  if (!r.targetTable) throw new Error(`Relationship '${r.name}' in '${table}' is missing 'targetTable'`);

  if (r.kind === 'link') {
    if (!r.linkTable || !r.sourceFk || !r.targetFk) {
      throw new Error(
        `Link relationship '${r.name}' in '${table}' requires linkTable, sourceFk, targetFk`,
      );
    }
  } else {
    if (!r.foreignKey) {
      throw new Error(
        `Direct relationship '${r.name}' in '${table}' requires foreignKey`,
      );
    }
  }

  return { ...r, loadWith: r.loadWith ?? 'simple' } as RelationshipInfo;
}
