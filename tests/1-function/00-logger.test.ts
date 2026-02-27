import { after, before, suite } from 'node:test';
import { TestBattery } from 'test-battery';
import {
  initializeLogger,
  getLogger,
  clearLoggerCache,
  resetLogger,
  registerFormat
} from '../../src/util/logger';
import winston from 'winston';
import { LoggerConfig, MMP } from '../../src/util/logger-types';

suite('Logger Module', () => {

  after(async () => {
    resetLogger();
  });

  before(async () => {
    // visual testing to ensure logs are formatted correctly - not an automated
    // test
    const config:LoggerConfig = {
      logging: {
        level: 'debug',
        format: 'colored',
        transport: {
          type: 'console',
        },
        modules: {
          silly: {
            level: 'silly',
          },
          error: {
            level: 'error',
          },
          http: {
            methods: {
              GET: {
                paths: {
                  '/test': {
                    level: 'info',
                    transport: [
                      { type: 'console' },
                      { type: 'console', format: 'json', level: 'error' },
                      { type: 'console', format: 'simple', level: 'warn' },
                      { type: 'console', format: 'detailed' }
                    ]
                  },
                },
              }
            }
          }
        }
      },
    };
    initializeLogger(config);
    const log = getLogger('test', 'loggerTest');
    log.error('Visible ok - error');
    log.warn('Visible ok - warning');
    log.info('Visible ok - info');
    log.http('Visible ok - http');
    log.debug('Visible ok - debug - lowest level for test.loggerTest');
    log.verbose('WRONG - verbose - should NOT appear because level is debug');
    log.silly('WRONG - silly - should NOT appear because level is debug');

    const sillyLog = getLogger('silly', 'sillyTest');
    sillyLog.silly('Visible ok - silly - lowest level for silly.sillyTest');

    const errorLog = getLogger('error', 'errorTest');
    errorLog.error('Visible ok - error - lowest level for error.errorTest');
    errorLog.warn('WRONG - warn - should NOT appear because of module override');

    const endpointLog = getLogger('http', 'GET', '/test');
    endpointLog.info('Visible TWICE ok - info - lowest level for http GET /test');
    endpointLog.debug('WRONG - debug - should NOT appear because of path override');

    log.info('## Back to first logger - should still be debug level');
    log.debug('Visible ok - debug - lowest level for test.loggerTest');
    log.silly('WRONG - should NOT appear because level is debug for test.loggerTest');
    sillyLog.info('## Back to silly logger - should still be silly level');
    sillyLog.debug('Visible ok - debug');
    sillyLog.verbose('Visible ok - verbose');
    sillyLog.silly('Visible ok - silly - lowest level for silly.sillyTest');

    await new Promise(resolve => setTimeout(resolve, 100));
    console.log();
  })

  TestBattery.test('initialization with config object', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: {
          type: 'console',
        },
      },
    };

    clearLoggerCache();
    initializeLogger(config);
    const rootLogger = getLogger('root', 'root');

    battery.test('Root logger should be Winston instance')
      .value(rootLogger instanceof winston.Logger)
      .is.true;
    battery.test('Root logger should have configured level')
      .value(rootLogger.level)
      .value('info')
      .equal;
  });

  TestBattery.test('getLogger for TypeScript function', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: {type: 'console'},
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger = getLogger('auth', 'login');

    battery.test('Should return Winston logger')
      .value(logger instanceof winston.Logger)
      .is.true;
  });

  TestBattery.test('getLogger for HTTP endpoint', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger = getLogger('users', 'GET', '/api/users/:id');

    battery.test('Should return Winston logger for HTTP endpoint')
      .value(logger instanceof winston.Logger)
      .is.true;
  });

  TestBattery.test('logger caching - same MMP returns same instance', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger1 = getLogger('auth', 'login');
    const logger2 = getLogger('auth', 'login');

    battery.test('Same module/method should return cached logger')
      .value(logger1)
      .value(logger2)
      .strictlyEqual;
  });

  TestBattery.test('different MMPs return different instances', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger1 = getLogger('auth', 'login');
    const logger2 = getLogger('auth', 'logout');

    battery.test('Different methods should return different loggers')
      .value(logger1)
      .value(logger2)
      .is.not.strictlyEqual;
  });

  TestBattery.test('config hierarchy - module overrides default', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
        modules: {
          auth: {
            level: 'debug',
          },
        },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger = getLogger('auth', 'login');

    battery.test('Module config should override default level')
      .value(logger.level)
      .value('debug')
      .equal;
  });

  TestBattery.test('config hierarchy - method overrides module', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
        modules: {
          auth: {
            level: 'debug',
            methods: {
              login: {
                level: 'trace',
              },
            },
          },
        },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger = getLogger('auth', 'login');

    battery.test('Method config should override module level')
      .value(logger.level)
      .value('trace')
      .equal;
  });

  TestBattery.test('config hierarchy - path overrides method for HTTP endpoints', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
        modules: {
          users: {
            methods: {
              GET: {
                level: 'debug',
                paths: {
                  '/api/users/:id': {
                    level: 'trace',
                  },
                },
              },
            },
          },
        },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger = getLogger('users', 'GET', '/api/users/:id');

    battery.test('Path config should override method level')
      .value(logger.level)
      .value('trace')
      .equal;
  });

  TestBattery.test('HTTP method detection is case-sensitive', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
        modules: {
          users: {
            methods: {
              GET: {
                level: 'debug',
                paths: {
                  '/path': {
                    level: 'trace',
                  },
                },
              },
            },
          },
        },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    // GET is HTTP method, should use path override
    const logger1 = getLogger('users', 'GET', '/path');
    battery.test('Uppercase HTTP method should match path config')
      .value(logger1.level)
      .value('trace')
      .equal;

    // get is TS method, should not use path override
    const logger2 = getLogger('users', 'get', '/path');
    battery.test('Lowercase method should not match HTTP path config')
      .value(logger2.level)
      .value('info')
      .equal;
  });

  TestBattery.test('error on uninitialized logger', (battery) => {
    resetLogger();

    let error: Error | null = null;
    try {
      getLogger('auth', 'login');
    } catch (e) {
      error = e as Error;
    }

    battery.test('Should throw error when not initialized')
      .value(error !== null)
      .is.true;
    battery.test('Error message should mention initialization')
      .value(error?.message.includes('not initialized') ?? false)
      .is.true;
  });

  TestBattery.test('clearLoggerCache empties cache', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
      },
    };

    initializeLogger(config);
    const logger1 = getLogger('auth', 'login');

    clearLoggerCache();

    const logger2 = getLogger('auth', 'login');

    battery.test('After cache clear, should return new logger instance')
      .value(logger1)
      .value(logger2)
      .is.not.strictlyEqual;
  });

  TestBattery.test('can register custom format', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'customFormat',
        transport: { type: 'console' },
      },
    };

    clearLoggerCache();

    const customFormat = (mmp: MMP) =>
      winston.format.simple();

    registerFormat('customFormat', customFormat);
    initializeLogger(config);

    const logger = getLogger('auth', 'login');

    battery.test('Should create logger with custom format')
      .value(logger instanceof winston.Logger)
      .is.true;
  });

  TestBattery.test('all Winston log levels available', (battery) => {
    const config = {
      logging: {
        level: 'silly',
        format: 'colored',
        transport: { type: 'console' },
      },
    };

    clearLoggerCache();
    initializeLogger(config);

    const logger = getLogger('test', 'test');

    const logMethods = [
      'error',
      'warn',
      'info',
      'http',
      'debug',
      'verbose',
      'silly',
    ];

    for (const method of logMethods) {
      battery.test(`Logger should have ${method} method`)
        .value(typeof logger[method as keyof typeof logger])
        .value('function')
        .equal;
    }
  });

  TestBattery.test('format receives correct context parameters', (battery) => {
    const config = {
      logging: {
        level: 'info',
        format: 'colored',
        transport: { type: 'console' },
      },
    };

    clearLoggerCache();

    let receivedContext: Partial<MMP> = {};

    const testFormat = (mmp: MMP) => {
      receivedContext = mmp;
      return winston.format.simple();
    };

    registerFormat('testFormat', testFormat);

    const newConfig = { ...config, logging: { ...config.logging, format: 'testFormat' } };
    initializeLogger(newConfig);

    getLogger('users', 'GET', '/api/users/:id');

    battery.test('Format should receive module')
      .value(receivedContext.module)
      .value('users')
      .equal;
    battery.test('Format should receive method')
      .value(receivedContext.method)
      .value('GET')
      .equal;
    battery.test('Format should receive path')
      .value(receivedContext.path)
      .value('/api/users/:id')
      .equal;
  });
});
