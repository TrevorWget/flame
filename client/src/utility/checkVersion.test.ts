import axios from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  checkVersion,
  isNewerVersion,
  LATEST_RELEASE_URL,
  parseVersion,
} from './checkVersion';

const { dispatch } = vi.hoisted(() => ({ dispatch: vi.fn() }));

vi.mock('axios', () => ({ default: { get: vi.fn() } }));
vi.mock('../store/store', () => ({ store: { dispatch } }));
vi.mock('../store/action-creators', () => ({
  createNotification: (notification: unknown) => notification,
}));

const get = vi.mocked(axios.get);

const release = (tag_name: string) => ({
  data: {
    tag_name,
    html_url: `https://github.com/TrevorWget/flame/releases/tag/${tag_name}`,
  },
});

describe('parseVersion', () => {
  it('reads x.y.z with or without a leading v', () => {
    expect(parseVersion('v2.5.0')).toEqual([2, 5, 0]);
    expect(parseVersion('2.10.3')).toEqual([2, 10, 3]);
  });

  it('rejects other tags', () => {
    for (const tag of ['', 'latest', 'v2.5', '2.5.0-rc.1', 'backup/x']) {
      expect(parseVersion(tag)).toBeNull();
    }
  });
});

describe('isNewerVersion', () => {
  it('compares each part as a number', () => {
    expect(isNewerVersion('v2.5.1', '2.5.0')).toBe(true);
    expect(isNewerVersion('v2.10.0', '2.9.9')).toBe(true);
    expect(isNewerVersion('v3.0.0', '2.99.99')).toBe(true);
  });

  it('is false for the same or an older release', () => {
    expect(isNewerVersion('v2.5.0', '2.5.0')).toBe(false);
    expect(isNewerVersion('v2.4.9', '2.5.0')).toBe(false);
    expect(isNewerVersion('v1.4', '2.5.0')).toBe(false);
  });
});

describe('checkVersion', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_APP_VERSION', '2.5.0');
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    get.mockReset();
    dispatch.mockReset();
  });

  it('asks GitHub for the latest release of this fork', async () => {
    get.mockResolvedValue(release('v2.5.0'));
    await checkVersion();
    expect(get).toHaveBeenCalledWith(LATEST_RELEASE_URL, expect.anything());
  });

  it('stays quiet on start-up when the v2.5.0 release matches', async () => {
    get.mockResolvedValue(release('v2.5.0'));
    await checkVersion();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('says so when checked from settings', async () => {
    get.mockResolvedValue(release('v2.5.0'));
    await checkVersion(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You are using the latest version!' })
    );
  });

  it('links to a newer release', async () => {
    get.mockResolvedValue(release('v2.6.0'));
    await checkVersion();
    expect(dispatch).toHaveBeenCalledWith({
      title: 'Info',
      message: 'New version is available! (2.6.0)',
      url: 'https://github.com/TrevorWget/flame/releases/tag/v2.6.0',
    });
  });

  it('does not offer an older release', async () => {
    get.mockResolvedValue(release('v2.4.0'));
    await checkVersion(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'You are using the latest version!' })
    );
  });

  it('only reports a failed check when asked', async () => {
    get.mockRejectedValue(new Error('Request failed with status code 404'));
    await checkVersion();
    expect(dispatch).not.toHaveBeenCalled();

    await checkVersion(true);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not check for updates' })
    );
  });
});
