const loadConfig = require('./loadConfig');
const { normalizeUrl } = require('./urlSchemes');
const { fetchAndStoreIcon } = require('./favicon');
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

/**
 * With the autoFetchIcons setting on, fills in the icon of an app or bookmark
 * that would otherwise be saved without one. On updates (`existing` given)
 * this only happens when the request touches the URL or icon, so pinning or
 * reordering never triggers a fetch. Failures keep the item as it was.
 */
const autoFetchIcon = async (body, existing = null) => {
  const config = await loadConfig();

  if (!config.autoFetchIcons) return body;
  if (existing && !('url' in body) && !('icon' in body)) return body;

  const icon = 'icon' in body ? body.icon : existing && existing.icon;
  if (typeof icon === 'string' && icon.trim()) return body;

  const url = iconSourceUrl(
    'url' in body ? body.url : existing && existing.url,
    config.extraUrlSchemes
  );
  if (!url) return body;

  try {
    const fetched = await fetchAndStoreIcon(url, {
      allowPrivate: Boolean(config.iconFetchAllowPrivate),
      timeoutMs: AUTO_FETCH_TIMEOUT_MS,
    });

    return { ...body, icon: fetched };
  } catch (err) {
    logger.log(`No icon fetched for ${url}: ${err.message}`, 'WARN');
    return body;
  }
};

module.exports = { autoFetchIcon, iconSourceUrl };
