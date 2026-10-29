import { urlParser } from '.';

export const redirectUrl = (
  url: string,
  sameTab: boolean,
  extraSchemes?: string
) => {
  const parsedUrl = urlParser(url, extraSchemes)[1];

  if (!parsedUrl) {
    return;
  }

  if (sameTab) {
    document.location.assign(parsedUrl);
  } else {
    window.open(parsedUrl);
  }
};
