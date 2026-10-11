/**
 * Application configuration
 */

import {
  isPlan,
  Plan
} from "@filamentjs/rate-limiting";
import { isLoggerLevelConfig, LoggerLevelConfig } from "../util/logger-types.js";

export interface KeyInfo {
  kid: string;
  expiry?: Date;
  private: string;
  public: string;
}

export type RateLimitOptions =
  { plans: Readonly<Record<string, Plan>>;
    defaultPlan?: string;
    store: { maxEntries: number }
  }

export interface AppConfig {
  app: {
    global: {
      baseUrl: string;
    }
  };
  debug: {
    logging: LoggerLevelConfig;
  };
  nodeEnv: string;
  policies?: {
    rateLimiting: RateLimitOptions
  },
  port: number;
  security: {
    jwtKeys: KeyInfo[];
  };
  sessions: {
    duration: number;
  };
}

function isPolicies(obj: any) {
  return obj !== null && typeof obj === 'object' &&
    isRateLimitOptions(obj.rateLimiting);
}

export function isRateLimitOptions(o: any): o is RateLimitOptions {
  return o !== null && typeof o === 'object' &&
    (o.store === undefined || (
      o.store !== null && typeof o.store === 'object' &&
      typeof o.store.maxEntries === 'number'
    )) &&
    o.plans !== null && typeof o.plans === 'object' &&
    !Array.isArray(o.plans) &&
    Object.values(o.plans).every(isPlan) &&
    (o.defaultPlan === undefined || (
      typeof o.defaultPlan === 'string' &&
      Object.hasOwn(o.plans, o.defaultPlan)
    ));
}

export function isAppConfig(obj: any): obj is AppConfig {
  return obj && typeof obj === 'object' &&
    typeof obj.app === 'object' && typeof obj.app.global === 'object' &&
    typeof obj.app.global.baseUrl === 'string' &&
    /https?:\/\/[a-zA-Z0-9\-]/.test(obj.app.global.baseUrl) &&
    (obj.policies === undefined || isPolicies(obj.policies)) &&
    typeof obj.port === 'number' &&
    typeof obj.nodeEnv === 'string' &&
    typeof obj.debug === 'object' &&
    isLoggerLevelConfig(obj.debug.logging) &&
    obj.sessions && typeof obj.sessions.duration === 'number';
}

class ConfigManager {

  private readyCallback:((newAppConfig: AppConfig) => void)|undefined;
  private readyPromise: Promise<AppConfig>;
  private isReadyFlag = false;
  private appConfig: AppConfig | undefined;

  constructor() {
    this.readyPromise = new Promise<AppConfig>((resolve) => {
      this.readyCallback = (newAppConfig: AppConfig) => {
        this.isReadyFlag = true;
        this.appConfig = newAppConfig;
        resolve(newAppConfig);
      };
    });
  }

  get isReady(): boolean {
    return this.isReadyFlag;
  }
  get config() : AppConfig {
    if (!this.isReadyFlag) {
      throw new Error('Config is not ready yet');
    }
    return this.appConfig as AppConfig; 
  }
  get configAsync(): Promise<AppConfig> {
    return this.readyPromise;
  }

  setAppConfig(newAppConfig: AppConfig) {
    if (this.isReadyFlag) {
      throw new Error('Config is already set');
    }
    if (!this.readyCallback) {
      // this should never happen since the constructor always sets
      // readyCallback, but we check just in case
      throw new Error('Ready callback is not defined');
    }
    if (!isAppConfig(newAppConfig)) {
      throw new Error('Invalid configuration shape');
    }
    if (!this.validateConfig(newAppConfig)) {
      throw new Error('Invalid configuration');
    }
    this.readyCallback(newAppConfig);
  }

  private validateConfig(myAppConfig: AppConfig) {
    // Add validation logic here if needed
    return true;
  }
}

const configManager = new ConfigManager();

export const appConfig = () => configManager.config;
export const appConfigAsync = () => configManager.configAsync;
export const isConfigReady = () => configManager.isReady;

export function setAppConfig(newAppConfig: AppConfig) {
  configManager.setAppConfig(newAppConfig);
}


// export const appConfig:AppConfig = {
//   port: parseInt(process.env.PORT || '3000', 10),
//   nodeEnv: process.env.NODE_ENV || 'development',
//   logging: { level: process.env.LOG_LEVEL || 'info' },
//   sessions: {
//     duration: 1000 * 60 * 60 * 24, // 1 day
//   }
// };

