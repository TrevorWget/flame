import { describe, expect, it } from 'vitest';

import { BackupPreview } from '../interfaces';
import {
  backupPreviewNotes,
  backupPreviewRows,
  formatBytes,
} from './backupPreview';

const preview = (backup: Partial<BackupPreview['backup']>): BackupPreview => ({
  manifest: { schemaVersion: 1, flameVersion: null, createdAt: null },
  backup: {
    categories: 2,
    apps: 5,
    bookmarks: 7,
    themes: 17,
    queries: 1,
    settings: 30,
    css: true,
    uploads: 3,
    ...backup,
  },
  current: {
    categories: 1,
    apps: 1,
    bookmarks: 1,
    themes: 16,
    queries: 0,
    uploads: 9,
  },
});

describe('backupPreviewRows', () => {
  it('pairs the current counts with the backup counts', () => {
    expect(backupPreviewRows(preview({}))).toEqual([
      { label: 'Categories', current: 1, backup: 2 },
      { label: 'Apps', current: 1, backup: 5 },
      { label: 'Bookmarks', current: 1, backup: 7 },
      { label: 'Themes', current: 16, backup: 17 },
      { label: 'Search providers', current: 0, backup: 1 },
      { label: 'Uploaded icons', current: 9, backup: 3 },
    ]);
  });

  it('marks sections the backup does not have', () => {
    const rows = backupPreviewRows(preview({ themes: null, queries: null }));

    expect(rows.find((r) => r.label === 'Themes')?.backup).toBeNull();
    expect(rows.find((r) => r.label === 'Search providers')?.backup).toBeNull();
  });
});

describe('backupPreviewNotes', () => {
  it('says what happens to settings and CSS', () => {
    expect(backupPreviewNotes(preview({}))).toContain(
      'Replaces 30 settings (the weather API key is kept)'
    );
    expect(backupPreviewNotes(preview({ settings: null, css: false }))).toEqual(
      [
        'Keeps the current settings',
        'Keeps the current custom CSS',
        'Adds the uploaded icons to the ones already there',
      ]
    );
  });
});

describe('formatBytes', () => {
  it('uses B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
