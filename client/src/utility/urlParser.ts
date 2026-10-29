import { normalizeUrl } from './urlSchemes';

const isSteamUrl = (url: string): boolean => /^steam:\/\//i.test(url);
const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url);

/**
 * Returns [displayUrl, redirectUrl]. redirectUrl is undefined when the URL is
 * invalid or its scheme is not allowed, so it must never reach an href unchecked
 */
export const urlParser = (
  rawUrl: string,
  extraSchemes?: string
): [string, string | undefined] => {
  const url = normalizeUrl(rawUrl, extraSchemes);

  if (!url) {
    return [rawUrl, undefined];
  }

  // Create simplified url to display as text
  let displayUrl: string;
  if (isSteamUrl(url)) {
    displayUrl = 'Run Steam App';
  } else if (isWebUrl(url)) {
    displayUrl = url
      .replace(/https?:\/\//i, '')
      .replace('www.', '')
      .replace(/\/$/, '');
  } else displayUrl = url;

  return [displayUrl, url];
};
