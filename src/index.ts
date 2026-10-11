
import { Application, createApp } from 'filamentjs';
import {
  createStandaloneStore as createRateLimitStore,
  SetupOptions as RateLimitSetupOptions,
  setup as setupRateLimit
} from '@filamentjs/rate-limiting';
import {
  setup as setupRequestLogging
} from '@filamentjs/request-logging';

import { defaultMeta } from './meta/defaults.js';
import { AppConfig, appConfig, appConfigAsync } from './config/app.js';
import { runSchemaMigrations } from './data/schema-migration.js';
import { registerErrorHandlers } from './handlers/errors.js';
import { registerFinalizers } from './handlers/finalizers.js';
import { registerTransformers } from './handlers/transforms.js';
import { AppMeta, Context } from './meta/meta-types.js';
import { registerMiddleware } from './routes/middleware/index.js';
import { registerRoutes } from './routes/index.js';
import { initializeLogger } from './util/logger.js';
import parseArgs, { parsedArgs } from './args.js';

export async function start(
  o?:Partial<AppConfig>,
  portCallback?: (port: number) => void
): Promise<Application<AppMeta>> {

  // Parse CLI args / envs for overrides like --config and --port
  parseArgs(o);

  // If one or more config files were provided and they contain logging
  // configuration, prefer that. Otherwise, if configFiles were provided,
  // pass the first filename to initializeLogger so it can load from disk.
  initializeLogger((await appConfigAsync()).debug);

  // Run schema migrations in the background only if the database is configured.
  if (parsedArgs.dbUrl) {
    runSchemaMigrations().catch((err) => {
      console.error('Fatal: schema migration failed:', err);
      process.exit(1);
    });
  } else {
    console.info('DATABASE_URL not set; skipping schema migrations.');
  }

  // Create Filament application
  const app = createApp(defaultMeta, {} as Context);

  //
  //  Register filament policies
  //

  const rateLimitOptions:RateLimitSetupOptions  = await
    (async () => {
      let config = (await appConfigAsync()).policies?.rateLimiting;

      if (!config) {
        throw new Error('Rate limiting config not defined');
      }

      return {
        defaultPlan: config.defaultPlan,
        plans: config.plans,
        resolveSubject: () => '_web',
        store: createRateLimitStore(config.store || { maxEntries: 100_000})
      };
    })();

  setupRateLimit(app, rateLimitOptions);
  setupRequestLogging(app); 

  // Register middleware
  registerMiddleware(app);

  // Register routes
  registerRoutes(app);

  // Register post-request handlers
  registerErrorHandlers(app);
  registerTransformers(app);
  registerFinalizers(app);

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await app.close();
    process.exit(0);
  });

  // Start server and wait for the selected port to be bound before returning.
  const actualPort = await app.listen(appConfig().port);
  console.log(`🔥 Filament server running on http://localhost:${actualPort}`);
  console.log(`   Environment: ${appConfig().nodeEnv}`);
  console.log(`   Log level: \n${JSON.stringify(appConfig().debug.logging, null, 2).replace(/^/gm, '     ')}`);
  if (portCallback) {
    portCallback(actualPort);
  }

  return app;
}

export async function stop(app: Application<AppMeta>) {
  // This function can be used to programmatically stop the server if needed
  // For example, in tests or when running as a child process
  await app.close();
}

// if this is the main module, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  start();
}
