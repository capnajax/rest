import { Application, Request } from "filamentjs";
import stringify from "safe-stable-stringify";
import toml from 'toml';
import yaml from 'yaml';
import { AppMeta } from "@/meta/meta-types.ts";
import { getLogger } from "@/util/logger.ts";

const MODULE = 'm.parse-body';

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
    const log = getLogger(MODULE, 'parseBody');
    log.verbose('called with content type: %o', contentType);
    const body = await (req.body as Promise<Buffer>|undefined);
    if (!body) {
      log.verbose('no body to parse');
      return undefined;
    }
    try {
      if (contentType.isJson()) {
        log.verbose('parsing JSON body: %s', body.toString());
        return JSON.parse(body.toString());
      } else if (contentType.isYaml()) {
        log.verbose('parsing YAML body: %s', body.toString());
        return yaml.parse(body.toString());
      } else if (contentType.isToml()) {
        log.verbose('parsing TOML body: %s', body.toString());
        return toml.parse(body.toString());
      } else if (contentType.isFormUrlEncoded()) {
        log.verbose('parsing Form URL Encoded body: %s', body.toString());
        return Object.fromEntries(new URLSearchParams(body.toString()));
      } else {
        // all other things are returned as is, including plain text, XML, HTML,
        // multipart form data, and images (which should be sent as base64
        // encoded strings)
        log.verbose('returning raw body: %s', body.toString());
        return body;
      }
    } catch (e) {
      log.error('Failed to parse request body: %o', e);
      throw new Error(`Failed to parse request body: ${stringify(e)}`);
    }
  }
}

export function isSupportedMediaType(
  req: Request<AppMeta>, contentType?: ContentType
): boolean {
  const log = getLogger(MODULE, 'isSupportedMediaType');
  log.verbose('Checking if content type is supported: %o', contentType);
  if (!(contentType?.type)) {
    return req.context.contentTypes.allowMissingContentType;
  }
  const ct = req.context?.contentTypes;
  log.verbose('Supported types: %s', JSON.stringify(ct?.supportedTypes));
  if (ct?.supportedTypes === undefined || ct?.supportedTypes.length === 0) {
    log.verbose('Supported by default since no supported types are configured');
    return true;
  }
  log.verbose('Checking if content type is among supported types');
  const acceptableTypes = ct.supportedTypes?.map((t: string) => {
    if (t.includes('/')) {
      return t;
    } else {
      return [`text/${t}`, `application/${t}`];
    }
  });
  if (contentType?.type && acceptableTypes?.length)  {
    log.verbose('Content type is %s, acceptable types are: %o', contentType.type, acceptableTypes);
    return acceptableTypes.includes(contentType.type);
  } else {
    log.verbose('Content type is not specified or no acceptable types are defined, defaulting to true');
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
    const log = getLogger(MODULE, 'parseContentMiddleware');
    log.verbose('Running parseContentMiddleware on a %s request', req.method);

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

    log.verbose('Received Content-Type header: %s', contentTypeAsString);

    const contentType = {
      type: contentTypeAsString?.split(';')[0].trim() || '',
      params: contentTypeAsString?.split(';').slice(1).reduce((params, param) => {
        const [key, value] = param.trim().split('=');
        params[key] = value;
        return params;
      }, {} as Record<string, string>)
    } as Partial<ContentType>;

    log.verbose('Parsed content type: %o', contentType);

    if (!isSupportedMediaType(req, contentType as ContentType)) {
      log.verbose('Content type %s is not supported, rejecting request', contentType.type);
      res.status(415).json({
        error: `Content-Type ${contentType.type} is not acceptable`
      });
      return;
    }

    log.verbose('Content type is supported, proceeding to parse body');

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

    log.verbose('Parsed content type: %o', contentType);

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
