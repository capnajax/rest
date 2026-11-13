import { readFile } from "fs/promises";
import { parse } from "yaml";
import { getLogger } from "../../util/logger.js";

const MODULE = 'r.d.default-mime-types';

/**
 * Promise that resolves to a map of file extensions to their default mime
 * types. Opposite of the mim-types.yaml that maps mime types to extensions.
 * Lazy loaded.
 */
let promisedExtensionsMap: Promise<Record<string, string>>|undefined = undefined;

/**
 * Lazy-load the default mime types file.
 * @returns a map of extensions to mime types.
 */
async function loadMimeTypesConfig(): Promise<Record<string, string>> {

  const log = getLogger(MODULE, loadMimeTypesConfig);

  // load the config
  const mimeFile = await readFile(
      new URL('./mime-types.yaml', import.meta.url),
      'utf8'
    );
  log.silly('mimeFile: %s', JSON.stringify(mimeFile));
  const mimeRecord = parse(mimeFile) as Record<string, string[]>;
  log.silly('mimeRecord: %s', JSON.stringify(mimeRecord));
  let mimeTypes: Map<string, string[]> = new Map<string, string[]>(
    Object.entries(mimeRecord)
  );
  log.silly('mimeTypes: %s', JSON.stringify([...mimeTypes]));

  // populate the extensionsMap
  const result = (() => {
    const log = getLogger(MODULE, 'EXTENSIONS');
    const result: Record<string, string> = {};
    const duplicateResults: Record<string, string[]> = {};
    for (const mimeTuple of [...mimeTypes]) {
      const exts = mimeTuple[1] || [];
      log.silly('Mime: %s, exts: %s', mimeTuple, JSON.stringify(exts));
      for (const ext of exts) {
        if (result[ext]) {
          duplicateResults[ext] ||= [];
          duplicateResults.ext.push(mimeTuple[0])
        } else {
          result[ext] = mimeTuple[0];
        }
      }
    }
    if (Object.keys(duplicateResults).length) {
      log.error(`Duplicate extensions in \`mime-types.yaml\`. Some media ` +
        'responses might have unexpected mime types');
      for (const dk of Object.keys(duplicateResults)) {
        log.error(`Extension "${dk}" duplicated in mime type "${
          duplicateResults[dk].join('", "')}"`);
      }
    }
    log.silly('Result: %s', result);
    return result;
  })();

  return result;
}

export async function getDefaultMimeType(extension: string)
: Promise<string|null> {
  const log = getLogger(MODULE, getDefaultMimeType);
  log.silly('Getting mime type for extension "%s"', extension);
  if (! promisedExtensionsMap) {
    try {
      promisedExtensionsMap = loadMimeTypesConfig();
    } catch(e) {
      log.error('Failed to load extensions map');
      promisedExtensionsMap = undefined;
      throw e;
    }
    log.silly('extensionMap: %s', JSON.stringify(await promisedExtensionsMap));
  }

  if (!extension) {
    log.silly(' --> no extension');
    return null;
  } else if (!extension.startsWith('.')) {
    extension = `.${extension}`;
  }
  const result = (await promisedExtensionsMap)[extension] || null;
  log.silly(' --> mime type "%s"', result);
  return result;
}
