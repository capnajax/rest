/**
 * Maps PostgreSQL data_type strings (from information_schema.columns)
 * to TypeScript type strings used in generated code.
 */
export function pgTypeToTs(pgType: string): string {
  switch (pgType.toLowerCase()) {
    // Integers
    case 'smallint':
    case 'integer':
    case 'bigint':
    case 'smallserial':
    case 'serial':
    case 'bigserial':
    case 'numeric':
    case 'decimal':
    case 'real':
    case 'double precision':
    case 'money':
      return 'number';

    // Text
    case 'text':
    case 'character varying':
    case 'character':
    case 'char':
    case 'varchar':
    case 'uuid':
    case 'citext':
    case 'name':
      return 'string';

    // Boolean
    case 'boolean':
      return 'boolean';

    // Date / time
    case 'date':
    case 'timestamp without time zone':
    case 'timestamp with time zone':
    case 'time without time zone':
    case 'time with time zone':
      return 'Date';

    // JSON
    case 'json':
    case 'jsonb':
      return 'Record<string, unknown>';

    // Binary
    case 'bytea':
      return 'Buffer';

    // Arrays — PostgreSQL reports these as "ARRAY" in data_type;
    // udt_name contains the element type with a leading underscore (e.g. _text).
    case 'array':
      return 'unknown[]';

    default:
      // Enums and other user-defined types come through here.
      // Fall back to string; the developer can narrow in their extension class.
      return 'string';
  }
}

/**
 * For ARRAY columns, information_schema.columns.udt_name contains the element
 * type name with a leading underscore (e.g. "_text", "_int4"). Strip the
 * underscore and map to a TypeScript array type.
 */
export function pgArrayUdtToTs(udtName: string): string {
  const element = udtName.startsWith('_') ? udtName.slice(1) : udtName;
  switch (element) {
    case 'int2':
    case 'int4':
    case 'int8':
    case 'float4':
    case 'float8':
    case 'numeric':
      return 'number[]';
    case 'text':
    case 'varchar':
    case 'bpchar':
    case 'uuid':
      return 'string[]';
    case 'bool':
      return 'boolean[]';
    default:
      return 'string[]';
  }
}
