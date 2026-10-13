import winston from 'winston';
import * as fs from 'fs';
import { deepClone, deepMerge, isNil, omit } from './tools.js';
import {
  FormatType, LoggerConfig, LoggerConfigLoggingObject, LoggerLevelConfig,
  LogTransportConfig, LogTransportFactoryOptions, MMP
} from './logger-types.js';
import { registerToken, completeToken } from './readiness.js';

const DEFAULT_LEVEL_CONFIG:LoggerLevelConfig = {
  level: 'info',
  format: 'colored',
  transport: { type: 'console' } as LogTransportConfig
}

function getLevelTag(level:string):string {
  return {
    error:   '[#ERROR]',
    warn:    '[*warn*]',
    info:    '[ info ]',
    http:    '[ http ]',
    debug:   '[  dbg ]',
    verbose: '[   vb ]',
    silly:   '[    s ]',
  }[level] || '[      ]';
}

export interface HttpRequestLogData {
  method: string;
  url: string;
  statusCode?: number;
  durationMs?: number;
  [key: string]: any; // Allow additional metadata
}

/**
 * Type guard for HttpRequestLogData
 */
function isHttpRequestLogData(data: unknown): data is HttpRequestLogData {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  const obj = data as Record<string, unknown>;
  return (
    typeof obj.method === 'string' &&
    typeof obj.url === 'string' &&
    (obj.statusCode === undefined || typeof obj.statusCode === 'number') &&
    (obj.durationMs === undefined || typeof obj.durationMs === 'number')
  );
}

/**
 * Build a context string from module, method, and optional path
 */
function buildContextString(mmp: MMP, levelConfig: LoggerLevelConfig, color: boolean = true): string {
  const nocolor=color?'\x1b[0m':'';
  const green=color?'\x1b[32m':'';
  const blue=color?'\x1b[34m':'';
  if (isHttpMethod(mmp, levelConfig)) {
    return `${green}${mmp.method}${mmp.path ? ' ' + mmp.path : ''}${nocolor} [${mmp.module}]:`;
  } else {
    return `${blue}${mmp.module}→${mmp.method}${mmp.path ? '[' + mmp.path + ']' : ''}${nocolor}:`;
  }
}

// Pre-canned formats - factory functions
const formats: Record<string, FormatType> = {
  simple: () => winston.format.simple(),
  json: () => winston.format.json(),
  detailed: (mmp: MMP, levelConfig: LoggerLevelConfig) =>
    winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const context = buildContextString(mmp, levelConfig, false);

        const levelTag:string = getLevelTag(level)

        return `${timestamp} ${levelTag} ${context} ${message}`;
      })
    ),
  colored: (mmp: MMP, levelConfig: LoggerLevelConfig) =>
    winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        const reset = '\x1b[0m';

        const context = buildContextString(mmp, levelConfig);

        const levelTag:string = {
          error:   '\x1b[97;1m[\x1b[91;1;4m#ERROR\x1b[0;97m]\x1b[0m',
          warn:    '\x1b[97;1m[\x1b[94;1m*warn*\x1b[0;97m]\x1b[0m',
          info:    '\x1b[97m[\x1b[92;1m info \x1b[0;97m]\x1b[0m',
          http:    '\x1b[97m[\x1b[96;1m http \x1b[0;97m]\x1b[0m',
          debug:   '\x1b[37m[\x1b[35m  dbg \x1b[37m]\x1b[0m',
          verbose: '\x1b[90m[\x1b[37m   vb \x1b[90m]\x1b[0m',
          silly:   '\x1b[90m[\x1b[90m    s \x1b[90m]\x1b[0m',
        }[level] || '\x1b[37m[\x1b[90m      \x1b[37m]\x1b[0m';

        return `${timestamp} ${levelTag} ${context}${reset} ${message}`;
      })
    ),
  httpRequest: () => {
    // special format for HTTP request logs, expects message to be
    // HttpRequestLogData
    return winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        if (isHttpRequestLogData(message)) {
          const { method, url, statusCode, durationMs } = message;
          let output = `${timestamp} ${method} ${url} - ${statusCode}`;
          if (durationMs !== undefined) {
            output += ` (${durationMs}ms)`;
          }
          return output;
        }
        return `${timestamp} ${message}`;
      })
    );
  }
};

const transportFactories:
  Record<string, (format: LogTransportFactoryOptions) => winston.transport> = {
    console: (options: LogTransportFactoryOptions) => {
      return new winston.transports.Console(options);
    },
    file: (options: LogTransportFactoryOptions) => {
      return new winston.transports.File({
        ...options,
        filename: 'logs/app.log'
      });
    },
    errorFile: (options: LogTransportFactoryOptions) => {
      return new winston.transports.File(deepMerge(
        { level: 'error' } as winston.transports.FileTransportOptions,
        options,
        { filename: 'logs/error.log' }
      ));
    },
  };

