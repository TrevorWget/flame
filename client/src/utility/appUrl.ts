import { AppUrlType, NewApp } from '../interfaces';

type AppUrls = Pick<NewApp, 'url' | 'externalUrl' | 'preferredUrl'>;

/**
 * The URL an app shows and opens: the one picked in its settings (internal by
 * default), or the other one when the picked URL is empty
 */
export const resolveAppUrl = ({
  url,
  externalUrl = '',
  preferredUrl = 'internal',
}: AppUrls): { url: string; type: AppUrlType } => {
  const urls: Record<AppUrlType, string> = {
    internal: url.trim(),
    external: externalUrl.trim(),
  };
  const fallback: AppUrlType =
    preferredUrl === 'external' ? 'internal' : 'external';
  const type = urls[preferredUrl] || !urls[fallback] ? preferredUrl : fallback;

  return { url: urls[type], type };
};
