import { createApp } from 'filamentjs';
import { defaultMeta } from './meta/defaults.js';
import { config, validateConfig } from './config/app.js';
import { registerMiddleware } from './middleware/index.js';
import { registerRoutes } from './routes/index.js';
import { registerErrorHandlers } from './handlers/errors.js';
import { registerTransformers } from './handlers/transforms.js';
import { registerFinalizers } from './handlers/finalizers.js';

// Validate configuration
validateConfig();

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
app.listen(config.port, () => {
  console.log(`🔥 Filament server running on http://localhost:${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Log level: ${config.logLevel}`);
});
