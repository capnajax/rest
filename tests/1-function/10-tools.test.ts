import assert from 'node:assert/strict';
import { suite, test } from 'node:test';
import TestBattery from 'test-battery';
import { InvalidQuery } from '../../src/util/exceptions.js';
import {
  assertPGableInteger,
  assertPGableIntegerArray,
  assertRecord,
  deepClone,
  deepMerge,
  earlierDate,
  isValidDate,
  normalizeBoolean,
  normalizeDate,
  normalizeZeroOrOne,
  outputHandler,
  pick,
} from '../../src/util/tools.js';

function isInvalidQuery(error: unknown): boolean {
  return error instanceof InvalidQuery;
}

suite('Tools Module', () => {
  TestBattery.test('deepClone primitives', (battery) => {
    const original = 42;
    const cloned = deepClone(original);

    battery
      .test('Cloned primitive equals original')
      .value(cloned)
      .value(original).equal;
  });

  TestBattery.test('deepClone null returns null', (battery) => {
    const original = null;
    const cloned = deepClone(original);

    battery.test('Cloned null is null').value(cloned).is.null;
  });

  TestBattery.test('deepClone string returns separate string', (battery) => {
    const original = 'hello';
    const cloned = deepClone(original);

    battery.test('Cloned string equals original').value(cloned).value(original)
      .equal;
  });

  TestBattery.test(
    'deepClone simple object creates separate instance',
    (battery) => {
      const original = { name: 'John', age: 30 };
      const cloned = deepClone(original);

      // Verify deep copy - modifying clone doesn't affect original
      (cloned as any).name = 'Jane';
      (cloned as any).age = 25;

      battery
        .test('Original object unchanged after clone modification')
        .value(original.name)
        .value('John').equal;

      battery
        .test('Original age unchanged after clone modification')
        .value(original.age)
        .value(30).equal;

      battery
        .test('Clone has new values')
        .value((cloned as any).name)
        .value('Jane').equal;
    }
  );

  TestBattery.test('deepClone nested object creates deep copy', (battery) => {
    const original = {
      user: {
        profile: {
          name: 'John',
          email: 'john@example.com',
        },
        settings: {
          theme: 'dark',
        },
      },
    };

    const cloned = deepClone(original);

    // Modify deeply nested property
    (cloned as any).user.profile.name = 'Jane';
    (cloned as any).user.settings.theme = 'light';

    battery
      .test('Original nested object unchanged after clone modification')
      .value((original as any).user.profile.name)
      .value('John').equal;

    battery
      .test('Original nested setting unchanged')
      .value((original as any).user.settings.theme)
      .value('dark').equal;

    battery
      .test('Clone has modified nested values')
      .value((cloned as any).user.profile.name)
      .value('Jane').equal;
  });

  TestBattery.test('deepClone array creates separate instance', (battery) => {
    const original = [1, 2, 3];
    const cloned = deepClone(original);

    // Modify clone
    (cloned as any)[0] = 99;
    (cloned as any).push(4);

    battery
      .test('Original array unchanged after clone modification')
      .value(original.length)
      .value(3).equal;

    battery.test('Original first element unchanged').value(original[0]).value(1)
      .equal;

    battery
      .test('Clone has modified values')
      .value((cloned as any)[0])
      .value(99).equal;

    battery
      .test('Clone has new length')
      .value((cloned as any).length)
      .value(4).equal;
  });

  TestBattery.test(
    'deepClone array of objects creates deep copies',
    (battery) => {
      const original = [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ];

      const cloned = deepClone(original);

      // Modify cloned array element
      (cloned as any)[0].name = 'Alicia';

      battery
        .test('Original array element unchanged')
        .value((original as any)[0].name)
        .value('Alice').equal;

      battery
        .test('Clone element has new value')
        .value((cloned as any)[0].name)
        .value('Alicia').equal;
    }
  );

  TestBattery.test(
    'deepMerge combines objects without mutating originals',
    (battery) => {
      const original = { a: 1, b: 2 };
      const source = { b: 20, c: 30 };

      const merged = deepMerge(original, source);

      battery.test('Original object unchanged').value(original.a).value(1)
        .equal;

      battery.test('Original has no c property').value((original as any).c).is
        .undefined;

      battery
        .test('Merged object has both properties')
        .value((merged as any).a)
        .value(1).equal;

      battery
        .test('Merged object has source value for b')
        .value((merged as any).b)
        .value(20).equal;

      battery
        .test('Merged object has c from source')
        .value((merged as any).c)
        .value(30).equal;
    }
  );

  TestBattery.test('deepMerge nested objects merges recursively', (battery) => {
    const original = {
      user: {
        profile: {
          name: 'John',
          email: 'john@example.com',
        },
        settings: {
          theme: 'dark',
        },
      },
    };

    const source = {
      user: {
        profile: {
          email: 'newemail@example.com',
        },
        settings: {
          notifications: true,
        },
      },
    };

    const merged = deepMerge(original, source);

    battery
      .test('Original object unchanged')
      .value((original as any).user.settings.notifications).is.undefined;

    battery
      .test('Merged has original name')
      .value((merged as any).user.profile.name)
      .value('John').equal;

    battery
      .test('Merged has updated email from source')
      .value((merged as any).user.profile.email)
      .value('newemail@example.com').equal;

    battery
      .test('Merged has new notifications setting')
      .value((merged as any).user.settings.notifications).is.true;

    battery
      .test('Merged preserves theme from original')
      .value((merged as any).user.settings.theme)
      .value('dark').equal;
  });

  TestBattery.test(
    'deepMerge respects array replacement (not merging)',
    (battery) => {
      const original = {
        items: [1, 2, 3],
      };

      const source = {
        items: [4, 5],
      };

      const merged = deepMerge(original, source);

      battery
        .test('Original array unchanged')
        .value(original.items.length)
        .value(3).equal;

      battery
        .test('Merged array is replaced with source array')
        .value((merged as any).items.length)
        .value(2).equal;

      battery
        .test('Merged array has first source element')
        .value((merged as any).items[0])
        .value(4).equal;
    }
  );

  TestBattery.test(
    'deepClone and deepMerge create independent objects',
    (battery) => {
      const original = {
        config: {
          logging: {
            level: 'info',
            modules: {
              auth: {
                level: 'debug',
              },
            },
          },
        },
      };

      const cloned = deepClone(original);
      const merged = deepMerge(original, {
        config: { logging: { level: 'trace' } },
      });

      // Modify cloned
      (cloned as any).config.logging.level = 'silly';
      (cloned as any).config.logging.modules.auth.level = 'verbose';

      battery
        .test('Original object unchanged after clone modification')
        .value((original as any).config.logging.level)
        .value('info').equal;

      battery
        .test('Original auth level unchanged after clone modification')
        .value((original as any).config.logging.modules.auth.level)
        .value('debug').equal;

      battery
        .test('Clone has modified values')
        .value((cloned as any).config.logging.level)
        .value('silly').equal;

      battery
        .test('Merged has source value')
        .value((merged as any).config.logging.level)
        .value('trace').equal;

      battery
        .test('Merged preserves original module config')
        .value((merged as any).config.logging.modules.auth.level)
        .value('debug').equal;
    }
  );

  TestBattery.test('deepMerge with multiple sources', (battery) => {
    const base = { a: 1, b: 2 };
    const source1 = { b: 20, c: 30 };
    const source2 = { c: 300, d: 40 };

    const merged = deepMerge(base, source1, source2);

    battery.test('Base unchanged').value(base.a).value(1).equal;

    battery
      .test('Merged has base value a')
      .value((merged as any).a)
      .value(1).equal;

    battery
      .test('Merged has source1 value b')
      .value((merged as any).b)
      .value(20).equal;

    battery
      .test('Merged has source2 value c (last wins)')
      .value((merged as any).c)
      .value(300).equal;

    battery
      .test('Merged has source2 value d')
      .value((merged as any).d)
      .value(40).equal;
  });
});

