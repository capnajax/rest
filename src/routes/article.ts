import { Application, createRouteContext, Request } from 'filamentjs';
import { ArticlesRow } from '../data/tables/articles-row.js';
import { ANALYTICS_ENABLED, PUBLIC } from '../meta/defaults.js';
import { AppMeta } from '../meta/meta-types.js';
import { InvalidQuery } from '../util/exceptions.js';
import { getLogger } from '../util/logger.js';
import {
  assertPGableIntegerArray,
  normalizeArray,
  normalizeBoolean,
  normalizeZeroOrOne,
  outputHandler,
} from '../util/tools.js';
const MODULE = 'article-routes';

interface ByIdsQuery {
  ids: number[];
  stream: boolean;
}
function normalizeByIdsQuery(req: Request): ByIdsQuery {
  const log = getLogger(MODULE, normalizeByIdsQuery);
  const q = req.query;
  const nz1 = (k: string) => normalizeZeroOrOne(q[k], 'throw');
  const nb = (k: string, def: boolean = false): boolean => {
    return normalizeBoolean(nz1(k), { default: def, name: k }) as boolean;
  };
  let result!: ByIdsQuery;
  try {
    const values = normalizeArray(q.id ?? '')
      .flatMap((value) => value.split(/,\s*/))
      .filter((value) => value !== '');
    if (values.some((value) => !/^[+-]?\d+$/.test(value))) {
      throw new InvalidQuery('Expected integer article IDs.');
    }
    const ids = values.map(Number);
    assertPGableIntegerArray(ids);
    result = {
      ids,
      stream: nb('stream'),
    };
  } catch (e) {
    log.error('failed to normalize %s', JSON.stringify(q));
    throw e;
  }
  log.verbose('normalized to %s', JSON.stringify(result));
  return result;
}

interface SearchQuery {
  stream: boolean;
}
function normalizeSearchQuery(req: Request): SearchQuery {
  const log = getLogger(MODULE, normalizeSearchQuery);
  const q = req.query;
  const nz1 = (k: string) => normalizeZeroOrOne(q[k], 'throw');
  const nb = (k: string, def: boolean = false): boolean => {
    return normalizeBoolean(nz1(k), { default: def, name: k }) as boolean;
  };
  log.verbose('normalizing %s', JSON.stringify(q));
  log.verbose('nz1(stream) is %s', nz1('stream'));
  let result!: SearchQuery;
  try {
    result = {
      stream: nb('stream'),
    };
  } catch (e) {
    log.error('failed to normalize %s', JSON.stringify(q));
    throw e;
  }
  log.verbose('normalized to %s', JSON.stringify(result));
  return result;
}

export function articleRoutes(app: Application<AppMeta>) {
  const log = getLogger(MODULE, 'articleRoutes');
  const ctx = createRouteContext(app, '/v3/article', ANALYTICS_ENABLED);

  ctx.get('/byId', PUBLIC, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/article/byId');
    const q = normalizeByIdsQuery(req);
    log.silly('q %s', q);
    const out = outputHandler(q.stream, res);
    if (q.ids.length === 0) {
      res.json([]); // Return empty array if no id parameter is provided
      return;
    }

    log.debug('q: %s', q);

    const cb = (article: ArticlesRow) => out.object(article.toJSON());

    const load = q.stream
      ? ArticlesRow.loadArticlesByIds(q.ids, cb)
      : ArticlesRow.loadArticlesByIds(q.ids).then((articles) => {
          articles.forEach(cb);
        });
    await load
      .then(() => {
        out.end();
      })
      .catch((err) => {
        log.error('Error loading articles by IDs:', err);
        res.status(500).json({ error: 'Failed to load articles by IDs' });
      });
  });

  ctx.get('/search', PUBLIC, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/search');
    log.verbose('called');
    const q = normalizeSearchQuery(req);
    log.silly('q', q);
    const out = outputHandler(q.stream, res);
    log.silly('out', out);
    await ArticlesRow.searchArticles({ limit: 100 })
      .then(async ({ articles }) => {
        log.info(
          `Loaded ${articles.length} articles: ${JSON.stringify(articles)}`
        );
        for (const article of articles) {
          await article.loadSimple();
          const sendArticle = {
            id: article.id,
            title: article.title,
            permalink: article.primary_permalink,
            content_type: article.content_type?.name,
            form_factor: article.content_type?.form_factor?.name,
            tags: article.tags,
            active_dt: article.active_dt,
            last_update: article.last_update || undefined,
            is_featured: article.is_featured || false,
            info: article.info,
          };
          out.object(sendArticle);
        }
      })
      .catch((err) => {
        log.error('Error loading articles:', err);
        res.status(500).json({ error: 'Failed to load articles' });
      });
    out.end();
  });

  ctx.get('/sidebar', PUBLIC, async (req, res) => {
    const log = getLogger(MODULE, 'GET', '/sidebar');
    log.debug('called');
    const q = normalizeSearchQuery(req);
    log.silly('q', q);
    const out = outputHandler(q.stream, res);
    log.silly('out', out);
    await ArticlesRow.searchArticles({ limit: 100 })
      .then(async ({ articles }) => {
        for (const article of articles) {
          await article.loadSummary();
          out.object(article.toJSON());
        }
      })
      .catch((err) => {
        log.error('Error loading articles:', err);
        res.status(500).json({ error: 'Failed to load articles' });
      });
    out.end();
  });

  log.info('Article routes registered');
}
