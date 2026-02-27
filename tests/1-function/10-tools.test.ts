import { suite, test } from 'node:test';
import TestBattery from 'test-battery';
import { deepClone, deepMerge } from '../../src/util/tools.js';

suite('Tools Module', () => {
  TestBattery.test('deepClone primitives', (battery) => {
    const original = 42;
    const cloned = deepClone(original);

    battery.test('Cloned primitive equals original')
      .value(cloned)
      .value(original)
      .equal;
  });

  TestBattery.test('deepClone null returns null', (battery) => {
    const original = null;
    const cloned = deepClone(original);

    battery.test('Cloned null is null')
      .value(cloned)
      .is.null;
  });

  TestBattery.test('deepClone string returns separate string', (battery) => {
    const original = 'hello';
    const cloned = deepClone(original);

    battery.test('Cloned string equals original')
      .value(cloned)
      .value(original)
      .equal;
  });

  TestBattery.test('deepClone simple object creates separate instance', (battery) => {
    const original = { name: 'John', age: 30 };
    const cloned = deepClone(original);

    // Verify deep copy - modifying clone doesn't affect original
    (cloned as any).name = 'Jane';
    (cloned as any).age = 25;

    battery.test('Original object unchanged after clone modification')
      .value(original.name)
      .value('John')
      .equal;

    battery.test('Original age unchanged after clone modification')
      .value(original.age)
      .value(30)
      .equal;

    battery.test('Clone has new values')
      .value((cloned as any).name)
      .value('Jane')
      .equal;
  });

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

    battery.test('Original nested object unchanged after clone modification')
      .value((original as any).user.profile.name)
      .value('John')
      .equal;

    battery.test('Original nested setting unchanged')
      .value((original as any).user.settings.theme)
      .value('dark')
      .equal;

    battery.test('Clone has modified nested values')
      .value((cloned as any).user.profile.name)
      .value('Jane')
      .equal;
  });

  TestBattery.test('deepClone array creates separate instance', (battery) => {
    const original = [1, 2, 3];
    const cloned = deepClone(original);

    // Modify clone
    (cloned as any)[0] = 99;
    (cloned as any).push(4);

    battery.test('Original array unchanged after clone modification')
      .value(original.length)
      .value(3)
      .equal;

    battery.test('Original first element unchanged')
      .value(original[0])
      .value(1)
      .equal;

    battery.test('Clone has modified values')
      .value((cloned as any)[0])
      .value(99)
      .equal;

    battery.test('Clone has new length')
      .value((cloned as any).length)
      .value(4)
      .equal;
  });

  TestBattery.test('deepClone array of objects creates deep copies', (battery) => {
    const original = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ];

    const cloned = deepClone(original);

    // Modify cloned array element
    (cloned as any)[0].name = 'Alicia';

    battery.test('Original array element unchanged')
      .value((original as any)[0].name)
      .value('Alice')
      .equal;

    battery.test('Clone element has new value')
      .value((cloned as any)[0].name)
      .value('Alicia')
      .equal;
  });

  TestBattery.test('deepMerge combines objects without mutating originals', (battery) => {
    const original = { a: 1, b: 2 };
    const source = { b: 20, c: 30 };

    const merged = deepMerge(original, source);

    battery.test('Original object unchanged')
      .value(original.a)
      .value(1)
      .equal;

    battery.test('Original has no c property')
      .value((original as any).c)
      .is.undefined;

    battery.test('Merged object has both properties')
      .value((merged as any).a)
      .value(1)
      .equal;

    battery.test('Merged object has source value for b')
      .value((merged as any).b)
      .value(20)
      .equal;

    battery.test('Merged object has c from source')
      .value((merged as any).c)
      .value(30)
      .equal;
  });

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

    battery.test('Original object unchanged')
      .value((original as any).user.settings.notifications)
      .is.undefined;

    battery.test('Merged has original name')
      .value((merged as any).user.profile.name)
      .value('John')
      .equal;

    battery.test('Merged has updated email from source')
      .value((merged as any).user.profile.email)
      .value('newemail@example.com')
      .equal;

    battery.test('Merged has new notifications setting')
      .value((merged as any).user.settings.notifications)
      .is.true;

    battery.test('Merged preserves theme from original')
      .value((merged as any).user.settings.theme)
      .value('dark')
      .equal;
  });

  TestBattery.test('deepMerge respects array replacement (not merging)', (battery) => {
    const original = {
      items: [1, 2, 3],
    };

    const source = {
      items: [4, 5],
    };

    const merged = deepMerge(original, source);

    battery.test('Original array unchanged')
      .value(original.items.length)
      .value(3)
      .equal;

    battery.test('Merged array is replaced with source array')
      .value((merged as any).items.length)
      .value(2)
      .equal;

    battery.test('Merged array has first source element')
      .value((merged as any).items[0])
      .value(4)
      .equal;
  });

  TestBattery.test('deepClone and deepMerge create independent objects', (battery) => {
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
    const merged = deepMerge(original, { config: { logging: { level: 'trace' } } });

    // Modify cloned
    (cloned as any).config.logging.level = 'silly';
    (cloned as any).config.logging.modules.auth.level = 'verbose';

    battery.test('Original object unchanged after clone modification')
      .value((original as any).config.logging.level)
      .value('info')
      .equal;

    battery.test('Original auth level unchanged after clone modification')
      .value((original as any).config.logging.modules.auth.level)
      .value('debug')
      .equal;

    battery.test('Clone has modified values')
      .value((cloned as any).config.logging.level)
      .value('silly')
      .equal;

    battery.test('Merged has source value')
      .value((merged as any).config.logging.level)
      .value('trace')
      .equal;

    battery.test('Merged preserves original module config')
      .value((merged as any).config.logging.modules.auth.level)
      .value('debug')
      .equal;
  });

  TestBattery.test('deepMerge with multiple sources', (battery) => {
    const base = { a: 1, b: 2 };
    const source1 = { b: 20, c: 30 };
    const source2 = { c: 300, d: 40 };

    const merged = deepMerge(base, source1, source2);

    battery.test('Base unchanged')
      .value(base.a)
      .value(1)
      .equal;

    battery.test('Merged has base value a')
      .value((merged as any).a)
      .value(1)
      .equal;

    battery.test('Merged has source1 value b')
      .value((merged as any).b)
      .value(20)
      .equal;

    battery.test('Merged has source2 value c (last wins)')
      .value((merged as any).c)
      .value(300)
      .equal;

    battery.test('Merged has source2 value d')
      .value((merged as any).d)
      .value(40)
      .equal;
  });
});
