const loadConfig = require('./loadConfig');
const { normalizeUrl } = require('./urlSchemes');
const { fetchAndStoreIcon } = require('./favicon');
const { defaultFormat, getIndex, storeSelfhstIcon, suggestIcon } = require('./selfhst');
const Logger = require('./Logger');
const logger = new Logger();

// Saving an app or bookmark waits for this, so keep it shorter than a manual fetch
const AUTO_FETCH_TIMEOUT_MS = 5000;

/**
 * Turns an app/bookmark URL into the http(s) URL its icon can be fetched
 * from, or null for other schemes (steam://, ssh://, ...)
 */
const iconSourceUrl = (url, extraSchemes) => {
  const normalized = normalizeUrl(url, extraSchemes);
  return normalized && /^https?:\/\//i.test(normalized) ? normalized : null;
};

/** Resolves to null instead if the promise takes longer than `ms` */
const within = (promise, ms) => {
  let timer;

  return Promise.race([
    promise,
    new Promise((resolve) => {
      timer = setTimeout(() => resolve(null), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/** The selfh.st icon named like the app, stored locally, or null */
const selfhstIconFor = async (name, timeoutMs) => {
  if (typeof name !== 'string' || !name.trim()) return null;

  const started = Date.now();

  try {
    // The first ever download of the index keeps going in the background
    const index = await within(getIndex(), timeoutMs);
    const icon = index && suggestIcon(index, name);
    if (!icon) return null;

    return await storeSelfhstIcon(icon.reference, {
      format: defaultFormat(icon),
      timeoutMs: Math.max(timeoutMs - (Date.now() - started), 1),
    });
  } catch (err) {
    logger.log(`No selfh.st icon stored for ${name}: ${err.message}`, 'WARN');
    return null;
  }
};

/**
 * With the autoFetchIcons setting on, fills in the icon of an app or bookmark
 * that would otherwise be saved without one: the selfh.st icon matching its
 * name first if preferSelfhstIcons is on, then the site's favicon. On updates
 * (`existing` given) this only happens when the request touches the URL or
 * icon, so pinning or reordering never triggers a fetch. Failures keep the
 * item as it was.
 */
const autoFetchIcon = async (body, existing = null) => {
  const config = await loadConfig();

  if (!config.autoFetchIcons) return body;
  if (existing && !('url' in body) && !('icon' in body)) return body;

  const icon = 'icon' in body ? body.icon : existing && existing.icon;
  if (typeof icon === 'string' && icon.trim()) return body;

  const deadline = Date.now() + AUTO_FETCH_TIMEOUT_MS;

  if (config.preferSelfhstIcons) {
    const name = 'name' in body ? body.name : existing && existing.name;
    const selfhst = await selfhstIconFor(name, AUTO_FETCH_TIMEOUT_MS);

    if (selfhst) return { ...body, icon: selfhst };
  }

  const url = iconSourceUrl(
    'url' in body ? body.url : existing && existing.url,
    config.extraUrlSchemes
  );
  const timeoutMs = deadline - Date.now();
  if (!url || timeoutMs <= 0) return body;

  try {
    const fetched = await fetchAndStoreIcon(url, {
      allowPrivate: Boolean(config.iconFetchAllowPrivate),
      timeoutMs,
    });

    return { ...body, icon: fetched };
  } catch (err) {
    logger.log(`No icon fetched for ${url}: ${err.message}`, 'WARN');
    return body;
  }
};

module.exports = { autoFetchIcon, iconSourceUrl };
