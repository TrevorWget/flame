export type BackupSchedule = 'off' | 'daily' | 'weekly';

export interface BackupCounts {
  categories: number;
  apps: number;
  bookmarks: number;
  themes: number;
  queries: number;
  uploads: number;
}

export interface BackupPreview {
  manifest: {
    schemaVersion: number;
    flameVersion: string | null;
    createdAt: string | null;
  };
  // null: the backup has no such section and the current one is kept
  backup: Omit<BackupCounts, 'themes' | 'queries'> & {
    themes: number | null;
    queries: number | null;
    settings: number | null;
    css: boolean;
  };
  current: BackupCounts;
}

export interface BackupFile {
  name: string;
  kind: 'scheduled' | 'pre-restore';
  size: number;
  createdAt: string;
}
