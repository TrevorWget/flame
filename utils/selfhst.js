const crypto = require('crypto');
const fs = require('fs');
const { dirname, join, resolve } = require('path');
const { processIcon } = require('./icons');
const { FetchError, safeFetch } = require('./safeFetch');
const { UPLOADS_DIR, MAX_ICON_BYTES } = require('./favicon');
const Logger = require('./Logger');
const logger = new Logger();

// Icon collection by selfh.st (https://selfh.st/icons), licensed under CC BY 4.0
const DEFAULT_OPTIONS = {
  indexSources: [
    'https://cdn.jsdelivr.net/gh/selfhst/icons@main/index.json',
    'https://raw.githubusercontent.com/selfhst/icons/main/index.json',
  ],
  cdnBase: 'https://cdn.jsdelivr.net/gh/selfhst/icons@main',
  // Relative to the working directory, like data/config.json
  indexFile: 'data/selfhst-index.json',
  uploadsDir: UPLOADS_DIR,
  allowPrivate: false,
};

let options = { ...DEFAULT_OPTIONS };

const FORMATS = ['svg', 'png', 'webp'];
const VARIANTS = ['standard', 'light', 'dark'];
const REFERENCE_REGEX = /^[a-z0-9][a-z0-9-]{0,99}$/;

const INDEX_TTL_MS = 24 * 60 * 60 * 1000;
// After a failed refresh the old index is used for this long before trying again
const INDEX_RETRY_MS = 15 * 60 * 1000;
const INDEX_TIMEOUT_MS = 15000;
const MAX_INDEX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 20000;
const MAX_TAGS = 20;
// A downloaded icon is reused this long, and kept if refreshing it fails
const ICON_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_PREVIEWS = 300;
const MAX_PREVIEW_BYTES = 512 * 1024;
const MAX_PREVIEW_CACHE_BYTES = 16 * 1024 * 1024;
const PREVIEW_FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_CONCURRENT_DOWNLOADS = 6;

const isReference = (value) => typeof value === 'string' && REFERENCE_REGEX.test(value);

const fold = (value) =>
  value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
const compact = (value) => fold(value).replace(/[^a-z0-9]/g, '');
const words = (value) => fold(value).split(/[^a-z0-9]+/).filter(Boolean);

const text = (value, max) =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';
const flag = (value) => value === true || value === 'Yes';

/**
 * Accepts entries of the published index ({ Name, Reference, SVG: 'Yes', ... })
 * and of the cached copy ({ name, reference, svg: true, ... })
 */
const normalizeEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;

  const reference = entry.Reference ?? entry.reference;
  if (!isReference(reference)) return null;

  const rawTags = entry.Tags ?? entry.tags;
  const tags = (Array.isArray(rawTags) ? rawTags : text(rawTags, 1000).split(','))
    .map((tag) => text(tag, 50))
    .filter(Boolean)
    .slice(0, MAX_TAGS);

  return {
    name: text(entry.Name ?? entry.name, 100) || reference,
    reference,
    svg: flag(entry.SVG ?? entry.svg),
    png: flag(entry.PNG ?? entry.png),
    webp: flag(entry.WebP ?? entry.webp),
    light: flag(entry.Light ?? entry.light),
    dark: flag(entry.Dark ?? entry.dark),
    category: text(entry.Category ?? entry.category, 50),
    tags,
  };
};

const normalizeIndex = (data) => {
  const list = Array.isArray(data) ? data : data && Object.values(data);
  if (!Array.isArray(list)) return [];

  const seen = new Set();
  const icons = [];

  for (const raw of list.slice(0, MAX_ENTRIES)) {
    const icon = normalizeEntry(raw);

    if (icon && (icon.png || icon.webp || icon.svg) && !seen.has(icon.reference)) {
      seen.add(icon.reference);
      icons.push(icon);
    }
  }

  return icons.sort((a, b) => a.name.localeCompare(b.name));
};

const buildState = (icons, fetchedAt) => ({
  icons,
  fetchedAt,
  byReference: new Map(icons.map((icon) => [icon.reference, icon])),
  searchable: icons.map((icon) => ({
    icon,
    name: compact(icon.name),
    reference: icon.reference.replace(/-/g, ''),
    words: [...new Set([...words(icon.name), ...icon.reference.split('-')])],
    tags: icon.tags.map(compact),
  })),
});

let state = null;
let diskChecked = false;
let refreshing = null;
let lastFailure = 0;
// Bumped by configureSelfhst, so a download started before it is discarded
let generation = 0;

