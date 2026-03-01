import * as fs   from 'fs';
import * as path from 'path';
import type { TableInfo } from './types.ts';
import {
  generateMutableBase, generateImmutableBase,
  generateMutableStub, generateImmutableStub,
} from './template.ts';

/**
 * Writes all generated base files to the output directory, and extension
 * stubs to the sibling tables/ directory.
 *
 * Generated base files (_*-row-base.ts) are always overwritten.
 * Extension stubs (*-row.ts) are written only if they do not already exist.
 *
 * Returns a summary of written / skipped files grouped by directory.
 */
export function writeGeneratedFiles(
  tables:      TableInfo[],
  outputDir:   string,
  projectRoot: string,
): { written: string[]; skipped: string[] } {
  const absOutputDir = path.isAbsolute(outputDir)
    ? outputDir
    : path.join(projectRoot, outputDir);

  // tables/ sits alongside generated/ in the same parent directory
  const absTablesDir = path.join(path.dirname(absOutputDir), 'tables');

  fs.mkdirSync(absOutputDir, { recursive: true });
  fs.mkdirSync(absTablesDir, { recursive: true });

  const written: string[] = [];
  const skipped: string[] = [];

  for (const table of tables) {
    // ── Generated base (always overwrite) ──────────────────────────────────
    const baseFile    = `_${toKebabCase(table.tableName)}-row-base.ts`;
    const baseContent = table.isReference
      ? generateImmutableBase(table)
      : generateMutableBase(table);

    fs.writeFileSync(path.join(absOutputDir, baseFile), baseContent, 'utf-8');
    written.push(`generated/${baseFile}`);

    // ── Extension stub (write only if absent) ───────────────────────────────
    const stubFile    = `${toKebabCase(table.tableName)}-row.ts`;
    const stubPath    = path.join(absTablesDir, stubFile);

    if (fs.existsSync(stubPath)) {
      skipped.push(`tables/${stubFile}`);
    } else {
      const stubContent = table.isReference
        ? generateImmutableStub(table)
        : generateMutableStub(table);

      fs.writeFileSync(stubPath, stubContent, 'utf-8');
      written.push(`tables/${stubFile}`);
    }
  }

  // Write an index barrel for generated/ so registerRow() and
  // ReferenceData.register() run when the barrel is imported at startup.
  writeBarrel(tables, absOutputDir);
  written.push('generated/index.ts');

  return { written, skipped };
}

function writeBarrel(tables: TableInfo[], outputDir: string): void {
  const lines = tables.map(t => {
    const fileName = `_${toKebabCase(t.tableName)}-row-base.ts`;
    const cls      = t.isReference
      ? `_${toPascalCase(t.tableName)}RowBase`
      : `_${toPascalCase(t.tableName)}RowBase`;
    return `export { ${cls} } from './${fileName}';`;
  });

  const content = [
    `// AUTO-GENERATED — do not edit.`,
    `// Import this file once at application startup to register all row classes.`,
    ``,
    ...lines,
    ``,
  ].join('\n');

  fs.writeFileSync(path.join(outputDir, 'index.ts'), content, 'utf-8');
}

// ── Utilities ─────────────────────────────────────────────────────────────

function toKebabCase(name: string): string {
  return name.replace(/_/g, '-');
}

function toPascalCase(name: string): string {
  return name.split('_').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}
