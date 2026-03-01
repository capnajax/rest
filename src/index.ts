import { Application, createApp } from 'filamentjs';

import { defaultMeta } from './meta/defaults.js';
import { AppConfig, appConfig, validateConfig } from './config/app.js';
import { runSchemaMigrations } from './data/schema-migration.js';
import { registerErrorHandlers } from './handlers/errors.js';
import { registerFinalizers } from './handlers/finalizers.js';
import { registerTransformers } from './handlers/transforms.js';
import { AppMeta } from './meta/meta-types.js';
import { registerMiddleware } from './middleware/index.js';
import { registerRoutes } from './routes/index.js';
import { deepClone, deepMerge } from './util/tools.ts';

export async function start(
  o?:Partial<AppConfig>,
  portCallback?: (port: number) => void
): Promise<Application<AppMeta>> {

  let config = o ? deepMerge(appConfig, o) : deepClone(appConfig) as AppConfig;

  // Validate configuration
  validateConfig();

  // Run schema migrations in the background; registers the 'schema-update'
  // readiness token and clears it when complete.
  runSchemaMigrations().catch((err) => {
    console.error('Fatal: schema migration failed:', err);
    process.exit(1);
  });

  // Create Filament application
  const app = createApp(defaultMeta);

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

  // Start server
  app.listen(await config.port)
    .then((actualPort) => {
      console.log(`🔥 Filament server running on http://localhost:${actualPort}`);
      console.log(`   Environment: ${config.nodeEnv}`);
      console.log(`   Log level: ${config.logLevel}`);
      if (portCallback) {
        portCallback(actualPort);
      }
    });

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
