import { Application, createRouteContext, Request, Response } from 'filamentjs';
import { ANALYTICS_ENABLED, LOG_ERRORS, PUBLIC } from '../meta/defaults.js';
import { AppMeta } from '../meta/meta-types.js';
import { getLogger } from '../util/logger.js';
import { PoolClient } from 'pg';
import { getConnection, returnConnection } from '../data/query.js';
import { PermalinksRow } from '../data/tables/permalinks-row.js';
import { ADMarkdown, ADPlainText, ArticlesRow, assertArticleInfo } from '../data/tables/articles-row.js';
import { GetMediaOptions, MediaRow } from '../data/tables/media-row.js';
import { formatWithOptions } from 'node:util';
import { extname } from 'node:path';
import { getDefaultMimeType } from './data-contracts/default-mime-types.js';

const MODULE = 'r.media';
const BASEPATH = '/v3/media';

async function respondWithMedia(
  res: Response,
  article: string|number,
  filename?: string,
  ims?: Date
): Promise<void> {
  const log = getLogger(MODULE, respondWithMedia);
  log.debug('Called for article: %s, filename%s', article,
    filename ? `:  ${filename}` : ' not requested');

  let connection!: PoolClient;

  const notFound = (): Promise<void> => {
    log.verbose('not found');
    res.statusCode = 404;
    return res.end();
  };
  const updateLocation = async (permalinkName: string|ArticlesRow)
  : Promise<void> => {
    log.verbose('updating location to %s', permalinkName);
    if (typeof permalinkName !== 'string') {
      await permalinkName.loadSimple();
      permalinkName =
        permalinkName.primary_permalink?.name.value || 'undefined';
    }
    let location = `${BASEPATH}/${permalinkName}`;
    if (filename) {
      location += '/' + filename;
    }
    res.headers.set('Content-Location', location);
  }
  const getArticleById = async (id: number)
  : Promise<ArticlesRow|null> => {
    log.verbose('getArticleById(%s)', id);
    let articleRow!: ArticlesRow;
    await ArticlesRow.getArticlesByIds(
      [id],
      (a:ArticlesRow[]) => {
        if (arguments.length) {
          articleRow = a[0];
        }
      },
      { connection }
    );
    return articleRow || null;
  }
  const sendMediaResponse = async (articleId: number, filename: string)
  : Promise<void> => {
    log.verbose('sending media response for articleId %s file %s',
      articleId, filename
    );
    const options: GetMediaOptions = { connection };
    if (ims) {
      options.ifModifiedSince = ims;
    }
    const mediaRow = await MediaRow.getMedia(articleId, filename, options);
    log.silly('mediaRow = %s', JSON.stringify(mediaRow));
    if (mediaRow === 404) {
      return notFound();
    } else if (mediaRow === 304) {
      res.statusCode = 304;
      res.end();
    } else {
      res.statusCode = 200;
      const mime =
        mediaRow.mime_type.value ?? await getDefaultMimeType(extname(filename));
      if (mime) {
        res.headers.set(
          'Content-Type',
          mime   
        );
      }
      const data = Buffer.from(mediaRow.data_b64.value as string, 'base64');
      res.send(data);
      res.end();
    }
  };

  try {
    connection = await getConnection();
    let articleRow!:ArticlesRow;
    if (typeof article === 'number') {
      log.verbose('article is number');
      // get the article by id
      const articleRowOrNull = await getArticleById(article);
      if (articleRowOrNull) {
        articleRow = articleRowOrNull;
        await updateLocation(articleRow);
      } else {
        return await notFound();
      }

    } else {
      log.verbose('article is string');
      const permalink = await PermalinksRow.getPermalink(article, connection);
      if (permalink === 404) {
        return await notFound();
      }
      log.verbose('got permalink');
      const articleRowOrNull = await getArticleById(
        permalink.article_id.value as number
      );
      if (articleRowOrNull) {
        articleRow = articleRowOrNull;
      } else {
        return await notFound();
      }
      log.verbose('got article from permalink');
      await articleRow.loadSimple();
      const ppname = articleRow.primary_permalink?.name.value;
      log.verbose('got primary permalink %s', ppname);
      if (ppname && (ppname !== article)) {
        await updateLocation(ppname);
      }
    }

    if (filename) {
      // get the media of the filename
      return await sendMediaResponse(
        articleRow.id.value as number,
        filename
      );
    } else {
      // check the article info -- either send the response or get the media
      // of the filename provided in the article info
      const articleInfo = articleRow.info.value;
      try {
        assertArticleInfo(articleInfo);        
      } catch(e) {
        log.error(`Data integrity issue: article ${articleRow.id.value} ` +
          'info does not parse');
        throw e;
      }
      if (!articleInfo.article) {
        log.error(`Requested article file/text for non-article`);
        res.status(404);
        return;
      }

      if (articleInfo.article && Object.hasOwn(articleInfo.article, 'file')) {
        // The media item is in the media database, the article info has the
        // filename.
        const file = (articleInfo.article as {file: string}).file;
        return await sendMediaResponse(
          articleRow.id.value as number,
          file
        );

      } else {
        // The media item is in the article info itself
        let format = articleInfo.article.format ?? 'text/plain';
        let content!: string;
        switch (format) {
        case 'text/plain':
          content = (articleInfo.article as ADPlainText)?.text as string;
          break;
        case 'text/markdown':
          content = (articleInfo.article as ADMarkdown)?.markdown as string;
        default:
          throw new Error(
            formatWithOptions({}, 'Internal error: unknown content type "%s"',
              articleInfo.article.format)
            );
        }
        if (ims &&
          articleRow.last_update.isLoaded &&
          ( ims >= (articleRow.last_update.value as unknown as Date) )
        ) {
          res.statusCode = 304;
          res.end();
        } else {
          res.headers.set('Content-Type', format);
          res.send(content);
          res.end();
          return;
        }
      }
    }
  } finally {
    if (connection) {
      returnConnection(connection);
    }
  }
}

export function mediaRoutes(app: Application<AppMeta>) {
  const log = getLogger(MODULE, 'mediaRoutes');
  const ctx = createRouteContext(app, BASEPATH, ANALYTICS_ENABLED);

  ctx.get(
    '/:permalink',
    ANALYTICS_ENABLED, PUBLIC, LOG_ERRORS, 
    (req: Request, res: Response) => {
      const log = getLogger(MODULE, 'GET', BASEPATH + '/:permalink');
      log.debug('Called for permalink == %s', req.params.permalink)
      const imsStr = req.headers.get('If-Modified-Since');
      if (imsStr) {

      }
      return respondWithMedia(res, req.params.permalink);
    }
  );
  ctx.get(
    '/:permalink/:filename*',
    ANALYTICS_ENABLED, PUBLIC, LOG_ERRORS, 
    (req: Request, res: Response) => {
      const log = getLogger(MODULE, 'GET', BASEPATH + '/:permalink');
      log.debug('Called for permalink == %s, filename == %s',
        req.params.permalink, req.params.filename
      );
      return respondWithMedia(res, req.params.permalink, req.params.filename);
    }
  );

  log.info('Media routes registered');
}
