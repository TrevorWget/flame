// Keep in sync with client/src/utility/urlSchemes.ts

const DEFAULT_URL_SCHEMES = [
  'http',
  'https',
  'ftp',
  'ftps',
  'sftp',
  'ssh',
  'smb',
  'steam',
  'mailto',
  'tel',
  'rdp',
  'vnc',
];

// Schemes that can execute script or smuggle content; never allowed, even via config
const BLOCKED_URL_SCHEMES = [
  'javascript',
  'vbscript',
  'data',
  'blob',
  'filesystem',
];

const SCHEME_NAME_REGEX = /^[a-z][a-z0-9+.-]*$/;
const SCHEME_PREFIX_REGEX = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Parse a user supplied list of extra schemes ("obsidian; vscode://, ...")
 */
const parseSchemeList = (list) => {
  if (typeof list !== 'string') return [];

  return list
    .split(/[;,\s]+/)
    .map((scheme) => scheme.toLowerCase().replace(/:(\/\/)?$/, ''))
    .filter(
      (scheme) =>
        SCHEME_NAME_REGEX.test(scheme) && !BLOCKED_URL_SCHEMES.includes(scheme)
    );
};

const getAllowedSchemes = (extraSchemes) =>
  new Set([...DEFAULT_URL_SCHEMES, ...parseSchemeList(extraSchemes)]);

/**
 * Returns the URL as it will be used in links (scheme-less input gets "http://"),
 * or null if it is not a valid URL with an allowed scheme
 */
const normalizeUrl = (url, extraSchemes = '') => {
  if (typeof url !== 'string') return null;

  // Browsers strip these before parsing, e.g. "java\tscript:" is "javascript:"
  let value = url
    // eslint-disable-next-line no-control-regex
    .replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '')
    .replace(/[\t\n\r]/g, '');

  if (!value) return null;

  const allowed = getAllowedSchemes(extraSchemes);
  const match = SCHEME_PREFIX_REGEX.exec(value);

  // "host:port" also looks like "scheme:", so only an explicit "scheme://",
  // a known scheme ("mailto:") or a blocked one counts as having a scheme
  const hasScheme =
    match &&
    (value.startsWith(`${match[0]}//`) ||
      allowed.has(match[1].toLowerCase()) ||
      BLOCKED_URL_SCHEMES.includes(match[1].toLowerCase()));

  if (!hasScheme) {
    value = `http://${value}`;
  }

  let parsed;

  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  const protocol = parsed.protocol.slice(0, -1).toLowerCase();

  return allowed.has(protocol) ? value : null;
};

const isAllowedUrl = (url, extraSchemes) =>
  normalizeUrl(url, extraSchemes) !== null;

/**
 * Returns the URL to request for an http(s) check (scheme-less input gets
 * "http://"), or null for other schemes and invalid URLs
 */
const toHttpUrl = (url) => {
  const normalized = normalizeUrl(url);

  if (!normalized) return null;

  const parsed = new URL(normalized);

  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    ? parsed.href
    : null;
};

const isHttpUrl = (url) => toHttpUrl(url) !== null;

module.exports = {
  DEFAULT_URL_SCHEMES,
  BLOCKED_URL_SCHEMES,
  parseSchemeList,
  normalizeUrl,
  isAllowedUrl,
  toHttpUrl,
  isHttpUrl,
};
