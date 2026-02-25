import { Application, Request } from "filamentjs";
import { pino } from 'pino';
import stringify from "safe-stable-stringify";
import toml from 'toml';
import yaml from 'yaml';
import { AppMeta } from "@/meta/meta-types.ts";

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

export interface ContentType {
  type: string;
  params: Record<string, string>;
  isMultipart: () => boolean;
  isJson: () => boolean;
  isYaml: () => boolean;
  isXml: () => boolean;
  isToml: () => boolean;
  isFormUrlEncoded: () => boolean;
  isPlainText: () => boolean;
  isHtml: () => boolean;
  isImage: () => boolean
}

export function parseBody(req: Request<AppMeta>):() => Promise<any> {
  return async () => {
    const contentType = req.context.contentType as ContentType;
    logger.trace('[parseBody] called with content type: %o', contentType);
    const body = await (req.body as Promise<Buffer>|undefined);
    if (!body) {
      logger.trace('[parseBody] no body to parse');
      return undefined;
    }
    try {
      if (contentType.isJson()) {
        logger.trace('[parseBody] parsing JSON body: %s', body.toString());
        return JSON.parse(body.toString());
      } else if (contentType.isYaml()) {
        logger.trace('[parseBody] parsing YAML body: %s', body.toString());
        return yaml.parse(body.toString());
      } else if (contentType.isToml()) {
        logger.trace('[parseBody] parsing TOML body: %s', body.toString());
        return toml.parse(body.toString());
      } else if (contentType.isFormUrlEncoded()) {
        logger.trace('[parseBody] parsing Form URL Encoded body: %s', body.toString());
        return Object.fromEntries(new URLSearchParams(body.toString()));
      } else {
        // all other things are returned as is, including plain text, XML, HTML,
        // multipart form data, and images (which should be sent as base64
        // encoded strings)
        logger.trace('[parseBody] returning raw body: %s', body.toString());
        return body;
      }
    } catch (e) {
      logger.error('[parseBody] Failed to parse request body: %o', e);
      throw new Error(`Failed to parse request body: ${stringify(e)}`);
    }
  }
}

export function isSupportedMediaType(
  req: Request<AppMeta>, contentType?: ContentType
): boolean {
  logger.trace('[isSupportedMediaType] Checking if content type is supported: %o', contentType);
  if (!(contentType?.type)) {
    return req.context.contentTypes.allowMissingContentType;
  }
  const ct = req.context?.contentTypes;
  logger.trace('[isSupportedMediaType]   --> Supported types: %s', JSON.stringify(ct?.supportedTypes));
  if (ct?.supportedTypes === undefined || ct?.supportedTypes.length === 0) {
    logger.trace('[isSupportedMediaType]   --> supported by default since no supported types are configured');
    return true;
  }
  logger.trace('[isSupportedMediaType]   --> checking if content type is among supported types');
  const acceptableTypes = ct.supportedTypes?.map((t: string) => {
    if (t.includes('/')) {
      return t;
    } else {
      return [`text/${t}`, `application/${t}`];
    }
  });
  if (contentType?.type && acceptableTypes?.length)  {
    logger.trace('[isSupportedMediaType]   --> content type is %s, acceptable types are: %o', contentType.type, acceptableTypes);
    return acceptableTypes.includes(contentType.type);
  } else {
    logger.trace('[isSupportedMediaType]   --> content type is not specified or no acceptable types are defined, defaulting to true');
    return true;
  }
}

export function parseContentMiddleware(app: Application<AppMeta>) {
  // get the content type of the request and parse the body accordingly,
  // attaching it to req.context.body
  app.use(async (req, res, next) => {
    // Only parse body for POST, PUT, PATCH requests
    if (req.method !== 'POST' && req.method !== 'PUT' && req.method !== 'PATCH') {
      await next();
      return;
    }
    logger.trace('[parseContentMiddleware] running parseContentMiddleware on a %s request', req.method);

    let contentTypeString = req.headers['content-type'] || null;
    if (Array.isArray(contentTypeString)) {
      // 400 Bad Request if multiple content-type headers are present
      res.status(400).json({ error: 'Multiple Content-Type headers are not allowed' });
      return;
    }
    if (!contentTypeString) {
      if (req.context.contentTypes.allowMissingContentType) {
        contentTypeString = req.context.contentTypes.defaultType as string;
        if (!contentTypeString) {
          res.status(500).json({
            error: 'Server misconfiguration: default content type is ' +
              'required when allowMissingContentType is true'
          });
          return;
        }
      } else {
        // 415 Unsupported Media Type if no content-type header is present for methods that usually have a body
        res.status(415).json({ error: 'Content-Type header is required' });
        return;
      }
    }

    const contentTypeAsString = contentTypeString as string;

    logger.trace('[parseContentMiddleware] Received Content-Type header: %s', contentTypeAsString);

    const contentType = {
      type: contentTypeAsString?.split(';')[0].trim() || '',
      params: contentTypeAsString?.split(';').slice(1).reduce((params, param) => {
        const [key, value] = param.trim().split('=');
        params[key] = value;
        return params;
      }, {} as Record<string, string>)
    } as Partial<ContentType>;

    logger.trace('[parseContentMiddleware] Parsed content type: %o', contentType);

    if (!isSupportedMediaType(req, contentType as ContentType)) {
      logger.trace('[parseContentMiddleware] Content type %s is not supported, rejecting request', contentType.type);
      res.status(415).json({
        error: `Content-Type ${contentType.type} is not acceptable`
      });
      return;
    }

    logger.trace('[parseContentMiddleware] Content type is supported, proceeding to parse body');

    const textOrApp = (t: string) => {
      return !!(contentType.type &&
        [`application/${t}`, `text/${t}`].includes(contentType.type));
    }
    const typeIs = (t: string) => {
      return !!(contentType.type && contentType?.type === t);
    }
    const typeStartsWith = (t: string) => {
      return !!(contentType.type && contentType?.type.startsWith(t));
    }

    logger.trace('[parseContentMiddleware] Parsed content type: %o', contentType);

    contentType.isMultipart = () => typeStartsWith('multipart/');
    contentType.isJson = () => typeIs('application/json');
    contentType.isYaml = () => textOrApp('yaml');
    contentType.isXml = () => textOrApp('xml');
    contentType.isToml = () => textOrApp('toml');
    contentType.isFormUrlEncoded = () => typeIs('application/x-www-form-urlencoded');
    contentType.isPlainText = () => typeIs('text/plain');
    contentType.isHtml = () => typeIs('text/html');
    contentType.isImage = () => typeStartsWith('image/');

    req.context.contentType = contentType as ContentType;

    req.context.body = parseBody(req);

    await next();
  });

}
