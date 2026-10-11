import type { MutableRow } from './mutable-row.js';

type MutableRowConstructor = new () => MutableRow;

/**
 * Maps table names to their generated row constructors. Used at runtime by
 * MutableRow._loadRelationship() to instantiate related rows without
 * introducing circular import chains in individual generated files.
 *
 * Generated files call registerRow() at module load time. As long as the
 * application imports every generated file (typically via a barrel), all
 * tables are registered before any query runs.
 */
const registry = new Map<string, MutableRowConstructor>();

export function registerRow(tableName: string, ctor: MutableRowConstructor): void {
  registry.set(tableName, ctor);
}

export function getRowClass(tableName: string): MutableRowConstructor {
  const ctor = registry.get(tableName);
  if (!ctor) {
    throw new Error(
      `No row class registered for table '${tableName}'. ` +
      `Ensure the generated file for this table is imported before queries run.`
    );
  }
  return ctor;
}
