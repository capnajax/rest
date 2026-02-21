import { suite, it, before, after } from 'node:test';
import { TestBattery } from 'test-battery';

suite('Example Test', () => {
  before(() => {
    // Setup code here
  });

  after(() => {
    // Cleanup code here
  });

  TestBattery.test('should pass', (battery) => {
    battery.test('1 + 1 = 2').value(1 + 1).value(2).equal;
  });

  TestBattery.test('should work with async', async (battery) => {
    battery.test('result = 42').value(Promise.resolve(42)).value(42).equal;
  });
});