/**
 * Get or create a transport instance. Create a new instance per logger to avoid
 * level confusion when the same transport is used by loggers with different levels.
 */
function getTransport(
  mmp: MMP,
  levelConfig: LoggerLevelConfig,
  transportConfig: LogTransportConfig
): winston.transport {
  const factory = transportFactories[transportConfig.type];
  if (!factory) {
    throw new Error(`Unknown transport: ${transportConfig.type}`);
  }

  const tConfig: LogTransportFactoryOptions = {
    format: buildFormat(mmp, levelConfig, transportConfig.format || levelConfig.format),
    level: transportConfig.level || levelConfig.level || 'info',
  };

  const transport = factory(tConfig);
  // Increase max listeners since transports might be long-lived
  (transport as any).setMaxListeners(0); // 0 = unlimited
  return transport;
}

// HTTP methods for detection
const HTTP_METHODS = new Set([
  'GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'
]);

/**
 * Check if a method is an HTTP method (case-sensitive)
 */
function isHttpMethod(mmp: MMP): boolean|undefined;
function isHttpMethod(mmp: MMP, levelConfig?: LoggerLevelConfig): boolean;

function isHttpMethod(mmp: MMP, levelConfig?: LoggerLevelConfig): boolean|undefined {
  function isMmpHttpMethod(mmp: MMP): boolean {
    return HTTP_METHODS.has(mmp.method);
  }
  return isNil(levelConfig)
    ? isMmpHttpMethod(mmp)
    : isNil(levelConfig.isEndpoint)
      ? isMmpHttpMethod(mmp)
      : levelConfig.isEndpoint;
}

// Cache and config
let config: LoggerConfig | null = null;
const loggerCache = new Map<string, winston.Logger>();

// Define custom log levels globally before any loggers are created
const customLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  verbose: 5,
  silly: 6,
};

winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  http: 'cyan',
  debug: 'magenta',
  verbose: 'white',
  silly: 'gray',
});

/**
 * Build a unique, unambiguous cache key from module, method, and optional path
 */
function buildCacheKey(module: string, method: string, path?: string): string {
  return `${module}::${method}::${path || ''}`;
}

/**
 * Build effective config by traversing the hierarchy
 */
function buildLevelConfig(
  module: string,
  method: string,
  path: string | undefined,
  options?: Partial<LoggerLevelConfig>
): LoggerLevelConfig {

  if (!config) {
    throw new Error('Logger configuration is not initialized');
  }

  const baseConfig:LoggerConfigLoggingObject = config!.logging;
  
  let resultConfig:LoggerLevelConfig =
    deepMerge<LoggerLevelConfig>(
      DEFAULT_LEVEL_CONFIG,
      omit(baseConfig, 'modules'
    ) as LoggerLevelConfig) || {};

  if (options) {
    // Apply overrides from options (e.g. for testing or loggers that have
    // extra requirements beyond module/method/path)
    resultConfig = deepMerge(resultConfig, options);
  }
  
  // Apply module config
  if (baseConfig.modules?.[module]) {
    const moduleConfig = omit(baseConfig.modules[module], 'methods') as Partial<LoggerLevelConfig>;
    if (Object.keys(moduleConfig).length > 0) {
      resultConfig = deepMerge(resultConfig, moduleConfig);
    }
  }

  // Apply method config
  if (baseConfig.modules?.[module]?.methods?.[method]) {
    const methodConfig = omit(baseConfig.modules[module].methods[method], 'paths') as Partial<LoggerLevelConfig>;
    if (Object.keys(methodConfig).length > 0) {
      resultConfig = deepMerge(resultConfig, methodConfig);
    }
  }

  // Apply path config (HTTP only)
  if ((resultConfig?.isEndpoint !== false) && path && 
    baseConfig.modules?.[module]?.methods?.[method]?.paths?.[path]
  ) {
    const pathConfig = baseConfig.modules[module].methods[method].paths[path] as Partial<LoggerLevelConfig>;
    if (Object.keys(pathConfig).length > 0) {
      resultConfig = deepMerge(resultConfig, pathConfig);
    }
  }

  return resultConfig;
}

/**
 * Load configuration from file path or object
 */
export function initializeLogger(configInput: LoggerConfig): void {
  const token = 'logger-initialization';
  registerToken(token);
  try {
    config = configInput;

    if (!config?.logging) {
      throw new Error('Invalid logger configuration: missing "logging" key');
    }

    completeToken(token);

  } catch (error) {
    completeToken(token, false);
    throw error;
  }
}

/**
 * Build a Winston format from configuration value(s)
 */