suite('Tools regressions and validation', () => {
  test('deepClone accepts shadowed methods and null prototypes', () => {
    const shadowed = { hasOwnProperty: 1, nested: { value: 2 } };
    const clone = deepClone(shadowed);
    assert.deepEqual(clone, shadowed);
    assert.notEqual(clone?.nested, shadowed.nested);
    const record = Object.assign(Object.create(null), { value: 3 });
    assert.deepEqual(deepClone(record), { value: 3 });
  });

  test('deepMerge replaces values across scalar, array and object types', () => {
    const cases: [unknown, unknown][] = [
      [1, { nested: { value: 2 } }],
      [null, { value: 2 }],
      [[1, 2], { value: 3 }],
      [{ value: 1 }, [2, 3]],
      [{ value: 1 }, null],
      [[1, 2], false],
    ];
    for (const [before, after] of cases) {
      const base: { value: unknown } = { value: before };
      const result = deepMerge(base, { value: after });
      assert.deepEqual(result, { value: after });
      assert.equal(JSON.stringify(result), JSON.stringify({ value: after }));
      assert.equal(base.value, before);
    }
  });

  test('deepMerge retains nested siblings across multiple sources', () => {
    const base: { nested: Record<string, number> } = {
      nested: { a: 1, b: 2 },
    };
    const result = deepMerge(base, { nested: { a: 3 } }, { nested: { b: 4 } });
    assert.deepEqual(result, { nested: { a: 3, b: 4 } });
    assert.deepEqual(base, { nested: { a: 1, b: 2 } });
  });

  test('deepMerge isolates replacement values from every input', () => {
    for (const value of [undefined, 0, [], {}]) {
      const base = { value };
      const source = { value: { nested: { count: 1 } } };
      const result = deepMerge(base, source) as typeof source;
      result.value.nested.count = 2;
      assert.equal(source.value.nested.count, 1);
      assert.equal(base.value, value);
    }
    const source = { items: [{ count: 1 }] };
    const result = deepMerge({ items: [] as { count: number }[] }, source);
    result.items[0].count = 2;
    assert.equal(source.items[0].count, 1);
  });

  test('deepMerge ignores inherited properties and preserves special keys', () => {
    const source = Object.assign(Object.create({ inherited: true }), {
      own: { count: 1 },
    });
    assert.deepEqual(deepMerge({}, source), { own: { count: 1 } });
    const payload = JSON.parse(
      '{"__proto__":{"injected":true},"constructor":{"prototype":' +
        '{"injected":true}},"hasOwnProperty":1}'
    );
    for (const result of [deepMerge({}, payload), deepMerge(payload)]) {
      assert.equal(Object.getPrototypeOf(result), Object.prototype);
      assert.equal(Object.hasOwn(result, '__proto__'), true);
      assert.equal(result.injected, undefined);
      assert.deepEqual(JSON.parse(JSON.stringify(result)), payload);
    }
    assert.equal(Object.hasOwn(Object.prototype, 'injected'), false);
  });

  test('deepMerge replaces functions without mutating their properties', () => {
    const hook = () => 1;
    const result = deepMerge({ hook }, { hook: { count: 2 } });
    assert.deepEqual(result, { hook: { count: 2 } });
    assert.deepEqual(Object.keys(hook), []);
    assert.equal(deepMerge({ hook }).hook, hook);
    assert.equal(deepMerge({ hook: {} }, { hook }).hook, hook);
  });

  test('integer validation enforces PostgreSQL bounds and zero options', () => {
    for (const value of [-2147483648, 0, 2147483647]) {
      assert.doesNotThrow(() => assertPGableInteger(value));
    }
    for (const value of [
      -2147483649,
      2147483648,
      1.5,
      NaN,
      Infinity,
      '1',
      null,
    ]) {
      assert.throws(() => assertPGableInteger(value), isInvalidQuery);
    }
    assert.doesNotThrow(() => assertPGableInteger(0, { gezero: true }));
    assert.doesNotThrow(() => assertPGableInteger(1, { gtzero: true }));
    assert.throws(
      () => assertPGableInteger(-1, { gezero: true }),
      isInvalidQuery
    );
    assert.throws(
      () => assertPGableInteger(0, { gtzero: true }),
      isInvalidQuery
    );
  });

  test('integer array assertion narrows to an array and checks elements', () => {
    const value: unknown = [1, 2];
    assertPGableIntegerArray(value);
    const numbers: number[] = value;
    assert.equal(
      numbers.reduce((sum, number) => sum + number, 0),
      3
    );
    assert.doesNotThrow(() => assertPGableIntegerArray([]));
    for (const invalid of [1, null, [1, '2'], [NaN], [2147483648]]) {
      assert.throws(() => assertPGableIntegerArray(invalid), isInvalidQuery);
    }
  });

  test('date validation rejects invalid Date objects and strings', () => {
    const date = new Date('2026-01-01T00:00:00Z');
    assert.equal(isValidDate(date), true);
    assert.equal(isValidDate(date.toISOString()), true);
    assert.equal(normalizeDate(date), date);
    assert.deepEqual(normalizeDate(date.toISOString()), date);
    for (const invalid of [new Date(NaN), '', 'invalid date']) {
      assert.equal(isValidDate(invalid), false);
      assert.throws(() => normalizeDate(invalid), isInvalidQuery);
    }
    for (const invalid of [null, undefined, 0, {}]) {
      assert.equal(isValidDate(invalid), false);
    }
    const later = new Date('2026-02-01T00:00:00Z');
    assert.equal(earlierDate(date, later), date);
    assert.equal(earlierDate(later, date), date);
    assert.equal(earlierDate(date, new Date(date)), date);
  });

  test('boolean normalisation handles aliases, defaults and invalid input', () => {
    for (const value of [true, 'TRUE', 'yes', '1', 'sí', 'sim']) {
      assert.equal(normalizeBoolean(value), true);
    }
    for (const value of [false, 'FALSE', 'no', '0', 'não']) {
      assert.equal(normalizeBoolean(value), false);
    }
    assert.equal(normalizeBoolean('STREAM', { name: 'stream' }), true);
    assert.equal(normalizeBoolean(undefined, { default: false }), false);
    assert.equal(normalizeBoolean(undefined, { default: true }), true);
    assert.throws(() => normalizeBoolean(), isInvalidQuery);
    assert.throws(() => normalizeBoolean('maybe'), isInvalidQuery);
  });

  test('single-value normalisation applies each multiple-value policy', () => {
    assert.equal(normalizeZeroOrOne(), undefined);
    assert.equal(normalizeZeroOrOne([]), undefined);
    assert.equal(normalizeZeroOrOne(''), '');
    assert.equal(normalizeZeroOrOne(['a']), 'a');
    assert.equal(normalizeZeroOrOne(['a', 'b'], 'first'), 'a');
    assert.equal(normalizeZeroOrOne(['a', 'b'], 'last'), 'b');
    assert.throws(() => normalizeZeroOrOne(['a', 'b']), isInvalidQuery);
  });

  test('records reject arrays and pick includes only requested own keys', () => {
    const record = Object.assign(Object.create({ inherited: 1 }), {
      a: 2,
      b: undefined,
      c: 3,
    });
    assert.doesNotThrow(() => assertRecord(record));
    for (const value of [null, [], 1, 'object']) {
      assert.throws(() => assertRecord(value), TypeError);
    }
    assert.deepEqual(pick(record, ['a', 'b'], 'inherited', 'missing'), {
      a: 2,
      b: undefined,
    });
  });

  test('output handler frames streaming and buffered JSON responses', () => {
    for (const stream of [true, false]) {
      for (const records of [[], [{ id: 1 }, { id: 2 }]]) {
        const writes: string[] = [];
        const headers = new Map<string, string>();
        let ends = 0;
        const response = {
          headers,
          send: (value: string) => {
            writes.push(value);
          },
          sendChunk: (value: string) => {
            writes.push(value);
          },
          end: () => {
            ends++;
          },
        } as unknown as Parameters<typeof outputHandler>[1];
        const output = outputHandler(stream, response);
        for (const record of records) output.object(record);
        if (stream === false) assert.deepEqual(writes, []);
        output.end();
        const expected = stream
          ? records.map((record) => JSON.stringify(record) + '\n').join('')
          : JSON.stringify(records);
        assert.equal(writes.join(''), expected);
        assert.equal(
          headers.get('Content-Type'),
          stream ? 'application/x-ndjson' : 'application/json'
        );
        assert.equal(ends, 1);
      }
    }
  });
});