const indexPath = () => resolve(options.indexFile);

const writeFileAtomic = async (path, data) => {
  const tmp = join(dirname(path), `.${crypto.randomBytes(8).toString('hex')}.tmp`);

  await fs.promises.mkdir(dirname(path), { recursive: true });

  try {
    await fs.promises.writeFile(tmp, data);
    await fs.promises.rename(tmp, path);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
};

const loadFromDisk = async () => {
  if (diskChecked) return;
  diskChecked = true;

  try {
    const saved = JSON.parse(await fs.promises.readFile(indexPath(), 'utf-8'));
    const icons = normalizeIndex(saved.icons);
    const fetchedAt = Date.parse(saved.fetchedAt);

    if (icons.length && !state) {
      state = buildState(icons, Number.isNaN(fetchedAt) ? 0 : fetchedAt);
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      logger.log(`Ignoring the cached selfh.st icon list: ${err.message}`, 'WARN');
    }
  }
};

const downloadIndex = async () => {
  let lastError = new FetchError('No source for the selfh.st icon list', 'UNAVAILABLE');

  for (const source of options.indexSources) {
    try {
      const res = await safeFetch(source, {
        allowPrivate: options.allowPrivate,
        maxBytes: MAX_INDEX_BYTES,
        timeoutMs: INDEX_TIMEOUT_MS,
        accept: 'application/json',
      });

      let data;
      try {
        data = JSON.parse(res.body.toString('utf-8'));
      } catch {
        throw new FetchError(`${source} is not valid JSON`, 'ENCODING');
      }

      const icons = normalizeIndex(data);
      if (!icons.length) {
        throw new FetchError(`${source} lists no icons`, 'ENCODING');
      }

      return icons;
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
};

const refreshIndex = () => {
  if (!refreshing) {
    const startedIn = generation;

    const request = (async () => {
      try {
        const icons = await downloadIndex();
        const fetchedAt = Date.now();

        if (startedIn !== generation) return buildState(icons, fetchedAt);

        state = buildState(icons, fetchedAt);
        lastFailure = 0;

        try {
          await writeFileAtomic(
            indexPath(),
            JSON.stringify({ fetchedAt: new Date(fetchedAt).toISOString(), icons })
          );
        } catch (err) {
          logger.log(`Could not cache the selfh.st icon list: ${err.message}`, 'WARN');
        }

        return state;
      } catch (err) {
        if (startedIn === generation) lastFailure = Date.now();
        logger.log(`Could not download the selfh.st icon list: ${err.message}`, 'WARN');
        throw err;
      }
    })().finally(() => {
      if (refreshing === request) refreshing = null;
    });

    refreshing = request;
  }

  return refreshing;
};

const isStale = (current) => Date.now() - current.fetchedAt >= INDEX_TTL_MS;

const describe = (current) => ({
  ...current,
  stale: isStale(current),
  updatedAt: current.fetchedAt ? new Date(current.fetchedAt).toISOString() : null,
});

/**
 * The selfh.st icon index. A stale copy (memory, then data/selfhst-index.json)
 * is returned at once and refreshed in the background, so search keeps working
 * offline. Only the very first download is waited for, unless `wait` is false,
 * which then returns null instead.
 */
const getIndex = async ({ wait = true } = {}) => {
  await loadFromDisk();

  if (state) {
    if (isStale(state) && Date.now() - lastFailure >= INDEX_RETRY_MS) {
      refreshIndex().catch(() => {});
    }
    return describe(state);
  }

  if (!wait) {
    if (Date.now() - lastFailure >= INDEX_RETRY_MS) refreshIndex().catch(() => {});
    return null;
  }

  // Without any copy, retry on every request: someone is waiting for it
  try {
    return describe(await refreshIndex());
  } catch (err) {
    throw new FetchError(
      `The selfh.st icon list could not be downloaded (${err.message})`,
      'UNAVAILABLE'
    );
  }
};

const rank = (entry, query, queryWords) => {
  if (!query) return 0;
  if (entry.name === query || entry.reference === query) return 0;
  if (entry.name.startsWith(query) || entry.reference.startsWith(query)) return 1;
  if (queryWords.every((word) => entry.words.some((w) => w.startsWith(word)))) return 2;
  if (entry.name.includes(query) || entry.reference.includes(query)) return 3;
  if (entry.tags.some((tag) => tag.includes(query))) return 4;
  return null;
};

/**
 * Icons matching a search, best first: exact names, then prefixes, then
 * words, then anywhere in the name, then tags. An empty query lists all icons.
 */
const searchIcons = (index, rawQuery, limit = 48) => {
  const query = compact(rawQuery);
  const queryWords = words(rawQuery);
  const matches = [];

  for (const entry of index.searchable) {
    const score = rank(entry, query, queryWords);
    if (score !== null) matches.push({ entry, score });
  }

  // The index is already sorted by name, and the sort is stable
  if (query) {
    matches.sort(
      (a, b) => a.score - b.score || a.entry.name.length - b.entry.name.length
    );
  }

  return {
    total: matches.length,
    icons: matches.slice(0, limit).map(({ entry }) => entry.icon),
  };
};

/**
 * The icon whose name or reference is the app name, ignoring case, spaces
 * and punctuation ("Home Assistant" finds home-assistant)
 */
const suggestIcon = (index, name) => {
  const query = compact(name || '');
  if (!query) return null;

  const match = index.searchable.find(
    (entry) => entry.name === query || entry.reference === query
  );

  return match ? match.icon : null;
};

/** The best format of an icon for showing on the dashboard */
const defaultFormat = (icon) => (icon.svg ? 'svg' : icon.webp ? 'webp' : 'png');

const iconFilename = (reference, format, variant) =>
  `selfhst-${reference}${variant === 'standard' ? '' : `_${variant}`}.${format}`;

const iconUrl = (reference, format, variant) =>
  `${options.cdnBase}/${format}/${reference}${
    variant === 'standard' ? '' : `-${variant}`
  }.${format}`;

let activeDownloads = 0;
const waiting = [];

const withDownloadSlot = async (fn) => {
  if (activeDownloads >= MAX_CONCURRENT_DOWNLOADS) {
    await new Promise((resolve) => waiting.push(resolve));
  }
  activeDownloads++;

  try {
    return await fn();
  } finally {
    activeDownloads--;
    if (waiting.length) waiting.shift()();
  }
};

const checkRequest = (reference, format, variant) => {
  if (!isReference(reference)) {
    throw new FetchError('Invalid selfh.st icon reference', 'INVALID');
  }
  if (!FORMATS.includes(format)) {
    throw new FetchError(`Format must be one of ${FORMATS.join(', ')}`, 'INVALID');
  }
  if (!VARIANTS.includes(variant)) {
    throw new FetchError(`Variant must be one of ${VARIANTS.join(', ')}`, 'INVALID');
  }
};

const FORMAT_NAMES = { svg: 'SVG', png: 'PNG', webp: 'WebP' };

/** Checks the request against the index, when there is one */
const checkAvailable = (index, reference, format, variant) => {
  if (!index) return;

  const icon = index.byReference.get(reference);

  if (!icon) {
    throw new FetchError(`selfh.st has no icon called "${reference}"`, 'NOT_FOUND');
  }
  if (!icon[format]) {
    throw new FetchError(
      `${icon.name} is not available as ${FORMAT_NAMES[format]} on selfh.st`,
      'UNAVAILABLE_VARIANT'
    );
  }
  if (variant !== 'standard' && !icon[variant]) {
    throw new FetchError(
      `${icon.name} has no ${variant} version on selfh.st`,
      'UNAVAILABLE_VARIANT'
    );
  }
};

const download = async (reference, format, variant, timeoutMs, maxBytes = MAX_ICON_BYTES) => {
  let res;

  try {
    res = await withDownloadSlot(() =>
      safeFetch(iconUrl(reference, format, variant), {
        allowPrivate: options.allowPrivate,
        maxBytes,
        timeoutMs,
        accept: 'image/*',
      })
    );
  } catch (err) {
    if (err instanceof FetchError && err.status === 404) {
      throw new FetchError(`selfh.st has no ${format} file for ${reference}`, 'NOT_FOUND');
    }
    throw err;
  }

  const icon = processIcon(res.body);

  if (!icon || icon.ext !== format) {
    throw new FetchError(
      `The selfh.st file for ${reference} is not a valid ${FORMAT_NAMES[format]} image`,
      'INVALID_IMAGE'
    );
  }

  return icon.data;
};

const inFlight = new Map();

/**
 * Download a selfh.st icon into data/uploads (so the dashboard never loads it
 * from the CDN) and return its file name. A copy younger than ICON_TTL_MS is
 * reused; an older one is refreshed, or kept if the CDN can't be reached.
 */
const storeSelfhstIcon = async (
  reference,
  { format = 'svg', variant = 'standard', timeoutMs = 10000 } = {}
) => {
  checkRequest(reference, format, variant);

  const filename = iconFilename(reference, format, variant);
  const path = join(options.uploadsDir, filename);
  const stat = await fs.promises.stat(path).catch(() => null);

  if (stat && Date.now() - stat.mtimeMs < ICON_TTL_MS) return filename;

  if (inFlight.has(filename)) return inFlight.get(filename);

  const request = (async () => {
    try {
      checkAvailable(await getIndex({ wait: false }), reference, format, variant);

      const data = await download(reference, format, variant, timeoutMs);
      await writeFileAtomic(path, data);

      return filename;
    } catch (err) {
      if (stat && err instanceof FetchError) {
        logger.log(`Keeping the cached ${filename}: ${err.message}`, 'WARN');
        return filename;
      }
      throw err;
    }
  })().finally(() => inFlight.delete(filename));

  inFlight.set(filename, request);

  return request;
};

/**
 * Stores an icon with its light version (for dark themes) and dark version
 * (for light themes). A version selfh.st doesn't have, or that can't be
 * downloaded, is null, so the dashboard shows the standard icon instead.
 * Files already in data/uploads are reused like by storeSelfhstIcon.
 */
const storeSelfhstIconSet = async (reference, { format = 'svg', timeoutMs = 10000 } = {}) => {
  checkRequest(reference, format, 'standard');

  const index = await getIndex({ wait: false });
  const entry = index && index.byReference.get(reference);

  const variant = async (name) => {
    if (entry && !entry[name]) return null;

    try {
      return await storeSelfhstIcon(reference, { format, variant: name, timeoutMs });
    } catch (err) {
      if (!(err instanceof FetchError)) throw err;
      logger.log(`No ${name} version of ${reference}: ${err.message}`, 'WARN');
      return null;
    }
  };

  const [icon, iconOnDark, iconOnLight] = await Promise.all([
    storeSelfhstIcon(reference, { format, timeoutMs }),
    variant('light'),
    variant('dark'),
  ]);

  return { icon, iconOnDark, iconOnLight };
};

const previews = new Map();
let previewBytes = 0;

const entryBytes = (entry) => (entry && entry.preview ? entry.preview.body.length : 0);

const forget = (key) => {
  previewBytes -= entryBytes(previews.get(key));
  previews.delete(key);
};

const remember = (key, entry) => {
  forget(key);
  previews.set(key, entry);
  previewBytes += entryBytes(entry);

  while (previews.size > MAX_PREVIEWS || previewBytes > MAX_PREVIEW_CACHE_BYTES) {
    forget(previews.keys().next().value);
  }
};

/**
 * A small WebP (or PNG) of an icon for the picker, fetched through the server
 * and kept in memory so the browser never contacts the CDN
 */
const getPreview = async (reference, variant = 'standard') => {
  checkRequest(reference, 'webp', variant);

  const index = await getIndex({ wait: false });
  const icon = index && index.byReference.get(reference);
  const format = icon && !icon.webp && icon.png ? 'png' : 'webp';
  checkAvailable(index, reference, format, variant);

  const key = `${reference} ${variant}`;
  const cached = previews.get(key);

  if (cached && !(cached.error && cached.expires <= Date.now())) {
    remember(key, cached);
    if (cached.error) throw cached.error;
    return cached.preview;
  }

  try {
    const preview = {
      contentType: `image/${format}`,
      body: await download(reference, format, variant, 10000, MAX_PREVIEW_BYTES),
    };
    remember(key, { preview });
    return preview;
  } catch (err) {
    if (err instanceof FetchError && err.code !== 'TIMEOUT') {
      remember(key, { error: err, expires: Date.now() + PREVIEW_FAILURE_TTL_MS });
    }
    throw err;
  }
};

/** Resets cached state, and lets tests point the module at local servers */
const configureSelfhst = (overrides = {}) => {
  options = { ...DEFAULT_OPTIONS, ...overrides };
  generation++;
  state = null;
  diskChecked = false;
  refreshing = null;
  lastFailure = 0;
  previews.clear();
  previewBytes = 0;
  inFlight.clear();
};

module.exports = {
  FORMATS,
  VARIANTS,
  INDEX_TTL_MS,
  ICON_TTL_MS,
  normalizeIndex,
  getIndex,
  searchIcons,
  suggestIcon,
  defaultFormat,
  iconFilename,
  storeSelfhstIcon,
  storeSelfhstIconSet,
  getPreview,
  configureSelfhst,
};
