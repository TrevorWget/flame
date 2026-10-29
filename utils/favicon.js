const crypto = require('crypto');
const fs = require('fs');
const { join } = require('path');
const { JSDOM } = require('jsdom');
const { processIcon } = require('./icons');
const { FetchError, safeFetch } = require('./safeFetch');

const UPLOADS_DIR = join(__dirname, '../data/uploads');

const MAX_ICON_BYTES = 1024 * 1024;
const MAX_CANDIDATES = 6;
const MAX_LINKS = 20;
// Icons smaller than this look blurry on high-DPI screens
const PREFERRED_MIN_SIZE = 48;

const CACHE_TTL_MS = 60 * 60 * 1000;
const FAILURE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 500;

// Errors that will fail the same way for every other URL on the host
const HOST_ERRORS = ['BLOCKED', 'DNS', 'TIMEOUT', 'SCHEME', 'URL'];

const ICON_RELS = ['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed'];

const isHtml = (contentType) => /html|xml/.test(contentType) && !/svg/.test(contentType);

const parseSizes = (sizes) => {
  if (!sizes) return null;
  if (/\bany\b/i.test(sizes)) return Infinity;

  const widths = [...sizes.matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1]));
  return widths.length ? Math.max(...widths) : null;
};

const isSvgHref = (href, type) =>
  /svg/i.test(type || '') ||
  /^data:image\/svg\+xml/i.test(href) ||
  /\.svg$/i.test(href.split(/[?#]/)[0]);

/**
 * Scalable icons first, then the smallest icon that's still sharp, then the
 * largest of the small ones
 */
const rankCandidate = ({ isSvg, size }) => {
  if (isSvg || size === Infinity) return [0, 0];
  if (size >= PREFERRED_MIN_SIZE) return [1, size];
  return [2, -size];
};

const compareRanks = (a, b) => {
  const [ra, rb] = [rankCandidate(a), rankCandidate(b)];
  return ra[0] - rb[0] || ra[1] - rb[1] || a.index - b.index;
};

/**
 * Icon <link>s of an HTML page, best first. Relative hrefs (and <base>) are
 * resolved against pageUrl. Scripts and subresources are never loaded.
 */
const findIconLinks = (html, pageUrl, contentType = 'text/html') => {
  const charset = /charset=([^;\s]+)/i.exec(contentType);
  let dom;

  try {
    dom = new JSDOM(html, {
      url: pageUrl,
      contentType: `text/html${charset ? `; charset=${charset[1]}` : ''}`,
    });
  } catch {
    return [];
  }

  const links = [...dom.window.document.querySelectorAll('link[rel][href]')]
    .map((link) => ({
      link,
      rels: link.getAttribute('rel').toLowerCase().split(/\s+/),
    }))
    .filter(({ rels }) => rels.some((rel) => ICON_RELS.includes(rel)))
    .slice(0, MAX_LINKS)
    .map(({ link, rels }, index) => {
      const href = link.href;
      const isAppleIcon = !rels.includes('icon');
      const declared = parseSizes(link.getAttribute('sizes'));

      return {
        href,
        index,
        isSvg: isSvgHref(href, link.getAttribute('type')),
        // Apple touch icons default to 180px, plain favicons are usually 16-32px
        size: declared === null ? (isAppleIcon ? 180 : 32) : declared,
      };
    });

  dom.window.close();

  const seen = new Set();

  return links.sort(compareRanks).filter(({ href }) => {
    if (seen.has(href)) return false;
    seen.add(href);
    return true;
  });
};

const decodeDataUri = (uri) => {
  const match = /^data:([^,]*),(.*)$/is.exec(uri);
  if (!match || uri.length > MAX_ICON_BYTES * 2) return null;

  const [, meta, payload] = match;

  try {
    return /;base64$/i.test(meta)
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload));
  } catch {
    return null;
  }
};

/**
 * Find and download the icon for a page (or an image URL itself).
 * Returns { ext, data, source } with data validated by its content and SVGs
 * sanitized, or throws a FetchError.
 */
const fetchIcon = async (rawUrl, { allowPrivate = false, timeoutMs = 10000, lookup } = {}) => {
  const deadline = Date.now() + timeoutMs;

  const fetchWithinBudget = (url, options) => {
    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      throw new FetchError(`Timed out fetching an icon for ${rawUrl}`, 'TIMEOUT');
    }

    return safeFetch(url, {
      allowPrivate,
      lookup,
      timeoutMs: remaining,
      maxBytes: MAX_ICON_BYTES,
      ...options,
    });
  };

  const candidates = [];
  let pageUrl;

  try {
    const page = await fetchWithinBudget(rawUrl, {
      truncate: true,
      accept: 'text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.8',
    });
    pageUrl = page.url;

    // The URL may point straight at an image
    if (!isHtml(page.contentType) && !page.truncated) {
      const icon = processIcon(page.body);
      if (icon) return { ...icon, source: page.url };
    }

    candidates.push(...findIconLinks(page.body, page.url, page.contentType));
  } catch (err) {
    if (!(err instanceof FetchError) || HOST_ERRORS.includes(err.code)) {
      throw err;
    }

    // Login walls and broken pages often still serve /favicon.ico
    pageUrl = rawUrl;
  }

  const origins = new Set([new URL(pageUrl).origin, new URL(rawUrl).origin]);
  for (const origin of origins) {
    candidates.push({ href: `${origin}/favicon.ico` });
  }

  const tried = new Set();

  for (const { href } of candidates) {
    if (tried.has(href)) continue;
    if (tried.size >= MAX_CANDIDATES) break;
    tried.add(href);

    let data;

    if (/^data:/i.test(href)) {
      data = decodeDataUri(href);
    } else {
      try {
        const res = await fetchWithinBudget(href, { accept: 'image/*,*/*;q=0.8' });
        data = res.body;
      } catch (err) {
        if (err instanceof FetchError && err.code === 'TIMEOUT') throw err;
        continue;
      }
    }

    const icon = data && data.length <= MAX_ICON_BYTES && processIcon(data);
    if (icon) return { ...icon, source: href.startsWith('data:') ? pageUrl : href };
  }

  throw new FetchError(`No usable icon found for ${new URL(pageUrl).host}`, 'NOT_FOUND');
};

