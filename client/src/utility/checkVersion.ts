import axios from 'axios';

import { createNotification } from '../store/action-creators';
import { store } from '../store/store';

// Drafts and prereleases are excluded by this endpoint
export const LATEST_RELEASE_URL =
  'https://api.github.com/repos/TrevorWget/flame/releases/latest';

const RELEASES_URL = 'https://github.com/TrevorWget/flame/releases';

interface GitHubRelease {
  tag_name: string;
  html_url?: string;
}

// "v2.5.0" or "2.5.0" -> [2, 5, 0]; null for anything that is not x.y.z
export const parseVersion = (version: string): number[] | null => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return match ? match.slice(1).map(Number) : null;
};

export const isNewerVersion = (latest: string, current: string): boolean => {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;

  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
};

const notify = (message: string, url?: string) => {
  store.dispatch<any>(createNotification({ title: 'Info', message, url }));
};

export const checkVersion = async (isForced: boolean = false) => {
  try {
    const res = await axios.get<GitHubRelease>(LATEST_RELEASE_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    const { tag_name, html_url } = res.data;

    if (!parseVersion(tag_name || '')) {
      throw new Error(`Unexpected release tag: ${tag_name}`);
    }

    if (isNewerVersion(tag_name, import.meta.env.VITE_APP_VERSION)) {
      notify(
        `New version is available! (${tag_name.replace(/^v/, '')})`,
        html_url || RELEASES_URL
      );
    } else if (isForced) {
      notify('You are using the latest version!');
    }
  } catch (err) {
    console.log(err);
    if (isForced) {
      notify('Could not check for updates', RELEASES_URL);
    }
  }
};