function buildFormat(mmp: MMP, levelConfig: LoggerLevelConfig, formatConfig?: string | string[]): winston.Logform.Format {
  if (!formatConfig) {
    return (formats.colored || (() => winston.format.simple()))(mmp, levelConfig);
  }

  const formatNames = Array.isArray(formatConfig) ? formatConfig : [formatConfig];
  const selectedFormats = formatNames
    .map(name => formats[name])
    .filter((f): f is FormatType => f !== undefined)
    .map(formatFn => formatFn(mmp, levelConfig));

  if (selectedFormats.length === 0) {
    return winston.format.simple();
  }

  return winston.format.combine(...selectedFormats);
}

/**
 * Build Winston transports from configuration value(s)
 */
function buildTransports(
  mmp: MMP, levelConfig: LoggerLevelConfig,
  transportConfig?: LogTransportConfig | LogTransportConfig[]
): winston.transport[] {
  const transportsToUse: winston.transport[] = [];
  
  if (!transportConfig) {
    transportsToUse.push(getTransport(mmp, levelConfig, {type: 'console'}));
  } else {
    const transportConfigs = Array.isArray(transportConfig) ? transportConfig : [transportConfig];
    for (const transportConifg of transportConfigs) {
      try {
        transportsToUse.push(getTransport(mmp, levelConfig, transportConifg));
      } catch {
        // Skip unknown transports
      }
    }
  }

  return transportsToUse.length > 0 ? transportsToUse : [getTransport(mmp, levelConfig, {type: 'console'})];
}

/**
 * Get or create a logger for a module and method (TypeScript function)
 * @example getLogger('auth', 'login')
 */
export function getLogger(
  module: string,
  method: string|Function,
  ...options: Partial<LoggerLevelConfig>[]
): winston.Logger;

/**
 * Get or create a logger for a module, HTTP method, and path
 * @example getLogger('users', 'GET', '/api/users/:id')
 */
export function getLogger(
  module: string, method: string|Function, path: string,
  ...options: Partial<LoggerLevelConfig>[]
): winston.Logger;

export function getLogger(
  module: string, method: string|Function,
  optionsOrPath?: string|Partial<LoggerLevelConfig>,
  ...options: Partial<LoggerLevelConfig>[]
): winston.Logger {

  if (typeof method === 'function') {
    method = method.name;
  }

  if (!config) {
    throw new Error('Logger not initialized. Call initializeLogger() first.');
  }

  const path = typeof optionsOrPath === 'string' ? optionsOrPath : undefined;
  const collapsedOptions =
    typeof optionsOrPath === 'object' && optionsOrPath !== null
      ? (options.length > 0
        ? deepMerge(optionsOrPath, ...options)
        : optionsOrPath
        )
      : (isNil(optionsOrPath)
        ? {}
        : (options.length > 0
          ? (options.length === 1
            ? deepClone(options[0]) as Partial<LoggerLevelConfig>
            : deepMerge(options[0], ...options.slice(1))
            )
          : {}
          )
        );

  const cacheKey = buildCacheKey(module, method, path);
  const mmp = { module, method, path };

  // Return cached logger if exists
  if (loggerCache.has(cacheKey)) {
    return loggerCache.get(cacheKey)!;
  }

  // Determine if this is an HTTP endpoint or TS function
  if (isNil(collapsedOptions?.isEndpoint)) {
    collapsedOptions.isEndpoint = isHttpMethod(mmp);
  }

  // Build effective config by traversing hierarchy
  const levelConfig = buildLevelConfig(module, method, path, collapsedOptions);

  console.log(
    'Logger %s level for %s', getLevelTag(levelConfig.level || ''), cacheKey
  );

  // Build format with context awareness
  const format = buildFormat({ module, method, path }, levelConfig, levelConfig.format);

  // Create a dedicated logger for this context
  const contextLogger = winston.createLogger({
    level: levelConfig.level || 'info',
    levels: customLevels,
    format: winston.format.combine(
      winston.format.splat(),
      format,
    ),
    transports: buildTransports(mmp, levelConfig, levelConfig.transport),
  });

  const actualLevel = (contextLogger as any).level;

  // Cache and return
  loggerCache.set(cacheKey, contextLogger);
  return contextLogger;
}

/**
 * Register a custom format factory
 */
export function registerFormat(name: string, format: (mmp: MMP, levelConfig: LoggerLevelConfig) => winston.Logform.Format): void {
  formats[name] = format;
}

/**
 * Register a custom transport factory
 */
export function registerTransport(name: string, factory: () => winston.transport): void {
  transportFactories[name] = factory;
}

/**
 * Clear all cached loggers (useful for testing)
 */
export function clearLoggerCache(): void {
  loggerCache.clear();
}

/**
 * Reset the entire logger state - config and cache (useful for testing)
 */
export function resetLogger(): void {
  config = null;
  loggerCache.clear();
}
