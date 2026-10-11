import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import { Column, TypeValidators } from '../../src/data/orm/column.js';
import { MutableRow } from '../../src/data/orm/mutable-row.js';
import { RelationshipArray } from '../../src/data/orm/relationship-array.js';

class FakeRow extends MutableRow {
  static readonly tableName = 'fake';
  static readonly pkColumn = 'id';
  static readonly columnSets = {
    summary: ['id'],
    simple: ['id'],
    all: ['id'],
  } as const;
  static readonly relationshipDefs = [] as const;

  readonly id = new Column<number>('id', TypeValidators.number);

  constructor(initialData?: Record<string, unknown>, assumeFromDb = false) {
    super();
    this._registerColumns(this.id);
    this._initialize(initialData, assumeFromDb);
  }
}

suite('ORM column immutability', () => {
  test('primary key becomes immutable once loaded from DB', () => {
    const row = new FakeRow({ id: 123 }, true);
    assert.equal(row.id.value, 123);
    assert.throws(
      () => { row.id.value = 456; },
      /immutable/,
    );
  });

  test('new rows may still assign primary key before save', () => {
    const row = new FakeRow();
    row.id.value = 42;
    assert.equal(row.id.value, 42);
  });

  test('Column JSON serializes to its current value', () => {
    const col = new Column<number>('id', TypeValidators.number);
    col.value = 99;
    assert.equal(JSON.stringify(col), '99');
  });

  test('MutableRow JSON serializes only current column values', () => {
    const row = new FakeRow({ id: 123 }, true);
    assert.deepEqual(JSON.parse(JSON.stringify(row)), { id: 123 });
  });

  test('RelationshipArray JSON serializes to current items', () => {
    const row = new FakeRow({ id: 123 }, true);
    const rel = new RelationshipArray([row]);
    assert.deepEqual(JSON.parse(JSON.stringify(rel)), [{ id: 123 }]);
  });
});
