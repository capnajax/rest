import { Application, createRouteContext } from 'filamentjs';
import { AppMeta } from '../meta/meta-types.js';
import { ANALYTICS_ENABLED, PUBLIC } from '../meta/defaults.js';
import { ArticlesRow } from '../data/tables/articles-row.js';

import { getLogger } from '../util/logger.js';
const MODULE= 'article-routes';

export function articleRoutes(app: Application<AppMeta>) {

  const log = getLogger(MODULE, 'articleRoutes');
  const ctx = createRouteContext(app, '/v3/article', ANALYTICS_ENABLED);

  ctx.get('/byId', PUBLIC, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/article/byId');
    const idParam = req.query.id;
    if (!idParam) {
      res.json([]); // Return empty array if no id parameter is provided
      return;
    }

    log.debug('idParam: ', idParam);

    const ids = (Array.isArray(idParam) ? idParam : [idParam]).map(
        id => id.split(',').map(Number)
      ).flat();
    log.debug('Parsed IDs: ', ids);
    if (ids.some(isNaN)) {
      return res.status(400).json({ error: 'Invalid id parameter' });
    }

    await ArticlesRow.loadArticlesByIds(ids).then(articles => {
      res.json(articles);
    }).catch(err => {
      log.error('Error loading articles by IDs:', err);
      res.status(500).json({ error: 'Failed to load articles by IDs' });
    });
  });

  ctx.get('/search', PUBLIC, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/search');
    log.info('called');
    res.headers.set('Content-Type: application/x-ndjson');
    await ArticlesRow.loadArticles().then(async (articles) => {
      log.info(`Loaded ${articles.length} articles: ${JSON.stringify(articles)}`);
      for (const article of articles) {
        console.log({article:article.toJSON()});
        console.log('loading simple');
        await article.loadSimple();
        console.log('loaded simple');
        console.log({article:article.toJSON()});
        res.sendChunk(JSON.stringify(article.toJSON()) + '\n');
      }
    }).catch(err => {
      log.error('Error loading articles:', err);
      res.status(500).json({ error: 'Failed to load articles' });
    });
    res.end();
  });

  ctx.get('/sidebar', PUBLIC, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/sidebar');
    log.debug('called');
    res.headers.set('Content-Type: application/x-ndjson');
    await ArticlesRow.loadArticles().then(async (articles) => {
      for (const article of articles) {
        await article.loadSummary();
        res.sendChunk(JSON.stringify(article.toJSON()) + '\n');
      }      
    }).catch(err => {
      log.error('Error loading articles:', err);
      res.status(500).json({ error: 'Failed to load articles' });
    });
    res.end();
  })

  log.info('Article routes registered');

}
