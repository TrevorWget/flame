import { describe, expect, it } from 'vitest';

import { resolveAppUrl } from './appUrl';

const internal = 'http://192.0.2.10:8096';
const external = 'https://jellyfin.example.com';

describe('resolveAppUrl', () => {
  it('opens the internal URL by default, as apps did before', () => {
    expect(resolveAppUrl({ url: internal })).toEqual({
      url: internal,
      type: 'internal',
    });
    expect(
      resolveAppUrl({ url: internal, externalUrl: external })
    ).toEqual({ url: internal, type: 'internal' });
  });

  it('opens the URL picked in the app settings', () => {
    expect(
      resolveAppUrl({
        url: internal,
        externalUrl: external,
        preferredUrl: 'external',
      })
    ).toEqual({ url: external, type: 'external' });
    expect(
      resolveAppUrl({
        url: internal,
        externalUrl: external,
        preferredUrl: 'internal',
      })
    ).toEqual({ url: internal, type: 'internal' });
  });

  it('falls back to the other URL when the picked one is empty', () => {
    for (const externalUrl of [undefined, '', '   ']) {
      expect(
        resolveAppUrl({ url: internal, externalUrl, preferredUrl: 'external' })
      ).toEqual({ url: internal, type: 'internal' });
    }

    expect(
      resolveAppUrl({
        url: ' ',
        externalUrl: external,
        preferredUrl: 'internal',
      })
    ).toEqual({ url: external, type: 'external' });
  });

  it('keeps the picked type when both URLs are empty', () => {
    expect(
      resolveAppUrl({ url: '', externalUrl: '', preferredUrl: 'external' })
    ).toEqual({ url: '', type: 'external' });
  });
});
