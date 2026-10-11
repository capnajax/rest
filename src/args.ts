import Parser from 'args-and-envs';
import fs from 'fs';
import YAML from 'yaml';
import { deepMerge } from './util/tools.js';
import { appConfig, AppConfig, setAppConfig } from './config/app.js';

export interface ParsedArgs {
  dbUrl?: string;
  port?: number;
  config?: AppConfig;
}

const appConfigDefaults: AppConfig = {
  app: {
    global: {
      baseUrl: 'http://example.com/'
    }
  },
  debug: {
    logging: { level: 'info' }
  },
  nodeEnv: 'development',
  port: 1661,
  security: {
    jwtKeys: []
  },
  sessions: {
    duration: 1000 * 60 * 60 * 24, // 1 day
  }
};

export const parsedArgs = {} as ParsedArgs;

export function isRecordStringUnknown(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).every(key => typeof key === 'string')
  );
}

function parseConfigFiles(files?:(string|Partial<AppConfig>)[]|Partial<AppConfig>): void {

  const errors = [];
  const filesAr = (typeof files === 'object' && !Array.isArray(files))
    ? [files]
    : files;

  const parsed: any[] = [];
  if (!filesAr || filesAr.length === 0) {
    setAppConfig(appConfigDefaults as AppConfig);
    return;
  }

  for (const f of filesAr) {
    if (typeof f === 'object') {
      if (isRecordStringUnknown(f)) {
        parsed.push(f);
      } else {
        errors.push(`Config object ${JSON.stringify(f)} is not a valid object`);
      }
      continue;
    } else {
      const content = fs.readFileSync(f, 'utf-8');
      try {
        let configObj = f.endsWith('.yaml') || f.endsWith('.yml') ?
          YAML.parse(content) :
          JSON.parse(content);
        if (isRecordStringUnknown(configObj)) {
          parsed.push(configObj);
        } else {
          errors.push(`Config file ${f} does not contain a valid object`);
        }
      } catch (err) {
        errors.push(`Failed to parse config file ${f}: ${(err as Error).message}`);
        continue;
      }
    }
  }

  // deep merge all config files, with later files taking precedence
  try {
    let config = deepMerge(appConfigDefaults, ...parsed);
    setAppConfig(config);
  } catch (err) {
    errors.push(`Failed to merge config files: ${(err as Error).message}`);
  }

  if (errors.length > 0) {
    throw errors;
  }
}

export function parseArgs(o?: Partial<AppConfig>): ParsedArgs {
  const errors = [];
  const argvDefinitions = [
    { name: 'configFiles', arg: ['--config', '-c'], env: 'CONFIG_FILES', type: 'list', required: false },
    { name: 'dbUrl', arg: ['--db-url'], env: 'DATABASE_URL', type: 'string', required: false },
    { name: 'port', arg: ['--port', '-p'], env: 'PORT', type: 'integer', required: false },
  ];

  const parser = new Parser(argvDefinitions as any);
  parser.parse();

  const argv = deepMerge(parser.argv || {}, o || {});

  const configFiles: (string|object)[]|undefined = argv?.configFiles;
  const dbUrl: string | undefined = argv?.dbUrl;
  const port: number | undefined = argv?.port;

  const configSources = [
    ...(Array.isArray(configFiles) ? configFiles : []),
    ...(o ? [o] : []),
  ];

  try {
    parseConfigFiles(configSources.length > 0 ? configSources : undefined);
  } catch (thrownErrors) {
    console.error('Error(s) occurred while parsing config files:');
    console.error(typeof thrownErrors, thrownErrors);
    for (const err of thrownErrors as string[]) {
      errors.push(err);
    }
  }

  parsedArgs.port = port ?? appConfig().port;
  parsedArgs.dbUrl = dbUrl;
  parsedArgs.config = appConfig(); // set up by parseConfigFiles

  if (errors.length > 0) {
    for (const err of errors) {
      console.error('Error:', err);
    }
    process.exit(1);
  }

  return parsedArgs;
}

export default parseArgs;
