import { Application } from 'filamentjs';
import { AppMeta } from '../meta/index.js';

/**
 * Register response transformers
 */
export function registerTransformers(app: Application<AppMeta>) {
  // Add custom headers based on tags
  app.onTransform(async (req, res) => {
    const tags = req.endpointMeta.tags;

    if (tags.includes('api')) {
      res.setHeader('X-API-Version', '1.0');
    }

    // Add more transformations here
  });
}