/**
 * Store an icon under a name derived from its content, so fetching the same
 * icon again (or for another app on the same site) reuses the file
 */
const storeIcon = async ({ ext, data }) => {
  const hash = crypto.createHash('sha256').update(data).digest('hex').slice(0, 32);
  const filename = `favicon-${hash}.${ext}`;

  await fs.promises.mkdir(UPLOADS_DIR, { recursive: true });

  try {
    await fs.promises.writeFile(join(UPLOADS_DIR, filename), data, { flag: 'wx' });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }

  return filename;
};

const cache = new Map();
const inFlight = new Map();

const remember = (key, entry) => {
  cache.delete(key);
  cache.set(key, entry);

  while (cache.size > MAX_CACHE_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
};

const fromCache = (key) => {
  const entry = cache.get(key);
  if (!entry || entry.expires <= Date.now()) return null;
  if (entry.error) return entry;

  return fs.existsSync(join(UPLOADS_DIR, entry.icon)) ? entry : null;
};

/**
 * Fetch the icon for a URL into data/uploads and return its file name.
 * Results (and failures, briefly) are remembered per URL unless `refresh` is set.
 */
const fetchAndStoreIcon = async (url, { allowPrivate = false, refresh = false, ...options } = {}) => {
  const key = `${allowPrivate ? 'lan' : 'public'} ${url}`;

  if (!refresh) {
    const cached = fromCache(key);
    if (cached && cached.error) throw cached.error;
    if (cached) return cached.icon;
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const request = (async () => {
    try {
      const icon = await storeIcon(await fetchIcon(url, { allowPrivate, ...options }));
      remember(key, { icon, expires: Date.now() + CACHE_TTL_MS });
      return icon;
    } catch (err) {
      if (err instanceof FetchError) {
        remember(key, { error: err, expires: Date.now() + FAILURE_TTL_MS });
      }
      throw err;
    }
  })().finally(() => inFlight.delete(key));

  inFlight.set(key, request);

  return request;
};

const clearIconCache = () => cache.clear();

module.exports = {
  UPLOADS_DIR,
  MAX_ICON_BYTES,
  findIconLinks,
  fetchIcon,
  storeIcon,
  fetchAndStoreIcon,
  clearIconCache,
};
